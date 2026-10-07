import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { cpus, homedir, totalmem, platform, release } from 'node:os';
import { join } from 'node:path';
import type { Browser, LaunchOptions } from '@playwright/test';
import type { DomainFixture } from '../../src/contracts/generated/dto';
import type { BenchRequestTiming } from '../harness';

/**
 * ZARI-SPATIAL-011 source-staged timings for queryNextFacts.
 * Cold 20 and warm 50. A p95 over the target is recorded as exceeded.
 * It does not lower a threshold and it does not replace zari-bench-3.
 */
const COLD_SAMPLES = Math.max(1, Number(process.env.ZARI_BENCH_COLD ?? 20));
const WARM_SAMPLES = Math.max(1, Number(process.env.ZARI_BENCH_WARM ?? 50));
const SOURCE_CASES = [
  'mc-12-input-only',
  'mc-10-stale-binding',
  'mc-07-shared-fact',
  'mc-09-catalog-source',
  'mc-12-historical',
  'mc-12-purchase-not-pass',
  'mc-12-limit',
] as const;
const COLD_CASE = 'mc-12-input-only';

const TARGETS = {
  querySource: 20,
  queryEncode: 10,
  queryDecode: 10,
  queryTransport: 10,
};

type QueryEvent = {
  kind?: string;
  code?: string;
  reply?: {
    freshness?: string;
    rows?: unknown[];
    sourceStamp?: { inputDigest?: string };
  };
};

type ExpectedQuery = {
  failureCode: string | null;
  reply: {
    freshness: string;
    rows: unknown[];
    sourceStamp: { inputDigest: string };
  } | null;
};

const report: Record<string, unknown> = {
  contract: 'zari-bench-mc-1',
  phone: 'unmeasured',
  discreteGpu: 'unmeasured',
};

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return { n: 0, p50: null, p95: null, max: null };
  const pick = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
  return { n: sorted.length, p50: pick(50), p95: pick(95), max: sorted[sorted.length - 1] ?? null };
}

function verdict(p95: number | null, target: number) {
  if (p95 === null) return 'unmeasured';
  return p95 <= target ? 'met' : 'exceeded';
}

async function loadFixture(caseId: string): Promise<DomainFixture> {
  return JSON.parse(await readFile(`fixtures/domain/${caseId}.json`, 'utf8')) as DomainFixture;
}

function fixtureDigest(caseId: string) {
  return createHash('sha256').update(readFileSync(`fixtures/domain/${caseId}.json`)).digest('hex');
}

function assertOracle(caseId: string, event: QueryEvent, fixture: DomainFixture) {
  const expected = fixture.expected as ExpectedQuery;
  if (expected.failureCode) {
    expect({ caseId, kind: event.kind, code: event.code }).toEqual({
      caseId,
      kind: 'operationFailed',
      code: expected.failureCode,
    });
    return;
  }
  expect(event.kind).toBe('nextFactsQueried');
  expect({ caseId, freshness: event.reply?.freshness, rows: event.reply?.rows?.length }).toEqual({
    caseId,
    freshness: expected.reply?.freshness,
    rows: expected.reply?.rows.length,
  });
  expect(event.reply?.sourceStamp?.inputDigest).toBe(expected.reply?.sourceStamp.inputDigest);
}

async function freshBrowser(browser: Browser): Promise<Browser> {
  const type = browser.browserType();
  const options: LaunchOptions = {};
  if (type.name() === 'chromium' && process.env.ZARI_CHROMIUM_EXECUTABLE) {
    options.executablePath = process.env.ZARI_CHROMIUM_EXECUTABLE;
    options.args = JSON.parse(process.env.ZARI_CHROMIUM_ARGS_JSON ?? '[]') as string[];
  }
  if (type.name() === 'webkit') {
    const marker = join(homedir(), '.cache', 'zari-webkit-deps', 'env.json');
    if (existsSync(marker)) {
      const extra = JSON.parse(readFileSync(marker, 'utf8')) as Record<string, string>;
      options.env = Object.fromEntries(
        Object.entries({ ...process.env, ...extra }).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      );
    }
  }
  return type.launch(options);
}

test.describe.configure({ mode: 'serial' });

test('@bench cold: measurement query source', async ({ browser, browserName }, info) => {
  test.setTimeout(900_000);
  report.engine = browserName;
  const fixture = await loadFixture(COLD_CASE);
  const cold: {
    pageLoadMs: number;
    wasmFetchMs: number;
    wasmCompileMs: number;
    workerInitMs: number;
    queryWorkerMs: number;
    queryComputeMs: number | null;
  }[] = [];
  for (let i = 0; i < COLD_SAMPLES; i += 1) {
    const instance = await freshBrowser(browser);
    try {
      const context = await instance.newContext({ baseURL: info.project.use.baseURL });
      const page = await context.newPage();
      const navStart = Date.now();
      await page.goto('/tests/harness.html');
      await page.waitForFunction(() => typeof window.bench === 'object');
      const pageLoadMs = Date.now() - navStart;
      const sample = await page.evaluate(async (body) => {
        const transfer = await window.bench.wasmTransfer();
        const requests = window.bench.requestsFor(body);
        const worker = window.bench.spawnTimedWorker();
        const direct = window.bench.directRuntime();
        const initStart = performance.now();
        const first = await window.bench.send(worker, direct, requests[0]!);
        const workerInitMs = performance.now() - initStart;
        const query = await window.bench.send(worker, direct, requests[1]!);
        worker.terminate();
        return { transfer, workerInitMs, first: first.event, query };
      }, fixture);
      expect((sample.first as { kind?: string }).kind).toBe('ready');
      const queryEvent = sample.query.event as QueryEvent;
      assertOracle(COLD_CASE, queryEvent, fixture);
      cold.push({
        pageLoadMs,
        wasmFetchMs: sample.transfer.fetchMs,
        wasmCompileMs: sample.transfer.compileMs,
        workerInitMs: sample.workerInitMs,
        queryWorkerMs: sample.query.timing.workerMs,
        queryComputeMs: sample.query.timing.workerComputeMs,
      });
      await context.close();
    } finally {
      await instance.close();
    }
  }
  report.browserVersion = browser.version();
  report.cold = {
    samples: cold.length,
    fixture: COLD_CASE,
    fixtureDigest: fixtureDigest(COLD_CASE),
    pageLoadMs: stats(cold.map((row) => row.pageLoadMs)),
    wasmFetchMs: stats(cold.map((row) => row.wasmFetchMs)),
    wasmCompileMs: stats(cold.map((row) => row.wasmCompileMs)),
    workerInitMs: stats(cold.map((row) => row.workerInitMs)),
    queryWorkerMs: stats(cold.map((row) => row.queryWorkerMs)),
    queryComputeMs: stats(cold.map((row) => row.queryComputeMs).filter((value): value is number => value !== null)),
  };
});

test('@bench warm: measurement query sources', async ({ page }) => {
  test.setTimeout(900_000);
  await page.goto('/tests/harness.html');
  await page.waitForFunction(() => typeof window.bench === 'object');
  const fixtures: Record<string, unknown> = {};
  for (const caseId of SOURCE_CASES) {
    const fixture = await loadFixture(caseId);
    const runs = await page.evaluate(
      async ({ body, samples }) => {
        const requests = window.bench.requestsFor(body);
        const collected: { steps: ({ command: string; event: string } & BenchRequestTiming)[]; terminal: unknown }[] =
          [];
        for (let i = 0; i < samples; i += 1) {
          const worker = window.bench.spawnTimedWorker();
          const direct = window.bench.directRuntime();
          const steps: ({ command: string; event: string } & BenchRequestTiming)[] = [];
          let terminal: unknown = null;
          try {
            for (const requestJson of requests) {
              const result = await window.bench.send(worker, direct, requestJson);
              const command = (JSON.parse(requestJson) as { command: { kind: string } }).command.kind;
              const event = (result.event as { kind?: string } | null)?.kind ?? 'none';
              steps.push({ command, event, ...result.timing });
              terminal = result.event;
            }
          } finally {
            worker.terminate();
          }
          collected.push({ steps, terminal });
        }
        return collected;
      },
      { body: fixture, samples: WARM_SAMPLES },
    );
    expect(runs.length).toBe(WARM_SAMPLES);
    const last = runs[runs.length - 1]!;
    assertOracle(caseId, last.terminal as QueryEvent, fixture);
    const querySteps = runs.flatMap((run) => run.steps.filter((step) => step.command === 'queryNextFacts'));
    expect(querySteps.length).toBe(WARM_SAMPLES);
    const stamp = (last.terminal as QueryEvent).reply?.sourceStamp?.inputDigest ?? null;
    fixtures[caseId] = {
      fixtureDigest: fixtureDigest(caseId),
      inputDigest: stamp,
      samples: WARM_SAMPLES,
      query: {
        workerMs: stats(querySteps.map((step) => step.workerMs)),
        workerComputeMs: stats(
          querySteps.map((step) => step.workerComputeMs).filter((value): value is number => value !== null),
        ),
        encodeMs: stats(querySteps.map((step) => step.encodeMs)),
        decodeMs: stats(querySteps.map((step) => step.decodeMs)),
        transportMs: stats(
          querySteps
            .filter((step) => step.workerComputeMs !== null)
            .map((step) => step.workerMs - (step.workerComputeMs as number)),
        ),
        requestBytes: querySteps[0]?.requestBytes ?? null,
        responseBytes: querySteps[0]?.responseBytes ?? null,
      },
    };
  }
  report.fixtures = fixtures;
});

test('@bench measurement source stages vs targets', async ({ browserName }, info) => {
  const fixtures = (report.fixtures ?? {}) as Record<
    string,
    {
      query: {
        workerComputeMs: { p95: number | null };
        encodeMs: { p95: number | null };
        decodeMs: { p95: number | null };
        transportMs: { p95: number | null };
      };
    }
  >;
  const maxOf = (pick: (query: (typeof fixtures)[string]['query']) => number | null) => {
    let best: number | null = null;
    for (const row of Object.values(fixtures)) {
      const value = pick(row.query);
      if (value === null) continue;
      if (best === null || value > best) best = value;
    }
    return best;
  };
  const cold = report.cold as { queryComputeMs?: { p95: number | null } } | undefined;
  const rows = [
    { stage: 'querySource', p95: maxOf((query) => query.workerComputeMs.p95), target: TARGETS.querySource },
    { stage: 'queryEncode', p95: maxOf((query) => query.encodeMs.p95), target: TARGETS.queryEncode },
    { stage: 'queryDecode', p95: maxOf((query) => query.decodeMs.p95), target: TARGETS.queryDecode },
    { stage: 'queryTransport', p95: maxOf((query) => query.transportMs.p95), target: TARGETS.queryTransport },
    {
      stage: 'coldQuerySource',
      p95: cold?.queryComputeMs?.p95 ?? null,
      target: TARGETS.querySource,
    },
  ].map((row) => ({
    ...row,
    status: verdict(row.p95, row.target),
    profile: 'desktop',
    phone: 'unmeasured' as const,
  }));
  const fixtureDigests = Object.fromEntries(SOURCE_CASES.map((caseId) => [caseId, fixtureDigest(caseId)]));
  const environment = {
    node: process.version,
    platform: `${platform()} ${release()}`,
    cpuModel: cpus()[0]?.model ?? null,
    cores: cpus().length,
    memoryBytes: totalmem(),
    browser: browserName,
    browserVersion: (report.browserVersion as string | undefined) ?? null,
    coldSamples: COLD_SAMPLES,
    warmSamples: WARM_SAMPLES,
    fixtureDigests,
  };
  const environmentDigest = createHash('sha256').update(JSON.stringify(environment)).digest('hex');
  report.environment = environment;
  report.environmentDigest = environmentDigest;
  report.targets = rows;
  const outDir = 'test-results/bench';
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, `bench-mc-${browserName}.json`);
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  for (const row of rows) {
    const observed = row.p95 === null ? 'n/a' : row.p95.toFixed(3);
    console.log(
      `[bench-mc] ${row.stage} p95=${observed}ms target=${row.target}ms ${row.status} env=${environmentDigest.slice(0, 12)}`,
    );
  }
  await info.attach('bench-mc-report.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  expect(Object.keys(fixtures)).toEqual([...SOURCE_CASES]);
  expect((report.cold as { samples?: number }).samples).toBe(COLD_SAMPLES);
});
