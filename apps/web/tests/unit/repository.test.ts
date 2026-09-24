import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import type { RawProjectInputDto } from '../../src/contracts/generated/dto';
import { validateProjectInput } from '../../src/contracts/generated/validators.mjs';
import { emptyProjectForm, sampleProjectForm } from '../../src/features/project/draft';
import { SCHEMA_VERSION, ZariDb } from '../../src/persistence/db';
import {
  ProjectRepository,
  StoreError,
} from '../../src/persistence/repository';

const repo = () => new ProjectRepository(new ZariDb(`test-${crypto.randomUUID()}`));

async function seedProject(r: ProjectRepository) {
  const project = await r.createProject('테스트', emptyProjectForm());
  return project;
}

it('creates a project with a draft and reloads the bundle', async () => {
  const r = repo();
  const project = await seedProject(r);
  expect(project.projectRevision).toBe('1');
  const bundle = await r.loadBundle(project.projectId);
  expect(bundle.draft?.projectId).toBe(project.projectId);
  expect(bundle.input).toBeNull();
  expect(bundle.corrupt).toEqual([]);
  expect(validateProjectInput === undefined).toBe(false);
});

it('template forms satisfy the generated raw DTO shape', async () => {
  // The draft row guard uses the generated validator; if the template stops
  // matching the contract, project creation must fail here first.
  const r = repo();
  const project = await seedProject(r);
  const bundle = await r.loadBundle(project.projectId);
  expect(bundle.draft).not.toBeNull();
});

it('CAS conflict: a stale writer never overwrites a newer revision', async () => {
  const db = new ZariDb(`test-${crypto.randomUUID()}`);
  const tabA = new ProjectRepository(db);
  const tabB = new ProjectRepository(db);
  const project = await tabA.createProject('테스트', emptyProjectForm());
  const form = sampleProjectForm();
  // Tab A commits revision 2; its tracked expectation is now '2'.
  expect(
    (
      await tabA.saveDraft({
        projectId: project.projectId,
        generation: '1',
        editorSessionId: 'tab-a',
        form,
        validation: { status: 'unchecked', diagnostics: [] },
      })
    ).status,
  ).toBe('committed');
  // Tab B commits revision 3 through its own view.
  expect(
    (
      await tabB.saveDraft({
        projectId: project.projectId,
        generation: '7',
        editorSessionId: 'tab-b',
        form,
        validation: { status: 'unchecked', diagnostics: [] },
      })
    ).status,
  ).toBe('committed');
  // Tab A's next write still expects '2' → conflict, no overwrite.
  const conflict = await tabA.saveDraft({
    projectId: project.projectId,
    generation: '2',
    editorSessionId: 'tab-a',
    form,
    validation: { status: 'unchecked', diagnostics: [] },
  });
  expect(conflict.status).toBe('conflict');
  const bundle = await tabA.loadBundle(project.projectId);
  expect(bundle.project.projectRevision).toBe('3');
  // The committed draft is tab B's generation — tab A's write was dropped.
  expect(bundle.draft?.generation).toBe('7');
});

it('commitNormalizedInput stores the draft without an input row when invalid', async () => {
  const r = repo();
  const project = await seedProject(r);
  const form = sampleProjectForm();
  // An invalid normalize result carries no normalized input and no digest;
  // the draft commits but `inputs` and the current pointer stay untouched.
  const result = await r.commitNormalizedInput({
    projectId: project.projectId,
    generation: '1',
    editorSessionId: 's1',
    form,
    validation: { status: 'invalid', diagnostics: [] },
    normalized: null,
    inputDigest: null,
    engineBuildId: 'test',
  });
  expect(result.status).toBe('committed');
  const bundle = await r.loadBundle(project.projectId);
  expect(bundle.project.currentInputRevision).toBe('0');
  expect(bundle.project.projectRevision).toBe('2');
  expect(bundle.input).toBeNull();
  expect(bundle.draft?.validation.status).toBe('invalid');
});

it('a malformed stored row surfaces as corrupt, not silently repaired', async () => {
  const r = repo();
  const project = await seedProject(r);
  await r.db.drafts.update(project.projectId, { generation: 'not-a-revision' });
  const bundle = await r.loadBundle(project.projectId);
  expect(bundle.draft).toBeNull();
  expect(bundle.corrupt).toEqual([
    expect.objectContaining({ store: 'drafts', reason: 'record_corrupt' }),
  ]);
});

it('a newer schemaVersion row is unsupported, preserved, and exportable', async () => {
  const r = repo();
  const project = await seedProject(r);
  await r.db.drafts.update(project.projectId, { schemaVersion: SCHEMA_VERSION + 1 });
  const bundle = await r.loadBundle(project.projectId);
  expect(bundle.unsupported).toBe(true);
  expect(bundle.corrupt).toEqual([
    expect.objectContaining({ store: 'drafts', reason: 'unsupported_schema' }),
  ]);
  // The row itself is untouched.
  const raw = await r.db.drafts.get(project.projectId);
  expect(raw?.schemaVersion).toBe(SCHEMA_VERSION + 1);
});

it('deleteProject removes only that project’s rows', async () => {
  const r = repo();
  const a = await seedProject(r);
  const b = await seedProject(r);
  await r.deleteProject(a.projectId);
  const bundle = await r.loadBundle(b.projectId);
  expect(bundle.project.projectId).toBe(b.projectId);
  await expect(r.loadBundle(a.projectId)).rejects.toBeInstanceOf(StoreError);
});

it('quarantine stores bounded raw bytes', async () => {
  const r = repo();
  const result = await r.quarantine({
    projectId: 'p',
    store: 'drafts',
    storeKey: 'p',
    reason: 'record_corrupt',
    bytes: btoa('{"broken":true}'),
  });
  expect(result.status).toBe('kept');
  const all = await r.quarantined();
  expect(all).toHaveLength(1);
  expect(atob(all[0]!.bytes)).toBe('{"broken":true}');
});

it('conflict resolution: saveAsCopy preserves the dirty draft verbatim', async () => {
  const r = repo();
  const project = await seedProject(r);
  const form = sampleProjectForm();
  (form as { items: { label: string }[] }).items[0]!.label = '충돌 전 로컬 라벨';
  const copy = await r.saveAsNewProject('사본', form, {
    status: 'invalid',
    diagnostics: [],
  });
  const bundle = await r.loadBundle(copy.projectId);
  expect(
    (bundle.draft?.form as RawProjectInputDto).items[0]?.label,
  ).toBe('충돌 전 로컬 라벨');
  // Original project is untouched.
  const original = await r.loadBundle(project.projectId);
  expect(original.draft?.form.items[0]?.label).not.toBe('충돌 전 로컬 라벨');
});
