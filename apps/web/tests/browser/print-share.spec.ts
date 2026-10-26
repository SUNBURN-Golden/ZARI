import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { expect, test, type Page } from '@playwright/test';
import type { PrintPackage } from '../../src/features/print/package';
import { SHARE_SCOPE } from '../../src/features/print/scope';
import { collectErrors, watchNetwork } from './product-setup';

/**
 * z-print-share in a real browser: the printable package and its CSV come
 * from one plan id, the person picks what personal text is included, and a
 * drawing that does not belong to the plan blocks the output. Chromium runs
 * the full file; the real print path (PDF) is Chromium only because Playwright
 * prints PDFs only there.
 */

const PROJECT_NAME = '새 정리 프로젝트';

async function planWithCards(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30000 });
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 60000,
  });
}

async function openFirstPlan(page: Page) {
  await page.locator('[data-testid^="plan-card-"]').first().click();
  await expect(page.getByTestId('print-panel').first()).toBeVisible();
}

function panel(page: Page) {
  return page.getByTestId('print-panel').first();
}

async function readCsv(page: Page, testId: string): Promise<{ name: string; text: string }> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    panel(page).getByTestId(testId).click(),
  ]);
  const path = await download.path();
  const raw = readFileSync(path, 'utf8');
  expect(raw.charCodeAt(0)).toBe(0xfeff);
  return { name: download.suggestedFilename(), text: raw.slice(1) };
}

function cells(line: string): string[] {
  return [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1]!.replace(/""/g, '"'));
}

test('one plan id on every part, a chosen personal scope, and a CSV with the same id', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  const leaked: string[] = [];
  collectErrors(page, errors);
  watchNetwork(page, leaked);
  await planWithCards(page);
  await openFirstPlan(page);
  const box = panel(page);
  await expect(box).toHaveAttribute('data-state', 'ready');

  // Safest scope first; the choice is visible, keyboard reachable, and honest.
  for (const key of ['projectName', 'itemNames', 'purchaseLinks', 'progress']) {
    await expect(box.getByTestId(`print-scope-${key}`)).not.toBeChecked();
  }
  await expect(box).toHaveAttribute('data-preset', 'share');
  await expect(box.getByTestId('print-always-excluded')).toContainText('사진·첨부 파일');
  await expect(box.getByTestId('print-ready')).toContainText('도면 2장');

  // Preview with the shared scope: no personal text.
  await box.getByTestId('print-open').click();
  const dialog = page.getByTestId('print-preview');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByTestId('print-close')).toBeFocused();
  const pkg = dialog.getByTestId('print-package');
  const revision = (await pkg.getAttribute('data-revision'))!;
  expect(revision).toMatch(/^[0-9a-f]{64}$/);
  // Every part of the package is stamped with the plan the screen shows.
  const shown = (await page.getByTestId('snapshot-id').first().innerText()).match(/스냅샷 ([0-9a-f]{16})/)![1]!;
  expect(revision.startsWith(shown)).toBe(true);
  await expect(dialog.getByTestId('print-head')).toContainText(revision);
  await expect(dialog.getByTestId('print-head')).toContainText('단위 mm');
  await expect(dialog.getByTestId('print-foot')).toContainText('포함 범위: 프로젝트 이름 제외');
  const sections = await pkg.locator('[data-section][data-revision]').evaluateAll((nodes) =>
    nodes.map((n) => (n as HTMLElement).dataset['revision']),
  );
  expect(sections.length).toBeGreaterThanOrEqual(6);
  expect(new Set(sections)).toEqual(new Set([revision]));
  await expect(pkg.locator('svg.print-svg')).toHaveCount(2);
  const text = await pkg.innerText();
  expect(text).not.toContain(PROJECT_NAME);
  expect(text).toContain('이름 숨김');
  await expect(pkg.locator('a')).toHaveCount(0);
  // The unassigned list and the unknown-check line are always present.
  await expect(pkg.getByTestId('print-unassigned')).toBeVisible();
  await expect(pkg.getByTestId('print-unknown-checks')).toBeVisible();

  // The print button asks the browser to print once, with the app stepped aside.
  await page.evaluate(() => {
    const w = window as unknown as { __printCalls: string[] };
    w.__printCalls = [];
    window.print = () => {
      w.__printCalls.push(document.body.getAttribute('data-print-open') ?? 'closed');
    };
  });
  await dialog.getByTestId('print-now').click();
  expect(
    await page.evaluate(() => (window as unknown as { __printCalls: string[] }).__printCalls),
  ).toEqual(['true']);

  // The page behind the dialog is inert; Escape closes and returns focus.
  await expect(page.locator('#root')).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#root')).not.toHaveAttribute('inert', '');
  await expect(box.getByTestId('print-open')).toBeFocused();

  // Choosing more by keyboard changes the output and the stated scope.
  const name = box.getByTestId('print-scope-projectName');
  await name.focus();
  await page.keyboard.press('Space');
  await expect(name).toBeChecked();
  await expect(box).toHaveAttribute('data-preset', 'custom');
  await box.getByTestId('print-open').focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByTestId('print-package')).toContainText(PROJECT_NAME);
  await expect(dialog.getByTestId('print-foot')).toContainText('프로젝트 이름 포함 · 물건 이름 제외');
  await page.keyboard.press('Escape');

  // CSV: same plan id on every line, links off by default.
  const planCsv = await readCsv(page, 'print-csv-plan');
  expect(planCsv.name).toBe(`zari-plan-${revision.slice(0, 12)}.csv`);
  const lines = planCsv.text.split('\r\n').filter((line) => line.length > 0);
  for (const line of lines) {
    const first = cells(line)[0]!;
    expect(first === '계획 ID' || first === revision, line).toBe(true);
  }
  expect(planCsv.text).toContain('"프로젝트","' + PROJECT_NAME + '"');
  expect(planCsv.text).not.toMatch(/https?:\/\//);
  await expect(box.getByTestId('print-downloaded')).toContainText('포함 범위: 프로젝트 이름 포함');

  // Everything on: the same plan, now with the purchase link as plain text.
  await box.getByTestId('print-preset-full').click();
  await expect(box).toHaveAttribute('data-preset', 'full');
  const bomCsv = await readCsv(page, 'print-csv-bom');
  expect(bomCsv.name).toBe(`zari-bom-${revision.slice(0, 12)}.csv`);
  expect(bomCsv.text).not.toContain('"미배치"');
  if (/https?:\/\//.test(bomCsv.text)) {
    for (const line of bomCsv.text.split('\r\n')) {
      for (const cell of cells(line)) expect(cell.charAt(0)).not.toMatch(/[=+@]/);
    }
  }
  await box.getByTestId('print-preset-share').click();
  await expect(box).toHaveAttribute('data-preset', 'share');
  await expect(box.getByTestId('print-digest')).toBeVisible();

  expect(errors).toEqual([]);
  expect(leaked).toEqual([]);
});

test('a drawing from another plan blocks every output and nothing is downloaded', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30000 });
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  // Test build only: the session stamps the projection with another plan id.
  await page.evaluate(() => {
    (window as unknown as { __zariCorruptProjection?: boolean }).__zariCorruptProjection = true;
  });
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 60000,
  });
  await openFirstPlan(page);
  const box = panel(page);
  await expect(box).toHaveAttribute('data-state', 'blocked');
  const blocked = box.getByTestId('print-blocked');
  await expect(blocked).toHaveAttribute('role', 'alert');
  await expect(blocked).toContainText('계획 ID가 달라 출력하지 않습니다');
  await expect(blocked.locator('li[data-code="revision_mismatch"]')).toHaveCount(1);
  for (const id of ['print-open', 'print-csv-bom', 'print-csv-plan']) {
    await expect(box.getByTestId(id)).toBeDisabled();
  }
  await expect(box.getByTestId('print-ready')).toHaveCount(0);
  await expect(page.getByTestId('print-preview')).toHaveCount(0);
  // The plan itself still reads normally: only the output is withheld.
  await expect(page.getByTestId('bom-table').or(page.getByTestId('no-purchase')).first()).toBeVisible();
  expect(errors.filter((e) => !e.includes('projection_source_mismatch'))).toEqual([]);
});

test('accepted plan: progress is printed only when chosen, and survives the preview', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await planWithCards(page);
  await openFirstPlan(page);
  await page.getByTestId('accept-plan').click();
  await expect(page.locator('#accepted-guide')).toBeVisible();
  const box = panel(page);
  await expect(box).toHaveAttribute('data-state', 'ready');
  await box.getByTestId('print-scope-progress').check();
  await box.getByTestId('print-open').click();
  const steps = page.getByTestId('print-preview').getByTestId('print-steps');
  await expect(steps).toBeVisible();
  const column = await steps.locator('tbody tr td:last-child').allInnerTexts();
  expect(column.length).toBeGreaterThan(0);
  expect(column.every((cell) => cell === '미완료' || cell === '완료')).toBe(true);
  await page.keyboard.press('Escape');
  await box.getByTestId('print-scope-progress').uncheck();
  await box.getByTestId('print-open').click();
  const hidden = await page
    .getByTestId('print-preview')
    .getByTestId('print-steps')
    .locator('tbody tr td:last-child')
    .allInnerTexts();
  expect(hidden.every((cell) => cell === '범위에서 제외')).toBe(true);
  expect(errors).toEqual([]);
});

test('responsive and forced-colors: the panel and preview keep their text', async ({ browser }) => {
  test.setTimeout(150_000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    forcedColors: 'active',
    locale: 'ko-KR',
  });
  const page = await context.newPage();
  const errors: string[] = [];
  collectErrors(page, errors);
  await planWithCards(page);
  await openFirstPlan(page);
  const box = panel(page);
  await box.scrollIntoViewIfNeeded();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await box.getByTestId('print-open').click();
  const dialog = page.getByTestId('print-preview');
  await expect(dialog.getByTestId('print-head')).toBeVisible();
  const pageWidth = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(pageWidth).toBeLessThanOrEqual(0);
  await expect(dialog.getByTestId('print-unassigned')).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

// ---------------------------------------------------------------------------
// Real print path (Chromium PDF). The page is the real preview, printed with
// print media. Page text is read back with pdftotext when the machine has it.
// ---------------------------------------------------------------------------

function pdfPages(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

function pdfText(pdf: Buffer, pages: number, layout = true): string[] | null {
  const dir = mkdtempSync(join(tmpdir(), 'zari-print-'));
  const file = join(dir, 'out.pdf');
  writeFileSync(file, pdf);
  try {
    const out: string[] = [];
    for (let n = 1; n <= pages; n += 1) {
      out.push(
        execFileSync('pdftotext', ['-f', String(n), '-l', String(n), ...(layout ? ['-layout'] : []), file, '-'], {
          encoding: 'utf8',
        }),
      );
    }
    return out;
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}


/**
 * Print-media layout facts every engine can report without printing a PDF:
 * the app steps aside, the toolbar goes, the header and footer bands are the
 * repeating table groups, and each drawing starts a new sheet.
 */
async function assertPrintLayout(page: Page, drawings: number) {
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#root')).toBeHidden();
  await expect(page.locator('.print-toolbar')).toBeHidden();
  const facts = await page.evaluate(() => {
    const style = (selector: string) => {
      const node = document.querySelector(selector);
      return node ? getComputedStyle(node) : null;
    };
    const breaks = [...document.querySelectorAll('.print-drawing')].map((node) => {
      const css = getComputedStyle(node);
      return css.breakBefore || css.getPropertyValue('page-break-before');
    });
    return {
      head: style('.print-frame > thead')?.display,
      foot: style('.print-frame > tfoot')?.display,
      breaks,
    };
  });
  expect(facts.head).toBe('table-header-group');
  expect(facts.foot).toBe('table-footer-group');
  expect(facts.breaks).toHaveLength(drawings);
  for (const value of facts.breaks) expect(['page', 'always']).toContain(value);
  await page.emulateMedia({ media: 'screen' });
}

test('the real preview prints to pages that each carry the plan id', async ({
  page,
  browserName,
}) => {
  test.setTimeout(150_000);
  await planWithCards(page);
  await openFirstPlan(page);
  await panel(page).getByTestId('print-open').click();
  const revision = (await page.getByTestId('print-package').getAttribute('data-revision'))!;
  if (browserName !== 'chromium') {
    // Playwright prints PDFs in Chromium only; the other engines report the
    // print-media layout of the same preview and its per-sheet stamps.
    await expect(page.getByTestId('print-head')).toContainText(revision);
    await assertPrintLayout(page, 2);
    return;
  }
  await page.emulateMedia({ media: 'print' });
  // In print media the app steps aside and only the sheet remains.
  await expect(page.locator('#root')).toBeHidden();
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const pages = pdfPages(pdf);
  // Cover + 2 drawings (each starts a sheet) + the lists.
  expect(pages).toBeGreaterThanOrEqual(3);
  const text = pdfText(pdf, pages);
  test.info().annotations.push({
    type: 'pdftotext',
    description: text ? 'page text checked' : 'pdftotext not available: page count only',
  });
  if (text) {
    for (const [index, body] of text.entries()) {
      const flat = body.replace(/\s+/g, '');
      expect(flat, `page ${index + 1} plan id`).toContain(revision);
      expect(body, `page ${index + 1} unit`).toContain('단위 mm');
      expect(body, `page ${index + 1} scope`).toContain('포함 범위');
    }
    expect(text.join('\n')).toContain('위에서 본 도면');
    expect(text.join('\n')).toContain('앞에서 본 도면');
  }
  await page.emulateMedia({ media: 'screen' });
});

// Long BOM, many drawings, Korean text, forced page breaks: the same markup
// the app renders, filled with more than one sheet of rows, in real print.

function longPackage(): PrintPackage {
  const revision = 'a1b2c3d4'.repeat(8);
  const rect = (n: number) => ({
    n,
    label: `긴 이름의 수납함과 물건 ${n}번 — 한글 줄바꿈 확인용 문장`,
    kindText: n % 3 === 0 ? '수납함 안 물건' : '수납함',
    x: (n % 8) * 60,
    y: Math.floor(n / 8) * 50,
    width: 55,
    height: 45,
    kind: (n % 3 === 0 ? 'contained' : 'container') as 'contained' | 'container',
  });
  const drawing = (view: 'top' | 'front') => ({
    view,
    title: view === 'top' ? '위에서 본 도면' : '앞에서 본 도면',
    axesText: view === 'top' ? '가로 x(폭), 세로 y(안쪽 깊이) · 단위 mm' : '가로 x(폭), 세로 z(높이) · 단위 mm',
    revision,
    frame: { width: 480, height: 400 },
    rects: Array.from({ length: 40 }, (_, i) => rect(i + 1)),
    missing: [{ label: '이름을 숨긴 물건 3', text: '수납함 안의 위치를 몰라 그리지 못했습니다' }],
    elementCount: 41,
  });
  return {
    version: 1,
    revision,
    inputDigest: 'b'.repeat(64),
    catalogDigest: 'c'.repeat(64),
    catalogVersion: 'catalog-2025-01',
    ruleVersion: 'zari-domain-v2',
    unit: 'mm',
    scope: SHARE_SCOPE,
    scopeText: '프로젝트 이름 제외 · 물건 이름 제외 · 구매 링크 제외 · 진행 기록 제외',
    projectName: '이름 숨김',
    stageText: '채택 전 후보',
    currentText: '현재 입력으로 계산된 계획',
    strategyText: '최소 구매',
    catalogSource: '합성 데이터 — 실제 상품이 아닙니다',
    assuranceText: '조건부 — 미확인 항목이 남아 있음',
    commerceText: '구매 조건 중 미확인이 있음',
    completenessText: '배정 120 · 임시 0 · 미배치 12 · 수량 미확인 물건 2',
    space: [
      { axis: '폭', text: '2400 mm (오차 미확인)' },
      { axis: '깊이', text: '미확인' },
      { axis: '높이', text: '2100 mm (+2 / −2 mm)' },
    ],
    drawings: [drawing('top'), drawing('front')],
    diagnostics: [],
    placements: Array.from({ length: 40 }, (_, i) => ({
      label: `수납함 ${i + 1}`,
      x: i * 10,
      y: 0,
      z: 0,
      orientation: '정면 0°',
    })),
    assignments: Array.from({ length: 120 }, (_, i) => ({
      label: `물건 ${i + 1}`,
      location: `수납함 ${(i % 40) + 1} 안 · 수납함 안 위치 (${i}, 5, 10) mm`,
    })),
    unassigned: Array.from({ length: 12 }, (_, i) => ({
      label: `물건 ${121 + i}`,
      quantity: i % 4 === 0 ? '수량 미확인' : `${i + 1}개`,
      reason: '둘 수 있는 위치가 없습니다',
    })),
    checks: Array.from({ length: 60 }, (_, i) => ({
      kind: '외형 치수',
      blocking: i % 2 === 0,
      status: i % 5 === 0 ? 'unknown' : 'pass',
      statusText: i % 5 === 0 ? '미확인' : '확인됨',
      reason: i % 5 === 0 ? 'fact_unknown' : '',
    })),
    bomRevision: revision,
    noPurchase: false,
    bom: Array.from({ length: 90 }, (_, i) => ({
      label: `수납함 옵션 BOM-행-${String(i + 1).padStart(3, '0')} 한글 이름이 길어서 줄이 바뀌는 상품`,
      needed: String(i + 1),
      reused: '0',
      packs: i % 7 === 0 ? '미확인' : '1',
      subtotal: i % 7 === 0 ? '미확인' : `₩${(12000 + i).toLocaleString('ko-KR')}`,
      inventory: i % 9 === 0 ? '미확인' : '재고 있음',
      shipping: '무료 배송',
      observed: '확인 시각 없음',
      link: i % 2 === 0 ? 'https://shop.example/path/to/a/rather/long/product/page/' + 'x'.repeat(60) : '범위에서 제외',
    })),
    cost: [
      { label: '상품 소계', value: '₩1,200,000' },
      { label: '배송비 합계', value: '₩0' },
      { label: '합계', value: '₩1,200,000' },
    ],
    purchaseNotes: ['ZARI는 아무것도 구매하지 않았습니다. 이 목록은 구매 약속이 아닙니다.'],
    guideRevision: revision,
    steps: Array.from({ length: 30 }, (_, i) => ({
      n: i + 1,
      title: '수납함을 배치합니다',
      subjects: [`수납함 ${i + 1}`],
      prerequisites: i > 0 ? [`${i}단계`] : [],
      conditions: i % 4 === 0 ? ['내부 수용: 미확인'] : [],
      confirmation: false,
      progress: '범위에서 제외',
    })),
    notes: ['모든 길이는 mm입니다.'],
  };
}

/**
 * Playwright rewrites JSX in spec imports for component tests, so the real
 * view is bundled with the normal React JSX runtime and rendered in Node.
 */
async function renderPackage(pkg: PrintPackage): Promise<string> {
  mkdirSync(join(process.cwd(), 'test-results'), { recursive: true });
  const dir = mkdtempSync(join(process.cwd(), 'test-results', 'print-render-'));
  const entry = join(dir, 'render.tsx');
  const view = new URL('../../src/features/print/PrintPackageView.tsx', import.meta.url).pathname;
  writeFileSync(
    entry,
    `import { renderToStaticMarkup } from 'react-dom/server';\n` +
      `import { PrintPackageView } from ${JSON.stringify(view)};\n` +
      `export const render = (pkg) => renderToStaticMarkup(<PrintPackageView pkg={pkg} />);\n`,
  );
  const out = join(dir, 'render.mjs');
  await build({
    entryPoints: [entry],
    outfile: out,
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    logLevel: 'silent',
  });
  const mod = (await import(pathToFileURL(out).href)) as { render: (pkg: PrintPackage) => string };
  return mod.render(pkg);
}

function cssFiles(): string {
  const read = (name: string) => readFileSync(new URL(`../../src/styles/${name}`, import.meta.url), 'utf8');
  return ['tokens.css', 'fonts.css', 'app.css', 'project.css', 'print.css'].map(read).join('\n');
}

test('a long Korean package spans pages without losing rows, ids, or units', async ({
  page,
  browserName,
}) => {
  test.setTimeout(120_000);
  const pkg = longPackage();
  const markup = await renderPackage(pkg);
  // Keep the fixture on the app origin so its self-hosted font URLs resolve.
  await page.goto('/');
  await page.setContent(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${cssFiles()}</style></head>` +
      `<body data-print-open="true"><div id="root"><p>app</p></div>` +
      `<div class="print-overlay"><div class="print-toolbar"><button>인쇄</button></div>` +
      `<div class="print-sheet">${markup}</div></div></body></html>`,
  );
  if (browserName !== 'chromium') {
    // No PDF here: every row and both drawings are in the document, the head
    // carries the plan id, and the print-media layout is the paged one.
    await expect(page.locator('.print-bom tbody tr')).toHaveCount(90);
    await expect(page.locator('.print-drawing')).toHaveCount(2);
    await expect(page.locator('.print-head')).toContainText(pkg.revision);
    await assertPrintLayout(page, 2);
    return;
  }
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  await test.info().attach('long-package.pdf', { body: pdf, contentType: 'application/pdf' });
  const pages = pdfPages(pdf);
  expect(pages).toBeGreaterThanOrEqual(8);
  const text = pdfText(pdf, pages);
  test.info().annotations.push({
    type: 'pdftotext',
    description: text ? `${pages} pages, page text checked` : `${pages} pages, pdftotext not available`,
  });
  if (!text) return;
  for (const [index, body] of text.entries()) {
    expect(body.replace(/\s+/g, ''), `page ${index + 1} plan id`).toContain(pkg.revision);
    expect(body, `page ${index + 1} unit`).toContain('단위 mm');
    expect(body, `page ${index + 1} scope`).toContain('포함 범위: 프로젝트 이름 제외');
  }
  const all = text.join('\n');
  // No row is lost across the page breaks, first or last.
  const flat = all.replace(/\s+/g, '');
  for (let n = 1; n <= 90; n += 1) {
    expect(flat, `BOM row ${n}`).toContain(`BOM-행-${String(n).padStart(3, '0')}`);
  }
  expect(flat).toContain('물건131');
  expect(flat).toContain('수납함40');
  // Korean text came out as Korean, not as missing-glyph boxes.
  const reading = (pdfText(pdf, pages, false) ?? []).join('\n').replace(/\s+/g, '');
  expect(reading).toContain('한글이름이길어서줄이바뀌는상품');
  // A price is never split in the middle of its digits.
  expect(flat).toContain('₩12,001');
  // Each drawing starts a sheet of its own; the BOM header repeats on later sheets.
  const topPage = text.findIndex((body) => body.includes('위에서 본 도면'));
  const frontPage = text.findIndex((body) => body.includes('앞에서 본 도면'));
  expect(frontPage).toBeGreaterThan(topPage);
  expect(text.filter((body) => body.includes('품목')).length).toBeGreaterThanOrEqual(4);
  expect(all).toContain('미확인 검사 12건');
});
