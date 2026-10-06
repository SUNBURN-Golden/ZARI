/**
 * Read-only fence captured with a pointer or keyboard edit.
 * Compared again before the command is sent and before a reply is applied.
 * Runtime ids are not persisted.
 */

export type WorkspaceLease = {
  projectId: string;
  displayedPlanSnapshotId: string;
  editorEpoch: string;
  inputRevision: string;
  inputDigest: string;
  catalogDigest: string;
  projectRevision: string;
  projectActivationId: string;
  workerSessionId: string;
  workspaceGeneration: string;
};

export function leasesEqual(a: WorkspaceLease | null, b: WorkspaceLease | null): boolean {
  if (!a || !b) return false;
  return (
    a.projectId === b.projectId &&
    a.displayedPlanSnapshotId === b.displayedPlanSnapshotId &&
    a.editorEpoch === b.editorEpoch &&
    a.inputRevision === b.inputRevision &&
    a.inputDigest === b.inputDigest &&
    a.catalogDigest === b.catalogDigest &&
    a.projectRevision === b.projectRevision &&
    a.projectActivationId === b.projectActivationId &&
    a.workerSessionId === b.workerSessionId &&
    a.workspaceGeneration === b.workspaceGeneration
  );
}
