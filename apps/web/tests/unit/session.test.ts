import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { initSync, Runtime } from '../../../../crates/wasm/pkg/zari_wasm.js';
import { WORKER_BUILD_ID } from '../../src/worker/client';
import type {
  CatalogSnapshot,
  ProjectInput,
  ProtocolRequest,
} from '../../src/contracts/generated/dto';
import { readInputProjection } from '../../src/features/plan/projection';
import { normalizedView, readEvidence } from '../../src/features/project/detailFacts';
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
  const gate = globalThis as {
    __zariNextFactsGate?: unknown;
    __zariNextFactsInject?: unknown;
    __zariNextFactsForeign?: unknown;
  };
  delete gate.__zariNextFactsGate;
  delete gate.__zariNextFactsInject;
  delete gate.__zariNextFactsForeign;
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
    command: { kind: 'initialize', buildId: WORKER_BUILD_ID, expectedProtocolVersion: 1, expectedSchemaVersion: 1 },
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
    (s) =>
      s.plan.edit.pending === null &&
      s.plan.edit.head !== null &&
      s.plan.edit.persist?.kind !== 'saving',
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
    (s) =>
      s.plan.edit.pending === null &&
      s.plan.edit.head !== null &&
      s.plan.edit.persist?.kind !== 'saving',
  );
  expect(undone.plan.edit.undo.length).toBe(0);
  expect(undone.plan.edit.redo.length).toBe(1);
  // Restoring the base layout reproduces its placements under a new snapshot
  // identity (creation is manualEdit, so the digest differs from the solver's).
  expect(undone.plan.edit.head!.content.placements).toEqual(base.content.placements);
  session.redoEdit();
  const redone = await until(
    session,
    (s) =>
      s.plan.edit.pending === null &&
      s.plan.edit.head !== null &&
      s.plan.edit.persist?.kind !== 'saving',
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

it('a history shortcut pressed while the verified head is saving is applied once the write finishes', async () => {
  const { repo, controller } = world();
  const projectId = await seedCommitted(repo);
  const session = watch(new ProjectSession(repo, controller, projectId, 'test-build'));
  await session.open();
  await until(session, (s) => s.context === 'installed');
  session.startSearch();
  const done = await until(session, (s) => s.plan.search === 'done', 30000);
  const base = done.plan.alternatives[0]!;
  const placement = base.content.placements[0]!;
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
    (s) =>
      s.plan.edit.pending === null &&
      s.plan.edit.head !== null &&
      s.plan.edit.persist?.kind !== 'saving',
  );
  const headId = moved.plan.edit.head!.planSnapshotId;
  let hold = false;
  let release = (): void => {};
  const original = repo.commitEditSnapshot.bind(repo);
  repo.commitEditSnapshot = (input) => {
    const run = () => original(input);
    if (!hold) return run();
    return new Promise((resolve) => {
      release = () => resolve(run());
    });
  };
  hold = true;
  session.undoEdit();
  const saving = await until(
    session,
    (s) => s.plan.edit.persist?.kind === 'saving' && s.plan.edit.undo.length === 0,
  );
  expect(saving.plan.edit.redo.length).toBe(1);
  expect(saving.plan.edit.pending).toBeNull();
  // The shortcut is kept. A move command during the same window still cannot replace it.
  session.redoEdit();
  session.requestLayoutEdit(
    {
      kind: 'movePlacement',
      placementId: placement.id,
      position: { ...placement.position, x: placement.position.x + 5 },
    },
    saving.plan.edit.head!.planSnapshotId,
  );
  expect(session.snapshot.plan.edit.pending).toBeNull();
  expect(session.snapshot.plan.edit.redo.length).toBe(1);
  expect(session.snapshot.plan.edit.undo.length).toBe(0);
  hold = false;
  release();
  const redone = await until(
    session,
    (s) =>
      s.plan.edit.pending === null &&
      s.plan.edit.persist?.kind !== 'saving' &&
      s.plan.edit.undo.length === 1,
  );
  expect(redone.plan.edit.redo.length).toBe(0);
  expect(redone.plan.edit.head!.planSnapshotId).toBe(headId);
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
  // While one edit is pending, a second command cannot replace it.
  // After that rejection settles, the permitted move is a single transition.
  session.requestLayoutEdit(
    {
      kind: 'movePlacement',
      placementId: placement.id,
      position: { x: 9_999, y: 0, z: 0 },
    },
    base.planSnapshotId,
  );
  const locked = session.snapshot.plan.edit.pending?.command;
  expect(locked?.kind).toBe('movePlacement');
  session.requestLayoutEdit(
    {
      kind: 'movePlacement',
      placementId: placement.id,
      position: { ...placement.position },
    },
    base.planSnapshotId,
  );
  expect(session.snapshot.plan.edit.pending?.command).toEqual(locked);
  const otherId = done.plan.alternatives[1]?.planSnapshotId ?? null;
  if (otherId) {
    session.selectAlternative(otherId);
    expect(session.snapshot.plan.selectedId).not.toBe(otherId);
  }
  const acceptedBefore = session.snapshot.plan.accepted;
  void session.acceptPlan(base.planSnapshotId);
  expect(session.snapshot.plan.acceptState).not.toBe('saving');
  expect(session.snapshot.plan.accepted).toEqual(acceptedBefore);
  const held = await until(session, (s) => s.plan.edit.pending === null);
  expect(held.plan.edit.head).toBeNull();
  expect(held.plan.edit.undo.length).toBe(0);
  expect(held.plan.edit.rejection).not.toBeNull();
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
    (s) =>
      s.plan.edit.pending === null &&
      s.plan.edit.head !== null &&
      s.plan.edit.persist?.kind !== 'saving',
  );
  // The permitted command, sent after the pending lock lifted, is the one undo step.
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

it('a failed device write keeps the verified head, and an epoch change drops an in-flight move', async () => {
  const { repo, controller } = world();
  const projectId = await seedCommitted(repo);
  const session = watch(new ProjectSession(repo, controller, projectId, 'test-build'));
  await session.open();
  await until(session, (s) => s.context === 'installed');
  session.startSearch();
  const done = await until(session, (s) => s.plan.search === 'done', 30000);
  const base = done.plan.alternatives[0]!;
  const placement = base.content.placements[0]!;
  const original = repo.commitEditSnapshot.bind(repo);
  repo.commitEditSnapshot = async () => {
    throw new Error('disk');
  };
  session.requestLayoutEdit(
    {
      kind: 'movePlacement',
      placementId: placement.id,
      position: { ...placement.position },
    },
    base.planSnapshotId,
  );
  const unsaved = await until(
    session,
    (s) => s.plan.edit.head !== null && s.plan.edit.persist?.kind === 'unsaved',
  );
  expect(unsaved.plan.edit.rejection).toBeNull();
  expect(unsaved.plan.accepted).toBeNull();
  expect(unsaved.saveState).toBe('error');
  const headId = unsaved.plan.edit.head!.planSnapshotId;
  repo.commitEditSnapshot = original;
  session.retryEditPersist();
  const saved = await until(
    session,
    (s) => s.plan.edit.persist === null && s.plan.edit.head?.planSnapshotId === headId,
  );
  expect(saved.plan.edit.rejection).toBeNull();
  expect(saved.plan.accepted).toBeNull();
  const bundle = await repo.loadBundle(projectId);
  expect(bundle.draft?.edit?.headSnapshotId).toBe(headId);
  const headPlacement = saved.plan.edit.head!.content.placements.find((item) => item.id === placement.id)!;
  repo.commitEditSnapshot = async () => ({ status: 'conflict' });
  session.requestLayoutEdit(
    {
      kind: 'movePlacement',
      placementId: placement.id,
      position: { ...headPlacement.position },
    },
    saved.plan.edit.head!.planSnapshotId,
  );
  const conflicted = await until(session, (s) => s.plan.edit.persist?.kind === 'conflict');
  expect(conflicted.saveState).toBe('conflict');
  expect(conflicted.conflict).not.toBeNull();
  expect(conflicted.plan.edit.rejection).toBeNull();
  expect(conflicted.plan.accepted).toBeNull();
  repo.commitEditSnapshot = original;
  session.requestLayoutEdit(
    {
      kind: 'movePlacement',
      placementId: placement.id,
      position: { x: placement.position.x + 2, y: placement.position.y, z: placement.position.z },
    },
    conflicted.plan.edit.head!.planSnapshotId,
  );
  expect(session.snapshot.plan.edit.pending).toBeNull();
  await session.reloadLatest();
  await until(session, (s) => s.conflict === null && s.plan.edit.head?.planSnapshotId === headId);
  session.requestLayoutEdit(
    {
      kind: 'movePlacement',
      placementId: placement.id,
      position: { x: placement.position.x + 3, y: placement.position.y, z: placement.position.z },
    },
    headId,
  );
  expect(session.snapshot.plan.edit.pending).not.toBeNull();
  session.edit('space.interior.width', '612');
  const dropped = await until(session, (s) => s.plan.edit.pending === null);
  expect(dropped.plan.edit.head?.planSnapshotId).toBe(headId);
}, 90000);

it('one normalized input asks Rust for projectSpatialView once and repeats hit the cache', async () => {
  const { repo, controller, ports } = world();
  const projectId = await seedCommitted(repo);
  const session = watch(new ProjectSession(repo, controller, projectId, 'test-build'));
  await session.open();
  const ready = await until(
    session,
    (s) => s.status === 'ready' && s.worker === 'ready' && s.normalizedInput !== null && s.inputDigest !== null,
  );
  const input = ready.normalizedInput!;
  const digest = ready.inputDigest!;
  session.ensureInputProjection(input, digest);
  session.ensureInputProjection(input, digest);
  await until(
    session,
    (s) => readInputProjection(s.plan.projections, digest)?.status === 'ready',
  );
  const spatial = () =>
    ports.flatMap((port) => port.sent).filter((request) => request.command.kind === 'projectSpatialView');
  expect(spatial()).toHaveLength(1);
  expect(session.spatialRequestCount).toBe(1);
  expect(spatial()[0]?.command).toMatchObject({
    kind: 'projectSpatialView',
    source: { kind: 'normalizedInput', inputDigest: digest },
  });
  session.ensureInputProjection(input, digest);
  expect(session.spatialRequestCount).toBe(1);
  expect(spatial()).toHaveLength(1);
});

it('accepted progress stays on its binding across edit, accept switch, and a late reply', async () => {
  const { repo, controller } = world();
  const projectId = await seedCommitted(repo);
  const session = watch(new ProjectSession(repo, controller, projectId, 'test-build'));
  await session.open();
  await until(session, (s) => s.context === 'installed');
  session.startSearch();
  const done = await until(session, (s) => s.plan.search === 'done', 30000);
  const chosen = done.plan.alternatives[0]!;
  const before = JSON.stringify(chosen);
  void session.acceptPlan(chosen.planSnapshotId);
  await until(session, (s) => s.plan.acceptState === 'saved' && s.plan.progressLoad === 'ready');
  const actions = session.snapshot.plan.acceptedSnapshot?.content.actions ?? [];
  const userAssertion = (action: (typeof actions)[number]) =>
    action.kind === 'clearSpace' ||
    action.kind === 'verifyUnassigned' ||
    action.kind === 'confirmArrival' ||
    action.kind === 'resolveCondition';
  const first = actions.find(
    (action) =>
      userAssertion(action) &&
      action.prerequisiteStepIds.length === 0 &&
      action.requiredConfirmations.length === 0,
  );
  expect(first).toBeDefined();
  await session.toggleActionStep(first!.id, true);
  await until(session, (s) => s.plan.actionProgress?.[first!.id] === 'done');
  const bound = await repo.loadBundle(projectId);
  const stored = bound.snapshots.find((row) => row.planSnapshotId === chosen.planSnapshotId);
  expect(JSON.stringify(stored?.snapshot)).toBe(before);
  expect(session.snapshot.plan.actionProgress).not.toBeNull();

  const placement = chosen.content.placements[0];
  expect(placement).toBeDefined();
  session.requestLayoutEdit(
    {
      kind: 'movePlacement',
      placementId: placement!.id,
      position: { ...placement!.position },
    },
    chosen.planSnapshotId,
  );
  const edited = await until(
    session,
    (s) => s.plan.edit.pending === null && s.plan.edit.head !== null && s.plan.edit.persist?.kind !== 'saving',
    30000,
  );
  expect(edited.plan.edit.rejection).toBeNull();
  const head = edited.plan.edit.head!;
  expect(head.planSnapshotId).not.toBe(chosen.planSnapshotId);
  expect(
    await repo.actionProgressFor(projectId, session.snapshot.inputRevision, head.planSnapshotId),
  ).toEqual([]);
  expect(session.snapshot.plan.actionProgress?.[first!.id]).toBe('done');

  const second =
    actions.find(
      (action) =>
        action.id !== first!.id &&
        userAssertion(action) &&
        action.requiredConfirmations.length === 0 &&
        action.prerequisiteStepIds.every((id) => id === first!.id || session.snapshot.plan.actionProgress?.[id] === 'done'),
    ) ?? first!;
  let release: () => void = () => {};
  let held = false;
  (globalThis as { __zariProgressGate?: () => Promise<void> }).__zariProgressGate = () =>
    new Promise((resolve) => {
      held = true;
      release = resolve;
    });
  try {
    const pending = session.toggleActionStep(second.id, true);
    const deadline = Date.now() + 8000;
    while (!held && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    expect(held).toBe(true);
    void session.acceptPlan(head.planSnapshotId);
    await until(
      session,
      (s) =>
        s.plan.acceptState === 'saved' &&
        s.plan.accepted?.planSnapshotId === head.planSnapshotId &&
        s.plan.progressLoad === 'ready',
    );
    release();
    await pending;
    expect(session.snapshot.plan.accepted?.planSnapshotId).toBe(head.planSnapshotId);
    expect(session.snapshot.plan.actionProgress?.[second.id]).not.toBe('done');
    const inputRevision = session.snapshot.inputRevision;
    expect(await repo.actionProgressFor(projectId, inputRevision, head.planSnapshotId)).toEqual([]);
    const originalRows = await repo.actionProgressFor(projectId, inputRevision, chosen.planSnapshotId);
    expect(originalRows.some((row) => row.stepId === first!.id && row.status === 'done')).toBe(true);
  } finally {
    delete (globalThis as { __zariProgressGate?: unknown }).__zariProgressGate;
  }

  const originalRead = repo.actionProgressFor.bind(repo);
  repo.actionProgressFor = async () => {
    throw new Error('read_failed');
  };
  try {
    await session.reloadLatest();
    await until(session, (s) => s.plan.progressLoad === 'error' && s.plan.actionProgress === null);
    await session.toggleActionStep(first!.id, true);
    expect(session.snapshot.plan.actionError).toBe('progress_unavailable');
    expect(session.snapshot.plan.actionProgress).toBeNull();
  } finally {
    repo.actionProgressFor = originalRead;
  }
  await session.reloadLatest();
  await until(session, (s) => s.plan.progressLoad === 'ready' && s.plan.actionProgress !== null);
  const progressBefore = { ...session.snapshot.plan.actionProgress! };
  const originalWrite = repo.setActionStep.bind(repo);
  repo.setActionStep = async () => {
    throw new Error('disk_unavailable');
  };
  try {
    await session.toggleActionStep(first!.id, false);
    expect(session.snapshot.plan.actionProgress).toEqual(progressBefore);
    expect(session.snapshot.plan.actionError).toBe('disk_unavailable');
    expect(session.snapshot.plan.actionRetry).toEqual({ stepId: first!.id, done: false });
  } finally {
    repo.setActionStep = originalWrite;
  }

  session.edit('space.interior.width', '610');
  session.commit();
  await until(session, (s) => s.saveState === 'saved');
  await until(session, () => !session.isCurrentSnapshot(head));
  await session.toggleActionStep(head.content.actions[0]?.id ?? first!.id, true);
  expect(session.snapshot.plan.actionError).toBe('stale_input');
}, 120000);

it('a blocked step cannot be checked off and a clear assertion leaves checks unchanged', async () => {
  const { repo, controller } = world();
  const projectId = await seedCommitted(repo);
  const session = watch(new ProjectSession(repo, controller, projectId, 'test-build'));
  await session.open();
  await until(session, (s) => s.context === 'installed');
  session.startSearch();
  await until(session, (s) => s.plan.search === 'done', 30000);
  const chosen = session.snapshot.plan.alternatives[0];
  expect(chosen).toBeDefined();
  void session.acceptPlan(chosen!.planSnapshotId);
  await until(session, (s) => s.plan.actionEligibility?.eligible === true, 30000);
  const eligibility = session.snapshot.plan.actionEligibility;
  const blocked = eligibility?.rows.find((row) => !row.executable && row.blockerCheckIds.length > 0);
  expect(blocked).toBeDefined();
  const checksBefore = JSON.stringify(session.snapshot.plan.acceptedSnapshot?.content.validation.checks);
  await session.toggleActionStep(blocked!.actionId, true);
  expect(session.snapshot.plan.actionError).toBe('blocked_condition');
  expect(session.snapshot.plan.actionProgress?.[blocked!.actionId]).not.toBe('done');
  expect(JSON.stringify(session.snapshot.plan.acceptedSnapshot?.content.validation.checks)).toBe(checksBefore);
  const clear = session.snapshot.plan.acceptedSnapshot?.content.actions.find(
    (action) => action.kind === 'clearSpace',
  );
  expect(clear).toBeDefined();
  await session.toggleActionStep(clear!.id, true);
  await until(session, (s) => s.plan.actionProgress?.[clear!.id] === 'done');
  expect(JSON.stringify(session.snapshot.plan.acceptedSnapshot?.content.validation.checks)).toBe(checksBefore);
  await until(
    session,
    (s) => s.plan.actionEligibility?.rows.find((row) => row.actionId === blocked!.actionId)?.executable === false,
  );
}, 120000);

const HANDLING = ['left', 'right', 'top', 'pullExtraDepth', 'liftAboveRim'] as const;

async function readySession() {
  const { repo, controller } = world();
  const project = await repo.createProject('테스트', emptyProjectForm());
  await repo.putCatalog(catalog, 'test-seed');
  const session = watch(new ProjectSession(repo, controller, project.projectId, 'test-build'));
  await session.open();
  await until(session, (s) => s.status === 'ready');
  return { repo, controller, session };
}

it('normalizes a new project with unknown support and every handling fact', async () => {
  const { session } = await readySession();
  session.commit();
  const saved = await until(session, (s) => s.saveState === 'saved' && s.inputRevision !== '0');
  expect(saved.diagnostics).toEqual([]);
  expect(normalizedView(saved.normalizedInput, 'space.staging.baseSupport').state).toBe('unknown');
  for (const item of saved.form!.items) {
    for (const axis of HANDLING) {
      const view = normalizedView(
        saved.normalizedInput,
        `items.${item.id}.requirement.handling.${axis}`,
      );
      expect(`${item.id}.${axis}:${view.state}`).toBe(`${item.id}.${axis}:unknown`);
    }
  }
});

it('keeps the sample support load and handling when the sample is chosen', async () => {
  const { session } = await readySession();
  session.replaceForm(sampleProjectForm());
  session.commit();
  const saved = await until(session, (s) => s.saveState === 'saved' && s.inputRevision !== '0');
  expect(normalizedView(saved.normalizedInput, 'space.staging.baseSupport.loadLimit').nominal).toBe(50000);
  expect(normalizedView(saved.normalizedInput, 'items.item-a.requirement.handling.left').nominal).toBe(5);
  expect(normalizedView(saved.normalizedInput, 'items.item-a.requirement.handling.pullExtraDepth').nominal).toBe(0);
  expect(normalizedView(saved.normalizedInput, 'items.item-a.requirement.handling.liftAboveRim').nominal).toBe(0);
  expect(normalizedView(saved.normalizedInput, 'items.item-b.requirement.handling.left').nominal).toBe(2);
  expect(normalizedView(saved.normalizedInput, 'items.item-b.requirement.handling.pullExtraDepth').state).toBe('known');
  expect(normalizedView(saved.normalizedInput, 'items.item-b.requirement.handling.pullExtraDepth').nominal).toBe(0);
});

it('converts a bounded group through Rust and holds invalid or partial text', async () => {
  const { session } = await readySession();
  session.edit('space.interior.width', '600');
  session.editUncertainty('space.interior.width', {
    state: 'bounded',
    minusText: '10',
    plusText: '20',
    unit: 'mm',
  });
  session.setUnit('space.interior.width', 'cm');
  await until(session, (s) => getMeasurement(s.form!, 'space.interior.width').text === '60');
  expect(getMeasurement(session.snapshot.form!, 'space.interior.width').uncertainty).toEqual({
    state: 'bounded',
    minusText: '1',
    plusText: '2',
    unit: 'cm',
  });

  session.edit('space.interior.width', '60ㄱ');
  const requests = session.snapshot.normalizeRequests;
  session.setUnit('space.interior.width', 'mm');
  await until(session, (s) => s.normalizeRequests > requests && s.unitHold !== null);
  expect(getMeasurement(session.snapshot.form!, 'space.interior.width').text).toBe('60ㄱ');
  expect(getMeasurement(session.snapshot.form!, 'space.interior.width').unit).toBe('cm');
  expect(session.snapshot.unitHold?.code).toBe('invalid_number');

  session.edit('space.interior.depth', '400');
  session.editUncertainty('space.interior.depth', {
    state: 'bounded',
    minusText: '',
    plusText: '3',
    unit: 'mm',
  });
  const beforeHold = session.snapshot.normalizeRequests;
  session.setUnit('space.interior.depth', 'cm');
  await until(session, (s) => s.normalizeRequests > beforeHold && s.unitHold?.fieldPath === 'space.interior.depth');
  const depth = getMeasurement(session.snapshot.form!, 'space.interior.depth');
  expect(depth.text).toBe('400');
  expect(depth.unit).toBe('mm');
  expect(depth.uncertainty).toEqual({ state: 'bounded', minusText: '', plusText: '3', unit: 'mm' });
});

it('rejects a partial bound commit and keeps the previous normalized input', async () => {
  const { session } = await readySession();
  session.edit('space.interior.width', '600');
  session.commit();
  const committed = await until(session, (s) => s.inputRevision === '1' && s.saveState === 'saved');
  const digest = committed.inputDigest;
  session.editUncertainty('space.interior.width', {
    state: 'bounded',
    minusText: '2',
    plusText: '',
    unit: 'mm',
  });
  session.commit();
  const held = await until(
    session,
    (s) => s.saveState === 'saved' && s.diagnostics.some((d) => d.code === 'uncertainty_missing'),
  );
  expect(held.inputRevision).toBe('1');
  expect(held.inputDigest).toBe(digest);
  expect(normalizedView(held.normalizedInput, 'space.interior.width')).toMatchObject({
    state: 'known',
    nominal: 600,
    minusMm: null,
    plusMm: null,
  });
  expect(getMeasurement(held.form!, 'space.interior.width').uncertainty).toEqual({
    state: 'bounded',
    minusText: '2',
    plusText: '',
    unit: 'mm',
  });
});

it('keeps a human conflict note unverified through normalize and reload', async () => {
  const { repo, controller, session } = await readySession();
  const projectId = session.snapshot.projectId;
  session.edit('space.interior.width', '600');
  session.editOrigin('space.interior.width', 'userMeasured');
  session.editEvidence('space.interior.width', {
    note: '다른 줄자와 충돌한다. 평균 590 mm.',
    locator: 'local:tape',
    observedAt: '2026-10-07T00:00:00Z',
    sourceKind: 'userMeasured',
  });
  session.commit();
  const saved = await until(session, (s) => s.inputRevision === '1' && s.saveState === 'saved');
  expect(saved.diagnostics.some((d) => d.code === 'conflicting_sources')).toBe(false);
  expect(normalizedView(saved.normalizedInput, 'space.interior.width')).toMatchObject({
    nominal: 600,
    verification: 'unverified',
    origin: 'userMeasured',
    minusMm: null,
  });
  expect(readEvidence(saved.form!, 'space.interior.width')).toMatchObject({
    note: '다른 줄자와 충돌한다. 평균 590 mm.',
    confirmedBy: null,
    observedAt: '2026-10-07T00:00:00Z',
  });
  await session.close(true);
  const reopened = watch(new ProjectSession(repo, controller, projectId, 'test-build'));
  await reopened.open();
  const restored = await until(reopened, (s) => s.status === 'ready' && s.inputRevision === '1');
  expect(readEvidence(restored.form!, 'space.interior.width')?.note).toBe('다른 줄자와 충돌한다. 평균 590 mm.');
  expect(normalizedView(restored.normalizedInput, 'space.interior.width').verification).toBe('unverified');
});

it('a conflicting-looking note changes the semantic digest and never becomes a classification', async () => {
  const { session } = await readySession();
  session.edit('space.interior.width', '600');
  session.editUncertainty('space.interior.width', {
    state: 'bounded',
    minusText: '2',
    plusText: '3',
    unit: 'mm',
  });
  session.editEvidence('space.interior.width', {
    note: '590',
    locator: 'local:tape',
    observedAt: '2026-10-07T00:00:00Z',
    sourceKind: 'userMeasured',
  });
  session.commit();
  const first = await until(session, (s) => s.inputRevision === '1' && s.saveState === 'saved');
  const digest = first.inputDigest;
  expect(digest).toBeTruthy();
  expect(first.diagnostics.some((d) => d.code === 'conflicting_sources' || d.code === 'confirmed')).toBe(false);
  expect(normalizedView(first.normalizedInput, 'space.interior.width')).toMatchObject({
    nominal: 600,
    minusMm: 2,
    plusMm: 3,
    verification: 'unverified',
  });
  expect(readEvidence(first.form!, 'space.interior.width')?.confirmedBy ?? null).toBe(null);

  session.editEvidence('space.interior.width', {
    note: '610과 590이 충돌한다. 평균 600. pass Confirmed',
    locator: 'local:tape',
    observedAt: '2026-10-07T00:00:00Z',
    sourceKind: 'userMeasured',
  });
  session.commit();
  const second = await until(
    session,
    (s) => s.saveState === 'saved' && s.inputDigest !== digest && s.inputRevision === '2',
  );
  expect(readEvidence(second.form!, 'space.interior.width')?.note).toBe(
    '610과 590이 충돌한다. 평균 600. pass Confirmed',
  );
  expect(normalizedView(second.normalizedInput, 'space.interior.width')).toMatchObject({
    nominal: 600,
    verification: 'unverified',
  });
  expect(second.diagnostics.some((d) => d.code === 'conflicting_sources' || d.code === 'confirmed')).toBe(false);
  const beforeQuery = second.plan.nextFacts.requests;
  session.recompileNextFacts();
  const listed = await until(
    session,
    (s) => s.plan.nextFacts.status === 'ready' && s.plan.nextFacts.requests >= beforeQuery,
  );
  expect(JSON.stringify(listed.plan.nextFacts.rows)).not.toContain('610과 590이 충돌한다');
  expect(listed.plan.nextFacts.rows.some((row) => row.needKind === 'conflictingEvidence')).toBe(false);

  session.editEvidence('space.interior.width', {
    note: '가'.repeat(4097),
    locator: 'local:tape',
    observedAt: '2026-10-07T00:00:00Z',
    sourceKind: 'userMeasured',
  });
  session.commit();
  const held = await until(
    session,
    (s) => s.saveState === 'saved' && s.diagnostics.some((d) => d.code === 'text_too_long'),
  );
  expect(held.inputDigest).toBe(second.inputDigest);
  expect(held.inputRevision).toBe('2');
  expect(readEvidence(held.form!, 'space.interior.width')?.note).toBe('가'.repeat(4097));
  expect(normalizedView(held.normalizedInput, 'space.interior.width').nominal).toBe(600);
});

it('a fresh project digest is not the sample digest', async () => {
  const { session } = await readySession();
  session.commit();
  const fresh = await until(session, (s) => s.saveState === 'saved' && s.inputRevision !== '0');
  expect(normalizedView(fresh.normalizedInput, 'space.staging.baseSupport').state).toBe('unknown');
  const freshDigest = fresh.inputDigest;
  session.replaceForm(sampleProjectForm());
  session.commit();
  const sample = await until(
    session,
    (s) => s.saveState === 'saved' && s.inputDigest !== freshDigest && s.inputRevision !== fresh.inputRevision,
  );
  expect(normalizedView(sample.normalizedInput, 'space.staging.baseSupport.loadLimit')).toMatchObject({
    state: 'known',
    nominal: 50000,
  });
});

it('treats an explicit zero as known and keeps signed offsets exact', async () => {
  const { session } = await readySession();
  const form = emptyProjectForm();
  form.items[0]!.id = 'shelf-9';
  for (const group of form.groups) {
    group.itemIds = group.itemIds.map((id) => (id === 'item-a' ? 'shelf-9' : id));
  }
  session.replaceForm(form);
  session.editNominal('items.shelf-9.quantity', '0');
  session.editNominal('items.shelf-9.requirement.handling.pullExtraDepth', '0');
  session.editNominal('space.opening.left', '0');
  session.editUncertainty('space.opening.left', {
    state: 'bounded',
    minusText: '0',
    plusText: '0',
    unit: 'mm',
  });
  session.editNominal('space.opening.bottom', '-2');
  session.editUncertainty('space.opening.bottom', {
    state: 'bounded',
    minusText: '3',
    plusText: '4',
    unit: 'mm',
  });
  session.commit();
  const saved = await until(session, (s) => s.saveState === 'saved' || s.saveState === 'error');
  expect(saved.diagnostics.map((d) => `${d.fieldPath}:${d.code}`)).toEqual([]);
  expect(normalizedView(saved.normalizedInput, 'items.shelf-9.quantity')).toMatchObject({
    state: 'known',
    nominal: 0,
  });
  expect(normalizedView(saved.normalizedInput, 'items.shelf-9.requirement.handling.pullExtraDepth')).toMatchObject({
    state: 'known',
    nominal: 0,
  });
  expect(normalizedView(saved.normalizedInput, 'space.opening.left')).toMatchObject({
    state: 'known',
    nominal: 0,
    minusMm: 0,
    plusMm: 0,
    verification: 'unverified',
  });
  expect(normalizedView(saved.normalizedInput, 'space.opening.bottom')).toMatchObject({
    nominal: -2,
    minusMm: 3,
    plusMm: 4,
  });
}, 20000);

function nextFactSends(ports: WasmPort[]): number {
  return ports.reduce(
    (count, port) => count + port.sent.filter((request) => request.command.kind === 'queryNextFacts').length,
    0,
  );
}

it('asks once for the committed source and again only on explicit recompile', async () => {
  const { repo, controller, ports } = world();
  const project = await repo.createProject('테스트', emptyProjectForm());
  await repo.putCatalog(catalog, 'test-seed');
  const session = watch(new ProjectSession(repo, controller, project.projectId, 'test-build'));
  await session.open();
  const ready = await until(session, (s) => s.plan.nextFacts.status === 'ready');
  expect(ready.plan.nextFacts.freshness).toBe('inputOnly');
  expect(ready.plan.nextFacts.requests).toBe(1);
  expect(nextFactSends(ports)).toBe(1);
  expect(ready.plan.nextFacts.rows.some((row) => row.factKey === 'space-1:space.interior.width')).toBe(true);
  const revision = ready.projectRevision;
  session.edit('space.interior.width', '1200');
  session.editUncertainty('space.interior.width', {
    state: 'bounded',
    minusText: '2',
    plusText: '3',
    unit: 'mm',
  });
  session.editEvidence('space.interior.width', {
    note: 'NOTE_TOKEN_91mm conflict',
    locator: '',
    observedAt: '',
    sourceKind: 'userDeclared',
  });
  expect(session.snapshot.plan.nextFacts.status).toBe('stale');
  expect(session.snapshot.plan.nextFacts.rows).toEqual([]);
  expect(session.snapshot.plan.nextFacts.requests).toBe(1);
  expect(session.snapshot.projectRevision).toBe(revision);
  session.commit();
  const saved = await until(session, (s) => s.saveState === 'saved' || s.saveState === 'error');
  expect(saved.saveState).toBe('saved');
  expect(saved.plan.nextFacts.requests).toBe(1);
  expect(nextFactSends(ports)).toBe(1);
  session.recompileNextFacts();
  const again = await until(
    session,
    (s) => s.plan.nextFacts.status === 'ready' && s.plan.nextFacts.requests === 2,
  );
  expect(nextFactSends(ports)).toBe(2);
  expect(again.plan.nextFacts.rows.some((row) => row.factKey === 'space-1:space.interior.width')).toBe(false);
  expect(again.plan.nextFacts.rows.length).toBeGreaterThan(0);
  expect(JSON.stringify(again.plan.nextFacts.rows)).not.toContain('NOTE_TOKEN_91mm');
  expect(again.plan.nextFacts.rows.some((row) => row.needKind === 'conflictingEvidence')).toBe(false);
  session.recompileNextFacts();
  expect(session.snapshot.plan.nextFacts.requests).toBe(2);
  expect(nextFactSends(ports)).toBe(2);
}, 20000);

it('a held reply cannot paint the list after the draft moves', async () => {
  let release: () => void = () => {};
  (globalThis as { __zariNextFactsGate?: () => Promise<void> }).__zariNextFactsGate = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const { repo, controller, ports } = world();
  const project = await repo.createProject('테스트', emptyProjectForm());
  await repo.putCatalog(catalog, 'test-seed');
  const session = watch(new ProjectSession(repo, controller, project.projectId, 'test-build'));
  await session.open();
  await until(session, (s) => s.plan.nextFacts.requests === 1 && s.plan.nextFacts.status === 'loading');
  session.edit('space.interior.width', '1');
  release();
  await until(session, (s) => s.plan.nextFacts.status === 'stale');
  expect(session.snapshot.plan.nextFacts.rows).toEqual([]);
  expect(session.snapshot.plan.nextFacts.requests).toBe(1);
  expect(nextFactSends(ports)).toBe(1);
}, 20000);

it('a limit injection publishes no rows', async () => {
  (globalThis as { __zariNextFactsInject?: string }).__zariNextFactsInject = 'limit';
  const { repo, controller } = world();
  const project = await repo.createProject('테스트', emptyProjectForm());
  await repo.putCatalog(catalog, 'test-seed');
  const session = watch(new ProjectSession(repo, controller, project.projectId, 'test-build'));
  await session.open();
  const limited = await until(session, (s) => s.plan.nextFacts.status === 'limited');
  expect(limited.plan.nextFacts.rows).toEqual([]);
  expect(limited.plan.nextFacts.failureCode).toBe('completion_limit_exceeded');
  expect(limited.plan.nextFacts.requests).toBe(1);
}, 20000);

it('a foreign stamp is dropped and a recovered worker asks again', async () => {
  const { repo, controller, ports } = world();
  const project = await repo.createProject('테스트', emptyProjectForm());
  await repo.putCatalog(catalog, 'test-seed');
  const session = watch(new ProjectSession(repo, controller, project.projectId, 'test-build'));
  await session.open();
  await until(session, (s) => s.plan.nextFacts.status === 'ready');
  (globalThis as { __zariNextFactsForeign?: boolean }).__zariNextFactsForeign = true;
  session.edit('space.interior.depth', '800');
  session.commit();
  await until(session, (s) => s.saveState === 'saved');
  session.recompileNextFacts();
  await until(session, (s) => s.plan.nextFacts.requests === 2);
  expect(session.snapshot.plan.nextFacts.rows).toEqual([]);
  expect(session.snapshot.plan.nextFacts.status).not.toBe('ready');
  (globalThis as { __zariNextFactsForeign?: boolean }).__zariNextFactsForeign = false;
  ports[0]!.crash();
  await until(session, (s) => s.plan.nextFacts.reason === 'worker');
  expect(session.snapshot.plan.nextFacts.rows).toEqual([]);
  await controller.recover();
  const restored = await until(session, (s) => s.worker === 'ready' && s.plan.nextFacts.status === 'ready');
  expect(restored.plan.nextFacts.requests).toBeGreaterThanOrEqual(3);
  expect(restored.plan.nextFacts.rows.length).toBeGreaterThan(0);
}, 20000);
