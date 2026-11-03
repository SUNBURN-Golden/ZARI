export const EASY_KEY = 'zari.easy.v1';
export const MODE_KEY = 'zari.mode.v1';
export type Dimensions = [string, string, string];
export type EasyDraft = {
  version: 1;
  step: number;
  name: string;
  room: string;
  item: Dimensions;
  space: Dimensions;
  example: boolean;
};
export const emptyDraft = (): EasyDraft => ({
  version: 1, step: 0, name: '', room: '', item: ['', '', ''], space: ['', '', ''], example: false,
});
export function restoreDraft(): EasyDraft {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(EASY_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return emptyDraft();
    const d = value as Record<string, unknown>;
    const dimensions = (v: unknown): v is Dimensions => Array.isArray(v) && v.length === 3 &&
      v.every((text) => typeof text === 'string' && text.length <= 40);
    if (d.version !== 1 || !Number.isInteger(d.step) || Number(d.step) < 0 || Number(d.step) > 4 ||
      typeof d.name !== 'string' || d.name.length > 120 ||
      typeof d.room !== 'string' || !['', '거실', '주방', '방'].includes(d.room) ||
      typeof d.example !== 'boolean' || !dimensions(d.item) || !dimensions(d.space)) return emptyDraft();
    return d as EasyDraft;
  } catch { return emptyDraft(); }
}
