import Dexie, { type Table } from 'dexie';
import type {
  CatalogSnapshot,
  Diagnostic,
  LayoutEditCommand,
  OwnedContainer,
  PlanSnapshot,
  ProjectInput,
  RawProjectInputDto,
} from '../contracts/generated/dto';
import {
  validateCatalogSnapshot,
  validateLayoutEditCommand,
  validatePlanSnapshot,
  validateProjectInput,
  validateRawProjectInputDto,
} from '../contracts/generated/validators.mjs';

export const DB_NAME = 'zari-local';
/**
 * v1: Task 005 stores. v2: Task 009 adds the `attachments` Blob store for
 * optional local photos. Historical declarations stay so a v1 database
 * upgrades in place; a v2 database opened by a v1 build is refused by
 * IndexedDB itself (downgrade protection).
 */
export const DB_VERSION = 2;
export const SCHEMA_VERSION = 1;
const MAX_REVISION = 18446744073709551615n;

export type SaveStatus = 'unchecked' | 'valid' | 'invalid';

/** Small mutable coordination record; every project write touches it. */
export interface ProjectRow {
  schemaVersion: number;
  projectId: string;
  name: string;
  status: 'active';
  projectRevision: string;
  currentInputRevision: string;
  currentInputDigest: string | null;
  accepted: { inputRevision: string; planSnapshotId: string } | null;
  lastStep: string;
  createdAt: string;
  updatedAt: string;
  recovery: { code: string; detail: string } | null;
  /** Import provenance; absent on projects created locally. */
  importedFrom?: { sourceProjectId: string; exportedAt: string };
}
/** Immutable normalized input at one revision. */
export interface InputRow {
  schemaVersion: number;
  projectId: string;
  inputRevision: string;
  inputDigest: string;
  input: ProjectInput;
  engineBuildId: string;
  createdAt: string;
}
/**
 * One committed layout-edit transition (DOMAIN_MODEL §undo): the validated
 * domain command plus the immutable snapshot ids it moved between. No
 * closures or event objects are ever persisted.
 */
export interface EditTransition {
  baseSnapshotId: string;
  command: LayoutEditCommand;
  resultSnapshotId: string;
}
/**
 * Bounded layout-edit chain persisted inside the draft row. The chain is
 * layout-only: it lives and dies inside one input revision — when the
 * committed input digest moves, the whole chain is stale and dropped on load.
 */
export interface EditChain {
  inputDigest: string;
  /** Snapshot the chain started from (a search alternative or the accepted plan). */
  baseSnapshotId: string;
  /** Current working-plan snapshot after the applied edits. */
  headSnapshotId: string;
  undo: EditTransition[];
  redo: EditTransition[];
}
/** One embedded raw draft per project; raw text survives invalid states. */
export interface DraftRow {
  schemaVersion: number;
  projectId: string;
  generation: string;
  editorSessionId: string;
  baseInputRevision: string;
  form: RawProjectInputDto;
  validation: { status: SaveStatus; diagnostics: Diagnostic[] };
  /** Layout-edit undo/redo chain; absent on drafts that predate editing. */
  edit?: EditChain | null;
  updatedAt: string;
}
/** Immutable evaluated plan body plus its exact binding. */
export interface SnapshotRow {
  schemaVersion: number;
  projectId: string;
  inputRevision: string;
  planSnapshotId: string;
  snapshot: PlanSnapshot;
  acceptedAt: string;
  engineBuildId: string;
}
export interface OwnedContainerRow {
  schemaVersion: number;
  ownedContainerId: string;
  revision: string;
  container: OwnedContainer;
  updatedAt: string;
}
export interface CatalogRow {
  schemaVersion: number;
  catalogDigest: string;
  catalogVersion: string;
  origin: string;
  catalog: CatalogSnapshot;
  ingestedAt: string;
}
export interface ActionProgressRow {
  schemaVersion: number;
  projectId: string;
  inputRevision: string;
  planSnapshotId: string;
  stepId: string;
  status: 'done' | 'todo';
  updatedAt: string;
}
export interface MetadataRow {
  schemaVersion: number;
  key: string;
  payload: unknown;
}
/**
 * Optional local photo attachment (PERSISTENCE §2, Ticket 009). `bytes` is a
 * decode/re-encode display derivative — EXIF/location metadata is stripped by
 * re-encoding, so the stored bytes are never claimed to be the user's
 * original file. Attachment rows live outside solver/input context entirely.
 */
export interface AttachmentRow {
  schemaVersion: number;
  attachmentId: string;
  projectId: string;
  name: string;
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Stored derivative byte length (must equal `bytes.byteLength`). */
  byteSize: number;
  /** Source file size before re-encoding, for honest limits/reporting. */
  originalByteSize: number;
  width: number;
  height: number;
  bytes: ArrayBuffer;
  createdAt: string;
}
/** Migration journal entry recorded in `metadata` after a versioned open. */
export interface MigrationJournal {
  kind: 'migration';
  fromVersion: number;
  toVersion: number;
  state: 'applied';
  recordedAt: string;
}
/** Quarantined record envelope kept under `metadata` for recovery. */
export interface QuarantinePayload {
  kind: 'quarantine';
  payloadVersion: 1;
  projectId: string;
  store: string;
  storeKey: string;
  reason: string;
  capturedAt: string;
  bytes: string;
}

export class ZariDb extends Dexie {
  projects!: Table<ProjectRow, string>;
  inputs!: Table<InputRow, [string, string]>;
  drafts!: Table<DraftRow, string>;
  snapshots!: Table<SnapshotRow, [string, string, string]>;
  ownedContainers!: Table<OwnedContainerRow, string>;
  catalogs!: Table<CatalogRow, string>;
  actionProgress!: Table<ActionProgressRow, [string, string, string, string]>;
  attachments!: Table<AttachmentRow, string>;
  metadata!: Table<MetadataRow, string>;
  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores({
      projects: 'projectId, updatedAt, status',
      inputs: '[projectId+inputRevision], projectId',
      drafts: 'projectId',
      snapshots: '[projectId+inputRevision+planSnapshotId], projectId, planSnapshotId',
      ownedContainers: 'ownedContainerId, updatedAt',
      catalogs: 'catalogDigest, catalogVersion, origin',
      actionProgress: '[projectId+inputRevision+planSnapshotId+stepId], projectId',
      metadata: 'key',
    });
    this.version(2)
      .stores({
        projects: 'projectId, updatedAt, status',
        inputs: '[projectId+inputRevision], projectId',
        drafts: 'projectId',
        snapshots: '[projectId+inputRevision+planSnapshotId], projectId, planSnapshotId',
        ownedContainers: 'ownedContainerId, updatedAt',
        catalogs: 'catalogDigest, catalogVersion, origin',
        actionProgress: '[projectId+inputRevision+planSnapshotId+stepId], projectId',
        attachments: 'attachmentId, projectId',
        metadata: 'key',
      })
      // PERSISTENCE §6 journal: recorded inside the schema transaction, so
      // the entry exists iff the upgrade actually applied — a failed or
      // never-run migration leaves no journal.
      .upgrade(async (tx) => {
        const journal: MigrationJournal = {
          kind: 'migration',
          fromVersion: 1,
          toVersion: 2,
          state: 'applied',
          recordedAt: new Date().toISOString(),
        };
        await tx.table('metadata').put({
          schemaVersion: SCHEMA_VERSION,
          key: 'migration:1->2',
          payload: journal,
        });
      });
  }
}

export const isCanonicalRevision = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^(0|[1-9][0-9]*)$/.test(value) &&
  BigInt(value) <= MAX_REVISION;

export function nextRevision(value: string): string {
  if (!isCanonicalRevision(value)) throw new Error('invalid_revision');
  const next = BigInt(value) + 1n;
  if (next > MAX_REVISION) throw new Error('revision_exhausted');
  return next.toString();
}

const digestShape = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length === 64 &&
  [...value].every((c) => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'));
const text = (value: unknown, max = 256): value is string =>
  typeof value === 'string' && [...value].length <= max;

/**
 * Newer on-disk schema versions are unsupported, not corrupt: bytes are
 * preserved and writes are rejected. Anything malformed is corrupt.
 */
function checkSchemaVersion(row: { schemaVersion?: unknown } | null): void {
  if (
    row &&
    typeof row === 'object' &&
    typeof row.schemaVersion === 'number' &&
    row.schemaVersion > SCHEMA_VERSION
  )
    throw new Error('unsupported_schema');
}
/**
 * Read-side envelope guards. They check storage bookkeeping shape only —
 * domain/hash integrity is Rust `verifyRecord` work. A row that fails here is
 * quarantined, never rewritten in place.
 */
export function readProjectRow(value: unknown): ProjectRow {
  const row = value as ProjectRow;
  checkSchemaVersion(row);
  if (
    !row ||
    typeof row !== 'object' ||
    row.schemaVersion !== SCHEMA_VERSION ||
    !text(row.projectId) ||
    !text(row.name, 4096) ||
    row.status !== 'active' ||
    !isCanonicalRevision(row.projectRevision) ||
    !isCanonicalRevision(row.currentInputRevision) ||
    !(row.currentInputDigest === null || digestShape(row.currentInputDigest)) ||
    !(
      row.accepted === null ||
      (typeof row.accepted === 'object' &&
        row.accepted !== null &&
        isCanonicalRevision(row.accepted.inputRevision) &&
        digestShape(row.accepted.planSnapshotId))
    ) ||
    !text(row.lastStep) ||
    !(
      row.importedFrom === undefined ||
      (typeof row.importedFrom === 'object' &&
        row.importedFrom !== null &&
        text(row.importedFrom.sourceProjectId) &&
        text(row.importedFrom.exportedAt))
    )
  )
    throw new Error('record_corrupt');
  return row;
}
export function readDraftRow(value: unknown): DraftRow {
  const row = value as DraftRow;
  checkSchemaVersion(row);
  if (
    !row ||
    typeof row !== 'object' ||
    row.schemaVersion !== SCHEMA_VERSION ||
    !text(row.projectId) ||
    !isCanonicalRevision(row.generation) ||
    !text(row.editorSessionId) ||
    !isCanonicalRevision(row.baseInputRevision) ||
    !validateRawProjectInputDto(row.form) ||
    !(
      row.validation &&
      (row.validation.status === 'unchecked' ||
        row.validation.status === 'valid' ||
        row.validation.status === 'invalid') &&
      Array.isArray(row.validation.diagnostics)
    ) ||
    !(row.edit === undefined || row.edit === null || validEditChain(row.edit))
  )
    throw new Error('record_corrupt');
  return row;
}
function validEditChain(value: unknown): boolean {
  const chain = value as EditChain;
  if (
    !chain ||
    typeof chain !== 'object' ||
    !digestShape(chain.inputDigest) ||
    !digestShape(chain.baseSnapshotId) ||
    !digestShape(chain.headSnapshotId) ||
    !Array.isArray(chain.undo) ||
    !Array.isArray(chain.redo) ||
    chain.undo.length > 100 ||
    chain.redo.length > 100
  )
    return false;
  const transition = (t: EditTransition) =>
    t &&
    typeof t === 'object' &&
    digestShape(t.baseSnapshotId) &&
    digestShape(t.resultSnapshotId) &&
    validateLayoutEditCommand(t.command);
  return chain.undo.every(transition) && chain.redo.every(transition);
}
export function readInputRow(value: unknown): InputRow {
  const row = value as InputRow;
  checkSchemaVersion(row);
  if (
    !row ||
    typeof row !== 'object' ||
    row.schemaVersion !== SCHEMA_VERSION ||
    !text(row.projectId) ||
    !isCanonicalRevision(row.inputRevision) ||
    !digestShape(row.inputDigest) ||
    !validateProjectInput(row.input) ||
    !text(row.engineBuildId)
  )
    throw new Error('record_corrupt');
  return row;
}
export function readSnapshotRow(value: unknown): SnapshotRow {
  const row = value as SnapshotRow;
  checkSchemaVersion(row);
  if (
    !row ||
    typeof row !== 'object' ||
    row.schemaVersion !== SCHEMA_VERSION ||
    !text(row.projectId) ||
    !isCanonicalRevision(row.inputRevision) ||
    !digestShape(row.planSnapshotId) ||
    !validatePlanSnapshot(row.snapshot) ||
    !text(row.acceptedAt) ||
    !text(row.engineBuildId)
  )
    throw new Error('record_corrupt');
  return row;
}
export function readCatalogRow(value: unknown): CatalogRow {
  const row = value as CatalogRow;
  checkSchemaVersion(row);
  if (
    !row ||
    typeof row !== 'object' ||
    row.schemaVersion !== SCHEMA_VERSION ||
    !digestShape(row.catalogDigest) ||
    !text(row.catalogVersion) ||
    !text(row.origin) ||
    !validateCatalogSnapshot(row.catalog) ||
    row.catalog.catalogDigest !== row.catalogDigest
  )
    throw new Error('record_corrupt');
  return row;
}
export function readOwnedContainerRow(value: unknown): OwnedContainerRow {
  const row = value as OwnedContainerRow;
  checkSchemaVersion(row);
  if (
    !row ||
    typeof row !== 'object' ||
    row.schemaVersion !== SCHEMA_VERSION ||
    !text(row.ownedContainerId) ||
    !isCanonicalRevision(row.revision) ||
    !row.container ||
    typeof row.container !== 'object' ||
    row.container.id !== row.ownedContainerId
  )
    throw new Error('record_corrupt');
  return row;
}
export function readActionProgressRow(value: unknown): ActionProgressRow {
  const row = value as ActionProgressRow;
  checkSchemaVersion(row);
  if (
    !row ||
    typeof row !== 'object' ||
    row.schemaVersion !== SCHEMA_VERSION ||
    !text(row.projectId) ||
    !isCanonicalRevision(row.inputRevision) ||
    !digestShape(row.planSnapshotId) ||
    !text(row.stepId) ||
    (row.status !== 'done' && row.status !== 'todo')
  )
    throw new Error('record_corrupt');
  return row;
}
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MAX_COUNT = 10;
export function readAttachmentRow(value: unknown): AttachmentRow {
  const row = value as AttachmentRow;
  checkSchemaVersion(row);
  if (
    !row ||
    typeof row !== 'object' ||
    row.schemaVersion !== SCHEMA_VERSION ||
    !text(row.attachmentId) ||
    !text(row.projectId) ||
    !text(row.name, 1024) ||
    (row.mime !== 'image/jpeg' &&
      row.mime !== 'image/png' &&
      row.mime !== 'image/webp') ||
    !Number.isInteger(row.byteSize) ||
    row.byteSize <= 0 ||
    row.byteSize > ATTACHMENT_MAX_BYTES ||
    !Number.isInteger(row.originalByteSize) ||
    row.originalByteSize <= 0 ||
    row.originalByteSize > ATTACHMENT_MAX_BYTES ||
    !Number.isInteger(row.width) ||
    row.width <= 0 ||
    !Number.isInteger(row.height) ||
    row.height <= 0 ||
    !(row.bytes instanceof ArrayBuffer) ||
    row.bytes.byteLength !== row.byteSize ||
    !text(row.createdAt)
  )
    throw new Error('record_corrupt');
  return row;
}
