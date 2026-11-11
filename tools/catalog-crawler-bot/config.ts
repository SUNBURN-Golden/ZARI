import type { CostCap } from './deepseek.ts';
import { existsSync } from 'node:fs';
import { readJson } from './fsx.ts';

/** User-editable. Every value is clamped to the hard limits below. */
export interface Config {
  aiCostCap: CostCap | null;
  minIntervalMs: number;
  jitterMs: number;
  pagesPerRun: number;
  dailyPerHost: number;
  recrawlDays: number;
  blockCooldownHours: number;
  robotsTtlHours: number;
  jobTimeoutMs: number;
  publishEvery: number;
  chromePath: string | null;
}

export const DEFAULTS: Config = {
  aiCostCap: null,
  minIntervalMs: 8000,
  jitterMs: 4000,
  pagesPerRun: 100,
  dailyPerHost: 300,
  recrawlDays: 30,
  blockCooldownHours: 6,
  robotsTtlHours: 24,
  jobTimeoutMs: 120000,
  publishEvery: 0,
  chromePath: null,
};

/** Hard-coded bounds. A config file can slow the bot down but not past these. */
export const LIMITS = {
  minIntervalMsFloor: 3000,
  pagesPerRunMax: 500,
  dailyPerHostMax: 1000,
  recrawlDaysFloor: 7,
  blockCooldownHoursFloor: 6,
  cooldownMaxHours: 24 * 7,
  jobTimeoutMsMax: 300000,
} as const;

const clamp = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback;

function costCap(raw: unknown): CostCap | null {
  if (raw === undefined || raw === null || raw === false) return null;
  if (typeof raw !== 'object') throw new Error('ai_cost_config_invalid');
  const c = raw as Record<string, unknown>;
  if (![c.limitUsd,c.inputUsdPerMillion,c.outputUsdPerMillion].every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)) throw new Error('ai_cost_config_invalid');
  return { limitUsd:c.limitUsd as number,inputUsdPerMillion:c.inputUsdPerMillion as number,outputUsdPerMillion:c.outputUsdPerMillion as number };
}
export function normalizeConfig(raw: Partial<Record<keyof Config, unknown>>): Config {
  return {
    aiCostCap: costCap(raw.aiCostCap),
    minIntervalMs: clamp(raw.minIntervalMs, DEFAULTS.minIntervalMs, LIMITS.minIntervalMsFloor, 3600000),
    jitterMs: clamp(raw.jitterMs, DEFAULTS.jitterMs, 0, 600000),
    pagesPerRun: clamp(raw.pagesPerRun, DEFAULTS.pagesPerRun, 1, LIMITS.pagesPerRunMax),
    dailyPerHost: clamp(raw.dailyPerHost, DEFAULTS.dailyPerHost, 1, LIMITS.dailyPerHostMax),
    recrawlDays: clamp(raw.recrawlDays, DEFAULTS.recrawlDays, LIMITS.recrawlDaysFloor, 3650),
    blockCooldownHours: clamp(raw.blockCooldownHours, DEFAULTS.blockCooldownHours, LIMITS.blockCooldownHoursFloor, LIMITS.cooldownMaxHours),
    robotsTtlHours: clamp(raw.robotsTtlHours, DEFAULTS.robotsTtlHours, 1, 24 * 14),
    jobTimeoutMs: clamp(raw.jobTimeoutMs, DEFAULTS.jobTimeoutMs, 10000, LIMITS.jobTimeoutMsMax),
    publishEvery: clamp(raw.publishEvery, DEFAULTS.publishEvery, 0, 10000),
    chromePath: typeof raw.chromePath === 'string' && raw.chromePath.length > 0 ? raw.chromePath : null,
  };
}

export function loadConfig(path: string): Config {
  return normalizeConfig(existsSync(path) ? readJson<Record<string, unknown>>(path, {}) : {});
}
