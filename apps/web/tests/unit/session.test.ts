import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { initSync, Runtime } from '../../../../crates/wasm/pkg/zari_wasm.js';
import type {
  CatalogSnapshot,
  ProjectInput,
  ProtocolRequest,
} from '../../src/contracts/generated/dto';
import { ProjectSession, type SessionSnapshot } from '../../src/features/project/session';
import {
  emptyProjectForm,
  getMeasurement,
  sampleProjectForm,
} from '../../src/features/project/draft';
import bundledCatalog from '../../src/features/project/synthetic-catalog.json';
import { ZariDb } from '../../src/persistence/db';
import { ProjectRepository } from '../../src/persistence/repository';
import type { WorkerPort } from '../../src/worker/client';
import { SearchPump, WorkerController } from '../../src/worker/controller';

/**
 * REAL-RUST harness tests. `WasmPort` runs the actual `zari_wasm` Runtime
 * in-process, so every initialize/activate/normalize/verifyRecord round-trip
 * below is computed by Rust — only the Worker transport is faked. These tests
 * cover persistence/session semantics; search-lifecycle coverage is in
 * searchPump.test.ts (protocol harness) and the @parity browser suite
 * (real stepped WASM search, including `search-cancelled`).
 */

initSync({
  module: readFileSync(new URL('../../../../crates/wasm/pkg/zari_wasm_bg.wasm', import.meta.url)),
});

/** A WorkerPort whose replies are produced by the real Rust Runtime. */
class WasmPort implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null;
  onerror: WorkerPort['onerror'] = null;
  onmessageerror: WorkerPort['onmessageerror'] = null;
  sent: ProtocolRequest[] = [];
  private runtime = new Runtime();
  private dead = false;
  postMessage(text: string) {
    if (this.dead) return;
    this.sent.push(JSON.parse(text) as ProtocolRequest);
    let reply: string;
    try {
      reply = this.runtime.handle_json(text);
    } catch {
      this.onerror?.({} as ErrorEvent);
      return;
    }
    queueMicrotask(() => {
      if (!this.dead) this.onmessage?.({ data: reply } as MessageEvent);
    });
  }
  crash() {
    this.onerror?.({} as ErrorEvent);
  }
  terminate() {
    this.dead = true;
  }
}

const catalog = bundledCatalog as unknown as CatalogSnapshot;

const sessions: ProjectSession[] = [];
const controllers: WorkerController[] = [];
afterEach(() => {
  for (const session of sessions.splice(0)) void session.close(true);
  for (const controller of controllers.splice(0)) controller.dispose();
});

function world(name = `test-${crypto.randomUUID()}`) {
  const db = new ZariDb(name);
  const repo = new ProjectRepository(db);
  const ports: WasmPort[] = [];
  const controller = new WorkerController(() => {
    const port = new WasmPort();
    ports.push(port);
    return port;
  });
  controllers.push(controller);
  return { db, repo, controller, ports, name };
}

function watch(session: ProjectSession) {
  sessions.push(session);
  return session;
}

/** Poll the session snapshot until `predicate` holds or the deadline passes. */
async function until(
  session: ProjectSession,
  predicate: (s: SessionSnapshot) => boolean,
  ms = 5000,
): Promise<SessionSnapshot> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const s = session.snapshot;
    if (predicate(s)) return s;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`timed out waiting for session condition; last=${JSON.stringify(session.snapshot.saveState)}/${session.snapshot.status}`);
}

/** Normalize the sample form through a standalone real Runtime (seeding only). */
function normalizeSample(): { input: ProjectInput; digest: string } {
  const runtime = new Runtime();
  const meta = (requestId: string, over: Record<string, unknown> = {}) => ({
    protocolVersion: 1,
    schemaVersion: 1,
    workerSessionId: 'seed',
    projectActivationId: 'seed-act',
    projectId: 'seed',
    requestId,
    editorEpoch: '0',
    inputRevision: '0',
    contextId: null,
    ...over,
  });
  const send = (req: unknown) =>
    JSON.parse(runtime.handle_json(JSON.stringify(req))) as {
      event: Record<string, unknown> & { kind: string };
    };
  send({
    meta: meta('i', { projectActivationId: 'system', projectId: 'system' }),
    command: { kind: 'initialize', buildId: 'zari-domain-4', expectedProtocolVersion: 1, expectedSchemaVersion: 1 },
  });
  send({ meta: meta('a'), command: { kind: 'activateProject', context: { kind: 'bootstrap' } } });
  const reply = send({
    meta: meta('n'),
    command: {
      kind: 'normalizeInput',
      input: { kind: 'project', project: sampleProjectForm() },
      priorInputDigest: null,
      formatRequests: [],
    },
  });
  if (reply.event.kind !== 'normalized' || !reply.event.normalizedInput)
    throw new Error('seed normalize failed');
  const normalized = reply.event.normalizedInput as { kind: string; input: ProjectInput };
  return { input: normalized.input, digest: reply.event.inputDigest as string };
}

/** One project with a committed normalized input and the bundled catalog. */
async function seedCommitted(repo: ProjectRepository): Promise<string> {
  const project = await repo.createProject('테스트', emptyProjectForm());
  const { input, digest } = normalizeSample();
  await repo.putCatalog(catalog, 'test-seed');
  const result = await repo.commitNormalizedInput({
    projectId: project.projectId,
    generation: '1',
    editorSessionId: 'seed',
    form: sampleProjectForm(),
    validation: { status: 'valid', diagnostics: [] },
    normalized: input,
    inputDigest: digest,
    engineBuildId: 'test',
  });
  if (result.status !== 'committed') throw new Error('seed commit failed');
  return project.projectId;
}

it('open runs real verifyRecord on stored records and installs project context', async () => {
  const { repo, controller } = world();
  const projectId = await seedCommitted(repo);
  const session = watch(new ProjectSession(repo, controller, projectId, 'test-build'));
  await session.open();
  const state = session.snapshot;
  expect(state.status).toBe('ready');
  expect(state.integrity).not.toBeNull();
  // The committed input row and the catalog row are both verified by Rust.
  expect(state.integrity!.some((i) => i.record.startsWith('inputs:') && i.verified)).toBe(true);
  expect(state.integrity!.some((i) => i.record.startsWith('catalogs:') && i.verified)).toBe(true);
  expect(state.integrity!.every((i) => i.verified)).toBe(true);
  expect(state.corrupt).toEqual([]);
  // Project activation (not bootstrap) succeeded → real Rust contextId.
  await until(session, (s) => s.context === 'installed');
});

it('a tampered stored input digest fails verifyRecord and is reported, never repaired', async () => {
  const { db, repo, controller } = world();
  const projectId = await seedCommitted(repo);
  await db.inputs.update([projectId, '1'], { inputDigest: 'f'.repeat(64) });
  const session = watch(new ProjectSession(repo, controller, projectId, 'test-build'));
  await session.open();
  const state = session.snapshot;
  expect(state.status).toBe('ready');
  const inputCheck = state.integrity!.find((i) => i.record.startsWith('inputs:'));
  expect(inputCheck?.verified).toBe(false);
  // The row stays byte-identical; it is only reported as failed verification.
  expect(state.corrupt).toEqual([
    expect.objectContaining({ store: 'verify', reason: 'record_corrupt' }),
  ]);
  const row = await db.inputs.get([projectId, '1']);
  expect(row?.inputDigest).toBe('f'.repeat(64));
});

it('a corrupted catalog still allows integrity inspection and recovery export', async () => {
  const { db, repo, controller } = world();
  const projectId = await seedCommitted(repo);
  // Byte-level corruption: the stored digest no longer matches the content.
  const row = await db.catalogs.get(catalog.catalogDigest);
  row!.catalog.catalogDigest = 'e'.repeat(64);
  await db.catalogs.put(row!);
  const session = watch(new ProjectSession(repo, controller, projectId, 'test-build'));
  await session.open();
  const state = await until(session, (s) => s.status === 'ready');
  // Envelope guard reported the catalog row; the input row still verified.
  expect(state.corrupt).toEqual([
    expect.objectContaining({ store: 'catalogs', reason: 'record_corrupt' }),
  ]);
  expect(state.integrity!.some((i) => i.record.startsWith('inputs:') && i.verified)).toBe(true);
  // Corrupt bytes were quarantined, and the project context degraded to
  // bootstrap — activation without the pinned catalog is impossible.
  await until(session, (s) => s.context === 'degraded' && s.degradedReason === 'catalog_unavailable');
  const kept = await repo.quarantined();
  expect(kept.some((q) => q.store === 'catalogs')).toBe(true);
  // Recovery export still works and carries the quarantined raw record.
  const exported = await session.exportJson('recovery');
  expect(exported).not.toBeNull();
  expect(exported!.kind).toBe('recovery');
  expect((exported!.quarantine as unknown[]).length).toBeGreaterThan(0);
});

it('invalid raw text survives save and reload without silent normalization', async () => {
  const { repo, controller } = world();
  const project = await repo.createProject('테스트', emptyProjectForm());
  await repo.putCatalog(catalog, 'test-seed');
  const session = watch(new ProjectSession(repo, controller, project.projectId, 'test-build'));
  await session.open();
  await until(session, (s) => s.status === 'ready');
  session.edit('space.interior.width', 'abc');
  session.commit();
  const saved = await until(session, (s) => s.saveState === 'saved' || s.saveState === 'error');
  expect(saved.saveState).toBe('saved');
  // Rust flagged the field; nothing was written into normalized inputs.
  expect(saved.diagnostics.some((d) => d.code === 'invalid_number')).toBe(true);
  expect(saved.inputRevision).toBe('0');
  await session.close(true);
  // A fresh session restores the raw text verbatim — 'abc' is not rewritten.
  const reopened = watch(new ProjectSession(repo, controller, project.projectId, 'test-build'));
  await reopened.open();
  const restored = await until(reopened, (s) => s.status === 'ready');
  expect(getMeasurement(restored.form!, 'space.interior.width').text).toBe('abc');
  const bundle = await repo.loadBundle(project.projectId);
  expect(bundle.draft?.validation.status).toBe('invalid');
});

it('a unit switch rewrites the exact value through Rust formattedFields', async () => {
  const { repo, controller } = world();
  const project = await repo.createProject('테스트', emptyProjectForm());
  await repo.putCatalog(catalog, 'test-seed');
  const session = watch(new ProjectSession(repo, controller, project.projectId, 'test-build'));
  await session.open();
  await until(session, (s) => s.status === 'ready');
  session.edit('space.interior.width', '600');
  session.setUnit('space.interior.width', 'cm');
  // The text is rewritten only by the Rust-formatted reply, not JS math.
  await until(session, (s) => getMeasurement(s.form!, 'space.interior.width').text === '60');
  expect(getMeasurement(session.snapshot.form!, 'space.interior.width').unit).toBe('cm');
});

it('Worker crash reports failed lifecycle and recovery reinstalls context with committed state intact', async () => {
  const { repo, controller, ports } = world();
  const projectId = await seedCommitted(repo);
  const session = watch(new ProjectSession(repo, controller, projectId, 'test-build'));
  await session.open();
  await until(session, (s) => s.context === 'installed');
  const revisionBefore = session.snapshot.projectRevision;
  ports[0]!.crash();
  await until(session, (s) => s.worker === 'failed');
  // The durable bundle is untouched by the crash.
  expect((await repo.loadBundle(projectId)).project.projectRevision).toBe(revisionBefore);
  await controller.recover();
  // Fresh Worker session → re-activation → real context reinstalled.
  await until(session, (s) => s.worker === 'ready' && s.context === 'installed');
  expect(ports.length).toBe(2);
  expect(session.snapshot.projectRevision).toBe(revisionBefore);
});

it('a second tab never silently last-write-wins: conflict is surfaced, not merged', async () => {
  // Two repositories + two controllers over one IndexedDB database = two tabs.
  const tabA = world('shared-db');
  const tabB = world('shared-db');
  const projectId = await seedCommitted(tabA.repo);
  const sessionA = watch(new ProjectSession(tabA.repo, tabA.controller, projectId, 'test-build'));
  const sessionB = watch(new ProjectSession(tabB.repo, tabB.controller, projectId, 'test-build'));
  await sessionA.open();
  await sessionB.open();
  await until(sessionB, (s) => s.status === 'ready');
  // Tab A commits a real change; tab B is notified instead of overwritten.
  sessionA.edit('space.interior.width', '610');
  sessionA.commit();
  await until(sessionA, (s) => s.saveState === 'saved');
  const conflicted = await until(sessionB, (s) => s.saveState === 'conflict');
  expect(conflicted.conflict).not.toBeNull();
  // Tab B's stale writer cannot commit over tab A's revision either.
  sessionB.edit('space.interior.depth', '999');
  sessionB.commit();
  const after = await until(sessionB, (s) => s.saveState === 'conflict' || s.saveState === 'error');
  expect(after.saveState).toBe('conflict');
  const bundle = await tabA.repo.loadBundle(projectId);
  // The committed draft still carries tab A's edit; tab B's never landed.
  expect(getMeasurement(bundle.draft!.form, 'space.interior.width').text).toBe('610');
});

it('REAL solver: the pump steps an actual WASM search and cancelSearch is serviced', async () => {
  // Unlike the protocol-harness tests in searchPump.test.ts, this drives
  // SearchPump against the real Rust engine: real bounded steps advance real
  // counters, then a cooperative cancel is acknowledged by the solver itself.
  // (Terminal completion on real WASM is covered by the @parity
  // `search-scope-complete` fixture.)
  const { repo, controller } = world();
  const projectId = await seedCommitted(repo);
  const session = watch(new ProjectSession(repo, controller, projectId, 'test-build'));
  await session.open();
  await until(session, (s) => s.context === 'installed');
  const client = controller.current!;
  const pump = new SearchPump(client, { stepAllowance: 32, cancelTimeoutMs: 5000 });
  const workUnits: string[] = [];
  let cancelSent = false;
  const outcome = await new Promise<string>((resolve) => {
    void pump
      .start('continuous', {
        onProgress: (event) => {
          workUnits.push(event.consumed.workUnits);
          if (workUnits.length >= 3 && !cancelSent) {
            cancelSent = true;
            pump.cancel();
          }
        },
        onCompleted: () => resolve('completed'),
        onCancelled: () => resolve('cancelled'),
        onFailed: (error) => resolve(`failed:${error.message}`),
      })
      .catch((error: unknown) => resolve(`start_failed:${String(error)}`));
  });
  // The engine did real bounded work (monotone counters), then serviced the
  // cancel between steps — no fabricated host-side success.
  expect(workUnits.length).toBeGreaterThanOrEqual(3);
  for (let i = 1; i < workUnits.length; i += 1)
    expect(BigInt(workUnits[i]!) >= BigInt(workUnits[i - 1]!)).toBe(true);
  expect(outcome).toBe('cancelled');
});

it('strategies and a real WASM search surface through the session plan state', async () => {
  const { repo, controller } = world();
  const projectId = await seedCommitted(repo);
  const session = watch(new ProjectSession(repo, controller, projectId, 'test-build'));
  await session.open();
  await until(session, (s) => s.context === 'installed');
  const plan = await until(session, (s) => s.plan.strategies !== null, 15000);
  expect(plan.plan.strategies!.length).toBeGreaterThan(0);
  session.startSearch();
  const done = await until(session, (s) => s.plan.search === 'done', 30000);
  expect(done.plan.searchError).toBeNull();
  expect(done.plan.alternatives.length).toBeGreaterThan(0);
  expect(done.plan.resultInputDigest).not.toBeNull();
  // The bundled demo surfaces a containerized purchase plan and a no-purchase
  // plan — both real solver alternatives, not fabricated fixtures.
  const purchase = done.plan.alternatives.find((s) =>
    s.content.placements.some((p) => p.subject.kind === 'newContainer'),
  );
  expect(purchase).toBeDefined();
  expect(purchase!.content.bom.length).toBeGreaterThan(0);
  expect(done.plan.alternatives.some((s) => s.content.bom.length === 0)).toBe(true);
}, 90000);

it('accept persists the snapshot once; reopening restores the bound plan', async () => {
  const { repo, controller } = world();
  const projectId = await seedCommitted(repo);
  const session = watch(new ProjectSession(repo, controller, projectId, 'test-build'));
  await session.open();
  await until(session, (s) => s.context === 'installed');
  session.startSearch();
  const done = await until(session, (s) => s.plan.search === 'done', 30000);
  const chosen = done.plan.alternatives[0]!;
  void session.acceptPlan(chosen.planSnapshotId);
  const saved = await until(session, (s) => s.plan.acceptState !== 'saving');
  expect(saved.plan.acceptState).toBe('saved');
  expect(saved.plan.acceptError).toBeNull();
  expect(saved.plan.accepted).not.toBeNull();
  expect(saved.plan.accepted!.planSnapshotId).toBe(chosen.planSnapshotId);
  expect(saved.plan.acceptedSnapshot?.planSnapshotId).toBe(chosen.planSnapshotId);
  // Durable facts: the snapshot row and the project binding landed together.
  const bundle = await repo.loadBundle(projectId);
  expect(bundle.project.accepted?.planSnapshotId).toBe(chosen.planSnapshotId);
  const row = bundle.snapshots.find((s) => s.planSnapshotId === chosen.planSnapshotId);
  expect(row).toBeDefined();
  // A fresh session on a new port reloads the bound snapshot from IndexedDB.
  await session.close(true);
  const reopened = watch(new ProjectSession(repo, controller, projectId, 'test-build'));
  await reopened.open();
  const restored = await until(reopened, (s) => s.status === 'ready' && s.plan.accepted !== null);
  expect(restored.plan.acceptedSnapshot?.planSnapshotId).toBe(chosen.planSnapshotId);
  // staleInput clears once the open-time reconcile round-trip confirms the draft.
  await until(reopened, (s) => !s.staleInput, 15000);
  const snap = reopened.snapshot.plan.acceptedSnapshot!;
  expect(reopened.isCurrentSnapshot(snap)).toBe(true);
}, 90000);

it('accepting an accepted snapshot after the input moved is refused as stale_input', async () => {
  const { repo, controller } = world();
  const projectId = await seedCommitted(repo);
  const session = watch(new ProjectSession(repo, controller, projectId, 'test-build'));
  await session.open();
  await until(session, (s) => s.context === 'installed');
  session.startSearch();
  const done = await until(session, (s) => s.plan.search === 'done', 30000);
  void session.acceptPlan(done.plan.alternatives[0]!.planSnapshotId);
  await until(session, (s) => s.plan.acceptState === 'saved');
  const acceptedSnapshot = session.snapshot.plan.acceptedSnapshot!;
  // Committing a real edit supersedes the input the snapshot was bound to.
  session.edit('space.interior.width', '610');
  session.commit();
  await until(session, (s) => s.saveState === 'saved');
  await until(session, () => !session.isCurrentSnapshot(acceptedSnapshot));
  // The stale snapshot is still byte-valid, but the CAS binding refuses it.
  void session.acceptPlan(acceptedSnapshot.planSnapshotId);
  const refused = await until(session, (s) => s.plan.acceptState !== 'saving');
  expect(refused.plan.acceptState).toBe('error');
  expect(refused.plan.acceptError).toBe('stale_input');
}, 90000);

it('a cancelled search can be restarted on the same context', async () => {
  const { repo, controller } = world();
  const projectId = await seedCommitted(repo);
  const session = watch(new ProjectSession(repo, controller, projectId, 'test-build'));
  await session.open();
  await until(session, (s) => s.context === 'installed');
  // Small step allowance → many macrotask steps → a reliable cancel window.
  session.startSearch({ stepAllowance: 32 });
  await until(session, (s) => s.plan.progress !== null, 15000);
  session.cancelSearch();
  await until(session, (s) => s.plan.search === 'cancelled', 15000);
  // A new search on the same context completes and replaces the old results.
  session.startSearch();
  const done = await until(session, (s) => s.plan.search === 'done', 30000);
  expect(done.plan.alternatives.length).toBeGreaterThan(0);
}, 90000);

it('a worker crash mid-search is reported as a failed search, not a fake result', async () => {
  const { repo, controller, ports } = world();
  const projectId = await seedCommitted(repo);
  const session = watch(new ProjectSession(repo, controller, projectId, 'test-build'));
  await session.open();
  await until(session, (s) => s.context === 'installed');
  session.startSearch({ stepAllowance: 32 });
  await until(session, (s) => s.plan.progress !== null, 15000);
  ports[0]!.crash();
  const failed = await until(session, (s) => s.plan.search === 'failed', 15000);
  expect(failed.plan.searchError).not.toBeNull();
  // Recovery reinstalls context; a fresh search works on the new worker.
  await controller.recover();
  await until(session, (s) => s.worker === 'ready' && s.context === 'installed');
  session.startSearch();
  const done = await until(session, (s) => s.plan.search === 'done', 30000);
  expect(done.plan.alternatives.length).toBeGreaterThan(0);
}, 90000);

it('a layout edit is re-verified by Rust into a new snapshot; undo/redo ride restoreLayout', async () => {
  const { repo, controller } = world();
  const projectId = await seedCommitted(repo);
  const session = watch(new ProjectSession(repo, controller, projectId, 'test-build'));
  await session.open();
  await until(session, (s) => s.context === 'installed');
  session.startSearch();
  const done = await until(session, (s) => s.plan.search === 'done', 30000);
  const base = done.plan.alternatives[0]!;
  const placement = base.content.placements[0]!;
  session.selectPlacement(placement.id);
  expect(session.snapshot.plan.edit.selectedPlacementId).toBe(placement.id);
  // Permitted edit: revalidated head is a different immutable snapshot.
  session.requestLayoutEdit(
    {
      kind: 'movePlacement',
      placementId: placement.id,
      position: { ...placement.position },
    },
    base.planSnapshotId,
  );
  const moved = await until(
    session,
    (s) => s.plan.edit.pending === null && s.plan.edit.head !== null,
  );
  expect(moved.plan.edit.rejection).toBeNull();
  const head = moved.plan.edit.head!;
  expect(head.planSnapshotId).not.toBe(base.planSnapshotId);
  expect(head.content.versions.inputDigest).toBe(base.content.versions.inputDigest);
  expect(moved.plan.edit.undo.length).toBe(1);
  // The result is durable: both snapshots and the chain landed in one commit.
  const bundle = await repo.loadBundle(projectId);
  expect(bundle.snapshots.some((s) => s.planSnapshotId === head.planSnapshotId)).toBe(
    true,
  );
  expect(bundle.draft?.edit?.headSnapshotId).toBe(head.planSnapshotId);
  // Undo is a fresh restoreLayout against the chain base — not a revoked token.
  session.undoEdit();
  const undone = await until(
    session,
    (s) => s.plan.edit.pending === null && s.plan.edit.head !== null,
  );
  expect(undone.plan.edit.undo.length).toBe(0);
  expect(undone.plan.edit.redo.length).toBe(1);
  // Restoring the base layout reproduces its placements under a new snapshot
  // identity (creation is manualEdit, so the digest differs from the solver's).
  expect(undone.plan.edit.head!.content.placements).toEqual(base.content.placements);
  session.redoEdit();
  const redone = await until(
    session,
    (s) => s.plan.edit.pending === null && s.plan.edit.head !== null,
  );
  expect(redone.plan.edit.head!.planSnapshotId).toBe(head.planSnapshotId);
  expect(redone.plan.edit.undo.length).toBe(1);
  expect(redone.plan.edit.redo.length).toBe(0);
  // A fresh session on a new port restores the persisted chain head.
  await session.close(true);
  const reopened = watch(new ProjectSession(repo, controller, projectId, 'test-build'));
  await reopened.open();
  await until(reopened, (s) => s.status === 'ready' && !s.staleInput, 30000);
  expect(reopened.snapshot.plan.edit.head?.planSnapshotId).toBe(head.planSnapshotId);
  expect(reopened.snapshot.plan.edit.undo.length).toBe(1);
}, 90000);

it('a rejected edit is explained and never becomes a plan; a superseded reply cannot overwrite', async () => {
  const { repo, controller } = world();
  const projectId = await seedCommitted(repo);
  const session = watch(new ProjectSession(repo, controller, projectId, 'test-build'));
  await session.open();
  await until(session, (s) => s.context === 'installed');
  session.startSearch();
  const done = await until(session, (s) => s.plan.search === 'done', 30000);
  const base = done.plan.alternatives[0]!;
  const placement = base.content.placements[0]!;
  // Blocking failure: the move leaves the space interior; no snapshot leaks.
  session.requestLayoutEdit(
    {
      kind: 'movePlacement',
      placementId: placement.id,
      position: { x: 9_999_999, y: 0, z: 0 },
    },
    base.planSnapshotId,
  );
  const rejected = await until(session, (s) => s.plan.edit.pending === null);
  expect(rejected.plan.edit.rejection).not.toBeNull();
  expect(rejected.plan.edit.rejection!.command.kind).toBe('movePlacement');
  expect(rejected.plan.edit.head).toBeNull();
  expect(rejected.plan.edit.undo.length).toBe(0);
  expect(rejected.plan.search).toBe('done');
  // Two rapid requests: the first reply is fenced by the edit sequence and
  // only the newest command can land — late replies never win.
  session.requestLayoutEdit(
    {
      kind: 'movePlacement',
      placementId: placement.id,
      position: { x: 9_999_999, y: 0, z: 0 },
    },
    base.planSnapshotId,
  );
  session.requestLayoutEdit(
    {
      kind: 'movePlacement',
      placementId: placement.id,
      position: { ...placement.position },
    },
    base.planSnapshotId,
  );
  const settled = await until(
    session,
    (s) => s.plan.edit.pending === null,
  );
  // The second (permitted) command won; the stale rejection was dropped.
  expect(settled.plan.edit.head).not.toBeNull();
  expect(settled.plan.edit.rejection).toBeNull();
  expect(settled.plan.edit.undo.length).toBe(1);
  // Committing a new input revision invalidates the whole edit chain.
  session.edit('space.interior.width', '610');
  session.commit();
  await until(session, (s) => s.saveState === 'saved');
  await until(session, (s) => s.plan.edit.head === null);
  expect(session.snapshot.plan.edit.undo.length).toBe(0);
  expect(session.snapshot.plan.edit.selectedPlacementId).toBeNull();
}, 90000);
