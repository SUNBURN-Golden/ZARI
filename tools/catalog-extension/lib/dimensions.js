// Dimension text → labelled W/D/H in the page's own unit. No unit guessing, no
// unit conversion (Rust converts), no axis guessing: anything ambiguous lowers
// the confidence and leaves the values out. Inner/cavity text is never read as
// the outer size, and the outer size is never copied into an inner value.

/** @typedef {{rawText:string,width:string|null,depth:string|null,height:string|null,unit:'mm'|'cm'|'m'|null,confidence:'high'|'medium'|'low'|'unparsed'}} Dimensions */
/** @typedef {{optionLabel:string|null,dimensions:Dimensions,flags:string[]}} DimensionBlock */

const MAX_RAW = 1024;
const AXIS_WORDS = {
  width: ['가로', '너비', '폭', '넓이', 'width'],
  depth: ['세로', '깊이', 'depth'],
  height: ['높이', 'height'],
};
const WORD_TO_AXIS = new Map(
  Object.entries(AXIS_WORDS).flatMap(([axis, words]) => words.map((word) => [word, axis])),
);
const WORD_ALT = [...WORD_TO_AXIS.keys()].sort((a, b) => b.length - a.length).join('|');
const NUM = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';
const UNIT = '(mm|cm|m(?![a-z0-9²³])|밀리미터|센티미터|센치미터|센치|미터)';
const INNER = /내부|내경|안쪽|내측|inner|internal|interior/i;
const ROUND = /지름|직경|원형|diameter|[øφØ]/i;
const GENERIC_LABEL = /^(?:제품\s*)?(?:사이즈|size|규격|치수|크기|외형|외경|외형\s*치수|제품\s*크기|상품\s*크기|dimensions?)\s*(?:\(.*\))?$/i;
const TOKEN = new RegExp(`(${WORD_ALT})\\s*(?:\\(\\s*${UNIT}\\s*\\))?\\s*[:：=]?\\s*${NUM}\\s*${UNIT}?`, 'gi');
const LETTER_TOKEN = new RegExp(`(?<![A-Za-z])([WDH])\\s*[:=]?\\s*${NUM}\\s*${UNIT}?`, 'g');
const ORDER_DECL = new RegExp(`(${WORD_ALT})\\s*[xX×*/·,]\\s*(${WORD_ALT})(?:\\s*[xX×*/·,]\\s*(${WORD_ALT}))?`, 'gi');
const TRIPLE = new RegExp(`${NUM}\\s*${UNIT}?\\s*[xX×*]\\s*${NUM}\\s*${UNIT}?\\s*[xX×*]\\s*${NUM}\\s*${UNIT}?`, 'i');

const UNIT_NAME = new Map([
  ['mm', 'mm'], ['밀리미터', 'mm'],
  ['cm', 'cm'], ['센티미터', 'cm'], ['센치미터', 'cm'], ['센치', 'cm'],
  ['m', 'm'], ['미터', 'm'],
]);

const norm = (text) => text.normalize('NFKC').replace(/[✕✖]/g, '×').replace(/\s+/g, ' ').trim();
const unitOf = (text) => (text ? (UNIT_NAME.get(text.toLowerCase()) ?? null) : null);
const cleanNum = (text) => text.replace(/,/g, '');

/** @param {string} raw @returns {Dimensions} */
function result(raw, fields) {
  return {
    rawText: raw.slice(0, MAX_RAW),
    width: null, depth: null, height: null, unit: null, confidence: 'unparsed',
    ...fields,
  };
}

/**
 * One segment of text → Dimensions + flags. Never merges segments.
 * @param {string} raw
 * @returns {{dimensions: Dimensions, flags: string[]}}
 */
export function parseSegment(raw) {
  const flags = [];
  const original = String(raw ?? '');
  // Inner/cavity clauses are cut out before anything is read as outer size.
  const clauses = norm(original).split(/[;|]|\/(?=\s*(?:내부|내경|안쪽|내측|inner|internal|interior))/i);
  const kept = clauses.filter((clause) => {
    if (INNER.test(clause)) {
      flags.push('inner_ignored');
      return false;
    }
    return true;
  });
  const text = kept.join(' ; ');
  const done = (fields) => ({ dimensions: result(original, fields), flags });
  if (!/\d/.test(text)) return done({ confidence: 'unparsed' });

  const found = [];
  const push = (axis, num, unit, index) => found.push({ axis, value: cleanNum(num), unit: unitOf(unit), index });
  for (const m of text.matchAll(TOKEN)) {
    // Groups: label, optional "(unit)" before the number, number, unit after.
    push(WORD_TO_AXIS.get(m[1].toLowerCase()), m[3], m[4] ?? m[2] ?? null, m.index);
  }
  for (const m of text.matchAll(LETTER_TOKEN)) {
    push({ W: 'width', D: 'depth', H: 'height' }[m[1]], m[2], m[3] ?? null, m.index);
  }

  // "사이즈(가로x세로x높이): 80x40x120cm" — labels declared once, values follow.
  if (found.length === 0) {
    ORDER_DECL.lastIndex = 0;
    const decl = ORDER_DECL.exec(text);
    const triple = TRIPLE.exec(decl ? text.slice(decl.index + decl[0].length) : '');
    if (decl && triple) {
      const axes = [decl[1], decl[2], decl[3]].filter(Boolean).map((w) => WORD_TO_AXIS.get(w.toLowerCase()));
      const nums = [triple[1], triple[3], triple[5]];
      const units = [triple[2], triple[4], triple[6]];
      if (axes.length === 3 && new Set(axes).size === 3) {
        axes.forEach((axis, i) => push(axis, nums[i], units[i], decl.index + i));
      }
    }
  }

  if (ROUND.test(text) && found.length < 3) {
    flags.push('round');
    return done({ confidence: 'low' });
  }
  if (found.length === 0) {
    if (TRIPLE.test(text)) flags.push('unlabeled_triple');
    else flags.push('no_labeled_value');
    return done({ confidence: 'low' });
  }
  if (/\d\s*(?:mm|cm|m)?\s*[~～]\s*\d|\d\s*-\s*\d+(?:\.\d+)?\s*(?:mm|cm|m)\b/i.test(text)) {
    flags.push('range');
    return done({ confidence: 'low' });
  }
  const axes = found.map((f) => f.axis);
  if (new Set(axes).size !== axes.length) {
    flags.push('axis_repeated');
    return done({ confidence: 'low' });
  }

  // Shared unit: only when it is written once for the whole run and every
  // explicit unit agrees. A trailing "(cm)" or "단위: cm" counts as written.
  const explicit = new Set(found.map((f) => f.unit).filter(Boolean));
  let shared = null;
  const marker = /\(\s*(mm|cm|m)\s*\)|단위\s*[:：]?\s*(mm|cm|m)\b/i.exec(text);
  if (marker) shared = unitOf(marker[1] ?? marker[2]);
  if (explicit.size > 1 || (shared && explicit.size === 1 && !explicit.has(shared))) {
    flags.push('mixed_units');
    return done({ confidence: 'low' });
  }
  const unit = explicit.size === 1 ? [...explicit][0] : shared;
  const lastHasUnit = found.every((f) => f.unit !== null) || found[found.length - 1].unit !== null;
  const unitless = found.some((f) => f.unit === null);
  if (!unit || (unitless && explicit.size === 1 && !shared && !lastHasUnit)) {
    flags.push('unit_missing');
    return done({ confidence: 'low' });
  }
  const fields = { unit };
  for (const f of found) fields[f.axis] = f.value;
  fields.confidence = found.length === 3 ? 'high' : found.length === 2 ? 'medium' : 'low';
  return done(fields);
}

const optionPrefix = /^\s*(?:\[([^\]]{1,40})\]|【([^】]{1,40})】|\(([^)\d]{1,30})\)|([^:：\d(]{1,30}?)\s*[:：]\s*(?=.*(?:가로|너비|폭|넓이|세로|깊이|높이|width|depth|height)))/i;

/** @returns {{label:string|null, rest:string}} */
function splitOption(line) {
  const m = optionPrefix.exec(line);
  if (!m) return { label: null, rest: line };
  const label = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').trim();
  if (!label || GENERIC_LABEL.test(label) || WORD_TO_AXIS.has(label.toLowerCase())) {
    return { label: null, rest: line };
  }
  return { label, rest: line.slice(m[0].length) };
}

const axisCount = (line) => {
  const found = new Set();
  const text = norm(line);
  for (const m of text.matchAll(new RegExp(WORD_ALT, 'gi'))) found.add(WORD_TO_AXIS.get(m[0].toLowerCase()));
  for (const m of text.matchAll(/(?<![A-Za-z])([WDH])\s*[:=]?\s*\d/g)) {
    found.add({ W: 'width', D: 'depth', H: 'height' }[m[1]]);
  }
  return found.size;
};

/**
 * Candidate lines (spec rows joined as "label: value" plus body lines) →
 * one block per distinct option. Different options are never merged; repeated
 * unlabeled blocks that disagree stay one low-confidence block.
 * @param {string[]} lines
 * @returns {DimensionBlock[]}
 */
export function parseDimensionBlocks(lines) {
  const candidates = lines
    .map((line) => String(line ?? '').trim())
    .filter((line) => line.length > 0 && line.length <= 300 && /\d/.test(line))
    .filter((line) => axisCount(line) > 0 || /[xX×*]/.test(line) || /사이즈|규격|치수|size/i.test(line))
    .filter((line, index, all) => all.indexOf(line) === index);
  const optioned = [];
  const plain = [];
  const singles = [];
  for (const line of candidates) {
    const { label, rest } = splitOption(line);
    if (label) optioned.push({ label, text: rest, raw: line });
    else if (axisCount(INNER.test(line) ? '' : line) >= 2 || (!axisCount(line) && TRIPLE.test(norm(line)))) plain.push(line);
    else if (axisCount(line) === 1 && !INNER.test(line)) singles.push(line);
    else if (INNER.test(line)) plain.push(line);
  }
  /** @type {DimensionBlock[]} */
  const blocks = [];
  for (const entry of optioned) {
    const parsed = parseSegment(entry.text);
    parsed.dimensions.rawText = entry.raw.slice(0, MAX_RAW);
    blocks.push({ optionLabel: entry.label, ...parsed });
  }
  const unlabeled = [...plain.map((line) => parseSegment(line))];
  if (singles.length > 0) {
    const merged = parseSegment(singles.join(' ; '));
    merged.dimensions.rawText = singles.join(' / ').slice(0, MAX_RAW);
    unlabeled.push(merged);
  }
  const distinct = [];
  for (const entry of unlabeled) {
    if (entry.dimensions.confidence === 'unparsed' && entry.flags.includes('inner_ignored')) {
      distinct.push(entry);
      continue;
    }
    const key = JSON.stringify([entry.dimensions.width, entry.dimensions.depth, entry.dimensions.height, entry.dimensions.unit, entry.dimensions.confidence]);
    if (!distinct.some((d) => d.key === key)) distinct.push({ ...entry, key });
  }
  const usable = distinct.filter((entry) => !(entry.dimensions.confidence === 'unparsed'));
  if (usable.length === 1) blocks.push({ optionLabel: null, dimensions: usable[0].dimensions, flags: usable[0].flags });
  else if (usable.length > 1) {
    // Several different unlabeled readings: unknown which one is the product.
    const raw = usable.map((entry) => entry.dimensions.rawText).join(' / ').slice(0, MAX_RAW);
    blocks.push({ optionLabel: null, dimensions: result(raw, { confidence: 'low' }), flags: ['option_ambiguous'] });
  } else if (distinct.length > 0 && blocks.length === 0) {
    blocks.push({ optionLabel: null, dimensions: distinct[0].dimensions, flags: distinct[0].flags });
  }
  if (blocks.length === 0) {
    blocks.push({ optionLabel: null, dimensions: result('', { confidence: 'unparsed' }), flags: ['no_dimension_text'] });
  }
  // Two different options must keep two items; identical labels collapse.
  const seen = new Set();
  return blocks.filter((block) => {
    const key = block.optionLabel ?? '';
    if (block.optionLabel !== null && seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
