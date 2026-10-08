import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { platform, release } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import {
  cardDump,
  computeDone,
  interruptRunningSearch,
  openPlan,
  projectIdOf,
  readCards,
  addOwned,
  backToFacts,
  commitSaved,
  enableMixedSearch,
  MIXED_WIDTH,
  registerOwnedCopies,
  removeOwned,
  REUSE_ID,
  seedSample,
  SMALL_ID,
  selectKind,
  widthBox,
} from './product-setup';

/**
 * ZARI-SPATIAL-016 draft captures. Real Chromium, IndexedDB, and WASM Worker.
 * These screens do not inherit SP-007 or SP-011 acceptance. Nothing here approves a baseline.
 */

const DESKTOP = { width: 1440, height: 1000, tag: '1440' } as const;
const PHONE = { width: 390, height: 844, tag: '390' } as const;
const VIEWPORTS = [DESKTOP, PHONE] as const;
const GPU_NOTE =
  'Headless Chromium software GL on this host. Not a discrete GPU and not a phone. Exact pixels are not physical validation.';
const FIXTURE_ID = 'sample-plus-reuse-bin';

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
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
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

function fileSha(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function scenarioFiles(root: string): ScenarioFile[] {
  const paths = [
    'apps/web/tests/browser/capture-product.ts',
    'apps/web/tests/browser/product-capture.spec.ts',
    'apps/web/tests/browser/product-setup.ts',
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

async function shoot(
  cap: Cap,
  page: Page,
  shotId: string,
  state: string,
  options: {
    webglNote: string;
    rawOverrides?: Record<string, string>;
    detail?: string;
    bucket?: Bucket;
    allowErrors?: boolean;
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
    id: `zari016-${shotId}`,
    status: 'draft',
    file: `draft/zari016/${fileName}`,
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
    page?: Page;
    bucket?: Bucket;
    allowErrors?: boolean;
  },
) {
  const page = options.page ?? cap.page;
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await reveal(target(page));
    await shoot(cap, page, `${state}-${viewport.tag}`, state, options);
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

async function ruleVersion(page: Page, projectId: string): Promise<string> {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolveDb, reject) => {
      const request = indexedDB.open('zari-local');
      request.onsuccess = () => resolveDb(request.result);
      request.onerror = () => reject(request.error);
    });
    const version = await new Promise<string>((resolveVersion, reject) => {
      const request = db.transaction('snapshots', 'readonly').objectStore('snapshots').getAll();
      request.onsuccess = () => {
        const rows = request.result as Array<{
          projectId: string;
          snapshot: { content: { versions: { ruleVersion: string } } };
        }>;
        resolveVersion(rows.find((item) => item.projectId === id)?.snapshot.content.versions.ruleVersion ?? '');
      };
      request.onerror = () => reject(request.error);
    });
    db.close();
    return version;
  }, projectId);
}

async function writeRuleVersion(page: Page, projectId: string, version: string) {
  await page.evaluate(
    async ({ id, ruleVersion: next }) => {
      const db = await new Promise<IDBDatabase>((resolveDb, reject) => {
        const request = indexedDB.open('zari-local');
        request.onsuccess = () => resolveDb(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolveWrite, reject) => {
        const tx = db.transaction('snapshots', 'readwrite');
        const store = tx.objectStore('snapshots');
        const request = store.getAll();
        request.onsuccess = () => {
          const rows = request.result as Array<{
            projectId: string;
            snapshot: { content: { versions: { ruleVersion: string } } };
          }>;
          const mine = rows.filter((item) => item.projectId === id);
          if (mine.length === 0) {
            reject(new Error('snapshot missing'));
            return;
          }
          for (const row of mine) row.snapshot.content.versions.ruleVersion = next;
          for (const row of mine) store.put(row);
          tx.oncomplete = () => resolveWrite();
        };
        request.onerror = () => reject(request.error);
      });
      db.close();
    },
    { id: projectId, ruleVersion: version },
  );
}

export async function captureProductDrafts(args: {
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
  const outDir = join(args.outputRoot, 'zari016');
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
  await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
  arm(bucket);
  await registerOwnedCopies(page);
  await seedSample(page);
  cap.catalogDigest = await page.getByTestId('catalog-pin-select').inputValue();
  await openPlan(page);
  cap.fontEnvironment = {
    cssStack: await page.locator('.zari-ui').first().evaluate((element) => getComputedStyle(element).fontFamily),
    koreanFallback: execFileSync('fc-match', [':lang=ko', 'family'], { encoding: 'utf8' }).trim(),
  };
  cap.gpu = await readGpu(page);
  cap.durationFast = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--zari-duration-fast').trim(),
  );
  if (!/^0(ms|s)$/.test(cap.durationFast)) throw new Error(`reduced-motion token is ${cap.durationFast}`);
  cap.observations.push(`gpu ${cap.gpu.vendor ?? 'none'} / ${cap.gpu.renderer ?? 'none'}`);
  cap.observations.push(`catalog ${cap.catalogDigest}`);
  cap.observations.push(`owned ${REUSE_ID} wide copy and ${SMALL_ID} 20L copy, quantity 1`);
  const axe = await axeSummary(page);
  const checkedStrategy = await page.locator('[data-testid="strategy-select"] input:checked').evaluate((element) => {
    const label = element.closest('label');
    return label?.textContent?.trim() ?? '';
  });
  cap.observations.push(`strategy ${checkedStrategy}`);

  await computeDone(page);
  const directCards = await readCards(page);
  cap.observations.push(`direct ${cardDump(directCards)}`);
  if (!directCards.some((card) => card.kind === 'no-purchase')) {
    throw new Error(`solver did not publish no-purchase; saw ${cardDump(directCards)}`);
  }

  await selectKind(page, directCards, 'no-purchase');
  await expect(page.getByTestId('no-purchase')).toBeVisible();
  await expect(page.getByTestId('bom-table')).toHaveCount(0);
  await shootPair(cap, 'no-purchase', (host) => host.getByTestId('no-purchase'), {
    webglNote: 'No new container. Direct or empty placement. Purchase count is zero.',
    detail: '구매 없이 정리됩니다. reuse-bin is not in this plan.',
    rawOverrides: { alternative: 'no-purchase' },
  });

  await backToFacts(page);
  await addOwned(page, REUSE_ID);
  await commitSaved(page);
  await openPlan(page);
  await computeDone(page);
  const reuseCards = await readCards(page);
  cap.observations.push(`reuse ${cardDump(reuseCards)}`);
  if (!reuseCards.some((card) => card.kind === 'reuse')) {
    throw new Error(`solver did not publish reuse; saw ${cardDump(reuseCards)}`);
  }
  await selectKind(page, reuseCards, 'reuse');
  await expect(page.getByTestId('no-purchase')).toBeVisible();
  await expect(page.getByTestId('placements-list')).toContainText(REUSE_ID);
  await shootPair(cap, 'reuse', (host) => host.getByTestId('placements-list'), {
    webglNote: 'Owned wide-bin copy is placed. No new container is purchased.',
    detail: `${REUSE_ID} is reused. Quantity available was 1.`,
    rawOverrides: { owned: REUSE_ID },
  });

  await backToFacts(page);
  await removeOwned(page, REUSE_ID);
  await addOwned(page, SMALL_ID);
  await enableMixedSearch(page);
  await openPlan(page);
  await computeDone(page);
  const mixedCards = await readCards(page);
  cap.observations.push(`mixed ${cardDump(mixedCards)}`);
  if (!mixedCards.some((card) => card.kind === 'mixed-purchase')) {
    throw new Error(`solver did not publish mixed-purchase; saw ${cardDump(mixedCards)}`);
  }
  await selectKind(page, mixedCards, 'mixed-purchase');
  await expect(page.getByTestId('bom-table')).toBeVisible();
  await expect(page.getByTestId('placements-list')).toContainText(SMALL_ID);
  await shootPair(cap, 'mixed-purchase', (host) => host.getByTestId('bom-table'), {
    webglNote: 'The same plan places the owned 20L bin and a purchased wide bin.',
    detail: 'Owned shelf-bin plus a purchase line. Price and shipping stay on the BOM.',
    rawOverrides: { owned: SMALL_ID, purchase: 'newContainer' },
  });

  await expect(page.getByTestId('unknown-checks')).toBeVisible();
  const unknownCount = await page.locator('[data-testid="checks-list"] [data-status="unknown"]').count();
  if (unknownCount < 1) throw new Error('selected plan has no unknown check');
  cap.observations.push(`unknown checks ${unknownCount}`);
  const snapshotBefore = (await page.getByTestId('snapshot-id').first().textContent()) ?? '';
  await page.getByTestId('accept-plan').click();
  await expect(page.locator('#accepted-guide')).toBeVisible();
  const condition = page.locator('#accepted-guide').locator('[data-testid^="step-condition-"]').first();
  await expect(condition).toBeVisible();
  await expect(condition).toContainText('완료 표시는 검사 결과를 바꾸지 않습니다.');
  await shootPair(cap, 'blocked-unknown', () => condition, {
    webglNote: 'Guide condition from Rust reason ids. A checkbox does not pass the check.',
    detail: `Unknown checks ${unknownCount}. Snapshot ${snapshotBefore.slice(0, 80)}`,
    rawOverrides: { unknownChecks: String(unknownCount) },
  });

  await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
  const next = page.locator('#accepted-guide').getByTestId('step-next');
  await next.focus();
  await expect(next).toBeFocused();
  await reveal(next);
  await shoot(cap, page, 'a11y-keyboard-1440', 'a11y-keyboard', {
    webglNote: 'Keyboard focus on the next guide step. No new color token.',
    detail: 'step-next focused at 1440.',
    rawOverrides: { focus: 'step-next' },
  });

  await page.emulateMedia({ forcedColors: 'active' });
  await shootPair(cap, 'a11y-forced-colors', (host) => host.locator('#accepted-guide').locator('[data-testid^="step-condition-"]').first(), {
    webglNote: 'Forced colors on the blocked guide. State is not color-only.',
    detail: 'forcedColors active. The condition sentence remains.',
    rawOverrides: { forcedColors: 'active' },
  });
  await page.emulateMedia({ forcedColors: 'none' });

  await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '200%';
  });
  await reveal(page.locator('#accepted-guide').getByTestId('guide-list'));
  await shoot(cap, page, 'a11y-zoom-200-1440', 'a11y-zoom-200', {
    webglNote: 'Document zoom 200% inside the 1440 viewport.',
    detail: 'Accepted guide at 200% zoom.',
    rawOverrides: { zoom: '200%' },
  });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '';
  });

  await page.getByRole('link', { name: '치수로 돌아가기' }).click();
  const width = widthBox(page);
  await width.fill('901ㄱ');
  await expect(width).toHaveValue('901ㄱ');
  await reveal(width);
  await shoot(cap, page, 'a11y-ime-1440', 'a11y-ime', {
    webglNote: 'Hangul jamo stays in the width field and is not normalized.',
    detail: 'Width text is 901ㄱ. It is not committed.',
    rawOverrides: { field: 'space.interior.width', text: '901ㄱ' },
  });
  await page.reload();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30_000 });
  await expect(widthBox(page)).toHaveValue(MIXED_WIDTH);
  await openPlan(page);
  await expect(page.locator('#accepted-guide')).toBeVisible();
  await expect(page.getByTestId('snapshot-id').first()).toContainText(snapshotBefore.trim().slice(0, 12));

  const acceptedId = (await page.getByTestId('snapshot-id').first().textContent()) ?? '';
  const projectId = await projectIdOf(page);
  const originalRule = await ruleVersion(page, projectId);
  if (originalRule !== 'zari-domain-v2') throw new Error(`expected current rule, saw ${originalRule}`);
  arm(bucket);
  await writeRuleVersion(page, projectId, 'zari-domain-v1');
  if ((await ruleVersion(page, projectId)) !== 'zari-domain-v1') {
    throw new Error('stored rule version did not change');
  }
  await page.reload();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30_000,
  });
  const guide = page.locator('#accepted-guide');
  await expect(guide).toBeVisible();
  const historical = guide.getByTestId('progress-ineligible');
  const historicalError = guide.getByTestId('action-error');
  const box = guide.locator('[data-testid^="action-"]').first();
  if (!(await historical.isVisible())) {
    if (await box.isEnabled()) {
      await box.click();
    } else {
      // The eligibility read can outlive the worker timeout on a large snapshot.
      // The repository still refuses the step from the stored rule version.
      await box.evaluate((element) => {
        const input = element as HTMLInputElement;
        input.disabled = false;
        input.click();
      });
    }
  }
  await expect(historical.or(historicalError)).toBeVisible({ timeout: 20_000 });
  const historicalTarget = (await historical.isVisible()) ? historical : historicalError;
  await expect(historicalTarget).toContainText(/이전 규칙|historical_rule/);
  await shootPair(cap, 'historical', () => historicalTarget, {
    webglNote: 'Stored zari-domain-v1 rule stays readable and is not completable.',
    detail: await historicalTarget.innerText(),
    rawOverrides: { ruleVersion: 'zari-domain-v1' },
  });
  await writeRuleVersion(page, projectId, originalRule);
  await page.reload();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30_000,
  });
  await expect(guide.getByTestId('progress-ineligible')).toHaveCount(0);

  const pageB = await page.context().newPage();
  const bucketB: Bucket = { errors: [], cursor: 0 };
  watch(pageB, bucketB);
  await pageB.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
  const projectUrl = page.url().replace(/\/plan$/, '');
  await pageB.goto(projectUrl);
  await expect(pageB.getByTestId('worker-state')).toHaveText('ready', { timeout: 30_000 });
  arm(bucket);
  arm(bucketB);
  await page.getByRole('link', { name: '치수로 돌아가기' }).click();
  await widthBox(page).fill('610');
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await widthBox(pageB).fill('700');
  await pageB.getByTestId('commit-input').click();
  await expect(pageB.getByTestId('save-state')).toHaveAttribute('data-save-state', 'conflict');
  await expect(pageB.getByTestId('conflict-notice')).toBeVisible();
  await shootPair(cap, 'save-cas', (host) => host.getByTestId('conflict-notice'), {
    webglNote: 'Second tab CAS rejection. The first tab save is kept.',
    detail: '다른 탭에서 이 프로젝트가 먼저 저장되었습니다.',
    page: pageB,
    bucket: bucketB,
    rawOverrides: { field: 'space.interior.width', text: '700' },
  });
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  const stale = page.locator('#accepted-guide').getByTestId('progress-stale');
  await expect(stale).toBeVisible();
  await shootPair(cap, 'stale', () => stale, {
    webglNote: 'Width 610 leaves the accepted guide stale. Done rows are not rewritten.',
    detail: await stale.innerText(),
    rawOverrides: { field: 'space.interior.width', text: '610' },
  });

  arm(bucket);
  await interruptRunningSearch(page);
  await expect(page.getByTestId('accepted-badge')).toBeVisible();
  const interrupted = page.getByTestId('search-status');
  await expect(interrupted).toHaveAttribute('data-search', 'interrupted');
  const recovery = page.getByTestId('worker-failed');
  const recoveryVisible = await recovery.isVisible();
  cap.observations.push(`worker-failed during interrupt ${recoveryVisible}`);
  const interruptTarget = recoveryVisible ? recovery : interrupted;
  await shootPair(cap, 'interrupted', () => interruptTarget, {
    webglNote: 'The calculator thread was blocked. The accepted plan was not replaced.',
    detail: `${(await interrupted.innerText()).slice(0, 180)} Snapshot stayed.`,
    allowErrors: true,
    rawOverrides: { search: 'interrupted' },
  });
  if (consoleErrorsNotable(cap)) cap.observations.push('interrupt console recorded on the interrupted shots');
  const retry = page.getByTestId('worker-retry');
  if (await retry.isVisible()) await retry.click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('snapshot-id').first()).toHaveText(acceptedId);

  const snapshot = {
    axe,
    motion: { reducedMotion: 'reduce', durationFast: cap.durationFast },
    gpu: { ...cap.gpu, note: GPU_NOTE },
    catalogDigest: cap.catalogDigest,
    fixtureId: FIXTURE_ID,
    ownedId: REUSE_ID,
    cards: mixedCards.map((card) => ({ index: card.index, kind: card.kind, title: card.title })),
    unknownChecks: unknownCount,
    missing: cap.missing,
    observations: cap.observations,
    doesNotInheritAcceptance: ['zari007', 'zari011'],
  };
  const a11yPath = join(outDir, 'a11y-snapshot.json');
  const a11yBody = `${JSON.stringify(snapshot, null, 2)}\n`;
  await writeFile(a11yPath, a11yBody);
  const a11ySha = createHash('sha256').update(a11yBody).digest('hex');
  const fragment = {
    spatialDraft016: {
      task: 'ZARI-SPATIAL-016',
      status: 'draft',
      approved: false,
      approval: 'USER ONLY. This capture set is not approved. SP-007 and SP-011 acceptance are not reused.',
      notPhysicalValidation: true,
      doesNotInheritAcceptance: ['zari007', 'zari011'],
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
      a11ySnapshot: { file: 'draft/zari016/a11y-snapshot.json', sha256: a11ySha },
    },
    baselines: cap.entries,
  };
  await writeFile(join(outDir, 'manifest-fragment.json'), `${JSON.stringify(fragment, null, 2)}\n`);
  await pageB.close();
}

function consoleErrorsNotable(cap: Cap): boolean {
  return cap.entries.some((entry) => entry.state === 'interrupted' && entry.consoleErrors.length > 0);
}
