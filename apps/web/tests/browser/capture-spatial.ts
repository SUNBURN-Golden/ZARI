import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { platform, release } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';

/**
 * ZARI-SPATIAL-007 draft captures. Real Chromium, IndexedDB, and WASM Worker.
 * Rust is not mocked. Nothing here approves a baseline.
 */

const DESKTOP = { width: 1440, height: 1000, tag: '1440' } as const;
const PHONE = { width: 390, height: 844, tag: '390' } as const;
const VIEWPORTS = [DESKTOP, PHONE] as const;
const GPU_NOTE =
  'Headless Chromium software GL on this host. Not a discrete GPU and not a phone. Exact pixels are not physical validation.';
const FIXTURE_ID = 'sample-project-form';
const CATALOG_DIGEST = '249cfb4185353ecb69c140ba6e7830b8670dd07708efa1d8cf0d5cee6e96be81';

type ScenarioFile = { path: string; sha256: string };

type GpuInfo = { vendor: string | null; renderer: string | null; available: boolean };

type Bucket = { errors: string[]; cursor: number };

type DraftEntry = {
  id: string;
  status: 'draft';
  file: string;
  sha256: string;
  bytes: number;
  sourceCommit: string;
  sourceDirty: boolean;
  productTree: string;
  scenarioFiles: ScenarioFile[];
  screenOrStory: string;
  state: string;
  fixtureId: string;
  rawOverrides: Record<string, string>;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  fullPage: false;
  browserAndVersion: string;
  os: string;
  fontEnvironment: { cssStack: string; koreanFallback: string };
  locale: 'ko-KR';
  theme: 'light';
  reducedMotion: 'reduce';
  durationFast: string;
  gpu: { vendor: string | null; renderer: string | null; note: string };
  webglNote: string;
  captureCommand: string;
  capturedAt: string;
  consoleErrors: string[];
  detail: string;
};

type Cap = {
  page: Page;
  browser: Browser;
  outDir: string;
  bucket: Bucket;
  entries: DraftEntry[];
  sourceCommit: string;
  sourceDirty: boolean;
  scenarioFiles: ScenarioFile[];
  fontEnvironment: { cssStack: string; koreanFallback: string };
  gpu: GpuInfo;
  durationFast: string;
  missing: string[];
  observations: string[];
  captureCommand: string;
};

function repoRoot(): string {
  return resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
}

function watch(page: Page, bucket: Bucket) {
  page.on('pageerror', (error) => bucket.errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') bucket.errors.push(message.text());
  });
}

function arm(bucket: Bucket) {
  bucket.cursor = bucket.errors.length;
}

async function optional(cap: Cap, label: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    cap.missing.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function since(bucket: Bucket): string[] {
  return bucket.errors.slice(bucket.cursor);
}

function textbox(page: Page, name: string) {
  return page.getByRole('textbox', { name, exact: true });
}

async function reveal(locator: Locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'start', inline: 'nearest' }));
  await locator.page().evaluate(
    () => new Promise((resolveFrame) => requestAnimationFrame(() => resolveFrame(undefined))),
  );
}

async function story(page: Page) {
  const hash = await page.evaluate(() => location.hash);
  if (hash.includes('/plan')) return '#/project/:id/plan';
  if (hash.includes('/project/')) return '#/project/:id';
  return hash || '/';
}

async function clipText(locator: Locator) {
  if ((await locator.count()) === 0) return '';
  const text = (await locator.first().innerText()).replace(/\s+/g, ' ').trim();
  return text.slice(0, 400);
}

async function closeCompactDialog(page: Page) {
  const workspace = page.getByTestId('plan-workspace');
  if ((await workspace.count()) === 0) return;
  const host = workspace.first();
  if ((await host.getAttribute('data-band')) !== 'compact') return;
  if ((await host.getAttribute('data-canvas-mode')) === 'move') return;
  const dialog = page.locator('dialog').first();
  if ((await dialog.count()) === 0) return;
  const open = await dialog.evaluate((el) => el instanceof HTMLDialogElement && el.open);
  if (!open) return;
  await dialog.getByTestId('close-inspector').click();
  await expect
    .poll(async () => dialog.evaluate((el) => el instanceof HTMLDialogElement && el.open))
    .toBe(false);
}

async function shoot(
  cap: Cap,
  page: Page,
  shotId: string,
  state: string,
  options: {
    webglNote: string;
    rawOverrides?: Record<string, string>;
    detail?: string;
    allowErrors?: boolean;
    bucket?: Bucket;
  },
) {
  const bucket = options.bucket ?? cap.bucket;
  await page.evaluate(() => document.fonts.ready);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error(`${shotId}: missing viewport`);
  const fileName = `${shotId}.png`;
  const path = join(cap.outDir, fileName);
  await page.screenshot({ path, fullPage: false, animations: 'disabled' });
  const bytes = await readFile(path);
  const consoleErrors = since(bucket);
  const entry: DraftEntry = {
    id: `zari007-${shotId}`,
    status: 'draft',
    file: `draft/zari007/${fileName}`,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.byteLength,
    sourceCommit: cap.sourceCommit,
    sourceDirty: cap.sourceDirty,
    productTree: 'apps/web/src matches sourceCommit',
    scenarioFiles: cap.scenarioFiles,
    screenOrStory: await story(page),
    state,
    fixtureId: FIXTURE_ID,
    rawOverrides: options.rawOverrides ?? {},
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: await page.evaluate(() => window.devicePixelRatio),
    fullPage: false,
    browserAndVersion: `Chromium ${cap.browser.version()}`,
    os: `${platform()} ${release()}`,
    fontEnvironment: cap.fontEnvironment,
    locale: 'ko-KR',
    theme: 'light',
    reducedMotion: 'reduce',
    durationFast: cap.durationFast,
    gpu: {
      vendor: cap.gpu.vendor,
      renderer: cap.gpu.renderer,
      note: GPU_NOTE,
    },
    webglNote: options.webglNote,
    captureCommand: cap.captureCommand,
    capturedAt: new Date().toISOString(),
    consoleErrors,
    detail: options.detail ?? '',
  };
  cap.entries.push(entry);
  if (!options.allowErrors && consoleErrors.length > 0) {
    throw new Error(`${entry.id} console: ${consoleErrors.join(' | ')}`);
  }
}

async function shootPair(
  cap: Cap,
  state: string,
  target: (page: Page) => Locator,
  options: {
    webglNote: string;
    rawOverrides?: Record<string, string>;
    detail?: string;
    allowErrors?: boolean;
    page?: Page;
    bucket?: Bucket;
  },
) {
  const page = options.page ?? cap.page;
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await closeCompactDialog(page);
    await reveal(target(page));
    await shoot(cap, page, `${state}-${vp.tag}`, state, options);
  }
}

async function readGpu(page: Page): Promise<GpuInfo> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl');
    if (!gl) return { vendor: null, renderer: null, available: false };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = ext
      ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL))
      : String(gl.getParameter(gl.VENDOR));
    const renderer = ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    return { vendor, renderer, available: true };
  });
}

async function installHooks(page: Page) {
  await page.addInitScript(() => {
    const read = (key: string) => sessionStorage.getItem(key) === '1';
    const wrap = (method: 'add' | 'put') => {
      const original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function (this: IDBObjectStore, ...args: unknown[]) {
        if (
          read('zari-fail-snapshot-add') &&
          (this.name === 'snapshots' || this.name === 'drafts')
        ) {
          throw new DOMException('injected failure', 'QuotaExceededError');
        }
        return original.apply(this, args as never);
      } as (typeof IDBObjectStore.prototype)[typeof method];
    };
    wrap('add');
    wrap('put');
    const originalGetAll = IDBIndex.prototype.getAll;
    IDBIndex.prototype.getAll = function (this: IDBIndex, ...args: unknown[]) {
      if (read('zari-fail-progress-read') && this.objectStore.name === 'actionProgress') {
        throw new DOMException('injected read', 'UnknownError');
      }
      return originalGetAll.apply(this, args as never);
    };
    const originalCursor = IDBIndex.prototype.openCursor;
    IDBIndex.prototype.openCursor = function (this: IDBIndex, ...args: unknown[]) {
      if (read('zari-fail-progress-read') && this.objectStore.name === 'actionProgress') {
        throw new DOMException('injected read', 'UnknownError');
      }
      return originalCursor.apply(this, args as never);
    };
  });
}

async function createProject(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30_000 });
}

async function commitSaved(page: Page) {
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
}

async function openComputedPlan(page: Page) {
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 60_000,
  });
  await page.locator('[data-testid^="plan-card-"]').first().click();
  await expect(page.getByTestId('plan-diagram-top').first()).toBeVisible();
  await expect(page.getByTestId('plan-workspace').first()).toHaveAttribute('data-projection-status', 'ready');
}

async function reopenPlan(page: Page) {
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30_000,
  });
  const diagram = page.getByTestId('plan-diagram-top').first();
  if (!(await diagram.isVisible())) {
    await page.locator('[data-testid^="plan-card-"]').first().click();
  }
  await expect(diagram).toBeVisible();
}

function alternativeDetail(page: Page): Locator {
  return page.locator('section').filter({ has: page.locator('#alts-title') }).locator('[data-testid="plan-detail"]');
}

async function prepareMove(scope: Locator) {
  const workspace = scope.getByTestId('plan-workspace');
  if ((await workspace.getAttribute('data-move')) === 'on') return;
  const dialog = scope.locator('dialog').first();
  if ((await workspace.getAttribute('data-band')) === 'compact') {
    const opened = await dialog
      .waitFor({ state: 'visible', timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    if (opened) {
      await dialog.getByTestId('mode-move').click();
      await expect(workspace).toHaveAttribute('data-move', 'on');
      return;
    }
  }
  await scope.getByTestId('mode-move').first().click();
  await expect(workspace).toHaveAttribute('data-move', 'on');
}

async function selectedBox(scope: Locator) {
  const svg = scope.getByTestId('plan-diagram-top');
  const rect = svg.locator('[data-selected="true"]').first();
  await expect(rect).toBeVisible();
  const target = await rect.getAttribute('data-target');
  if (!target) throw new Error('selected rect has no target');
  const hit = await svg.evaluate((el, placementTarget) => {
    const node = el.querySelector(`[data-target="${placementTarget}"]`);
    if (!(node instanceof SVGGraphicsElement)) return null;
    const box = node.getBoundingClientRect();
    const points: { x: number; y: number }[] = [];
    for (let x = box.left + 1; x < box.right - 1; x += 1) {
      points.push({ x, y: box.top + 1 }, { x, y: box.bottom - 1 });
    }
    for (let y = box.top + 1; y < box.bottom - 1; y += 1) {
      points.push({ x: box.left + 1, y }, { x: box.right - 1, y });
    }
    for (let y = box.top + 1; y < box.bottom - 1; y += 4) {
      for (let x = box.left + 1; x < box.right - 1; x += 4) points.push({ x, y });
    }
    for (const point of points) {
      const under = document.elementFromPoint(point.x, point.y);
      const owner = under?.closest('[data-target^="placement:"]');
      if (owner?.getAttribute('data-target') === placementTarget) return point;
    }
    return null;
  }, target);
  if (!hit) throw new Error(`no uncovered point on ${target}`);
  const scale = await svg.locator('[data-testid="plan-diagram-top-plane"]').evaluate((el) => {
    const ctm = (el as SVGGraphicsElement).getScreenCTM();
    return ctm ? { x: ctm.a, y: ctm.d } : { x: 0, y: 0 };
  });
  if (Math.abs(scale.x) < 0.01) throw new Error('missing screen CTM');
  return { start: hit, scale };
}

function screenDelta(scale: { x: number; y: number }, domainX: number, domainY: number) {
  return { x: scale.x * domainX, y: scale.y * domainY };
}

async function cancelDrag(page: Page, at: { x: number; y: number }) {
  await page.keyboard.press('Escape');
  await page.mouse.move(at.x, at.y);
  await page.mouse.up();
}

async function frameDiagram(scope: Locator) {
  await scope.getByTestId('plan-diagram-top').evaluate((el) => {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
  });
}

async function gesturePreview(page: Page, scope: Locator) {
  await prepareMove(scope);
  await frameDiagram(scope);
  const placed = await selectedBox(scope);
  const vp = page.viewportSize();
  if (!vp) throw new Error('missing viewport');
  const dx = placed.start.x + 90 < vp.width - 8 ? 90 : -90;
  const end = { x: placed.start.x + dx, y: placed.start.y };
  await page.mouse.move(placed.start.x, placed.start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect(scope.getByTestId('plan-workspace')).toHaveAttribute('data-gesture-phase', 'preview');
  await expect(scope.getByTestId('drag-preview')).toBeVisible();
  await expect(scope.getByTestId('drag-phase')).toContainText('검사 전');
  return end;
}

async function commitDrag(page: Page, scope: Locator) {
  await prepareMove(scope);
  await frameDiagram(scope);
  const placed = await selectedBox(scope);
  const toward = screenDelta(placed.scale, 0, -15);
  const end = { x: placed.start.x + toward.x, y: placed.start.y + toward.y };
  await page.mouse.move(placed.start.x, placed.start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await expect(scope.getByTestId('plan-workspace')).toHaveAttribute('data-gesture-phase', 'preview');
  await page.mouse.up();
}

function fileSha(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function scenarioFiles(root: string): ScenarioFile[] {
  const paths = [
    'apps/web/tests/browser/capture-spatial.ts',
    'apps/web/tests/browser/capture.spec.ts',
  ];
  return paths.map((path) => ({ path, sha256: fileSha(join(root, path)) }));
}

async function axeSummary(page: Page) {
  const results = await new AxeBuilder({ page }).include('main').analyze();
  return {
    violations: results.violations.map((item) => ({
      id: item.id,
      impact: item.impact,
      nodes: item.nodes.slice(0, 5).map((node) => node.target.join(' ')),
    })),
    incomplete: results.incomplete.length,
    passes: results.passes.length,
  };
}

async function captureMain(cap: Cap) {
  const page = cap.page;
  await installHooks(page);
  await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
  arm(cap.bucket);
  await createProject(page);
  await page.getByTestId('fill-sample').click();
  await commitSaved(page);
  cap.fontEnvironment = {
    cssStack: await page.locator('.zari-ui').first().evaluate((el) => getComputedStyle(el).fontFamily),
    koreanFallback: execFileSync('fc-match', [':lang=ko', 'family'], { encoding: 'utf8' }).trim(),
  };
  cap.gpu = await readGpu(page);
  cap.durationFast = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--zari-duration-fast').trim(),
  );
  if (!/^0(ms|s)$/.test(cap.durationFast)) {
    throw new Error(`reduced-motion token is ${cap.durationFast}`);
  }
  cap.observations.push(`gpu ${cap.gpu.vendor ?? 'none'} / ${cap.gpu.renderer ?? 'none'}`);

  await textbox(page, '공간 안쪽 폭').focus();
  await expect(page.locator('.measure-field[data-focused="true"]')).toHaveCount(1);
  await expect(page.getByTestId('measurement-diagram')).toHaveAttribute('data-scale', 'mm', { timeout: 30_000 });
  await shootPair(cap, 'measurement-known', (host) => host.getByTestId('measurement-diagram'), {
    webglNote: 'Measurement page. No WebGL.',
    detail: 'Sample interior width focused. Diagram scale is mm.',
    rawOverrides: { field: 'space.interior.width', text: '600' },
  });

  arm(cap.bucket);
  await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
  await textbox(page, '개구부 높이').fill('');
  await commitSaved(page);
  await textbox(page, '개구부 높이').focus();
  await expect(page.getByTestId('normalized-space.opening.height')).toHaveText('미측정');
  await expect(page.getByTestId('measurement-diagram')).toHaveAttribute('data-scale', 'none');
  await expect(page.getByTestId('measurement-segment')).toHaveCount(0);
  await shootPair(cap, 'unknown', (host) => host.getByTestId('measurement-diagram'), {
    webglNote: 'Measurement page. No WebGL.',
    detail: 'Opening height cleared. Normalized value 미측정. No scaled segment.',
    rawOverrides: { field: 'space.opening.height', text: '' },
  });

  arm(cap.bucket);
  await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
  await page.getByTestId('fill-sample').click();
  await commitSaved(page);
  await textbox(page, '공간 안쪽 폭').focus();
  await textbox(page, '공간 안쪽 폭').fill('abc');
  await expect(page.getByTestId('normalized-space.interior.width')).toHaveAttribute('data-historical', 'true');
  await expect(page.getByTestId('measurement-diagram')).toHaveAttribute('data-scale', 'none');
  await expect(page.getByTestId('measurement-diagram')).toContainText('축척 없음');
  await shootPair(cap, 'historical', (host) => host.getByTestId('measurement-diagram'), {
    webglNote: 'Measurement page. No WebGL.',
    detail: 'Non-numeric width. Previous 600 mm stays historical. Scale is none.',
    rawOverrides: { field: 'space.interior.width', text: 'abc' },
  });

  arm(cap.bucket);
  await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
  await page.getByTestId('fill-sample').click();
  await commitSaved(page);
  await openComputedPlan(page);
  const axe = await axeSummary(page);
  const ariaWorkspace = await page.getByTestId('plan-workspace').first().ariaSnapshot();
  cap.observations.push(`axe violations ${axe.violations.length}; passes ${axe.passes}; incomplete ${axe.incomplete}`);
  await shootPair(cap, 'success', (host) => host.getByTestId('plan-workspace').first(), {
    webglNote: '2D plan. WebGL chunk not requested.',
    detail: 'Worker search finished. Projection ready on the sample plan.',
    rawOverrides: { sample: 'restored' },
  });

  const unknownChecks = page.locator('[data-testid="checks-list"] li[data-status="unknown"]');
  if ((await unknownChecks.count()) > 0) {
    arm(cap.bucket);
    const summary = await clipText(page.getByTestId('unknown-checks'));
    cap.observations.push(`unknown checks ${await unknownChecks.count()}: ${summary}`);
    await shootPair(cap, 'checks-unknown', (host) => host.getByTestId('checks-list').first(), {
      webglNote: '2D plan. No WebGL.',
      detail: summary || 'Unknown check rows from the Rust report.',
    });
  } else {
    cap.missing.push('Sample plan checks-list had no data-status=unknown row.');
  }

  const multi = page.locator('tr', { hasText: /배치 [2-9]곳/ });
  if ((await multi.count()) > 0) {
    arm(cap.bucket);
    await shootPair(cap, 'bom-multi', () => multi.first(), {
      webglNote: '2D plan. No WebGL.',
      detail: await clipText(multi.first()),
    });
  } else {
    cap.missing.push('Sample plan has no multi-placement BOM row (same limit recorded in 006).');
  }

  const scope = alternativeDetail(page);
  await scope.locator('.placement-pick').first().click();
  await expect(scope.locator('[data-selected="true"]').first()).toBeVisible();
  await optional(cap, 'selection-dimensions', async () => {
    const dimensions = scope.getByTestId('inspector-dimensions');
    if ((await dimensions.count()) === 0 || !/외경|내경/.test(await dimensions.innerText())) {
      cap.missing.push('Selected placement did not show 외경/내경 in inspector-dimensions.');
      return;
    }
    arm(cap.bucket);
    const detail = await clipText(dimensions);
    await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
    await reveal(dimensions);
    await shoot(cap, page, 'selection-dimensions-1440', 'selection-dimensions', {
      webglNote: '2D inspector. No WebGL.',
      detail,
    });
    await page.setViewportSize({ width: PHONE.width, height: PHONE.height });
    const dialog = scope.locator('dialog').first();
    if (!(await dialog.evaluate((el) => el instanceof HTMLDialogElement && el.open).catch(() => false))) {
      const open = scope.getByTestId('open-inspector');
      if ((await open.count()) > 0) await open.click();
    }
    await expect(dialog).toBeVisible();
    await shoot(cap, page, 'selection-dimensions-390', 'selection-dimensions', {
      webglNote: 'Compact inspector sheet. No WebGL.',
      detail,
    });
    await dialog.getByTestId('close-inspector').click();
  });
  await optional(cap, 'cavity-unknown', async () => {
    const cavity = scope.getByTestId('cavity-local');
    if ((await cavity.count()) === 0 || !(await cavity.isVisible())) {
      cap.missing.push('Selected placement did not open a cavity-local pane (offset unknown figure).');
      return;
    }
    arm(cap.bucket);
    await shootPair(cap, 'cavity-unknown', () => cavity, {
      webglNote: '2D cavity pane. No WebGL.',
      detail: await clipText(cavity),
    });
  });

  arm(cap.bucket);
  await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
  const previewEnd = await gesturePreview(page, scope);
  await shoot(cap, page, 'drag-preview-1440', 'drag-preview', {
    webglNote: 'Pointer is down. Rust has not been asked to evaluate the move.',
    detail: '검사 전 ghost on the top diagram.',
  });
  await cancelDrag(page, previewEnd);
  await page.setViewportSize({ width: PHONE.width, height: PHONE.height });
  const previewEndPhone = await gesturePreview(page, scope);
  await shoot(cap, page, 'drag-preview-390', 'drag-preview', {
    webglNote: 'Explicit move mode at 390. Pointer is down. No evaluate yet.',
    detail: '검사 전 ghost. Compact band uses 평면에서 이동.',
  });
  await cancelDrag(page, previewEndPhone);

  arm(cap.bucket);
  await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
  await commitDrag(page, scope);
  await expect(page.getByTestId('edit-section')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('edit-save-failed')).toHaveCount(0);
  await shootPair(cap, 'drag-committed', (host) => host.getByTestId('edit-section'), {
    webglNote: '2D. One pointerup evaluateLayoutEdit. Save succeeded.',
    detail: '검증된 작업 계획 after a -15 mm depth drag.',
  });

  await expect(page.getByTestId('undo-edit')).toBeEnabled();
  await page.getByTestId('undo-edit').click();
  await expect(page.getByTestId('undo-edit')).toContainText('(0)', { timeout: 15_000 });

  arm(cap.bucket);
  await page.evaluate(() => sessionStorage.setItem('zari-fail-snapshot-add', '1'));
  await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
  await commitDrag(page, alternativeDetail(page));
  await expect(page.getByTestId('edit-save-failed')).toBeVisible({ timeout: 20_000 });
  await shootPair(cap, 'drag-save-failed', (host) => host.getByTestId('edit-save-failed'), {
    webglNote: '2D. Rust accepted the move. IndexedDB snapshot and draft writes were injected to fail.',
    detail: '검증된 작업안이 화면에 남고 IndexedDB snapshot/draft write was injected to fail.',
    allowErrors: true,
  });
  await page.evaluate(() => sessionStorage.removeItem('zari-fail-snapshot-add'));
  await page.reload();
  await reopenPlan(page);

  arm(cap.bucket);
  await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
  await page.locator('.placement-pick').first().click();
  const moveX = page.getByTestId('move-x').first();
  await moveX.fill('19999');
  await page.getByTestId('move-apply').first().click();
  await expect(page.getByTestId('edit-rejected')).toBeVisible({ timeout: 20_000 });
  await shootPair(cap, 'drag-rejected', (host) => host.getByTestId('edit-rejected'), {
    webglNote: '2D. Same move command as a drag, sent as coordinates. Rust rejected it.',
    detail: await clipText(page.getByTestId('edit-rejected')),
    rawOverrides: { moveX: '19999' },
  });

  await page.reload();
  await reopenPlan(page);
  await page.getByTestId('view-spatial').click();
  const view = page.getByTestId('spatial-view');
  await expect(view).toHaveAttribute('data-status', 'ready', { timeout: 20_000 });
  await expect.poll(async () => Number(await view.getAttribute('data-renders'))).toBeGreaterThan(0);
  const showWall = async (which: 'front' | 'top', hidden: boolean) => {
    const attr = which === 'front' ? 'data-hide-front' : 'data-hide-top';
    const testId = which === 'front' ? 'spatial-hide-front' : 'spatial-hide-top';
    if ((await view.getAttribute(attr)) === (hidden ? 'true' : 'false')) return;
    const before = await view.getAttribute('data-renders');
    await page.getByTestId(testId).click();
    await expect.poll(async () => view.getAttribute('data-renders')).not.toBe(before);
  };
  arm(cap.bucket);
  await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
  await showWall('front', false);
  await showWall('top', false);
  await shootPair(cap, 'spatial-ready', () => view, {
    webglNote: `Ready oblique software GL. hide-front ${await view.getAttribute('data-hide-front')}, hide-top ${await view.getAttribute('data-hide-top')}. ${GPU_NOTE}`,
    detail: '3D status ready. Front and top boundaries shown.',
  });
  arm(cap.bucket);
  await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
  await showWall('front', true);
  await showWall('top', true);
  await shootPair(cap, 'spatial-cutaway', () => view, {
    webglNote: `Cutaway. hide-front ${await view.getAttribute('data-hide-front')}, hide-top ${await view.getAttribute('data-hide-top')}. ${GPU_NOTE}`,
    detail: 'Front and top boundaries hidden. Read-only.',
  });

  await optional(cap, 'spatial-child', async () => {
    await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
    await reveal(view);
    const placement = page.locator('.spatial-label[data-target^="placement:"]').first();
    if ((await placement.count()) === 0) {
      cap.missing.push('No placement spatial label, so exact child selection was not captured.');
      return;
    }
    const host = await view.boundingBox();
    const placementKey = await placement.getAttribute('data-target');
    if (!host || !placementKey) {
      cap.missing.push('Placement label had no canvas point.');
      return;
    }
    await page.mouse.click(
      host.x + Number(await placement.getAttribute('data-x')),
      host.y + Number(await placement.getAttribute('data-y')),
    );
    const interior = page.getByTestId('spatial-interior');
    const enabled = await interior.isEnabled({ timeout: 3_000 }).catch(() => false);
    if (!enabled) {
      cap.missing.push('spatial-interior stayed disabled, so the exact child was not captured.');
      cap.observations.push(`placement pick ${placementKey} did not enable interior`);
      return;
    }
    await interior.click({ timeout: 5_000 });
    await expect(view).toHaveAttribute('data-interior', 'true', { timeout: 5_000 });
    const instance = page.locator('.spatial-label[data-target^="instance:"]').first();
    await expect(instance).toBeVisible({ timeout: 5_000 });
    const instanceKey = await instance.getAttribute('data-target');
    const hostAgain = await view.boundingBox();
    if (!hostAgain || !instanceKey) {
      cap.missing.push('Instance label had no canvas point.');
      return;
    }
    arm(cap.bucket);
    await page.mouse.click(
      hostAgain.x + Number(await instance.getAttribute('data-x')),
      hostAgain.y + Number(await instance.getAttribute('data-y')),
    );
    await shoot(cap, page, 'spatial-child-1440', 'spatial-child', {
      webglNote: GPU_NOTE,
      detail: `Picked ${instanceKey} inside ${placementKey}.`,
    });
    cap.observations.push(`spatial child pick ${instanceKey}`);
  });

  await page.getByTestId('view-top').click({ timeout: 10_000 });
  await expect(page.getByTestId('plan-diagram-top').first()).toBeVisible();
  await page.getByTestId('accept-plan').click();
  const guide = page.locator('#accepted-guide');
  await expect(guide).toBeVisible();
  const next = guide.getByTestId('step-next');
  await next.focus();
  await page.keyboard.press('Enter');
  if (await next.isEnabled()) await next.click();
  await expect(guide.getByTestId('current-step')).not.toHaveText('현재 단계: 없음');
  const focusButtons = guide.locator('[data-testid^="step-focus-"]');
  const focusCount = await focusButtons.count();
  let highlighted = false;
  for (let i = 0; i < focusCount; i += 1) {
    await focusButtons.nth(i).click();
    if ((await page.locator('[data-testid="plan-diagram-top"] [data-focus="true"]').count()) > 0) {
      highlighted = true;
      break;
    }
  }
  if (!highlighted) {
    cap.missing.push('Accepted guide had no diagram focus outline; the step list is still captured.');
  }
  const blocked = guide.locator('input[disabled]');
  if ((await blocked.count()) > 0) {
    cap.observations.push(`prerequisite-disabled steps ${await blocked.count()}`);
  } else {
    cap.missing.push('No disabled step checkbox, so a prerequisite-blocked row was not separately framed.');
  }
  arm(cap.bucket);
  await shootPair(cap, 'guide-focus', () => guide, {
    webglNote: '2D guide. No WebGL.',
    detail: await clipText(guide.getByTestId('current-step')),
  });
  if (highlighted) {
    await optional(cap, 'guide-diagram', async () => {
      arm(cap.bucket);
      await shootPair(cap, 'guide-diagram', (host) => host.locator('[data-testid="plan-diagram-top"] [data-focus="true"]').first(), {
        webglNote: '2D focus outline for the current step.',
        detail: 'Diagram target of the focused step.',
      });
    });
  }

  arm(cap.bucket);
  await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
  await page.getByTestId('view-top').first().focus();
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
  cap.observations.push(`keyboard focus ${focused}`);
  await reveal(page.locator(':focus'));
  await shoot(cap, page, 'a11y-focus-1440', 'a11y-focus', {
    webglNote: 'Keyboard Tab. prefers-reduced-motion reduce.',
    detail: `Focused ${focused}. --zari-duration-fast ${cap.durationFast}.`,
  });

  arm(cap.bucket);
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await shootPair(cap, 'a11y-forced-colors', (host) => host.getByTestId('plan-workspace').first(), {
    webglNote: 'forced-colors active. 3D color is not the evidence; the 2D workspace is.',
    detail: 'Forced colors on the plan workspace.',
  });
  await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });

  arm(cap.bucket);
  await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
  await reveal(page.getByTestId('plan-diagram-top').first());
  await page.evaluate(() => {
    document.documentElement.style.zoom = '200%';
  });
  await shoot(cap, page, 'a11y-zoom-200-1440', 'a11y-zoom-200', {
    webglNote: 'CSS zoom 200% on the document element.',
    detail: 'Viewport is still 1440×1000 CSS pixels. Content is zoomed.',
  });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '';
  });

  arm(cap.bucket);
  await page.evaluate(() => sessionStorage.setItem('zari-fail-progress-read', '1'));
  await page.reload();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('progress-unavailable')).toBeVisible();
  await shootPair(cap, 'progress-unavailable', (host) => host.getByTestId('progress-unavailable'), {
    webglNote: '2D. Progress read threw. Completion was not invented.',
    detail: await clipText(page.getByTestId('progress-unavailable')),
    allowErrors: true,
  });
  await page.evaluate(() => sessionStorage.removeItem('zari-fail-progress-read'));
  await page.reload();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30_000,
  });
  await expect(page.locator('#accepted-guide')).toBeVisible();
  await expect(page.getByTestId('progress-unavailable')).toHaveCount(0);

  const pageB = await page.context().newPage();
  const bucketB: Bucket = { errors: [], cursor: 0 };
  watch(pageB, bucketB);
  arm(bucketB);
  await pageB.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
  await pageB.goto(page.url());
  await expect(pageB.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30_000,
  });
  await expect(pageB.locator('#accepted-guide')).toBeVisible();
  arm(cap.bucket);
  const enabled = page.locator('#accepted-guide').locator('[data-testid^="action-"]:not([disabled])').first();
  await expect(enabled).toBeVisible();
  await enabled.click();
  await expect(pageB.getByTestId('edit-conflict')).toBeVisible();
  await expect(pageB.locator('#accepted-guide').getByTestId('progress-conflict')).toBeVisible();
  await shootPair(cap, 'conflict', (host) => host.getByTestId('edit-conflict'), {
    webglNote: 'Second tab. No WebGL.',
    detail: await clipText(pageB.getByTestId('edit-conflict')),
    page: pageB,
    bucket: bucketB,
  });
  arm(bucketB);
  await shootPair(cap, 'conflict-progress', (host) => host.locator('#accepted-guide').getByTestId('progress-conflict'), {
    webglNote: 'Second tab guide. No WebGL.',
    detail: await clipText(pageB.getByTestId('progress-conflict')),
    page: pageB,
    bucket: bucketB,
  });

  arm(cap.bucket);
  await page.getByRole('link', { name: '치수로 돌아가기' }).click();
  await textbox(page, '공간 안쪽 폭').fill('610');
  await commitSaved(page);
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await expect(page.locator('#accepted-guide').getByTestId('progress-stale')).toBeVisible();
  const staleTarget = page.getByTestId('stale-plan-notice').or(page.getByTestId('accepted-stale')).first();
  await expect(staleTarget).toBeVisible();
  await shootPair(cap, 'stale', () => staleTarget, {
    webglNote: '2D historical plan after the input width changed to 610. No recompute.',
    detail: await clipText(staleTarget),
    rawOverrides: { field: 'space.interior.width', text: '610' },
  });
  await shootPair(cap, 'stale-progress', (host) => host.locator('#accepted-guide').getByTestId('progress-stale'), {
    webglNote: 'Accepted guide refuses completion on the stale input.',
    detail: await clipText(page.locator('#accepted-guide').getByTestId('progress-stale')),
    rawOverrides: { field: 'space.interior.width', text: '610' },
  });

  const snapshot = {
    axe,
    ariaWorkspace,
    motion: { reducedMotion: 'reduce', durationFast: cap.durationFast },
    gpu: { ...cap.gpu, note: GPU_NOTE },
    focused,
    missing: cap.missing,
    observations: cap.observations,
  };
  return snapshot;
}

async function captureWebglFallback(cap: Cap) {
  const context = await cap.browser.newContext({
    viewport: { width: DESKTOP.width, height: DESKTOP.height },
    deviceScaleFactor: 1,
    locale: 'ko-KR',
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  try {
    await context.addInitScript(() => {
      const prototype = HTMLCanvasElement.prototype;
      const original = prototype.getContext;
      prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (String(type).includes('webgl')) return null;
        return original.apply(this, [type, ...args] as never);
      } as typeof prototype.getContext;
    });
    const page = await context.newPage();
    const bucket: Bucket = { errors: [], cursor: 0 };
    watch(page, bucket);
    arm(bucket);
    await createProject(page);
    await page.getByTestId('fill-sample').click();
    await commitSaved(page);
    await openComputedPlan(page);
    await page.getByTestId('view-spatial').click();
    await expect(page.getByTestId('spatial-fallback')).toHaveAttribute('data-reason', 'webgl_unavailable', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('plan-diagram-top')).toBeVisible();
    await shootPair(cap, 'fallback-webgl', (host) => host.getByTestId('spatial-fallback'), {
      webglNote: 'getContext(webgl) returns null. 2D diagram stays. Software-GL absence, not a discrete-GPU result.',
      detail: await clipText(page.getByTestId('spatial-fallback')),
      page,
      bucket,
    });
  } finally {
    await context.close();
  }
}

async function captureMissingChunk(cap: Cap) {
  const context: BrowserContext = await cap.browser.newContext({
    viewport: { width: DESKTOP.width, height: DESKTOP.height },
    deviceScaleFactor: 1,
    locale: 'ko-KR',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  try {
    const page = await context.newPage();
    const bucket: Bucket = { errors: [], cursor: 0 };
    watch(page, bucket);
    await page.route('**/*SpatialView*', (route) => route.abort());
    await page.route('**/*spatial3d*', (route) => route.abort());
    arm(bucket);
    await createProject(page);
    await page.getByTestId('fill-sample').click();
    await commitSaved(page);
    await openComputedPlan(page);
    await page.getByTestId('view-spatial').click();
    await expect(page.getByTestId('spatial-fallback')).toHaveAttribute('data-reason', 'import', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('plan-diagram-top')).toBeVisible();
    const noise = since(bucket).filter(
      (error) =>
        !/abort|failed to fetch|import|chunk|dynamically imported|error loading|ERR_FAILED|Failed to load resource|JSHandle@object/i.test(
          error,
        ),
    );
    if (noise.length > 0) throw new Error(`fallback-chunk console: ${noise.join(' | ')}`);
    await shootPair(cap, 'fallback-chunk', (host) => host.getByTestId('spatial-fallback'), {
      webglNote: 'SpatialView chunk request aborted. Service worker blocked. 2D diagram stays.',
      detail: await clipText(page.getByTestId('spatial-fallback')),
      page,
      bucket,
      allowErrors: true,
    });
  } finally {
    await context.close();
  }
}

export async function captureSpatialDrafts(args: { page: Page; browser: Browser; outputRoot: string }) {
  const root = repoRoot();
  const productDiff = execFileSync('git', ['diff', '--name-only', 'HEAD', '--', 'apps/web/src'], {
    encoding: 'utf8',
  }).trim();
  if (productDiff) throw new Error(`apps/web/src differs from HEAD:\n${productDiff}`);
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const sourceDirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
  const outDir = join(args.outputRoot, 'zari007');
  await mkdir(outDir);
  const bucket: Bucket = { errors: [], cursor: 0 };
  watch(args.page, bucket);
  const cap: Cap = {
    page: args.page,
    browser: args.browser,
    outDir,
    bucket,
    entries: [],
    sourceCommit,
    sourceDirty,
    scenarioFiles: scenarioFiles(root),
    fontEnvironment: { cssStack: '', koreanFallback: '' },
    gpu: { vendor: null, renderer: null, available: false },
    durationFast: '',
    missing: [
      'Physical phone: UNVERIFIED. 390×844 is Playwright viewport emulation.',
      'Discrete GPU: UNVERIFIED. Headless WebGL is software GL. GPU timestamps were not taken.',
      'WebKit offline was not captured. Node 006 recorded that WPE crashes on setOffline plus reload.',
    ],
    observations: [],
    captureCommand:
      process.env.ZARI_CAPTURE_COMMAND ??
      'ZARI_CAPTURE_DIR=<fresh-directory> npm run capture:baselines',
  };
  const a11y = await captureMain(cap);
  await captureWebglFallback(cap);
  await captureMissingChunk(cap);
  const a11yPath = join(outDir, 'a11y-snapshot.json');
  const a11yBody = JSON.stringify({ ...a11y, missing: cap.missing, observations: cap.observations }, null, 2) + '\n';
  await writeFile(a11yPath, a11yBody);
  const a11ySha = createHash('sha256').update(a11yBody).digest('hex');
  const proposedApprovalSet = cap.entries.map((entry) => entry.id);
  const fragment = {
    spatialDraft007: {
      task: 'ZARI-SPATIAL-007',
      status: 'draft',
      approved: false,
      approval: 'USER ONLY. This capture set is not approved.',
      notPhysicalValidation: true,
      sourceCommit,
      sourceDirty,
      productTree: 'apps/web/src matches sourceCommit',
      fixtureId: FIXTURE_ID,
      catalogDigest: CATALOG_DIGEST,
      scenarioFiles: cap.scenarioFiles,
      gpu: { ...cap.gpu, note: GPU_NOTE },
      reducedMotion: 'reduce',
      durationFast: cap.durationFast,
      proposedApprovalSet,
      missingOrUnverified: cap.missing,
      observations: cap.observations,
      a11ySnapshot: { file: 'draft/zari007/a11y-snapshot.json', sha256: a11ySha },
    },
    baselines: cap.entries,
  };
  await writeFile(join(outDir, 'manifest-fragment.json'), JSON.stringify(fragment, null, 2) + '\n');
  await writeFile(join(outDir, 'capture-metadata.json'), JSON.stringify(cap.entries, null, 2) + '\n');
}
