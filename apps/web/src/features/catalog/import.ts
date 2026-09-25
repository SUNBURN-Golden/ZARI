import type {
  CatalogImportDto,
  Evidence,
  FactForString,
  FactFor_ClearanceMm,
  FactFor_InventoryState,
  FactFor_MassGrams,
  FactFor_MeasuredLength,
  FactFor_MoneyKrw,
  FactFor_PackQuantity,
  FactFor_ShippingRule,
  MeasurementOrigin,
  NormalizedCatalogField,
  Offer,
  Provenance,
  RawCatalogFieldDto,
  SourceObservation,
  StoragePrimitive,
} from '../../contracts/generated/dto';

/**
 * Catalog import assembly (Ticket 008). Every numeric fact in a staged import
 * is produced by Rust `normalizeCatalogFields` — this module only copies the
 * returned typed values into DTO slots and never computes a number itself.
 * Host-authored fields (ids, labels, enum choices, URLs) carry honest
 * `userDeclared`/`unverified` provenance; facts the source does not state are
 * explicit `unknown` facts, never fabricated defaults.
 */
export interface ImportEntry {
  productId: string;
  productName: string;
  category: string;
  brand: string;
  variantId: string;
  optionLabel: string;
  primitive: StoragePrimitive;
  /** When true the entry declares upright-only orientation as a known fact. */
  uprightOnly: boolean;
  outerWidthMm: string;
  outerDepthMm: string;
  outerHeightMm: string;
  innerWidthMm: string;
  innerDepthMm: string;
  innerHeightMm: string;
  massGrams: string;
  /** Empty offerId means the row carries no offer — the variant imports alone. */
  offerId: string;
  sellerId: string;
  packQuantity: string;
  packPriceKrw: string;
  inventory: '' | 'inStock' | 'outOfStock';
  shipping: '' | 'free' | 'fixed' | 'complex';
  shippingFeeKrw: string;
  url: string;
  observedAt: string;
  note: string;
}

export interface ImportIssue {
  fieldPath: string;
  code: string;
}

export const IMPORT_ENTRY_LIMIT = 100;
export const IMPORT_TEXT_LIMIT = 1024 * 1024;

/** Mirrors the Rust `Id` grammar so malformed ids fail before transport. */
export const isIdText = (value: string): boolean =>
  /^[A-Za-z0-9_:-]{1,96}$/.test(value);
/** Mirrors `valid_locator`: no control chars, no executable schemes. */
export const isLocatorText = (value: string): boolean => {
  const lower = value.toLowerCase();
  return (
    value.length > 0 &&
    [...value].length <= 2048 &&
    !lower.startsWith('javascript:') &&
    !lower.startsWith('data:') &&
    !lower.startsWith('file:') &&
    ![...value].some((c) => c < ' ' || c === '')
  );
};
/** Mirrors `valid_utc_timestamp`: an explicit-UTC RFC3339 date or empty. */
export const isUtcTimestamp = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|z|\+00:00)$/.test(value);

const provenance = (evidenceIds: string[]): Provenance => ({
  origin: 'userDeclared' as MeasurementOrigin,
  verification: 'unverified',
  evidenceIds,
  ruleIds: [],
  inputRefs: [],
  observedAt: null,
});
const unknownFact = () => ({ state: 'unknown' as const, reason: 'notProvided' as const });
const textFact = (text: string, evidenceIds: string[]): FactForString =>
  text === ''
    ? { state: 'unknown', reason: 'notProvided' }
    : { state: 'known', value: text, provenance: provenance(evidenceIds) };

/** The catalog numeric field paths one entry can carry through Rust. */
export function collectRawFields(entries: ImportEntry[]): RawCatalogFieldDto[] {
  const fields: RawCatalogFieldDto[] = [];
  const measurement = (fieldPath: string, text: string, evidenceIds: string[]) =>
    fields.push({
      fieldPath,
      value: {
        kind: 'measurement',
        raw: {
          text,
          unit: 'mm',
          uncertainty: { state: 'unknown' },
          origin: 'userDeclared',
          evidenceIds,
        },
      },
    });
  const scalar = (
    fieldPath: string,
    kind: 'packQuantity' | 'moneyKrw' | 'massGrams',
    text: string,
  ) => fields.push({ fieldPath, value: { kind, text } });
  for (const entry of entries) {
    const v = `variants.${entry.variantId}`;
    const ev = entry.note !== '' || entry.url !== '' ? [`ev-${entry.variantId}`] : [];
    measurement(`${v}.dimensions.outer.width`, entry.outerWidthMm, ev);
    measurement(`${v}.dimensions.outer.depth`, entry.outerDepthMm, ev);
    measurement(`${v}.dimensions.outer.height`, entry.outerHeightMm, ev);
    measurement(`${v}.dimensions.inner.width`, entry.innerWidthMm, ev);
    measurement(`${v}.dimensions.inner.depth`, entry.innerDepthMm, ev);
    measurement(`${v}.dimensions.inner.height`, entry.innerHeightMm, ev);
    scalar(`${v}.mass`, 'massGrams', entry.massGrams);
    if (entry.offerId !== '') {
      const o = `offers.${entry.offerId}`;
      scalar(`${o}.packQuantity`, 'packQuantity', entry.packQuantity);
      scalar(`${o}.packPrice`, 'moneyKrw', entry.packPriceKrw);
      if (entry.shipping === 'fixed')
        scalar(`${o}.shipping.fee`, 'moneyKrw', entry.shippingFeeKrw);
    }
  }
  return fields;
}

/** Local shape checks that keep malformed entries off the wire entirely. */
export function checkEntries(entries: ImportEntry[]): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const row = `entries.${index}`;
    for (const [field, id] of [
      ['productId', entry.productId],
      ['variantId', entry.variantId],
      ['offerId', entry.offerId],
      ['sellerId', entry.sellerId],
    ] as const) {
      if (id !== '' && !isIdText(id))
        issues.push({ fieldPath: `${row}.${field}`, code: 'invalid_id' });
    }
    if (entry.productName.trim() === '')
      issues.push({ fieldPath: `${row}.productName`, code: 'required_text_missing' });
    if (entry.category.trim() === '')
      issues.push({ fieldPath: `${row}.category`, code: 'required_text_missing' });
    if (entry.optionLabel.trim() === '')
      issues.push({ fieldPath: `${row}.optionLabel`, code: 'required_text_missing' });
    if (entry.offerId !== '' && entry.sellerId === '')
      issues.push({ fieldPath: `${row}.sellerId`, code: 'required_text_missing' });
    if (entry.url !== '' && !isLocatorText(entry.url))
      issues.push({ fieldPath: `${row}.url`, code: 'invalid_locator' });
    if (entry.observedAt !== '' && !isUtcTimestamp(entry.observedAt))
      issues.push({ fieldPath: `${row}.observedAt`, code: 'invalid_timestamp' });
    for (const dup of ['productId', 'variantId', 'offerId'] as const) {
      const id = entry[dup];
      if (id === '') continue;
      const key = `${dup}:${id}`;
      if (dup !== 'productId' && seen.has(key))
        issues.push({ fieldPath: `${row}.${dup}`, code: 'duplicate_id' });
      seen.add(key);
    }
  }
  return issues;
}

/**
 * Assemble the complete `CatalogImportDto` from converted fields. A field with
 * diagnostics or a null value degrades to an explicit unknown fact — the
 * diagnostics are reported alongside so nothing is silently repaired.
 */
export function buildImport(
  entries: ImportEntry[],
  normalized: NormalizedCatalogField[],
  meta: { catalogVersion: string; ingestionVersion: string; observedAt: string | null; note: string },
): { catalog: CatalogImportDto; issues: ImportIssue[] } {
  const byPath = new Map(normalized.map((f) => [f.fieldPath, f]));
  const issues: ImportIssue[] = [];
  const measurement = (fieldPath: string): FactFor_MeasuredLength => {
    const field = byPath.get(fieldPath);
    if (!field || field.value === null || field.value.kind !== 'measurement') {
      for (const d of field?.diagnostics ?? [])
        issues.push({ fieldPath, code: d.code });
      return unknownFact();
    }
    return field.value.value;
  };
  const scalar = (
    fieldPath: string,
    kind: 'packQuantity' | 'moneyKrw' | 'massGrams',
  ): FactFor_PackQuantity | FactFor_MoneyKrw | FactFor_MassGrams => {
    const field = byPath.get(fieldPath);
    if (!field || field.value === null || field.value.kind !== kind) {
      for (const d of field?.diagnostics ?? [])
        issues.push({ fieldPath, code: d.code });
      return unknownFact();
    }
    return field.value.value;
  };
  const unknownClearance = (): FactFor_ClearanceMm => unknownFact();
  const products = new Map<string, ImportEntry>();
  const variants: CatalogImportDto['variants'] = [];
  const offers: Offer[] = [];
  const evidence: Evidence[] = [];
  for (const entry of entries) {
    const ev = entry.note !== '' || entry.url !== '' ? [`ev-${entry.variantId}`] : [];
    if (!products.has(entry.productId))
      products.set(entry.productId, entry);
    const v = `variants.${entry.variantId}`;
    variants.push({
      id: entry.variantId,
      productId: entry.productId,
      optionLabel: entry.optionLabel,
      dimensions: {
        outer: {
          width: measurement(`${v}.dimensions.outer.width`),
          depth: measurement(`${v}.dimensions.outer.depth`),
          height: measurement(`${v}.dimensions.outer.height`),
        },
        inner: {
          width: measurement(`${v}.dimensions.inner.width`),
          depth: measurement(`${v}.dimensions.inner.depth`),
          height: measurement(`${v}.dimensions.inner.height`),
        },
        innerOffset: unknownFact(),
        innerSupport: unknownFact(),
        handles: unknownFact(),
        lidState: unknownFact(),
        cavityModel: unknownFact(),
        cavityClearances: {
          left: unknownClearance(),
          right: unknownClearance(),
          front: unknownClearance(),
          back: unknownClearance(),
          top: unknownClearance(),
          betweenItems: unknownClearance(),
        },
      },
      primitive: entry.primitive,
      allowedOrientations: entry.uprightOnly
        ? { state: 'known', value: ['upright0'], provenance: provenance(ev) }
        : unknownFact(),
      mass: scalar(`${v}.mass`, 'massGrams') as FactFor_MassGrams,
      material: textFact('', []),
      color: textFact('', []),
      compatibility: unknownFact(),
      mounting: unknownFact(),
      stackability: unknownFact(),
      handling: {
        left: unknownClearance(),
        right: unknownClearance(),
        top: unknownClearance(),
        pullExtraDepth: unknownClearance(),
        liftAboveRim: unknownClearance(),
      },
    });
    if (ev.length > 0)
      evidence.push({
        id: `ev-${entry.variantId}`,
        sourceKind: 'userDeclared',
        locator: entry.url !== '' ? entry.url : null,
        sourceField: 'catalog import',
        note: entry.note,
        observedAt: entry.observedAt !== '' ? entry.observedAt : null,
        confirmedBy: null,
      });
    if (entry.offerId !== '') {
      const o = `offers.${entry.offerId}`;
      const inventory: FactFor_InventoryState =
        entry.inventory === ''
          ? { state: 'unknown', reason: 'sourceMissing' }
          : { state: 'known', value: entry.inventory, provenance: provenance(ev) };
      const shipping: FactFor_ShippingRule =
        entry.shipping === ''
          ? { state: 'unknown', reason: 'sourceMissing' }
          : {
              state: 'known',
              value:
                entry.shipping === 'fixed'
                  ? {
                      kind: 'fixedPerSeller',
                      fee: scalar(`${o}.shipping.fee`, 'moneyKrw') as FactFor_MoneyKrw,
                    }
                  : entry.shipping === 'free'
                    ? { kind: 'free' }
                    : { kind: 'complex' },
              provenance: provenance(ev),
            };
      offers.push({
        id: entry.offerId,
        variantId: entry.variantId,
        sellerId: entry.sellerId,
        url: entry.url === '' ? { state: 'unknown', reason: 'sourceMissing' } : textFact(entry.url, ev),
        packQuantity: scalar(`${o}.packQuantity`, 'packQuantity') as FactFor_PackQuantity,
        packPrice: scalar(`${o}.packPrice`, 'moneyKrw') as FactFor_MoneyKrw,
        inventory,
        shipping,
        observedAt: entry.observedAt !== '' ? entry.observedAt : null,
        bundleComponents: [],
      });
    }
  }
  const catalog: CatalogImportDto = {
    schemaVersion: 1,
    catalogVersion: meta.catalogVersion,
    sourceKind: 'imported',
    products: [...products.values()].map((entry) => ({
      id: entry.productId,
      name: entry.productName,
      category: entry.category,
      brand: textFact(entry.brand, entry.note !== '' || entry.url !== '' ? [`ev-${entry.variantId}`] : []),
      provenance: provenance([]),
    })),
    variants,
    offers,
    evidence,
    ingestionVersion: meta.ingestionVersion,
    sourceObservations: [
      {
        id: 'obs-1',
        note: meta.note,
        observedAt: meta.observedAt,
      } satisfies SourceObservation,
    ],
  };
  return { catalog, issues };
}

/** Canonical CSV header for the bounded adapter; unknown columns are errors. */
export const CSV_COLUMNS = [
  'productId',
  'productName',
  'category',
  'brand',
  'variantId',
  'optionLabel',
  'primitive',
  'outerWidthMm',
  'outerDepthMm',
  'outerHeightMm',
  'innerWidthMm',
  'innerDepthMm',
  'innerHeightMm',
  'massGrams',
  'offerId',
  'sellerId',
  'packQuantity',
  'packPriceKrw',
  'inventory',
  'shipping',
  'shippingFeeKrw',
  'url',
  'observedAt',
  'note',
] as const;

const CSV_ROW_LIMIT = IMPORT_ENTRY_LIMIT;
const CSV_CELL_LIMIT = 4096;

/**
 * Minimal bounded CSV reader: quoted cells, doubled quotes, LF/CRLF. Returns
 * null when the source exceeds the transport bounds or cannot parse.
 */
export function parseCsv(text: string): string[][] | null {
  if (text.length > IMPORT_TEXT_LIMIT || text.length === 0) return null;
  const rows: string[][] = [];
  let cell = '';
  let row: string[] = [];
  let quoted = false;
  let closed = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += ch;
    } else if (ch === '"' && !closed && cell === '') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
      closed = false;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      closed = false;
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      if (rows.length > CSV_ROW_LIMIT) return null;
    } else {
      if (closed) return null;
      cell += ch;
    }
    if (cell.length > CSV_CELL_LIMIT) return null;
  }
  if (quoted) return null;
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  if (rows.length === 0 || rows.length > CSV_ROW_LIMIT) return null;
  return rows;
}

/** Map parsed CSV rows onto import entries; null on a header/shape error. */
export function csvToEntries(rows: string[][]): { entries: ImportEntry[]; issues: ImportIssue[] } | null {
  const [header, ...data] = rows;
  if (!header || data.length === 0) return null;
  const columns = header.map((h) => h.trim());
  if (columns.length > CSV_COLUMNS.length) return null;
  const index = new Map(columns.map((name, i) => [name, i]));
  for (const required of ['productName', 'category', 'variantId', 'optionLabel'])
    if (!index.has(required)) return null;
  for (const name of columns)
    if (!(CSV_COLUMNS as readonly string[]).includes(name)) return null;
  const get = (row: string[], name: string) => {
    const i = index.get(name);
    return i === undefined ? '' : (row[i] ?? '').trim();
  };
  const entries: ImportEntry[] = [];
  const issues: ImportIssue[] = [];
  for (const [r, row] of data.entries()) {
    if (row.length !== columns.length) {
      issues.push({ fieldPath: `row.${r}`, code: 'row_length_mismatch' });
      continue;
    }
    const primitive = get(row, 'primitive') || 'openBin';
    const inventory = get(row, 'inventory');
    const shipping = get(row, 'shipping');
    entries.push({
      productId: get(row, 'productId') || `prod-${r + 1}`,
      productName: get(row, 'productName'),
      category: get(row, 'category'),
      brand: get(row, 'brand'),
      variantId: get(row, 'variantId'),
      optionLabel: get(row, 'optionLabel'),
      primitive: (['directPlacement', 'openBin', 'tray', 'verticalFile'] as const).includes(
        primitive as never,
      )
        ? (primitive as StoragePrimitive)
        : 'openBin',
      uprightOnly: true,
      outerWidthMm: get(row, 'outerWidthMm'),
      outerDepthMm: get(row, 'outerDepthMm'),
      outerHeightMm: get(row, 'outerHeightMm'),
      innerWidthMm: get(row, 'innerWidthMm'),
      innerDepthMm: get(row, 'innerDepthMm'),
      innerHeightMm: get(row, 'innerHeightMm'),
      massGrams: get(row, 'massGrams'),
      offerId: get(row, 'offerId'),
      sellerId: get(row, 'sellerId'),
      packQuantity: get(row, 'packQuantity'),
      packPriceKrw: get(row, 'packPriceKrw'),
      inventory: inventory === 'inStock' || inventory === 'outOfStock' ? inventory : '',
      shipping:
        shipping === 'free' || shipping === 'fixed' || shipping === 'complex'
          ? shipping
          : '',
      shippingFeeKrw: get(row, 'shippingFeeKrw'),
      url: get(row, 'url'),
      observedAt: get(row, 'observedAt'),
      note: get(row, 'note'),
    });
  }
  return { entries, issues };
}
