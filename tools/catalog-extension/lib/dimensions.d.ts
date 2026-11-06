import type { BundleDimensions } from '../../../apps/web/src/contracts/generated/dto';
export function parseSegment(raw: string): { dimensions: BundleDimensions; flags: string[] };
export function parseDimensionBlocks(lines: string[]): { optionLabel: string | null; dimensions: BundleDimensions; flags: string[] }[];
