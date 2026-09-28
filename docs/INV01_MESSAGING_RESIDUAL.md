# INV-01 — ZARI-010 "messaging residual" 초과 조사

상태: read-only 조사 보고서입니다. 제품 코드는 바꾸지 않았고, 측정 코드는 조사용 임시 checkout에서만 실행한 뒤 폐기했습니다(원문은 부록). 이 문서는 ZARI-010의 독립 감사 PASS, 아키텍처 결정, 성능 목표 달성 선언이 아닙니다. 결정은 ASTRA와 사용자에게 있습니다.

- 조사 대상: PR #28(ZARI-010) exact HEAD `a824f2d973f21aff3f48de534e700a400936457e`, base `bb0ca20f472f1bf0329d6d826339b5949b263d6e`. 이 HEAD는 변경하지 않았습니다.
- 조사자: Claude Code 세션(ZARI-010 작성에 참여하지 않음), 2026-09-28 UTC.
- 계약: [DEVIN_EXECUTION_PLAN.md §17 INV-01](DEVIN_EXECUTION_PLAN.md), 목표값은 [PERFORMANCE_SECURITY_FAILURES.md](PERFORMANCE_SECURITY_FAILURES.md).

## 1. 질문

ZARI-010 벤치는 `messagingResidual` p95가 Chromium 37.9ms·Firefox 52ms·WebKit 40ms로 데스크톱 목표 10ms를 넘는다고 보고했습니다. 이 초과가 Worker 메시지 전송 비용인지, 그래서 전송 구조를 바꿔야 하는지를 확인합니다. 같은 PR이 보고한 normalization 초과(Chromium 33.7ms·WebKit 27ms / 20ms)는 §6에서 범위를 제한해 다룹니다.

## 2. 환경

| 항목 | 값 |
|---|---|
| OS / CPU / 메모리 | Linux 6.18.44, Intel Xeon @ 2.10GHz, 논리 코어 4, 16 GiB |
| 브라우저 | Chromium 141.0.7390.37 headless — 환경에 설치된 바이너리를 `ZARI_CHROMIUM_EXECUTABLE`로 지정. Playwright 1.63.0 번들 버전과 다를 수 있음 |
| 런타임 | Node 24.19.0, npm 11.17.0, Rust 1.98.1, wasm-bindgen 0.2.128 |
| 네트워크·전원 | loopback `vite preview`, throttle 없음, 전원 상태 미측정 |
| 미실행 | Firefox·WebKit, 실제 모바일 기기 |

fixture SHA-256(`fixtures/bench/`, 조사 HEAD 기준):

| fixture | sha256 |
|---|---|
| bench-search-small | `957563cfa3bb445e72d1a94ab1c8e942f2f99d56a749a9e9d531c0dad1c8c3b0` |
| bench-search-reference | `8df7650b4f89f7e694c7ced5757cfcd40d6b12f5dfc6baaa6ecdec0bfec44295` |
| bench-search-adversarial | `d4f38d6e4003417702885e787fb5d182d9638d4a3b6ededccd04480f3f104e6d` |
| bench-search-cancel | `49943c8cab821e2c22655e2628b0bf23459b872e715bc337f790e2a31f9768e4` |
| bench-normalize-small | `7577d6c37d603bd823cc17c6c20c6a00aed70d4bbbdbaa50b12c5e0d3fd29cd6` |
| bench-normalize-reference | `b7921c327ffc7505366f46feb1da65108845492251e128bd2f35ff7ef3eccb9a` |
| bench-normalize-boundary | `21f61aea2291b473a1795cdad17b294020dd28410b3b5434a3c43c9518b2b8b1` |

## 3. 재현 (관측)

조사 HEAD에서 `npm run bench:browser -- --project=chromium`(cold 20, warm 50, 예산·fixture 변경 없음)을 실행했습니다. 10개 테스트가 통과했고 모든 terminal event가 고정 Rust oracle과 일치했습니다.

| stage | 이 환경 p95 | PR 보고(Chromium) p95 | 목표 |
|---|---|---|---|
| wasmTransferCompile | 181.9ms | 194ms | 1000ms |
| normalization | **14.0ms** | 33.7ms | 20ms |
| searchStep | 0.6ms | 0.7–1.0ms | 8ms |
| messagingResidual | **56.9ms** | 37.9ms | 10ms |
| serialization | 9.2ms | 5.8ms | 20ms |
| cancelAck | 0.5ms | ≤1ms | 100ms |
| draftTransaction | 6.9ms | ≤13ms | 50ms |
| snapshotSaveReload | 39.0ms | ≤41ms | 200ms |

messagingResidual 초과는 재현되었고, normalization 초과는 이 환경에서 재현되지 않았습니다.

## 4. 측정 경로 (관측, 코드 기준)

1. 페이지 `window.bench.send`(`apps/web/tests/harness.ts`)가 요청 JSON을 다시 직렬화해 `worker.postMessage(string)`으로 보내고 응답까지의 시간을 `workerMs`로 잽니다.
2. Worker(`apps/web/src/worker/entry.ts`)는 문자열을 그대로 `runtime.handle_json`에 넘기고 결과 문자열을 `postMessage`합니다. 별도 JSON 파싱이나 검증은 없습니다.
3. 응답을 받은 뒤 **페이지가 같은 요청을 자기 WASM Runtime으로 한 번 더 실행**해 `directMs`를 잽니다.
4. `residualMs = workerMs − directMs`를 샘플마다 계산하고, stage 행은 (fixture, command≠initialize) 조합별 residual p95 중 **최댓값**입니다(`bench.spec.ts`).
5. warm 반복마다 새 Worker를 만듭니다(새 WASM 인스턴스). 페이지 쪽 모듈은 한 번 컴파일된 것을 재사용합니다.

따라서 residual에는 전송 비용 외에 **서로 다른 두 실행(Worker 대 페이지)의 Rust 계산 시간 차이**가 그대로 섞입니다.

## 5. 분해 결과

### 5.1 벤치 아티팩트의 명령별 residual (관측)

| fixture | command | 요청 크기 | directMs p95 | residual p50 | residual p95 |
|---|---|---|---|---|---|
| bench-search-small | activateProject | 190,195 B | 48.6ms | 2.5ms | 14.2ms |
| bench-search-reference | activateProject | 908,173 B | 213.9ms | 5.7ms | 33.8ms |
| bench-search-adversarial | activateProject | 908,172 B | 230.8ms | 5.8ms | **56.9ms** |
| bench-search-reference | startSearch | 355 B | 76.0ms | 0.2ms | 25.6ms |
| bench-search-adversarial | startSearch | 355 B | 64.8ms | 0.8ms | 17.2ms |
| (전 search fixture) | stepSearch (n≈23,000) | — | ≤0.2ms | 0.1ms | ≤0.5ms |
| (전 normalize fixture) | normalizeInput | ≤39,512 B | ≤14.1ms | ≤1.6ms | ≤4.2ms |

10ms를 넘는 행은 모두 계산이 수십~수백 ms 걸리는 명령입니다. 가장 자주 호출되는 `stepSearch`는 0.5ms 이하입니다. `bench-search-cancel`의 activateProject는 workerMs p95(46.6ms)가 directMs p95(59.2ms)보다 작습니다. 전송 비용이라면 나올 수 없는 관계입니다.

### 5.2 임시 probe: 전송과 계산의 직접 분리 (관측)

Worker 안에서 `handle_json` 직전·직후 시간을 재서 응답과 함께 돌려주는 probe worker를 만들었습니다(부록 A). 이렇게 하면 같은 실행 안에서 `전송 = workerMs − worker 내부 계산 시간`이 됩니다. 새 Worker 경로, 같은 Worker에서 Runtime만 새로 만든 warm 경로, 페이지 direct 경로를 fixture별 30회 측정했습니다. WASM이 없는 echo worker로 같은 908KB 문자열의 순수 왕복도 200회 쟀습니다.

activateProject, 2회 실행(각 n=30):

| fixture | 실제 전송 p95 (1회/2회) | 벤치 방식 residual p95 (1회/2회) | Worker 계산 − direct 계산 p95 (1회/2회) |
|---|---|---|---|
| bench-search-small (190KB) | 0.7 / 0.7ms | 12.2 / 12.2ms | 11.5 / 11.8ms |
| bench-search-reference (908KB) | 1.5 / 1.4ms | 64.7 / 41.3ms | 63.4 / 40.4ms |
| bench-search-adversarial (908KB) | 1.9 / 1.9ms | 24.4 / 26.5ms | 23.0 / 22.6ms |

startSearch(2회차, n=30): 실제 전송 p95 0.5–0.6ms, 벤치 방식 residual p95 2.8–4.1ms. 같은 명령이 벤치 본 실행의 reference·adversarial에서는 25.6ms·17.2ms였습니다.

echo worker(WASM 없음, n=200): 908,173자 왕복 p50 1.2–1.3ms, p95 1.6–1.8ms, 최대 3.6ms. 336자 왕복 p95 0.3ms.

새 Worker와 warm Worker의 계산 시간 차이(reference activateProject 1회차 p50 191.0ms 대 180.0ms)는 residual 크기에 비해 작습니다.

## 6. 해석 (추론)

- **H1 (채택):** 보고된 messagingResidual 초과는 전송 비용이 아니라, 오래 걸리는 Rust 명령을 서로 다른 두 실행에서 잰 **계산 시간 편차**입니다. 근거는 세 가지입니다. (a) 같은 실행 안에서 분리한 실제 전송 p95가 가장 큰 908KB 요청에서도 1.9ms 이하입니다. (b) 벤치 방식 residual p95가 "Worker 계산 − direct 계산" p95와 0.4–3.9ms 차이로 거의 같습니다. (c) 같은 명령·같은 fixture의 residual p95가 실행마다 크게 흔들립니다. reference activateProject는 벤치 33.8ms, probe 64.7ms·41.3ms였고, reference startSearch는 벤치 25.6ms, probe 3.3ms였습니다.
- **H2 (기각):** 전송(postMessage 문자열 복사, Worker 스케줄링)이 10ms를 넘는다. 순수 echo 왕복 최대 3.6ms로 반증되었습니다.
- **반증 조건:** 다른 host나 엔진(특히 PR이 52ms를 보고한 Firefox)에서 같은 probe의 "실제 전송" p95가 10ms를 넘으면 H1은 그 환경에서 성립하지 않습니다. Firefox·WebKit은 이번에 측정하지 않았습니다.
- **normalization:** 이 환경에서 p95 14.0ms로 목표 안이었습니다. normalizeInput의 residual은 4.2ms 이하이고 direct와 worker 시간이 거의 같으므로, PR host의 33.7ms는 전송이 아니라 그 host의 Rust 계산 시간으로 보입니다(추론). 기준 host를 정하지 않으면 met/exceeded 판정이 host에 따라 바뀝니다. 정규화 내부 profiling은 하지 않았습니다.
- **serialization(Firefox 28ms):** Firefox를 실행하지 않아 확인하지 못했습니다.

## 7. 제안하는 다음 범위 (최소)

새 아키텍처는 필요하지 않습니다(추론). 전송 구조를 바꾸는 EXP-01도 이 근거만으로는 정당화되지 않습니다.

1. **측정 정의 수정 (ZARI-010 작성자 또는 별도 task):** messagingResidual을 "Worker가 보고한 자기 계산 시간을 뺀 같은 실행의 왕복 시간"으로 재정의합니다. 계측 worker는 test build 전용 harness에 두고 제품 `entry.ts`는 바꾸지 않습니다. 이미 있는 `directMs`는 realm 간 계산 비교용으로 별도 보고합니다. 예산·fixture·oracle은 그대로 둡니다.
2. **stage 집계 공개:** 최댓값 집계는 유지하되 어느 (fixture, command)가 최댓값인지 아티팩트와 표에 함께 적습니다.
3. **기준 환경 결정:** normalization 판정을 위한 reference host/브라우저를 정하고, 그 환경에서 초과가 재현될 때만 normalize profiling을 INV로 엽니다.
4. **미측정 목표 보고:** 첫 유효 후보 시간, 검증·BOM·확정 시간, React 반영 시간은 아직 측정하지 않았습니다. activateProject 계산이 reference fixture에서 180–245ms(Worker 안, UI 비차단)라는 관측도 함께 적습니다. 문서에 activation 전용 목표는 없습니다.

## 부록 A — 임시 probe 원문 (커밋하지 않음, 조사 HEAD 위에서만 실행)

실행: 조사 HEAD checkout에 아래 세 변경을 두고 `npm run test:build` 후 `npx playwright test --project=chromium --grep @inv01`. 결과 JSON 두 벌(1회: sha256 `1fdb0428a1a321547c5bcca81ef6bb276adc49a134f9a60fe19fc1ed17c68f6b`, 2회: `8f1b2f31dbee5eacbc66b7717d2b3ce1c87d0da3baf20ce6868bd0940913cbc4`)과 벤치 아티팩트(`c4ad5114a71b84c2f6d289287ef95da24c4e4e801ddfa5b95d84f286be35e30c`)는 조사 세션의 로컬 파일이며 저장소에 넣지 않았습니다. 위 표의 수치가 그 파일에서 옮긴 값입니다.

`apps/web/tests/probe-entry.ts`:

```ts
// INV-01 local probe (not committed): the production entry plus in-worker
// compute timing, and a control message that swaps in a fresh Runtime inside
// the same (already warmed) worker isolate.
import init, { Runtime } from '../../../crates/wasm/pkg/zari_wasm.js';
import wasmUrl from '../../../crates/wasm/pkg/zari_wasm_bg.wasm?url';
let runtime: Runtime | null = null;
self.onmessage = async (event: MessageEvent<unknown>) => {
  if (!runtime) {
    await init({ module_or_path: wasmUrl });
    runtime = new Runtime();
  }
  if (typeof event.data !== 'string') {
    runtime = new Runtime();
    self.postMessage({ reset: true });
    return;
  }
  const t0 = performance.now();
  const out = runtime.handle_json(event.data);
  const computeMs = performance.now() - t0;
  self.postMessage({ out, computeMs });
};
```

`apps/web/tests/harness.ts` 추가분:

```diff
diff --git a/apps/web/tests/harness.ts b/apps/web/tests/harness.ts
index f5ad494..d148799 100644
--- a/apps/web/tests/harness.ts
+++ b/apps/web/tests/harness.ts
@@ -302,3 +302,18 @@ window.bench = {
     },
   },
 };
+
+// INV-01 local probe hooks (not committed).
+(window as unknown as { inv01: unknown }).inv01 = {
+  spawnProbe: () =>
+    new Worker(new URL('./probe-entry.ts', import.meta.url), { type: 'module' }),
+  echoWorker: () =>
+    new Worker(
+      URL.createObjectURL(
+        new Blob(
+          ["self.onmessage=(e)=>self.postMessage(typeof e.data==='string'?e.data.length:-1)"],
+          { type: 'text/javascript' },
+        ),
+      ),
+    ),
+};
```

`apps/web/tests/browser/inv01.spec.ts` (2회차 버전, startSearch 포함):

```ts
import { test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { DomainFixture } from '../../src/contracts/generated/dto';

// INV-01 local probe (not committed). Decomposes the bench "messagingResidual"
// for the heavy activateProject request into (a) pure postMessage transport,
// (b) in-worker Rust compute in a freshly spawned worker, (c) the same compute
// after a Runtime swap inside the already-warm worker, (d) page-side direct.
const N = Number(process.env.INV01_N ?? 30);
const CASES = ['bench-search-small', 'bench-search-reference', 'bench-search-adversarial'];

function stats(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const pick = (p: number) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  const r = (v: number) => Math.round(v * 10) / 10;
  return { n: s.length, p50: r(pick(50)), p95: r(pick(95)), max: r(s[s.length - 1]) };
}

test('@inv01 decompose activateProject residual', async ({ page }) => {
  test.setTimeout(900_000);
  await page.goto('/tests/harness.html');
  await page.waitForFunction(() => typeof (window as unknown as { inv01?: unknown }).inv01 === 'object');
  const report: Record<string, unknown> = {
    browserVersion: page.context().browser()?.version(),
    n: N,
  };
  for (const caseId of CASES) {
    const fixture = JSON.parse(
      await readFile(`fixtures/bench/${caseId}.json`, 'utf8'),
    ) as DomainFixture;
    const rows = [] as {
      requestBytes: number;
      freshWorkerMs: number;
      freshComputeMs: number;
      warmWorkerMs: number;
      warmComputeMs: number;
      directMs: number;
      benchResidualMs: number;
      startFreshWorkerMs: number;
      startFreshComputeMs: number;
      startWarmWorkerMs: number;
      startWarmComputeMs: number;
      startDirectMs: number;
    }[];
    for (let i = 0; i < N; i += 1) {
      rows.push(
        await page.evaluate(async (f) => {
          type Probe = { spawnProbe: () => Worker };
          const w = window as unknown as {
            inv01: Probe;
            bench: {
              requestsFor: (f: unknown) => string[];
              directRuntime: () => { handle_json: (s: string) => string };
            };
          };
          const requests = w.bench.requestsFor(f);
          const [initJson, activateJson, startJson] = requests;
          const worker = w.inv01.spawnProbe();
          const send = (msg: unknown) =>
            new Promise<{ out?: string; computeMs?: number }>((resolve) => {
              worker.onmessage = (e) => resolve(e.data);
              worker.postMessage(msg);
            });
          const timed = async (json: string) => {
            const wire = JSON.stringify(JSON.parse(json));
            const t0 = performance.now();
            const reply = await send(wire);
            return { workerMs: performance.now() - t0, computeMs: reply.computeMs ?? NaN };
          };
          await timed(initJson);
          const fresh = await timed(activateJson);
          const freshStart = await timed(startJson);
          await send({ reset: true });
          await timed(initJson);
          const warm = await timed(activateJson);
          const warmStart = await timed(startJson);
          worker.terminate();
          const direct = w.bench.directRuntime();
          direct.handle_json(initJson);
          const d0 = performance.now();
          direct.handle_json(activateJson);
          const directMs = performance.now() - d0;
          const d1 = performance.now();
          direct.handle_json(startJson);
          const directStartMs = performance.now() - d1;
          return {
            requestBytes: new TextEncoder().encode(activateJson).length,
            freshWorkerMs: fresh.workerMs,
            freshComputeMs: fresh.computeMs,
            warmWorkerMs: warm.workerMs,
            warmComputeMs: warm.computeMs,
            directMs,
            benchResidualMs: fresh.workerMs - directMs,
            startFreshWorkerMs: freshStart.workerMs,
            startFreshComputeMs: freshStart.computeMs,
            startWarmWorkerMs: warmStart.workerMs,
            startWarmComputeMs: warmStart.computeMs,
            startDirectMs: directStartMs,
          };
        }, fixture),
      );
    }
    report[caseId] = {
      requestBytes: rows[0].requestBytes,
      freshWorkerMs: stats(rows.map((r) => r.freshWorkerMs)),
      freshComputeMs: stats(rows.map((r) => r.freshComputeMs)),
      freshTransportMs: stats(rows.map((r) => r.freshWorkerMs - r.freshComputeMs)),
      warmWorkerMs: stats(rows.map((r) => r.warmWorkerMs)),
      warmComputeMs: stats(rows.map((r) => r.warmComputeMs)),
      warmTransportMs: stats(rows.map((r) => r.warmWorkerMs - r.warmComputeMs)),
      directMs: stats(rows.map((r) => r.directMs)),
      benchStyleResidualMs: stats(rows.map((r) => r.benchResidualMs)),
      freshComputeMinusDirectMs: stats(rows.map((r) => r.freshComputeMs - r.directMs)),
      startSearch: {
        freshTransportMs: stats(rows.map((r) => r.startFreshWorkerMs - r.startFreshComputeMs)),
        warmTransportMs: stats(rows.map((r) => r.startWarmWorkerMs - r.startWarmComputeMs)),
        freshComputeMs: stats(rows.map((r) => r.startFreshComputeMs)),
        warmComputeMs: stats(rows.map((r) => r.startWarmComputeMs)),
        directMs: stats(rows.map((r) => r.startDirectMs)),
        benchStyleResidualMs: stats(rows.map((r) => r.startFreshWorkerMs - r.startDirectMs)),
        freshComputeMinusDirectMs: stats(rows.map((r) => r.startFreshComputeMs - r.startDirectMs)),
      },
    };
  }
  // Pure transport: same heavy request string to a no-WASM echo worker.
  const heavy = JSON.parse(
    await readFile('fixtures/bench/bench-search-reference.json', 'utf8'),
  ) as DomainFixture;
  report.echoTransport = await page.evaluate(async (f) => {
    const w = window as unknown as {
      inv01: { echoWorker: () => Worker };
      bench: { requestsFor: (f: unknown) => string[] };
    };
    const activateJson = w.bench.requestsFor(f)[1];
    const small = w.bench.requestsFor(f)[0];
    const worker = w.inv01.echoWorker();
    const rtt = async (msg: string) => {
      const t0 = performance.now();
      await new Promise((resolve) => {
        worker.onmessage = resolve;
        worker.postMessage(msg);
      });
      return performance.now() - t0;
    };
    await rtt(small);
    const heavyMs: number[] = [];
    const smallMs: number[] = [];
    for (let i = 0; i < 200; i += 1) {
      heavyMs.push(await rtt(activateJson));
      smallMs.push(await rtt(small));
    }
    worker.terminate();
    return { heavyBytes: activateJson.length, smallBytes: small.length, heavyMs, smallMs };
  }, heavy);
  const echo = report.echoTransport as { heavyMs: number[]; smallMs: number[]; heavyBytes: number; smallBytes: number };
  report.echoTransport = {
    heavyChars: echo.heavyBytes,
    smallChars: echo.smallBytes,
    heavyRttMs: stats(echo.heavyMs),
    smallRttMs: stats(echo.smallMs),
  };
  await mkdir('test-results/inv01', { recursive: true });
  await writeFile('test-results/inv01/inv01-chromium.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
```
