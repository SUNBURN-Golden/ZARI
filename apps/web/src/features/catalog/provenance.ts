import type {
  CatalogProvenanceBatch,
  FieldSource,
  ProvenanceRow,
  SourceScope,
  VerificationScope,
} from '../../contracts/generated/dto';
import { parseCsv } from './import';

export const SOURCE_SCOPES = [
  'brand',
  'model',
  'option',
  'seller',
  'outer',
  'inner',
  'protrusion',
  'load',
] as const satisfies readonly SourceScope[];

const DIMENSION_COLUMNS = [
  'productId',
  'model',
  'category',
  'brand',
  'optionId',
  'optionLabel',
  'sellerId',
  'primitive',
  'outerWidthMm',
  'outerDepthMm',
  'outerHeightMm',
  'innerWidthMm',
  'innerDepthMm',
  'innerHeightMm',
  'protrusionMm',
  'loadGrams',
] as const;

const SOURCE_SUFFIXES = ['Url', 'ConfirmedAt', 'PhotoRef', 'Verification'] as const;

export const PROVENANCE_COLUMNS = [
  ...DIMENSION_COLUMNS,
  ...SOURCE_SCOPES.flatMap((scope) => SOURCE_SUFFIXES.map((suffix) => `${scope}${suffix}`)),
];

export interface ProvenanceIssue {
  fieldPath: string;
  code: string;
}

export function blankRow(): ProvenanceRow {
  return {
    productId: '',
    model: '',
    brand: '',
    category: '',
    optionId: '',
    optionLabel: '',
    sellerId: '',
    primitive: '',
    outerWidthMm: '',
    outerDepthMm: '',
    outerHeightMm: '',
    innerWidthMm: '',
    innerDepthMm: '',
    innerHeightMm: '',
    protrusionMm: '',
    loadGrams: '',
    sources: [],
  };
}

export function blankSource(scope: SourceScope = 'outer'): FieldSource {
  return {
    scope,
    url: null,
    confirmedAt: null,
    photoRef: null,
    verificationScope: 'unknown',
    note: '',
  };
}

function cell(row: string[], index: Map<string, number>, name: string): string {
  const at = index.get(name);
  return at === undefined ? '' : (row[at] ?? '').trim();
}

function verification(value: string): VerificationScope | null {
  if (value === '' || value === 'unknown' || value === 'unverified' || value === 'verified') {
    return value === '' ? 'unknown' : value;
  }
  return null;
}

/**
 * Map a provenance CSV onto rows. A bad header or a short row rejects the
 * whole file so the ready rows are not imported alone.
 */
export function csvToBatch(
  text: string,
  preservedDigest: string | null,
): { batch: CatalogProvenanceBatch } | { issues: ProvenanceIssue[] } {
  const rows = parseCsv(text);
  if (rows === null) return { issues: [{ fieldPath: 'file', code: 'invalid_csv' }] };
  const [header, ...data] = rows;
  if (!header || data.length === 0) return { issues: [{ fieldPath: 'file', code: 'csv_header_invalid' }] };
  const columns = header.map((name) => name.trim());
  if (columns.length > PROVENANCE_COLUMNS.length)
    return { issues: [{ fieldPath: 'file', code: 'csv_header_invalid' }] };
  for (const name of columns) {
    if (!PROVENANCE_COLUMNS.includes(name))
      return { issues: [{ fieldPath: 'file', code: 'csv_header_invalid' }] };
  }
  for (const required of ['model', 'category', 'optionId', 'optionLabel']) {
    if (!columns.includes(required))
      return { issues: [{ fieldPath: 'file', code: 'csv_header_invalid' }] };
  }
  const index = new Map(columns.map((name, position) => [name, position]));
  const parsed: ProvenanceRow[] = [];
  for (const [rowIndex, row] of data.entries()) {
    if (row.length !== columns.length)
      return { issues: [{ fieldPath: `row.${rowIndex}`, code: 'row_length_mismatch' }] };
    const sources: FieldSource[] = [];
    for (const scope of SOURCE_SCOPES) {
      const url = cell(row, index, `${scope}Url`);
      const confirmedAt = cell(row, index, `${scope}ConfirmedAt`);
      const photoRef = cell(row, index, `${scope}PhotoRef`);
      const scopeVerification = cell(row, index, `${scope}Verification`);
      if (url === '' && confirmedAt === '' && photoRef === '' && scopeVerification === '') continue;
      const parsedVerification = verification(scopeVerification);
      if (parsedVerification === null)
        return { issues: [{ fieldPath: `row.${rowIndex}.${scope}Verification`, code: 'invalid_verification' }] };
      sources.push({
        scope,
        url: url === '' ? null : url,
        confirmedAt: confirmedAt === '' ? null : confirmedAt,
        photoRef: photoRef === '' ? null : photoRef,
        verificationScope: parsedVerification,
        note: '',
      });
    }
    parsed.push({
      productId: cell(row, index, 'productId'),
      model: cell(row, index, 'model'),
      brand: cell(row, index, 'brand'),
      category: cell(row, index, 'category'),
      optionId: cell(row, index, 'optionId'),
      optionLabel: cell(row, index, 'optionLabel'),
      sellerId: cell(row, index, 'sellerId'),
      primitive: cell(row, index, 'primitive'),
      outerWidthMm: cell(row, index, 'outerWidthMm'),
      outerDepthMm: cell(row, index, 'outerDepthMm'),
      outerHeightMm: cell(row, index, 'outerHeightMm'),
      innerWidthMm: cell(row, index, 'innerWidthMm'),
      innerDepthMm: cell(row, index, 'innerDepthMm'),
      innerHeightMm: cell(row, index, 'innerHeightMm'),
      protrusionMm: cell(row, index, 'protrusionMm'),
      loadGrams: cell(row, index, 'loadGrams'),
      sources,
    });
  }
  return {
    batch: {
      catalogVersion: 'catalog-csv',
      ingestionVersion: 'provenance-1',
      rows: parsed,
      existingDigest: preservedDigest,
    },
  };
}

export function batchFromJson(
  text: string,
  preservedDigest: string | null,
): { batch: CatalogProvenanceBatch } | { issues: ProvenanceIssue[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { issues: [{ fieldPath: 'file', code: 'invalid_json' }] };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
    return { issues: [{ fieldPath: 'file', code: 'catalog_schema_invalid' }] };
  const body = parsed as Record<string, unknown>;
  if (!Array.isArray(body.rows))
    return { issues: [{ fieldPath: 'file', code: 'catalog_schema_invalid' }] };
  const batch: CatalogProvenanceBatch = {
    catalogVersion: typeof body.catalogVersion === 'string' ? body.catalogVersion : '',
    ingestionVersion: typeof body.ingestionVersion === 'string' ? body.ingestionVersion : '',
    existingDigest:
      typeof body.existingDigest === 'string' ? body.existingDigest : preservedDigest,
    rows: body.rows as ProvenanceRow[],
  };
  return { batch };
}
