import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { cpus, homedir, totalmem, platform, release } from 'node:os';
import { join } from 'node:path';
import type { Browser, LaunchOptions } from '@playwright/test';
import type { DomainFixture, RawProjectInputDto } from '../../src/contracts/generated/dto';
import type { BenchRequestTiming } from '../harness';

/**
 * ZARI-010 measured beta readiness. Every number below is produced by the
 * real Worker/WASM/IndexedDB stack, from the same wire requests the native
 * fixture runner issues. Stages are reported separately so transport, Rust
 * compute, serialization, and persistence costs never hide inside a single
 * combined figure.
 *
 * Env knobs (defaults match docs/PERFORMANCE_SECURITY_FAILURES.md):
 *   ZARI_BENCH_COLD   cold-start samples          (default 20)
 *   ZARI_BENCH_WARM   warm iterations per fixture (default 50)
 */
const COLD_SAMPLES = Math.max(1, Number(process.env.ZARI_BENCH_COLD ?? 20));
const WARM_SAMPLES = Math.max(1, Number(process.env.ZARI_BENCH_WARM ?? 50));
const SEARCH_CASES = [
  'bench-search-small',
  'bench-search-reference',
  'bench-search-adversarial',
  'bench-search-cancel',
];
const NORMALIZE_CASES = [
  'bench-normalize-small',
  'bench-normalize-reference',
  'bench-normalize-boundary',
];

// Desktop p95 targets from docs/PERFORMANCE_SECURITY_FAILURES.md. The mobile
// column is not claimed: no mobile-profile project runs in this matrix.
const TARGETS = {
  wasmTransferCompile: 1000,
  normalization: 20,
  searchStep: 8,
  messagingResidual: 10,
  serialization: 20,
  cancelAck: 100,
  draftTransaction: 50,
  snapshotSaveReload: 200,
};

interface StepRow extends BenchRequestTiming {
  command: string;
  event: string;
}
interface FixtureRun {
  steps: StepRow[];
  terminal: unknown;
  heapDelta: number | null;
}

async function loadFixture(caseId: string): Promise<DomainFixture> {
  return JSON.parse(
    await readFile(`fixtures/bench/${caseId}.json`, 'utf8'),
  ) as DomainFixture;
}
function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return { n: 0, p50: null, p95: null, max: null };
  const pick = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  return { n: sorted.length, p50: pick(50), p95: pick(95), max: sorted[sorted.length - 1] };
}
function verdict(p95: number | null, target: number) {
  if (p95 === null) return 'unmeasured';
  return p95 <= target ? 'met' : 'exceeded';
}

/** A truly cold browser: fresh profile, empty HTTP cache, cold JIT. */
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
test.setTimeout(15 * 60 * 1000);

const report: Record<string, unknown> = {
  contract: 'zari-bench-1',
  generatedAt: new Date().toISOString(),
  samples: { cold: COLD_SAMPLES, warm: WARM_SAMPLES },
  environment: {
    node: process.version,
    platform: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model ?? 'unknown',
    logicalCores: cpus().length,
    memoryBytes: totalmem(),
    headless: true,
    network: 'loopback vite preview; no throttle',
    power: 'unmeasured',
  },
  fixtures: {},
};

test.afterAll(async () => {
  const outDir = 'test-results/bench';
  await mkdir(outDir, { recursive: true });
  const engine = String(report.engine ?? 'unknown');
  const path = join(outDir, `bench-${engine}.json`);
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  const rows =
    (report.targets as { stage: string; p95: number | null; target: number; status: string }[]) ??
    [];
  console.log(`[bench] ${engine}: report -> ${path}`);
  for (const row of rows) {
    const observed = row.p95 === null ? 'n/a' : `${row.p95.toFixed(2)}ms`;
    console.log(`[bench]   ${row.stage.padEnd(24)} p95=${observed} target=${row.target}ms ${row.status}`);
  }
});

test('@bench cold: wasm transfer, instantiate, worker init', async ({
  browser,
  browserName,
}, info) => {
  report.engine = browserName;
  const fixture = await loadFixture('bench-search-small');
  const cold: {
    pageLoadMs: number;
    wasmFetchMs: number;
    wasmCompileMs: number;
    wasmBytes: number;
    runtimeCreateMs: number;
    workerInitMs: number;
    heapBytes: number | null;
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
      const requests = await page.evaluate((f) => window.bench.requestsFor(f), fixture);
      const sample = await page.evaluate(async (initializeJson) => {
        const transfer = await window.bench.wasmTransfer();
        const createStart = performance.now();
        const direct = window.bench.directRuntime();
        const runtimeCreateMs = performance.now() - createStart;
        const worker = window.bench.spawnWorker();
        const initStart = performance.now();
        const first = await window.bench.send(worker, direct, initializeJson);
        const workerInitMs = performance.now() - initStart;
        worker.terminate();
        return {
          transfer,
          runtimeCreateMs,
          workerInitMs,
          firstEvent: first.event,
          heapBytes: window.bench.memory()?.usedJSHeapSize ?? null,
        };
      }, requests[0]!);
      expect((sample.firstEvent as { kind?: string }).kind).toBe('ready');
      cold.push({
        pageLoadMs,
        wasmFetchMs: sample.transfer.fetchMs,
        wasmCompileMs: sample.transfer.compileMs,
        wasmBytes: sample.transfer.bytes,
        runtimeCreateMs: sample.runtimeCreateMs,
        workerInitMs: sample.workerInitMs,
        heapBytes: sample.heapBytes,
      });
      await context.close();
    } finally {
      await instance.close();
    }
  }
  report.browserVersion = browser.version();
  report.wasmBytes = cold[0]?.wasmBytes ?? null;
  report.cold = {
    pageLoadMs: stats(cold.map((s) => s.pageLoadMs)),
    wasmFetchMs: stats(cold.map((s) => s.wasmFetchMs)),
    wasmCompileMs: stats(cold.map((s) => s.wasmCompileMs)),
    workerInitMs: stats(cold.map((s) => s.workerInitMs)),
    runtimeCreateMs: stats(cold.map((s) => s.runtimeCreateMs)),
    heapBytesAfterInit: stats(cold.map((s) => s.heapBytes ?? 0)),
    note: 'workerInitMs = Worker construction + its WASM fetch (HTTP-cache-warm after the page load even on a cold profile) + instantiate + initialize round trip. wasmFetchMs is an uncached page-side download of the same module.',
  };
});

for (const caseId of [...NORMALIZE_CASES, ...SEARCH_CASES]) {
  test(`@bench warm: ${caseId}`, async ({ page }) => {
    const fixture = await loadFixture(caseId);
    await page.goto('/tests/harness.html');
    await page.waitForFunction(() => typeof window.bench === 'object');
    const runs: FixtureRun[] = [];
    for (let i = 0; i < WARM_SAMPLES; i += 1) {
      const run = await page.evaluate(async (f) => {
        const requests = window.bench.requestsFor(f);
        const worker = window.bench.spawnWorker();
        const direct = window.bench.directRuntime();
        const heapBefore = window.bench.memory()?.usedJSHeapSize ?? null;
        const steps: ({ command: string; event: string } & BenchRequestTiming)[] =
          [];
        let terminal: unknown = null;
        try {
          for (const requestJson of requests) {
            const result = await window.bench.send(worker, direct, requestJson);
            const command = (JSON.parse(requestJson) as { command: { kind: string } })
              .command.kind;
            const event = (result.event as { kind?: string } | null)?.kind ?? 'none';
            steps.push({ command, event, ...result.timing });
            terminal = result.event;
            if (
              ['searchCompleted', 'searchCancelled', 'operationFailed'].includes(event)
            )
              break;
          }
        } finally {
          worker.terminate();
        }
        const heapAfter = window.bench.memory()?.usedJSHeapSize ?? null;
        return {
          steps,
          terminal,
          heapDelta:
            heapBefore === null || heapAfter === null ? null : heapAfter - heapBefore,
        };
      }, fixture);
      runs.push(run);
    }
    // Oracle equality: the terminal event must reproduce the pinned Rust
    // expectation — termination, digests, diagnostics, consumed counters. A
    // browser regression or silently changed budget fails here.
    const expected = fixture.expected as Record<string, unknown>;
    const last = runs[runs.length - 1]?.terminal as Record<string, unknown>;
    if (fixture.operation === 'runSearch') {
      const result = (last?.result ?? {}) as Record<string, unknown>;
      const digests = ((result.alternatives as { planSnapshotId: string }[]) ?? []).map(
        (a) => a.planSnapshotId,
      );
      const actualTermination =
        last?.kind === 'searchCancelled' ? 'cancelled' : result.termination;
      expect({ caseId, actualTermination }).toEqual({
        caseId,
        actualTermination: expected.termination,
      });
      expect({ caseId, digests }).toEqual({ caseId, digests: expected.alternativeDigests });
      expect({ caseId, consumed: result.consumed ?? (last?.consumed ?? null) }).toEqual({
        caseId,
        consumed: expected.consumed,
      });
    } else {
      expect(last?.kind).toBe('normalized');
      expect(last?.inputDigest ?? null).toBe(expected.inputDigest ?? null);
      const diagnostics = ((last?.diagnostics as { code: string; fieldPath: string }[]) ?? [])
        .map((d) => ({ code: d.code, fieldPath: d.fieldPath }))
        .sort((a, b) => a.fieldPath.localeCompare(b.fieldPath) || a.code.localeCompare(b.code));
      const want = ((expected.diagnostics as { code: string; fieldPath: string }[]) ?? [])
        .map((d) => ({ code: d.code, fieldPath: d.fieldPath }))
        .sort((a, b) => a.fieldPath.localeCompare(b.fieldPath) || a.code.localeCompare(b.code));
      expect(diagnostics).toEqual(want);
    }

    const byCommand = new Map<string, BenchRequestTiming[]>();
    for (const run of runs)
      for (const step of run.steps) {
        const list = byCommand.get(step.command) ?? [];
        list.push(step);
        byCommand.set(step.command, list);
      }
    const perCommand: Record<string, unknown> = {};
    for (const [command, rows] of byCommand) {
      perCommand[command] = {
        workerMs: stats(rows.map((r) => r.workerMs)),
        directMs: stats(rows.map((r) => r.directMs)),
        encodeMs: stats(rows.map((r) => r.encodeMs)),
        decodeMs: stats(rows.map((r) => r.decodeMs)),
        residualMs: stats(rows.map((r) => r.workerMs - r.directMs)),
        requestBytes: stats(rows.map((r) => r.requestBytes)),
        responseBytes: stats(rows.map((r) => r.responseBytes)),
        n: rows.length,
      };
    }
    (report.fixtures as Record<string, unknown>)[caseId] = {
      iterations: runs.length,
      expected,
      perCommand,
      heapDeltaMax: Math.max(0, ...runs.map((r) => r.heapDelta ?? 0)),
    };
  });
}

test('@bench IndexedDB persistence on the real repository', async ({ page }) => {
  const normalizeFixture = await loadFixture('bench-normalize-small');
  const searchFixture = await loadFixture('bench-search-small');
  await page.goto('/tests/harness.html');
  await page.waitForFunction(() => typeof window.bench === 'object');
  const iterations = Math.min(WARM_SAMPLES, 20);
  const result = await page.evaluate(
    async ({ normalize, search, iterations: n }) => {
      const idb = window.bench.idb;
      const out = {
        openMs: [] as number[],
        createMs: [] as number[],
        commitMs: [] as number[],
        putCatalogMs: [] as number[],
        acceptMs: [] as number[],
        loadMs: [] as number[],
        corruptRows: 0,
        snapshotPersisted: false,
      };
      // Real Rust-produced values only: the normalized input + digest come
      // from the pinned fixture pair, and the PlanSnapshot is a live search
      // alternative produced by the real Worker below.
      const normalizedInput = (search.input as { input: unknown }).input;
      const catalog = (search.input as { catalog: unknown }).catalog;
      const inputDigest = (normalize.expected as { inputDigest: string }).inputDigest;
      const rawForm = normalize.input as unknown as RawProjectInputDto;
      let snapshot: unknown = null;
      {
        const requests = window.bench.requestsFor(search);
        const worker = window.bench.spawnWorker();
        const direct = window.bench.directRuntime();
        try {
          for (const requestJson of requests) {
            const r = await window.bench.send(worker, direct, requestJson);
            const kind = (r.event as { kind?: string } | null)?.kind;
            if (kind === 'searchCompleted') {
              snapshot =
                (r.event as { result?: { alternatives?: unknown[] } }).result
                  ?.alternatives?.[0] ?? null;
              break;
            }
            if (kind === 'searchCancelled' || kind === 'operationFailed') break;
          }
        } finally {
          worker.terminate();
        }
      }
      for (let i = 0; i < n; i += 1) {
        out.openMs.push(await idb.open());
        const created = await idb.createProject(rawForm);
        out.createMs.push(created.ms);
        out.putCatalogMs.push(await idb.putCatalog(catalog));
        const commit = await idb.commitNormalized(
          created.projectId,
          rawForm,
          normalizedInput as never,
          inputDigest,
        );
        if (commit.status !== 'committed') throw new Error(`commit:${commit.status}`);
        out.commitMs.push(commit.ms);
        if (snapshot) {
          const accept = await idb.acceptSnapshot(created.projectId, snapshot as never);
          if (accept.status !== 'committed') throw new Error(`accept:${accept.status}`);
          out.acceptMs.push(accept.ms);
          out.snapshotPersisted = true;
        }
        const load = await idb.loadBundle(created.projectId);
        out.loadMs.push(load.ms);
        out.corruptRows += load.corrupt;
      }
      idb.close();
      return out;
    },
    { normalize: normalizeFixture, search: searchFixture, iterations },
  );
  expect(result.corruptRows).toBe(0);
  expect(result.snapshotPersisted).toBe(true);
  report.persistence = {
    openMs: stats(result.openMs),
    createProjectMs: stats(result.createMs),
    commitNormalizedMs: stats(result.commitMs),
    putCatalogMs: stats(result.putCatalogMs),
    acceptSnapshotMs: stats(result.acceptMs),
    loadBundleMs: stats(result.loadMs),
    corruptRows: result.corruptRows,
    note: 'commitNormalizedMs is the small-draft commit transaction; snapshot save+reload = acceptSnapshotMs + loadBundleMs on a real search alternative.',
  };
});

test('@bench stage targets vs measured p95', async ({ browserName }, info) => {
  const fixtures = (report.fixtures ?? {}) as Record<
    string,
    {
      perCommand: Record<
        string,
        {
          workerMs: { p95: number | null };
          residualMs: { p95: number | null };
          encodeMs: { p95: number | null };
          decodeMs: { p95: number | null };
        }
      >;
    }
  >;
  const cold = (report.cold ?? {}) as Record<string, { p95: number | null } | undefined>;
  const persistence = (report.persistence ?? {}) as Record<
    string,
    { p95: number | null } | undefined
  >;
  const p95of = (command: string) =>
    Object.values(fixtures)
      .map((f) => f.perCommand[command]?.workerMs?.p95)
      .filter((v): v is number => v !== null && v !== undefined);
  const cancelP95 = p95of('cancelSearch');
  const serializeP95 = Math.max(
    0,
    ...Object.values(fixtures).flatMap((f) =>
      Object.values(f.perCommand).map((c) => (c.encodeMs.p95 ?? 0) + (c.decodeMs.p95 ?? 0)),
    ),
  );
  // Messaging residual is a steady-state transport cost: initialize carries a
  // one-time WASM instantiate inside the worker, so it stays reported under
  // perCommand but is excluded from the residual target row.
  const residualP95 = Math.max(
    0,
    ...Object.values(fixtures).flatMap((f) =>
      Object.entries(f.perCommand)
        .filter(([command]) => command !== 'initialize')
        .map(([, c]) => c.residualMs.p95 ?? 0),
    ),
  );
  const wasmP95 =
    cold.wasmFetchMs?.p95 !== null && cold.wasmFetchMs !== undefined
      ? (cold.wasmFetchMs.p95 ?? 0) +
        (cold.wasmCompileMs?.p95 ?? 0) +
        (cold.workerInitMs?.p95 ?? 0)
      : null;
  const rows = [
    { stage: 'wasmTransferCompile', p95: wasmP95, target: TARGETS.wasmTransferCompile },
    {
      stage: 'normalization',
      p95: p95of('normalizeInput').length
        ? Math.max(...p95of('normalizeInput'))
        : null,
      target: TARGETS.normalization,
    },
    {
      stage: 'searchStep',
      p95: p95of('stepSearch').length ? Math.max(...p95of('stepSearch')) : null,
      target: TARGETS.searchStep,
    },
    { stage: 'messagingResidual', p95: residualP95 || null, target: TARGETS.messagingResidual },
    { stage: 'serialization', p95: serializeP95 || null, target: TARGETS.serialization },
    {
      stage: 'cancelAck',
      p95: cancelP95.length ? Math.max(...cancelP95) : null,
      target: TARGETS.cancelAck,
    },
    {
      stage: 'draftTransaction',
      p95: persistence.commitNormalizedMs?.p95 ?? persistence.createProjectMs?.p95 ?? null,
      target: TARGETS.draftTransaction,
    },
    {
      stage: 'snapshotSaveReload',
      p95:
        persistence.acceptSnapshotMs?.p95 !== null &&
        persistence.acceptSnapshotMs !== undefined &&
        persistence.loadBundleMs?.p95 !== null &&
        persistence.loadBundleMs !== undefined
          ? persistence.acceptSnapshotMs.p95 + persistence.loadBundleMs.p95
          : null,
      target: TARGETS.snapshotSaveReload,
    },
  ].map((row) => ({ ...row, status: verdict(row.p95, row.target), profile: 'desktop' }));
  report.targets = rows;
  await info.attach('bench-report.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  expect(browserName).toBeTruthy();
});
