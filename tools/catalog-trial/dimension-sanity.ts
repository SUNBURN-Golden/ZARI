// Literal evidence is required even when the model returns plausible numbers.
export function saneDimensions(text: string, proposal: unknown) {
  if (!proposal || typeof proposal !== 'object') return null;
  const p = proposal as Record<string, unknown>;
  if (typeof p.evidence !== 'string' || !p.evidence.trim() || p.evidence.length > 1024 || !text.includes(p.evidence)) return null;
  if (/내경|내부|포장|패키지|배송/.test(p.evidence)) return null;
  const values = ['width', 'depth', 'height'].map((axis) => p[axis]);
  if (!values.every((n) => (typeof n === 'number' || typeof n === 'string') && /^\d+(?:\.\d+)?$/.test(String(n)) && Number(n) >= 0.5 && Number(n) <= 300)) return null;
  // Evidence must carry all three values, including converted units (e.g. mm).
  const tokens = p.evidence.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const scale = /mm|㎜|밀리미터/i.test(p.evidence) ? 10 : /(?:^|[^c])\bm\b|미터/.test(p.evidence) && !/cm|센티미터/.test(p.evidence) ? 0.01 : 1;
  if (!values.every((v) => tokens.some((n) => Math.abs(n - Number(v) * scale) < 1e-8))) return null;
  return { rawText: p.evidence, width: String(values[0]), depth: String(values[1]), height: String(values[2]), unit: 'cm', confidence: 'llm' };
}
