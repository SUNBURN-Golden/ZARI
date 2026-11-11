// Pure helpers for the unattended Daiso pipeline (server side). No I/O here so
// every rule is unit-tested: dimension text rules, OCR text rules, pack
// quantity evidence, carry-over of previously published values, safety gates.

export interface Dims { rawText: string; width: string; depth: string; height: string; unit: 'cm' | 'mm'; confidence: 'low' }
export interface Pack { value: number; basis: 'confirmed' | 'reference'; evidence: string }

const NUM = '(\\d{1,3}(?:[.,]\\d{1,2})?)';
const SEP = '\\s*[xX×*✕]\\s*';
// Official name / option line: "26 X 10 X 9 cm", "약24x32x12 cm".
const NAME_TRIPLE = /(?:약\s*)?(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)\s*(cm|mm)\b/i;
const OCR_TRIPLE = new RegExp(`${NUM}${SEP}${NUM}${SEP}${NUM}\\s*(cm|mm|㎝|㎜|c\\s?m|m\\s?m)?`, 'i');
const OUTER = /(외부\s*크기|외경|제품\s*크기|상품\s*크기|본체\s*크기|사이즈|크기|규격|치수)/;
const INNER = /(서랍\s*크기|내부|내경|내측|안쪽|포장|박스\s*크기|칸\s*크기)/;
const REVIEW = /요|다\.|ㅎ|ㅠ|!|별점|리뷰|구매|샀/;

const dims = (raw: string, w: string, d: string, h: string, unit: string): Dims => ({
  rawText: raw.trim().slice(0, 120), width: w.replace(',', '.'), depth: d.replace(',', '.'), height: h.replace(',', '.'),
  unit: /mm|㎜|m\s?m/i.test(unit) ? 'mm' : 'cm', confidence: 'low',
});

/** Unlabelled triples in Daiso names/option labels are W x D x H (listing order). */
export function dimsFromPageText(name: string, pageText: string): { dims: Dims; how: string } | null {
  const m = NAME_TRIPLE.exec(name);
  if (m) return { dims: dims(m[0], m[1]!, m[2]!, m[3]!, m[4]!), how: 'name' };
  const core = name.replace(/\s+\S*\d+\s*(호|L)\b.*$/, '').slice(0, 6).replace(/\s/g, '');
  if (!core) return null;
  for (const line of pageText.split(/\n+/).map((s) => s.trim()).filter((s) => s.length <= 60 && !REVIEW.test(s))) {
    const mm = NAME_TRIPLE.exec(line);
    if (mm && line.replace(/\s/g, '').includes(core)) return { dims: dims(mm[0], mm[1]!, mm[2]!, mm[3]!, mm[4]!), how: 'option' };
  }
  return null;
}

/** OCR / detail text: labelled outer-size line first, then any non-inner triple. `ambiguous` asks for the LLM. */
export function dimsFromOcrText(text: string): { dims: Dims | null; ambiguous: boolean; snippet: string } {
  const lines = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  let hit: Dims | null = null;
  for (const pass of [0, 1]) {
    for (const l of lines) {
      if (INNER.test(l) || (pass === 0 && !OUTER.test(l))) continue;
      const m = OCR_TRIPLE.exec(l);
      if (m) { hit = dims(`[image-OCR] ${m[0]}`, m[1]!, m[2]!, m[3]!, m[4] ?? 'cm'); break; }
    }
    if (hit) break;
  }
  const triples = lines.filter((l) => OCR_TRIPLE.test(l) && !INNER.test(l)).length;
  const snippet = lines.filter((l) => /\d/.test(l) && /(cm|mm|㎝|크기|사이즈|가로|세로|높이|폭|깊이|지름|규격|[xX×])/i.test(l)).join('\n').slice(0, 3000);
  return { dims: hit, ambiguous: !hit || triples > 1, snippet };
}

/** An LLM answer is only kept when its evidence is verbatim and contains all three numbers. */
export function acceptLlmDims(text: string, p: Record<string, unknown> | null): Dims | null {
  if (!p || p.abstain || typeof p.evidence !== 'string' || !p.evidence || !text.includes(p.evidence)) return null;
  const vals = ['width', 'depth', 'height'].map((k) => String(p[k] ?? ''));
  const tokens = new Set(Array.from(p.evidence.matchAll(/\d+(?:[.,]\d+)?/g), (m) => m[0].replace(',', '.')));
  if (!vals.every((v) => /^\d{1,4}(?:\.\d{1,2})?$/.test(v) && tokens.has(v))) return null;
  if (p.unit !== 'cm' && p.unit !== 'mm') return null;
  return { rawText: `[image-OCR] ${p.evidence}`.replace(/\s+/g, ' ').slice(0, 120), width: vals[0]!, depth: vals[1]!, height: vals[2]!, unit: p.unit, confidence: 'low' };
}

/**
 * Pack quantity from the product's own text, strongest first: name "5P" / "3개입",
 * detail "구성 : 1P" / "바구니 1개", then the page's "1개씩 구매" single-unit price.
 */
export function packFromText(name: string, snips: string[], detail: string): Pack | null {
  const n = /(\d{1,3})\s*(?:P|p|매|개입|입)(?![a-zA-Z가-힣])/.exec(name);
  if (n && Number(n[1]) >= 1) return { value: Number(n[1]), basis: 'confirmed', evidence: `이름 "${n[0].trim()}"` };
  const all = [...snips, ...detail.split(/\n+/)].map((s) => s.trim()).filter(Boolean);
  for (const l of all) {
    const m = /(?:구성|상품\s*구성|입수)\s*[:：]?\s*[^\d\n]{0,12}?(\d{1,3})\s*(?:P|p|개|입|매)/.exec(l);
    if (m && Number(m[1]) >= 1) return { value: Number(m[1]), basis: 'confirmed', evidence: `상세 "${m[0].trim().slice(0, 40)}"` };
  }
  if (all.some((l) => /1개씩\s*구매/.test(l))) return { value: 1, basis: 'confirmed', evidence: '페이지 "1개씩 구매" 기본가' };
  return null;
}

export interface PrevItem { id: string; dimensions?: Dims | Record<string, unknown>; packQuantity?: Pack | null; categoryHint?: string; [k: string]: unknown }

const hasDims = (d: unknown): d is Dims => !!d && typeof d === 'object' && ['width', 'depth', 'height'].every((k) => typeof (d as Record<string, unknown>)[k] === 'string' && (d as Record<string, string>)[k] !== '');

/**
 * Merge a freshly crawled item with the previously published one. Previously
 * published dimensions win (they may carry manual visual corrections); for pack
 * quantity a confirmed published value wins, else fresh evidence, else the previous value.
 */
export function mergeItem(crawled: Record<string, unknown>, prev: PrevItem | undefined, fresh: { dims: Dims | null; pack: Pack | null; categoryHint: string }): Record<string, unknown> | null {
  const d = hasDims(prev?.dimensions) ? prev!.dimensions : fresh.dims;
  if (!hasDims(d)) return null;
  const out: Record<string, unknown> = { ...crawled, dimensions: d, status: 'unconfirmed', categoryHint: prev?.categoryHint ?? fresh.categoryHint };
  // A previously published confirmed pack value stays (it may carry a manual check);
  // fresh page evidence fills gaps and upgrades reference-only values.
  const prevPack = prev?.packQuantity ?? null;
  const pack = prevPack?.basis === 'confirmed' ? prevPack : (fresh.pack ?? prevPack);
  if (pack) out.packQuantity = pack; else delete out.packQuantity;
  return out;
}

/** Canonical item list for "did anything change" comparison (order and key order free). */
export function canonicalItems(items: Record<string, unknown>[]): string {
  const sortKeys = (v: unknown): unknown => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify([...items].map((i) => { const { fetchedAt: _f, ...rest } = i; return sortKeys(rest); }).sort((a, b) => String((a as PrevItem).id).localeCompare(String((b as PrevItem).id))));
}

export interface Gate { ok: boolean; reasons: string[] }

/** Publish gates: validator clean, no item loss beyond maxDropRatio, crawl not blocked or error-heavy. */
export function publishGate(input: { liveCount: number; newCount: number; reviewCodes: string[]; quarantined: boolean; rejected: number; blocked: string[]; pages: number; errors: number; maxDropRatio: number }): Gate {
  const reasons: string[] = [];
  if (input.blocked.length) reasons.push(`blocked:${[...new Set(input.blocked)].join(',')}`);
  if (input.errors >= 3 && input.errors > input.pages * 0.2) reasons.push(`error_spike:${input.errors}/${input.pages}`);
  if (input.quarantined || input.reviewCodes.length) reasons.push(`validator:${input.reviewCodes.join(',') || 'quarantined'}`);
  if (input.rejected > 0) reasons.push(`rejected_items:${input.rejected}`);
  if (input.newCount === 0) reasons.push('empty_bundle');
  if (input.liveCount > 0 && input.newCount < input.liveCount * (1 - input.maxDropRatio)) reasons.push(`item_drop:${input.liveCount}->${input.newCount}`);
  return { ok: reasons.length === 0, reasons };
}
