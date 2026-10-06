import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
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
  // docs/SPATIAL_VERIFICATION.md §6. Encode and decode are separate rows.
  projectionSource: 20,
  projectionEncode: 10,
  projectionDecode: 10,
  projectionTransport: 10,
  render2d: 16,
  pointerPreviewJs: 8,
  pointerPreviewPaint: 32,
  first3dReady: 1000,
  frame3d: 16,
  spatialGzipKiB: 250,
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
/** Static `from "./x.js"` edges. Dynamic import maps are not already loaded. */
function staticJsImports(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(/from\s*["']\.\/([^"']+\.js)["']/g)) names.add(match[1]!);
  for (const match of source.matchAll(/import\s*["']\.\/([^"']+\.js)["']/g)) names.add(match[1]!);
  return [...names];
}

/** Static edges plus dynamic `import()` and Vite's preload list. */
function allJsImports(source: string): string[] {
  const names = new Set(staticJsImports(source));
  for (const match of source.matchAll(/import\s*\(\s*["'`](\.\/[^"'`]+\.js)["'`]\s*\)/g)) {
    names.add(match[1]!.replace(/^\.\//, ''));
  }
  const mapped = source.match(/m\.f\|\|\(m\.f=\[([^\]]*)\]\)/);
  if (mapped) {
    for (const match of mapped[1]!.matchAll(/["']\.\/([^"']+\.js)["']/g)) names.add(match[1]!);
  }
  return [...names];
}

/**
 * JS chunks fetched only when 3D opens: the SpatialView entry and every
 * chunk it pulls in, minus the index.html static graph. In the test build
 * that includes the separate three.js chunk. In production three.js is
 * inside the SpatialView chunk.
 */
function lazySpatialChunks(): string[] {
  const assetsDir = 'apps/web/dist/assets';
  const assets = readdirSync(assetsDir);
  const html = readFileSync('apps/web/dist/index.html', 'utf8');
  const read = (name: string) => readFileSync(join(assetsDir, name), 'utf8');
  const initial = new Set<string>();
  const initialQueue = [...html.matchAll(/(?:src|href)="\.\/assets\/([^"]+\.js)"/g)].map((match) => match[1]!);
  while (initialQueue.length > 0) {
    const name = initialQueue.pop()!;
    if (initial.has(name) || !assets.includes(name)) continue;
    initial.add(name);
    for (const next of staticJsImports(read(name))) {
      if (!initial.has(next)) initialQueue.push(next);
    }
  }
  const spatial = new Set<string>();
  const spatialQueue = assets.filter((file) => file.startsWith('SpatialView-') && file.endsWith('.js'));
  while (spatialQueue.length > 0) {
    const name = spatialQueue.pop()!;
    if (spatial.has(name) || !assets.includes(name)) continue;
    spatial.add(name);
    for (const next of allJsImports(read(name))) {
      if (!spatial.has(next)) spatialQueue.push(next);
    }
  }
  return [...spatial].filter((name) => !initial.has(name)).sort();
}

function bundleSizes() {
  const empty = {
    spatialGzipKiB: null as number | null,
    spatialBrotliKiB: null as number | null,
    spatialRawBytes: null as number | null,
    spatialChunks: [] as string[],
    wasmGzipKiB: null as number | null,
    initialJsCssGzipKiB: null as number | null,
    spatialInIndex: null as boolean | null,
  };
  try {
    const assets = readdirSync('apps/web/dist/assets');
    const wasmName = assets.find((file) => file.endsWith('.wasm'));
    const html = readFileSync('apps/web/dist/index.html', 'utf8');
    const referenced = [...html.matchAll(/(?:src|href)="\.\/assets\/([^"]+)"/g)].map((match) => match[1]!);
    const compress = (name: string) => {
      const bytes = readFileSync(join('apps/web/dist/assets', name));
      const gzip = gzipSync(bytes, { level: 9 }).length;
      const brotli = brotliCompressSync(bytes, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
      }).length;
      return { raw: bytes.length, gzip, brotli };
    };
    const lazy = lazySpatialChunks();
    let spatialRaw = 0;
    let spatialGzip = 0;
    let spatialBrotli = 0;
    for (const name of lazy) {
      const sizes = compress(name);
      spatialRaw += sizes.raw;
      spatialGzip += sizes.gzip;
      spatialBrotli += sizes.brotli;
    }
    const wasm = wasmName ? compress(wasmName) : null;
    let initialGzip = 0;
    for (const name of referenced) {
      if (!name.endsWith('.js') && !name.endsWith('.css')) continue;
      initialGzip += gzipSync(readFileSync(join('apps/web/dist/assets', name)), { level: 9 }).length;
    }
    const kib = (bytes: number) => Math.round((bytes / 1024) * 100) / 100;
    const spatialEntry = lazy.find((file) => file.startsWith('SpatialView-')) ?? null;
    return {
      spatialGzipKiB: lazy.length > 0 ? kib(spatialGzip) : null,
      spatialBrotliKiB: lazy.length > 0 ? kib(spatialBrotli) : null,
      spatialRawBytes: lazy.length > 0 ? spatialRaw : null,
      spatialChunks: lazy,
      wasmGzipKiB: wasm ? kib(wasm.gzip) : null,
      initialJsCssGzipKiB: referenced.length > 0 ? kib(initialGzip) : null,
      spatialInIndex: spatialEntry ? html.includes(spatialEntry) : null,
    };
  } catch {
    return empty;
  }
}
function spatialChunkPaths(): string[] {
  try {
    return lazySpatialChunks().map((name) => `assets/${name}`);
  } catch {
    return [];
  }
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
  contract: 'zari-bench-3',
  hardware: {
    phone: 'UNVERIFIED',
    discreteGpu: 'UNVERIFIED',
    note: 'No physical phone and no discrete GPU on this host. Playwright emulation is not a phone result. Optional 3D keeps the 2D fallback when WebGL is missing.',
  },
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
    (report.targets as {
      stage: string;
      p95: number | null;
      target: number;
      status: string;
      at?: { fixture: string; command: string } | null;
    }[]) ?? [];
  console.log(`[bench] ${engine}: report -> ${path}`);
  for (const row of rows) {
    const unit =
      row.stage === 'spatialGzipKiB' ? 'KiB' : row.stage === 'idle3d' ? 'draws' : 'ms';
    const observed = row.p95 === null ? 'n/a' : `${row.p95.toFixed(2)}${unit}`;
    const at = row.at ? ` at ${row.at.fixture}/${row.at.command}` : '';
    console.log(
      `[bench]   ${row.stage.padEnd(24)} p95=${observed} target=${row.target}${unit} ${row.status}${at}`,
    );
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
    spatialChunkFetchMs: number | null;
    spatialChunkBytes: number | null;
  }[] = [];
  const spatialChunks = spatialChunkPaths();
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
      const chunk =
        spatialChunks.length > 0
          ? await page.evaluate(async (paths) => {
              const start = performance.now();
              let bytes = 0;
              for (const path of paths) {
                const response = await fetch(path, { cache: 'no-store' });
                if (!response.ok) return { bytes: 0, fetchMs: 0, ok: false };
                bytes += (await response.arrayBuffer()).byteLength;
              }
              return { bytes, fetchMs: performance.now() - start, ok: true };
            }, spatialChunks)
          : null;
      expect(chunk === null || chunk.ok).toBe(true);
      cold.push({
        pageLoadMs,
        wasmFetchMs: sample.transfer.fetchMs,
        wasmCompileMs: sample.transfer.compileMs,
        wasmBytes: sample.transfer.bytes,
        runtimeCreateMs: sample.runtimeCreateMs,
        workerInitMs: sample.workerInitMs,
        heapBytes: sample.heapBytes,
        spatialChunkFetchMs: chunk?.fetchMs ?? null,
        spatialChunkBytes: chunk?.bytes ?? null,
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
    spatialChunkFetchMs: stats(
      cold.map((s) => s.spatialChunkFetchMs).filter((value): value is number => value !== null),
    ),
    spatialChunkBytes: cold[0]?.spatialChunkBytes ?? null,
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
        // Instrumented entry: same replies, plus in-worker compute timing so
        // the messaging residual is measured within one execution.
        const worker = window.bench.spawnTimedWorker();
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
      const timed = rows.filter(
        (r): r is BenchRequestTiming & { workerComputeMs: number } => r.workerComputeMs !== null,
      );
      perCommand[command] = {
        workerMs: stats(rows.map((r) => r.workerMs)),
        directMs: stats(rows.map((r) => r.directMs)),
        encodeMs: stats(rows.map((r) => r.encodeMs)),
        decodeMs: stats(rows.map((r) => r.decodeMs)),
        // Rust handle_json inside the Worker for the same round trip.
        workerComputeMs: stats(timed.map((r) => r.workerComputeMs)),
        // Messaging residual: round trip minus that same execution's compute
        // (postMessage copy both ways, Worker queueing, reply dispatch).
        transportMs: stats(timed.map((r) => r.workerMs - r.workerComputeMs)),
        // Informational only: the same request's Rust compute in the Worker
        // versus a separate in-page run. It carries run-to-run compute
        // variance and is not a transport cost (docs/INV01_MESSAGING_RESIDUAL.md).
        crossRealmDeltaMs: stats(timed.map((r) => r.workerComputeMs - r.directMs)),
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

test('@bench warm: projection reference and stress, preview, 3D stages', async ({ page }) => {
  const yaw = JSON.parse(
    await readFile('fixtures/spatial/spatial-yaw-offset.json', 'utf8'),
  ) as DomainFixture;
  // bench-search-reference exhausts its budget with zero alternatives, so it
  // has no snapshot to project. The stress plan is the first live alternative
  // from bench-search-small, the same snapshot the persistence bench accepts.
  const search = await loadFixture('bench-search-small');
  await page.goto('/tests/harness.html');
  await page.waitForFunction(() => typeof window.bench === 'object');
  const measured = await page.evaluate(
    async ({ yawFixture, searchFixture, samples }) => {
      const box = (value: unknown) => {
        if (!value || typeof value !== 'object') return null;
        const record = value as Record<string, unknown>;
        const nested = record.value as { min?: unknown; max?: unknown } | undefined;
        return {
          kind: record.kind ?? null,
          basis: record.basis ?? null,
          reasonCode: record.reasonCode ?? null,
          min: nested?.min ?? record.min ?? null,
          max: nested?.max ?? record.max ?? null,
        };
      };
      // Fixture rects omit basis; the wire available rect always carries it.
      // Compare the fields the fixture records, and basis only when it does.
      const geometryKey = (value: unknown, fixtureSide: unknown) => {
        const parsed = box(value);
        const recorded = box(fixtureSide);
        if (!parsed || !recorded) return parsed ? 'present' : 'null';
        return JSON.stringify({
          kind: parsed.kind,
          reasonCode: parsed.reasonCode,
          min: parsed.min,
          max: parsed.max,
          ...(recorded.basis == null ? {} : { basis: parsed.basis }),
        });
      };
      const stable = (value: unknown): string => {
        if (value === null || typeof value !== 'object') return JSON.stringify(value);
        if (Array.isArray(value)) return `[${value.map((item) => stable(item)).join(',')}]`;
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
          .join(',')}}`;
      };
      const projectTimes = async (fixture: DomainFixture) => {
        const requests = window.bench.requestsFor(fixture);
        const projectionJson = requests.find(
          (request) =>
            (JSON.parse(request) as { command: { kind: string } }).command.kind ===
            'projectSpatialView',
        );
        if (!projectionJson) throw new Error('missing_projectSpatialView');
        const worker = window.bench.spawnTimedWorker();
        const direct = window.bench.directRuntime();
        const rows: BenchRequestTiming[] = [];
        let last: unknown = null;
        let directProjection = '';
        try {
          await window.bench.send(worker, direct, requests[0]!);
          for (let i = 0; i < samples; i += 1) {
            const result = await window.bench.send(worker, direct, projectionJson);
            rows.push(result.timing);
            last = result.event;
            if (i === samples - 1) {
              directProjection = direct.handle_json(projectionJson);
            }
          }
        } finally {
          worker.terminate();
        }
        return { rows, last, directProjection };
      };
      const reference = await projectTimes(yawFixture);
      const yawEvent = reference.last as {
        kind?: string;
        projection?: { elements?: Record<string, unknown>[] };
      };
      const expected = yawFixture.expected as { elements?: Record<string, unknown>[] };
      const actual = yawEvent.projection?.elements ?? [];
      const want = expected.elements ?? [];
      let oracleDetail = yawEvent.kind === 'spatialViewProjected' ? '' : `kind=${yawEvent.kind ?? 'none'}`;
      let oracleOk = oracleDetail === '' && actual.length === want.length;
      if (!oracleOk && oracleDetail === '') oracleDetail = `length actual=${actual.length} want=${want.length}`;
      if (oracleOk) {
        for (let i = 0; i < want.length; i += 1) {
          const left = actual[i]!;
          const right = want[i]!;
          const checks: [string, string, string][] = [
            ['role', String(left.role), String(right.role)],
            ['target', stable(left.target), stable(right.target)],
            ['parent', String(left.parentPlacementId ?? null), String(right.parentPlacementId ?? null)],
            ['world', geometryKey(left.worldBox, right.world), geometryKey(right.world, right.world)],
            ['top', geometryKey(left.topRect, right.top), geometryKey(right.top, right.top)],
            ['front', geometryKey(left.frontRect, right.front), geometryKey(right.front, right.front)],
          ];
          const mismatch = checks.find(([, a, b]) => a !== b);
          if (mismatch) {
            oracleOk = false;
            oracleDetail = `i=${i} ${mismatch[0]} actual=${mismatch[1]} want=${mismatch[2]}`;
            break;
          }
        }
      }
      const searchRequests = window.bench.requestsFor(searchFixture);
      const searchWorker = window.bench.spawnWorker();
      const searchDirect = window.bench.directRuntime();
      let snapshot: { content?: { placements?: { id: string }[] } } | null = null;
      let lastKind = 'none';
      try {
        for (const requestJson of searchRequests) {
          const result = await window.bench.send(searchWorker, searchDirect, requestJson);
          const kind = (result.event as { kind?: string } | null)?.kind ?? 'null';
          lastKind = kind;
          if (kind === 'searchCompleted') {
            const searchResult = (
              result.event as {
                result?: { alternatives?: { content?: { placements?: { id: string }[] } }[]; termination?: { reason?: string } };
              }
            ).result;
            snapshot = searchResult?.alternatives?.[0] ?? null;
            if (!snapshot) {
              lastKind = `searchCompleted:alts=${searchResult?.alternatives?.length ?? 'none'}:termination=${searchResult?.termination?.reason ?? 'none'}`;
            }
            break;
          }
          if (kind === 'searchCancelled' || kind === 'operationFailed') break;
        }
      } finally {
        searchWorker.terminate();
      }
      if (!snapshot) {
        throw new Error(`stress_snapshot_missing:${lastKind}:requests=${searchRequests.length}`);
      }
      const stressFixture = {
        ...yawFixture,
        caseId: 'bench-spatial-stress',
        input: { kind: 'plan', snapshot },
      } as DomainFixture;
      const stress = await projectTimes(stressFixture);
      const stressEvent = stress.last as {
        kind?: string;
        projection?: { elements?: { target?: { kind?: string; placementId?: string }; parentPlacementId?: string | null }[] };
      };
      const workerProjection = JSON.stringify(stressEvent.projection ?? null);
      let directProjection: string;
      try {
        const parsed = JSON.parse(stress.directProjection) as { event?: { projection?: unknown } };
        directProjection = JSON.stringify(parsed.event?.projection ?? null);
      } catch {
        directProjection = '';
      }
      const seen = new Set<string>();
      for (const element of stressEvent.projection?.elements ?? []) {
        if (element.target?.kind === 'placement' && element.target.placementId) {
          seen.add(element.target.placementId);
        }
        if (element.parentPlacementId) seen.add(element.parentPlacementId);
      }
      const omitted = (snapshot.content?.placements ?? [])
        .map((placement) => placement.id)
        .filter((id) => !seen.has(id));
      const referenceProjection = yawEvent.projection;
      const referenceContent = (
        yawFixture.input as { snapshot?: { content?: unknown } }
      ).snapshot?.content;
      const stressContent = snapshot.content;
      const spatialReference =
        referenceProjection && referenceContent
          ? await window.bench.measureSpatial(referenceProjection, referenceContent, samples)
          : null;
      const spatialStress =
        stressEvent.projection && stressContent
          ? await window.bench.measureSpatial(stressEvent.projection, stressContent, samples)
          : null;
      const preview = await window.bench.timePreview(samples);
      return {
        referenceRows: reference.rows,
        oracleOk,
        oracleDetail,
        referenceElements: actual.length,
        stressRows: stress.rows,
        stressKind: stressEvent.kind ?? 'none',
        stressEqual: workerProjection === directProjection && workerProjection !== 'null',
        omitted,
        stressElements: stressEvent.projection?.elements?.length ?? 0,
        spatialReference,
        spatialStress,
        preview,
      };
    },
    { yawFixture: yaw, searchFixture: search, samples: WARM_SAMPLES },
  );
  expect(measured.oracleOk, measured.oracleDetail).toBe(true);
  expect(measured.referenceElements).toBeGreaterThan(0);
  expect(measured.stressKind).toBe('spatialViewProjected');
  expect(measured.stressEqual).toBe(true);
  expect(measured.omitted).toEqual([]);
  expect(measured.stressElements).toBeGreaterThan(0);
  expect(measured.preview.jsMs.length).toBe(WARM_SAMPLES);
  for (const spatial of [measured.spatialReference, measured.spatialStress]) {
    expect(spatial).not.toBeNull();
    if (!spatial?.webgl) continue;
    expect(spatial.unclassified).toBe(0);
    expect(spatial.idleDelta).toBe(0);
    expect(spatial.pendingAfterIdle).toBe('0');
    expect(spatial.liveAfter).toBe('0');
    expect(spatial.disposeCycles).toBe(20);
    expect(
      spatial.geometryStable,
      `geometries ready=${spatial.geometriesAtReady} after=${spatial.geometries}`,
    ).toBe(true);
  }
  report.projection = {
    reference: {
      fixture: 'spatial-yaw-offset',
      iterations: measured.referenceRows.length,
      encodeMs: stats(measured.referenceRows.map((row) => row.encodeMs)),
      decodeMs: stats(measured.referenceRows.map((row) => row.decodeMs)),
      workerComputeMs: stats(
        measured.referenceRows
          .map((row) => row.workerComputeMs)
          .filter((value): value is number => value !== null),
      ),
      transportMs: stats(
        measured.referenceRows
          .filter((row) => row.workerComputeMs !== null)
          .map((row) => row.workerMs - (row.workerComputeMs ?? 0)),
      ),
      requestBytes: stats(measured.referenceRows.map((row) => row.requestBytes)),
      responseBytes: stats(measured.referenceRows.map((row) => row.responseBytes)),
      oracleOk: measured.oracleOk,
    },
    stress: {
      fixture: 'bench-search-small snapshot',
      iterations: measured.stressRows.length,
      encodeMs: stats(measured.stressRows.map((row) => row.encodeMs)),
      decodeMs: stats(measured.stressRows.map((row) => row.decodeMs)),
      workerComputeMs: stats(
        measured.stressRows
          .map((row) => row.workerComputeMs)
          .filter((value): value is number => value !== null),
      ),
      transportMs: stats(
        measured.stressRows
          .filter((row) => row.workerComputeMs !== null)
          .map((row) => row.workerMs - (row.workerComputeMs ?? 0)),
      ),
      requestBytes: stats(measured.stressRows.map((row) => row.requestBytes)),
      responseBytes: stats(measured.stressRows.map((row) => row.responseBytes)),
      equalToDirect: measured.stressEqual,
      omittedPlacements: measured.omitted,
      elements: measured.stressElements,
      note: 'One search produces the snapshot. Fifty projectSpatialView calls reuse that snapshot. Worker and in-page projections are compared as JSON.',
    },
  };
  report.preview = {
    jsMs: stats(measured.preview.jsMs),
    paintMs: stats(measured.preview.paintMs),
    note: 'updateMove plus one animation frame that writes a rect. No Worker call.',
  };
  report.spatial = {
    reference: measured.spatialReference,
    stress: measured.spatialStress,
    note: 'sceneMs is planScene. frameMs is renderer.render. idle is one 5s window after the last frame. disposeCycles is 20 create/ready/dispose passes. Frame samples use the warm count. geometryStable means a second selection did not allocate another geometry after the shared edge geometry was uploaded.',
  };
});

test('@bench ui: 2D render, gesture, first 3D on the sample plan', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const host = new URL(request.url()).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') external.push(request.url());
  });
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 60_000,
  });
  const cards = page.locator('[data-testid^="plan-card-"]');
  await cards.first().click();
  await expect(page.getByTestId('plan-diagram-top')).toBeVisible();
  const picks = page.locator('[data-testid^="diagram-pick-"]');
  const pickCount = await picks.count();
  expect(pickCount).toBeGreaterThan(0);
  const renderMs: number[] = [];
  const workspace = page.getByTestId('plan-workspace').first();
  for (let i = 0; i < Math.min(WARM_SAMPLES, pickCount > 1 ? WARM_SAMPLES : 1); i += 1) {
    const before = await workspace.getAttribute('data-render-seq');
    await picks.nth(i % pickCount).click();
    await expect.poll(async () => workspace.getAttribute('data-render-seq')).not.toBe(before);
    renderMs.push(Number(await workspace.getAttribute('data-render-ms')));
  }
  const requestsBefore = await workspace.getAttribute('data-spatial-requests');
  const top = page.getByTestId('plan-diagram-top');
  const box = await top.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 16);
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.mouse.up();
  }
  const requestsAfter = await workspace.getAttribute('data-spatial-requests');
  expect(requestsAfter).toBe(requestsBefore);
  const previewJs = Number(await top.getAttribute('data-preview-js-ms'));
  const previewPaint = Number(await top.getAttribute('data-preview-paint-ms'));
  const started = Date.now();
  await page.getByTestId('view-spatial').click();
  const view = page.getByTestId('spatial-view');
  const fallback = page.getByTestId('spatial-fallback');
  await expect(view.or(fallback)).toBeVisible({ timeout: 20_000 });
  const clickMs = Date.now() - started;
  let first: {
    status: string | null;
    readyMs: number | null;
    frameMs: number | null;
    sceneMs: number | null;
    importMs: number | null;
  };
  if ((await view.count()) > 0 && (await view.getAttribute('data-status')) !== null) {
    await expect(view).toHaveAttribute('data-status', 'ready');
    const idleRenders = await view.getAttribute('data-renders');
    await page.waitForTimeout(5000);
    expect(await view.getAttribute('data-renders')).toBe(idleRenders);
    expect(await view.getAttribute('data-pending-frame')).toBe('0');
    first = {
      status: 'ready',
      readyMs: Number(await view.getAttribute('data-ready-ms')),
      frameMs: Number(await view.getAttribute('data-frame-ms')),
      sceneMs: Number(await view.getAttribute('data-scene-ms')),
      importMs: Number(await workspace.getAttribute('data-spatial-import-ms')),
    };
    const geometries = await view.getAttribute('data-geometries');
    for (let i = 0; i < 20; i += 1) {
      await page.getByTestId(i % 2 === 0 ? 'view-top' : 'view-spatial').click();
    }
    await page.getByTestId('view-spatial').click();
    await expect(view).toHaveAttribute('data-status', 'ready');
    expect(await view.getAttribute('data-geometries')).toBe(geometries);
  } else {
    first = {
      status: await fallback.getAttribute('data-reason'),
      readyMs: null,
      frameMs: null,
      sceneMs: null,
      importMs: Number(await workspace.getAttribute('data-spatial-import-ms')),
    };
  }
  expect(external).toEqual([]);
  report.ui = {
    renderMs: stats(renderMs.filter((value) => Number.isFinite(value))),
    previewJsMs: Number.isFinite(previewJs) ? previewJs : null,
    previewPaintMs: Number.isFinite(previewPaint) ? previewPaint : null,
    clickToReadyMs: clickMs,
    first,
    note: 'Sample plan in the real test build. renderMs is the React commit recorded on the workspace. The 5s idle and 20 view toggles run only when WebGL becomes ready. No request left the loopback host.',
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
          transportMs: { p95: number | null };
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
  type PerCommand = (typeof fixtures)[string]['perCommand'][string];
  // Max-aggregated stage rows also record which (fixture, command) produced
  // the maximum, so one heavy request cannot silently define a whole stage.
  const maxOver = (
    pick: (command: string, c: PerCommand) => number | null | undefined,
  ): { p95: number | null; at: { fixture: string; command: string } | null } => {
    let best: { p95: number; at: { fixture: string; command: string } } | null = null;
    for (const [fixture, f] of Object.entries(fixtures))
      for (const [command, c] of Object.entries(f.perCommand)) {
        const value = pick(command, c);
        if (value === null || value === undefined) continue;
        if (!best || value > best.p95) best = { p95: value, at: { fixture, command } };
      }
    return best ?? { p95: null, at: null };
  };
  const onCommand = (name: string) => (command: string, c: PerCommand) =>
    command === name ? c.workerMs.p95 : null;
  // Messaging residual is a steady-state transport cost: initialize carries a
  // one-time WASM instantiate outside the timed handle_json, so it stays
  // reported under perCommand but is excluded from the residual target row.
  const residual = maxOver((command, c) =>
    command === 'initialize' ? null : c.transportMs?.p95,
  );
  const serialization = maxOver((_, c) =>
    c.encodeMs.p95 === null && c.decodeMs.p95 === null
      ? null
      : (c.encodeMs.p95 ?? 0) + (c.decodeMs.p95 ?? 0),
  );
  const wasmP95 =
    cold.wasmFetchMs?.p95 !== null && cold.wasmFetchMs !== undefined
      ? (cold.wasmFetchMs.p95 ?? 0) +
        (cold.wasmCompileMs?.p95 ?? 0) +
        (cold.workerInitMs?.p95 ?? 0)
      : null;
  const rows: {
    stage: string;
    p95: number | null;
    target: number;
    at?: { fixture: string; command: string } | null;
  }[] = [
    { stage: 'wasmTransferCompile', p95: wasmP95, target: TARGETS.wasmTransferCompile },
    { stage: 'normalization', ...maxOver(onCommand('normalizeInput')), target: TARGETS.normalization },
    { stage: 'searchStep', ...maxOver(onCommand('stepSearch')), target: TARGETS.searchStep },
    { stage: 'messagingResidual', ...residual, target: TARGETS.messagingResidual },
    { stage: 'serialization', ...serialization, target: TARGETS.serialization },
    { stage: 'cancelAck', ...maxOver(onCommand('cancelSearch')), target: TARGETS.cancelAck },
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
  ];
  const projection = report.projection as
    | {
        reference: {
          encodeMs: { p95: number | null };
          decodeMs: { p95: number | null };
          workerComputeMs: { p95: number | null };
          transportMs: { p95: number | null };
        };
        stress: {
          workerComputeMs: { p95: number | null };
          transportMs: { p95: number | null };
        };
      }
    | undefined;
  const preview = report.preview as
    | { jsMs: { p95: number | null }; paintMs: { p95: number | null } }
    | undefined;
  const spatial = report.spatial as
    | {
        reference: {
          webgl?: boolean;
          readyMs?: number | null;
          frameMs?: number[];
          sceneMs?: number[];
          idleDelta?: number | null;
        } | null;
        stress: {
          webgl?: boolean;
          readyMs?: number | null;
          frameMs?: number[];
          sceneMs?: number[];
        } | null;
      }
    | undefined;
  const ui = report.ui as
    | {
        renderMs: { p95: number | null };
        clickToReadyMs: number;
        first: { readyMs: number | null; frameMs: number | null; status: string | null } | null;
      }
    | undefined;
  const maxNum = (values: Array<number | null | undefined>) => {
    const present = values.filter((value): value is number => value !== null && value !== undefined);
    return present.length === 0 ? null : Math.max(...present);
  };
  const frameP95 = (samples: number[] | undefined) => stats(samples ?? []).p95;
  rows.push(
    {
      stage: 'projectionSource',
      p95: maxNum([
        projection?.reference.workerComputeMs.p95,
        projection?.stress.workerComputeMs.p95,
      ]),
      target: TARGETS.projectionSource,
      at: { fixture: 'reference-and-stress', command: 'projectSpatialView' },
    },
    {
      stage: 'projectionEncode',
      p95: projection?.reference.encodeMs.p95 ?? null,
      target: TARGETS.projectionEncode,
      at: { fixture: 'spatial-yaw-offset', command: 'projectSpatialView' },
    },
    {
      stage: 'projectionDecode',
      p95: projection?.reference.decodeMs.p95 ?? null,
      target: TARGETS.projectionDecode,
      at: { fixture: 'spatial-yaw-offset', command: 'projectSpatialView' },
    },
    {
      stage: 'projectionTransport',
      p95: maxNum([
        projection?.reference.transportMs.p95,
        projection?.stress.transportMs.p95,
      ]),
      target: TARGETS.projectionTransport,
      at: { fixture: 'reference-and-stress', command: 'projectSpatialView' },
    },
    {
      stage: 'render2d',
      p95: ui?.renderMs.p95 ?? null,
      target: TARGETS.render2d,
      at: { fixture: 'sample-plan', command: 'selection' },
    },
    {
      stage: 'pointerPreviewJs',
      p95: preview?.jsMs.p95 ?? null,
      target: TARGETS.pointerPreviewJs,
    },
    {
      stage: 'pointerPreviewPaint',
      p95: preview?.paintMs.p95 ?? null,
      target: TARGETS.pointerPreviewPaint,
    },
    {
      stage: 'first3dReady',
      p95: maxNum([
        spatial?.reference?.webgl ? spatial.reference.readyMs : null,
        spatial?.stress?.webgl ? spatial.stress.readyMs : null,
        ui?.first?.status === 'ready' ? ui.clickToReadyMs : null,
      ]),
      target: TARGETS.first3dReady,
    },
    {
      stage: 'frame3d',
      p95: maxNum([
        frameP95(spatial?.reference?.frameMs),
        frameP95(spatial?.stress?.frameMs),
        ui?.first?.frameMs ?? null,
      ]),
      target: TARGETS.frame3d,
    },
    {
      stage: 'scene3d',
      p95: maxNum([
        frameP95(spatial?.reference?.sceneMs),
        frameP95(spatial?.stress?.sceneMs),
      ]),
      target: TARGETS.projectionSource,
    },
    {
      stage: 'idle3d',
      p95: spatial?.reference?.webgl ? spatial.reference.idleDelta ?? null : null,
      target: 0,
    },
  );
  const bundled = bundleSizes();
  report.bundle = bundled;
  rows.push({
    stage: 'spatialGzipKiB',
    p95: bundled.spatialGzipKiB,
    target: TARGETS.spatialGzipKiB,
  });
  const withStatus = rows.map((row) => ({
    ...row,
    status: verdict(row.p95, row.target),
    profile: 'desktop',
    phone: 'unmeasured' as const,
  }));
  report.targets = withStatus;
  await info.attach('bench-report.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  expect(browserName).toBeTruthy();
});
