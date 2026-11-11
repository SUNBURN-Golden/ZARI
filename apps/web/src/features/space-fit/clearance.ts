/**
 * Clearance is a search input (millimetres), not a computed geometry value.
 * The approved choices are shown in centimetres; storage keeps the integer mm.
 */
export const CLEARANCE_OPTIONS_MM = [0, 5, 10, 20] as const;

export type ClearanceMm = (typeof CLEARANCE_OPTIONS_MM)[number];

export const DEFAULT_CLEARANCE_MM: ClearanceMm = 5;

export const CLEARANCE_STORAGE_KEY = 'zari.space-fit.clearance.v1';

/**
 * A stored value is accepted only when it names one of the approved choices.
 * Broken JSON, unknown numbers and empty text fall back to the default.
 */
export function parseClearance(value: string | null | undefined): ClearanceMm {
  if (value === null || value === undefined || value.trim() === '') return DEFAULT_CLEARANCE_MM;
  const parsed = Number(value);
  return (CLEARANCE_OPTIONS_MM as readonly number[]).includes(parsed)
    ? (parsed as ClearanceMm)
    : DEFAULT_CLEARANCE_MM;
}

/** Centimetres without trailing zeros: 0, 0.5, 1, 2. */
export function formatClearanceCm(mm: number): string {
  return String(mm / 10);
}

/** Visible chip label, e.g. `0.5cm`. */
export function clearanceLabel(mm: number): string {
  return `${formatClearanceCm(mm)}cm`;
}
