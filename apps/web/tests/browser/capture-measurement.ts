import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { platform, release } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Browser, type Locator, type Page } from '@playwright/test';

/**
 * ZARI-SPATIAL-011 draft captures. Real Chromium, IndexedDB, and WASM Worker.
 * Rust is not mocked. Nothing here approves a baseline or a physical measurement.
 */

const DESKTOP = { width: 1440, height: 1000, tag: '1440' } as const;
const PHONE = { width: 390, height: 844, tag: '390' } as const;
const VIEWPORTS = [DESKTOP, PHONE] as const;
const GPU_NOTE =
  'Headless Chromium software GL on this host. Not a discrete GPU and not a phone. Exact pixels are not physical validation.';
const FIXTURE_ID = 'fresh-ordinary-project';
const CONFLICT_NOTE = '590 mm와 610 mm가 충돌한다. 평균 600. pass Confirmed';

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
  catalogDigest: string;
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

function since(bucket: Bucket): string[] {
  return bucket.errors.slice(bucket.cursor);
}

async function reveal(locator: Locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await locator.page().evaluate(
    () => new Promise((resolveFrame) => requestAnimationFrame(() => resolveFrame(undefined))),
  );
}

async function story(page: Page) {
  const hash = await page.evaluate(() => location.hash);
  if (hash.includes('/project/')) return '#/project/:id';
  return hash || '/';
}

function fileSha(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function scenarioFiles(root: string): ScenarioFile[] {
  const paths = [
    'apps/web/tests/browser/capture-measurement.ts',
    'apps/web/tests/browser/measurement-capture.spec.ts',
  ];
  return paths.map((path) => ({ path, sha256: fileSha(join(root, path)) }));
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

async function createProject(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30_000 });
}

async function commitSaved(page: Page) {
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
}

async function openDetail(page: Page) {
  const button = page.getByTestId('open-detail');
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}

async function desktop(page: Page) {
  await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
}

async function shoot(
  cap: Cap,
  page: Page,
  shotId: string,
  state: string,
  options: { webglNote: string; rawOverrides?: Record<string, string>; detail?: string; bucket?: Bucket },
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
    id: `zari011-${shotId}`,
    status: 'draft',
    file: `draft/zari011/${fileName}`,
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
    gpu: { vendor: cap.gpu.vendor, renderer: cap.gpu.renderer, note: GPU_NOTE },
    webglNote: options.webglNote,
    captureCommand: cap.captureCommand,
    capturedAt: new Date().toISOString(),
    consoleErrors,
    detail: options.detail ?? '',
  };
  cap.entries.push(entry);
  if (consoleErrors.length > 0) throw new Error(`${entry.id} console: ${consoleErrors.join(' | ')}`);
}

async function shootPair(
  cap: Cap,
  state: string,
  target: (page: Page) => Locator,
  options: {
    webglNote: string;
    rawOverrides?: Record<string, string>;
    detail?: string;
    page?: Page;
    bucket?: Bucket;
    detailOpen?: boolean;
    group?: string;
    pick?: string;
  },
) {
  const page = options.page ?? cap.page;
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    if (options.detailOpen) {
      await openDetail(page);
      if (vp.tag === '390') await expect(page.getByTestId('detail-sheet')).toBeVisible();
      if (options.group) await page.getByTestId(`detail-group-${options.group}`).click();
      if (options.pick) await page.getByTestId(`detail-pick-${options.pick}`).click();
    }
    await reveal(target(page));
    await shoot(cap, page, `${state}-${vp.tag}`, state, options);
  }
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

export async function captureMeasurementDrafts(args: {
  page: Page;
  browser: Browser;
  outputRoot: string;
}) {
  const root = repoRoot();
  const productDiff = execFileSync('git', ['diff', '--name-only', 'HEAD', '--', 'apps/web/src'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  if (productDiff) throw new Error(`apps/web/src differs from HEAD:\n${productDiff}`);
  await access(args.outputRoot);
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const sourceDirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0;
  const outDir = join(args.outputRoot, 'zari011');
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
    catalogDigest: '',
    missing: [
      'Physical phone: UNVERIFIED. 390×844 is Playwright viewport emulation.',
      'Discrete GPU: UNVERIFIED. Headless WebGL is software GL. GPU timestamps were not taken.',
    ],
    observations: [],
    captureCommand:
      process.env.ZARI_CAPTURE_COMMAND ??
      'ZARI_CAPTURE_DIR=<fresh-directory> npm run capture:baselines',
  };

  const page = cap.page;
  await desktop(page);
  arm(bucket);
  await createProject(page);
  await expect(page.getByTestId('next-facts')).toHaveAttribute('data-next-facts-status', 'ready');
  await expect(page.getByTestId('next-facts')).toHaveAttribute('data-next-facts-freshness', 'inputOnly');
  await expect(page.locator('[data-need="conflictingEvidence"]')).toHaveCount(0);
  cap.fontEnvironment = {
    cssStack: await page.locator('.zari-ui').first().evaluate((el) => getComputedStyle(el).fontFamily),
    koreanFallback: execFileSync('fc-match', [':lang=ko', 'family'], { encoding: 'utf8' }).trim(),
  };
  cap.gpu = await readGpu(page);
  cap.durationFast = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--zari-duration-fast').trim(),
  );
  if (!/^0(ms|s)$/.test(cap.durationFast)) throw new Error(`reduced-motion token is ${cap.durationFast}`);
  cap.catalogDigest = await page.getByTestId('catalog-pin-select').inputValue();
  cap.observations.push(`gpu ${cap.gpu.vendor ?? 'none'} / ${cap.gpu.renderer ?? 'none'}`);
  cap.observations.push(`catalog ${cap.catalogDigest}`);
  const axe = await axeSummary(page);
  const freshDigest = (await page.getByTestId('input-digest').textContent()) ?? '';

  await shootPair(cap, 'next-fact', (host) => host.getByTestId('next-facts-list'), {
    webglNote: 'Input-only next-fact list from the real Worker. No plan snapshot and no WebGL.',
    detail: 'Fresh project. One query. Rows are missing measurements, not a plan pass.',
    rawOverrides: { freshness: 'inputOnly' },
  });
  await shootPair(cap, 'fresh', (host) => host.getByTestId('uncertainty-space.interior.width'), {
    webglNote: 'Fresh ordinary project. Support and handling are unknown. Sample 50000 g is not inherited.',
    detail: 'Interior width uncertainty is unknown. Detail panel starts collapsed.',
    rawOverrides: { field: 'space.interior.width', text: '' },
  });

  await desktop(page);
  await openDetail(page);
  await page.getByTestId('detail-group-staging').click();
  await page.getByTestId('detail-pick-space.staging.baseSupport').click();
  await expect(page.getByTestId('detail-support-unknown')).toBeChecked();
  await expect(page.getByText('손으로 들어 옮기는 동작은 검사 범위에 포함되지 않습니다.')).toBeVisible();
  await shootPair(
    cap,
    'staging-support',
    (host) => host.getByText('손으로 들어 옮기는 동작은 검사 범위에 포함되지 않습니다.'),
    {
      webglNote: 'Staging support is unknown. The limitation text is not a completed handling check.',
      detail: '미확인 is selected. The limitation sentence stays human text and does not fill 50000 g.',
      detailOpen: true,
      group: 'staging',
      pick: 'space.staging.baseSupport',
      rawOverrides: { field: 'space.staging.baseSupport', state: 'unknown' },
    },
  );

  await desktop(page);
  await openDetail(page);
  await page.getByTestId('detail-group-support').click();
  await page.getByTestId('detail-pick-space.support.footprint.width').click();
  await page.getByTestId('detail-nominal').fill('500');
  await commitSaved(page);
  await expect(page.getByTestId('detail-normalized-space.support.footprint.width')).toHaveAttribute(
    'data-nominal',
    '500',
  );
  await expect(page.getByTestId('detail-normalized-space.support.loadLimit')).toHaveAttribute(
    'data-state',
    'unknown',
  );
  await shootPair(cap, 'load-unknown', (host) => host.getByTestId('detail-normalized-space.support.loadLimit'), {
    webglNote: 'Footprint width is known. Floor load stays unknown. Position is not a load pass.',
    detail: 'Normalized footprint 500. Load state unknown.',
    detailOpen: true,
    group: 'support',
    rawOverrides: { field: 'space.support.footprint.width', text: '500' },
  });

  await desktop(page);
  await openDetail(page);
  await page.getByTestId('detail-group-interior').click();
  await page.getByTestId('detail-pick-space.interior.width').click();
  await page.getByTestId('detail-nominal').fill('600');
  await page.getByTestId('detail-uncertainty-bounded').check();
  await page.getByTestId('detail-minus').fill('2');
  await page.getByTestId('detail-plus').fill('3');
  await commitSaved(page);
  const bounded = page.getByTestId('detail-normalized-space.interior.width');
  await expect(bounded).toHaveAttribute('data-nominal', '600');
  await expect(bounded).toHaveAttribute('data-minus', '2');
  await expect(bounded).toHaveAttribute('data-plus', '3');
  await expect(bounded).toHaveAttribute('data-verification', 'unverified');
  const boundedDigest = (await page.getByTestId('input-digest').textContent()) ?? '';
  expect(boundedDigest).not.toBe(freshDigest);
  await shootPair(cap, 'nominal-bounds', (host) => host.getByTestId('detail-normalized-space.interior.width'), {
    webglNote: 'Rust normalized 600 mm −2/+3. UserMeasured is not Confirmed.',
    detail: 'Nominal 600, minus 2, plus 3, verification unverified.',
    detailOpen: true,
    group: 'interior',
    pick: 'space.interior.width',
    rawOverrides: { field: 'space.interior.width', nominal: '600', minus: '2', plus: '3' },
  });

  await desktop(page);
  await openDetail(page);
  await page.getByTestId('detail-group-opening').click();
  await expect(page.getByTestId('detail-normalized-space.opening.height')).toHaveAttribute('data-state', 'unknown');
  await shootPair(cap, 'unknown', (host) => host.getByTestId('detail-normalized-space.opening.height'), {
    webglNote: 'Opening height was never entered. Unknown stays unknown.',
    detail: 'Opening height normalized state is unknown.',
    detailOpen: true,
    group: 'opening',
    rawOverrides: { field: 'space.opening.height', state: 'unknown' },
  });

  await desktop(page);
  await openDetail(page);
  await page.getByTestId('detail-group-interior').click();
  await page.getByTestId('detail-pick-space.interior.width').click();
  await page.getByTestId('detail-plus').fill('');
  await commitSaved(page);
  await expect(page.getByTestId('normalize-held')).toBeVisible();
  await expect(page.getByTestId('input-digest')).toHaveText(boundedDigest);
  await expect(page.getByTestId('detail-plus')).toHaveValue('');
  await expect(page.getByTestId('uncertainty-space.interior.width')).toHaveText('오차 −2 / +비어 있음 mm');
  await shootPair(cap, 'missing-bound', (host) => host.getByTestId('detail-plus'), {
    webglNote: 'One empty bound blocks the new semantic digest. The previous 600 −2/+3 stays.',
    detail: 'Plus is empty. normalize-held is visible. Digest is unchanged.',
    detailOpen: true,
    group: 'interior',
    pick: 'space.interior.width',
    rawOverrides: { field: 'space.interior.width', plus: '' },
  });

  await desktop(page);
  await openDetail(page);
  await page.getByTestId('detail-group-interior').click();
  await page.getByTestId('detail-pick-space.interior.width').click();
  await page.getByTestId('detail-plus').fill('3');
  await page.getByTestId('detail-note').fill(CONFLICT_NOTE);
  await commitSaved(page);
  const notedDigest = (await page.getByTestId('input-digest').textContent()) ?? '';
  expect(notedDigest).not.toBe(boundedDigest);
  await page.getByTestId('recompile-next-facts').click();
  await expect(page.getByTestId('next-facts')).toHaveAttribute('data-next-facts-status', 'ready');
  await expect(page.locator('[data-need="conflictingEvidence"]')).toHaveCount(0);
  await expect(page.getByTestId('next-facts')).not.toContainText(CONFLICT_NOTE);
  await expect(page.getByTestId('detail-note')).toHaveValue(CONFLICT_NOTE);
  await expect(page.getByTestId('detail-normalized-space.interior.width')).toHaveAttribute('data-nominal', '600');
  await expect(page.getByTestId('detail-normalized-space.interior.width')).toHaveAttribute(
    'data-verification',
    'unverified',
  );
  cap.observations.push('conflict note preserved; next-facts conflictingEvidence count 0');
  await shootPair(cap, 'conflicting-evidence', (host) => host.getByTestId('detail-note'), {
    webglNote: 'The note is human text. The Worker list did not gain conflictingEvidence or Confirmed.',
    detail: CONFLICT_NOTE,
    detailOpen: true,
    group: 'interior',
    pick: 'space.interior.width',
    rawOverrides: { field: 'space.interior.width', note: CONFLICT_NOTE },
  });

  await desktop(page);
  await openDetail(page);
  await page.getByTestId('detail-group-catalog').click();
  await expect(page.getByTestId('detail-catalog-readonly')).toBeVisible();
  await expect(page.getByTestId('detail-editor')).toHaveCount(0);
  await shootPair(cap, 'catalog-source', (host) => host.getByTestId('detail-catalog'), {
    webglNote: 'Catalogue physics stay on #/catalog. This project does not write them.',
    detail: 'Read-only catalogue notice and the link to the catalogue screen.',
    detailOpen: true,
    group: 'catalog',
    rawOverrides: { destination: '#/catalog' },
  });

  await desktop(page);
  const closer = page.getByTestId('detail-close');
  if ((await closer.count()) > 0) await closer.click();
  await page.getByRole('textbox', { name: '공간 안쪽 폭', exact: true }).fill('601');
  await expect(page.getByTestId('next-facts-stale')).toBeVisible();
  await expect(page.getByTestId('next-facts')).toHaveAttribute('data-next-facts-rows', '0');
  await shootPair(cap, 'stale', (host) => host.getByTestId('next-facts-stale'), {
    webglNote: 'Draft edit drops the previous list. No current checks are borrowed.',
    detail: 'Width text 601 is not committed. Rows are 0.',
    rawOverrides: { field: 'space.interior.width', text: '601' },
  });

  const pageB = await page.context().newPage();
  const bucketB: Bucket = { errors: [], cursor: 0 };
  watch(pageB, bucketB);
  await pageB.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
  await pageB.goto(page.url());
  await expect(pageB.getByTestId('worker-state')).toHaveText('ready', { timeout: 30_000 });
  await commitSaved(page);
  await pageB.getByRole('textbox', { name: '공간 안쪽 폭', exact: true }).fill('700');
  await pageB.getByTestId('commit-input').click();
  await expect(pageB.getByTestId('save-state')).toHaveAttribute('data-save-state', 'conflict');
  await expect(pageB.getByTestId('conflict-notice')).toBeVisible();
  await shootPair(cap, 'conflict', (host) => host.getByTestId('conflict-notice'), {
    webglNote: 'Second tab CAS rejection. The other tab is not overwritten.',
    detail: '다른 탭에서 이 프로젝트가 먼저 저장되었습니다.',
    page: pageB,
    bucket: bucketB,
    rawOverrides: { field: 'space.interior.width', text: '700' },
  });

  await desktop(page);
  await openDetail(page);
  await page.getByTestId('detail-group-interior').click();
  await page.getByTestId('detail-pick-space.interior.width').click();
  await page.getByTestId('detail-nominal').focus();
  await expect(page.getByTestId('detail-nominal')).toBeFocused();
  await reveal(page.getByTestId('detail-nominal'));
  await shoot(cap, page, 'a11y-focus-1440', 'a11y-focus', {
    webglNote: 'Keyboard focus on the nominal field. No new color token.',
    detail: 'detail-nominal focused at 1440.',
    rawOverrides: { focus: 'detail-nominal' },
  });

  await page.emulateMedia({ forcedColors: 'active' });
  await shootPair(cap, 'a11y-forced-colors', (host) => host.getByTestId('detail-nominal'), {
    webglNote: 'Forced colors on the detail editor. State is not color-only.',
    detail: 'forcedColors active. Nominal field remains.',
    detailOpen: true,
    group: 'interior',
    pick: 'space.interior.width',
    rawOverrides: { forcedColors: 'active' },
  });
  await page.emulateMedia({ forcedColors: 'none' });

  await desktop(page);
  await page.evaluate(() => {
    document.documentElement.style.zoom = '200%';
  });
  await reveal(page.getByTestId('next-facts'));
  await shoot(cap, page, 'a11y-zoom-200-1440', 'a11y-zoom-200', {
    webglNote: 'Document zoom 200% inside the 1440 viewport.',
    detail: 'Next-fact list at 200% zoom.',
    rawOverrides: { zoom: '200%' },
  });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '';
  });

  const snapshot = {
    axe,
    motion: { reducedMotion: 'reduce', durationFast: cap.durationFast },
    gpu: { ...cap.gpu, note: GPU_NOTE },
    catalogDigest: cap.catalogDigest,
    fixtureId: FIXTURE_ID,
    conflictNote: CONFLICT_NOTE,
    conflictingEvidenceRows: 0,
    missing: cap.missing,
    observations: cap.observations,
  };
  const a11yPath = join(outDir, 'a11y-snapshot.json');
  const a11yBody = JSON.stringify(snapshot, null, 2) + '\n';
  await writeFile(a11yPath, a11yBody);
  const a11ySha = createHash('sha256').update(a11yBody).digest('hex');
  const fragment = {
    spatialDraft011: {
      task: 'ZARI-SPATIAL-011',
      status: 'draft',
      approved: false,
      approval: 'USER ONLY. This capture set is not approved. SP-007 acceptance is not reused.',
      notPhysicalValidation: true,
      sourceCommit,
      sourceDirty,
      productTree: 'apps/web/src matches sourceCommit',
      fixtureId: FIXTURE_ID,
      catalogDigest: cap.catalogDigest,
      scenarioFiles: cap.scenarioFiles,
      gpu: { ...cap.gpu, note: GPU_NOTE },
      reducedMotion: 'reduce',
      durationFast: cap.durationFast,
      proposedApprovalSet: cap.entries.map((entry) => entry.id),
      missingOrUnverified: cap.missing,
      observations: cap.observations,
      nodeState: 'IN_PROGRESS',
      qualificationState: 'PARTIAL',
      acceptanceState: 'PENDING',
      releaseState: 'NOT_AUTHORIZED',
      a11ySnapshot: { file: 'draft/zari011/a11y-snapshot.json', sha256: a11ySha },
    },
    baselines: cap.entries,
  };
  await writeFile(join(outDir, 'manifest-fragment.json'), JSON.stringify(fragment, null, 2) + '\n');
  await writeFile(join(outDir, 'capture-metadata.json'), JSON.stringify(cap.entries, null, 2) + '\n');
  await pageB.close();
}
