import type {
  CatalogImportDto,
  CatalogProvenanceReply,
  CatalogReviewAction,
  CatalogSnapshot,
  Diagnostic,
  NormalizedCatalogField,
  SampleBundleKind,
} from '../../contracts/generated/dto';
import { validateCatalogImportDto } from '../../contracts/generated/validators.mjs';
import type { ProjectRepository } from '../../persistence/repository';
import type { ProbeClient } from '../../worker/client';
import type { WorkerController } from '../../worker/controller';
import {
  IMPORT_ENTRY_LIMIT,
  IMPORT_TEXT_LIMIT,
  buildImport,
  checkEntries,
  collectRawFields,
  csvToEntries,
  isIdText,
  isLocatorText,
  isUtcTimestamp,
  parseCsv,
  type ImportEntry,
  type ImportIssue,
} from './import';

/**
 * Staged catalog import (Ticket 008). Two host steps, both Rust-owned:
 * `normalizeCatalogFields` converts numeric text into typed facts, then
 * `validateCatalog` canonicalizes, structurally validates and digests the
 * assembled catalog under the system identity — usable before any project
 * activation. A snapshot is persisted only after Rust returns one; a rejected
 * import keeps its diagnostics and is never written to the library.
 */
export type StageResult =
  | { status: 'validated'; snapshot: CatalogSnapshot; issues: ImportIssue[] }
  | { status: 'rejected'; diagnostics: Diagnostic[]; issues: ImportIssue[] }
  | { status: 'unavailable'; error: string };

export interface ImportMeta {
  catalogVersion: string;
  ingestionVersion: string;
  /** Optional observation timestamp for the whole import batch. */
  observedAt: string | null;
  note: string;
}

export class CatalogManager {
  constructor(
    private readonly controller: WorkerController,
    private readonly repo: ProjectRepository,
  ) {}
  private async validateDto(
    catalog: CatalogImportDto,
    issues: ImportIssue[],
  ): Promise<StageResult> {
    let client: ProbeClient;
    try {
      client = await this.controller.ensure();
    } catch (error) {
      return {
        status: 'unavailable',
        error: String(error instanceof Error ? error.message : error),
      };
    }
    try {
      const reply = await client.systemRequest({ kind: 'validateCatalog', catalog });
      if (reply.kind !== 'catalogValidated')
        return { status: 'unavailable', error: 'unexpected_worker_event' };
      if (reply.snapshot === null)
        return { status: 'rejected', diagnostics: reply.diagnostics, issues };
      return { status: 'validated', snapshot: reply.snapshot, issues };
    } catch (error) {
      return {
        status: 'unavailable',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  /**
   * JSON import: the file is an untrusted `CatalogImportDto` document —
   * provenance is whatever the file claims, checked by the generated schema
   * validator for shape and by Rust for structure. The digest cannot be
   * supplied at all: `CatalogImportDto` has no slot for it and Rust computes
   * the digest itself.
   */
  async stageJson(text: string): Promise<StageResult> {
    if (text.length > IMPORT_TEXT_LIMIT)
      return {
        status: 'rejected',
        diagnostics: [],
        issues: [{ fieldPath: 'file', code: 'import_too_large' }],
      };
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        status: 'rejected',
        diagnostics: [],
        issues: [{ fieldPath: 'file', code: 'invalid_json' }],
      };
    }
    if (!validateCatalogImportDto(parsed))
      return {
        status: 'rejected',
        diagnostics: [],
        issues: [{ fieldPath: 'file', code: 'catalog_schema_invalid' }],
      };
    return this.validateDto(parsed, []);
  }
  /** CSV import: bounded parse → entry rows → the shared entry pipeline. */
  async stageCsv(text: string, meta: ImportMeta): Promise<StageResult> {
    const rows = parseCsv(text);
    if (rows === null)
      return {
        status: 'rejected',
        diagnostics: [],
        issues: [{ fieldPath: 'file', code: 'invalid_csv' }],
      };
    const mapped = csvToEntries(rows);
    if (mapped === null)
      return {
        status: 'rejected',
        diagnostics: [],
        issues: [{ fieldPath: 'file', code: 'csv_header_invalid' }],
      };
    return this.stageEntries(mapped.entries, meta, mapped.issues);
  }
  /**
   * Manual/CSV entry pipeline: local shape gate, then Rust scalar conversion,
   * assembly, and final Rust validation. Nothing is persisted here — the
   * caller previews the validated snapshot and explicitly commits it.
   */
  async stageEntries(
    entries: ImportEntry[],
    meta: ImportMeta,
    preIssues: ImportIssue[] = [],
  ): Promise<StageResult> {
    if (entries.length === 0 || entries.length > IMPORT_ENTRY_LIMIT)
      return {
        status: 'rejected',
        diagnostics: [],
        issues: [
          {
            fieldPath: 'entries',
            code: entries.length === 0 ? 'empty_import' : 'import_too_large',
          },
        ],
      };
    const issues = [...preIssues, ...checkEntries(entries)];
    if (meta.catalogVersion.trim() === '')
      issues.push({ fieldPath: 'catalogVersion', code: 'required_text_missing' });
    if (meta.ingestionVersion.trim() === '')
      issues.push({ fieldPath: 'ingestionVersion', code: 'required_text_missing' });
    if (meta.observedAt !== null && !isUtcTimestamp(meta.observedAt))
      issues.push({ fieldPath: 'observedAt', code: 'invalid_timestamp' });
    if (issues.length > 0) return { status: 'rejected', diagnostics: [], issues };
    let client: ProbeClient;
    try {
      client = await this.controller.ensure();
    } catch (error) {
      return {
        status: 'unavailable',
        error: String(error instanceof Error ? error.message : error),
      };
    }
    let fields: NormalizedCatalogField[];
    try {
      const reply = await client.systemRequest({
        kind: 'normalizeCatalogFields',
        fields: collectRawFields(entries),
      });
      if (reply.kind !== 'catalogFieldsNormalized')
        return { status: 'unavailable', error: 'unexpected_worker_event' };
      fields = reply.fields;
    } catch (error) {
      return {
        status: 'unavailable',
        error: error instanceof Error ? error.message : String(error),
      };
    }
    const { catalog, issues: buildIssues } = buildImport(entries, fields, meta);
    return this.validateDto(catalog, [...issues, ...buildIssues]);
  }
  /**
   * A catalogue with no products, variants, or offers. Rust still assigns a
   * digest. This does not invent a seller or a price.
   */
  stageEmpty(meta: ImportMeta): Promise<StageResult> {
    if (meta.catalogVersion.trim() === '' || meta.ingestionVersion.trim() === '')
      return Promise.resolve({
        status: 'rejected',
        diagnostics: [],
        issues: [{ fieldPath: 'catalogVersion', code: 'required_text_missing' }],
      });
    const catalog: CatalogImportDto = {
      schemaVersion: 1,
      catalogVersion: meta.catalogVersion,
      sourceKind: 'imported',
      products: [],
      variants: [],
      offers: [],
      evidence: [],
      ingestionVersion: meta.ingestionVersion,
      sourceObservations: [],
    };
    return this.validateDto(catalog, []);
  }
  /**
   * Provenance review. Rust decides row diagnosis, duplicate quarantine, and
   * whether a snapshot exists. This method does not write.
   */
  async review(action: CatalogReviewAction): Promise<
    | { status: 'reviewed'; reply: CatalogProvenanceReply }
    | { status: 'unavailable'; error: string }
  > {
    let client: ProbeClient;
    try {
      client = await this.controller.ensure();
    } catch (error) {
      return {
        status: 'unavailable',
        error: String(error instanceof Error ? error.message : error),
      };
    }
    try {
      const reply = await client.systemRequest({ kind: 'reviewCatalogImport', action });
      if (reply.kind !== 'catalogImportReviewed')
        return { status: 'unavailable', error: 'unexpected_worker_event' };
      return { status: 'reviewed', reply: reply.reply };
    } catch (error) {
      return {
        status: 'unavailable',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  /**
   * Store a reviewed snapshot only when Rust published one. A quarantine,
   * including a batch that has some ready rows, does not write.
   */
  async commitReviewed(reply: CatalogProvenanceReply): Promise<'saved' | 'blocked'> {
    if (reply.quarantined || reply.snapshot === null) return 'blocked';
    await this.commit(reply.snapshot, provenanceOrigin(reply.bundle));
    return 'saved';
  }
  /** Persist only a Rust-validated snapshot; the digest is the row key. */
  async commit(snapshot: CatalogSnapshot, origin = 'imported'): Promise<void> {
    await this.repo.open();
    await this.repo.putCatalog(snapshot, origin);
  }
  list(): ReturnType<ProjectRepository['listCatalogs']> {
    return this.repo.listCatalogs();
  }
}

export function provenanceOrigin(bundle: SampleBundleKind | null): string {
  if (bundle === 'synthetic') return 'provenance-synthetic';
  if (bundle === 'verified') return 'provenance-verified';
  if (bundle === 'unverified') return 'provenance-unverified';
  return 'provenance-import';
}

export { isIdText, isLocatorText, isUtcTimestamp };
