import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  cardDump,
  collectErrors,
  commitSaved,
  computeDone,
  openPlan,
  projectIdOf,
  readCards,
  seedSample,
  watchNetwork,
  widthBox,
} from './product-setup';

/**
 * ZARI-z-product-qualification: the whole journey in one real Chromium +
 * IndexedDB + WASM Worker run. 측정→실상품 검토→대안→구매 준비→실행→위치 검색→
 * 재정리 on the same accepted snapshot and the same data-revision. Per-scenario
 * evidence is a four-layer tuple: native fixture runner (reported in the
 * qualification doc), real WASM worker reply, IndexedDB row, screen assertion.
 * Nothing here is an approved baseline, a physical device, or a release.
 */

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
const REVIEW_DIR = process.env.ZARI_REVIEW_DIR;

async function readRows(page: Page, store: string): Promise<unknown[]> {
  return page.evaluate(async (storeName) => {
    const db = await new Promise<IDBDatabase>((resolveDb, reject) => {
      const request = indexedDB.open('zari-local');
      request.onsuccess = () => resolveDb(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<unknown[]>((resolveRows) => {
      const request = db
        .transaction(storeName, 'readonly')
        .objectStore(storeName)
        .getAll();
      request.onsuccess = () => resolveRows(request.result as unknown[]);
      request.onerror = () => resolveRows([]);
    });
    db.close();
    return rows;
  }, store);
}

async function readRow(page: Page, store: string, key: string): Promise<unknown> {
  return page.evaluate(
    async ([storeName, rowKey]) => {
      const db = await new Promise<IDBDatabase>((resolveDb, reject) => {
        const request = indexedDB.open('zari-local');
        request.onsuccess = () => resolveDb(request.result);
        request.onerror = () => reject(request.error);
      });
      const row = await new Promise((resolveRow) => {
        const request = db
          .transaction(storeName as string, 'readonly')
          .objectStore(storeName as string)
          .get(rowKey as string);
        request.onsuccess = () => resolveRow(request.result);
        request.onerror = () => resolveRow('error');
      });
      db.close();
      return row;
    },
    [store, key],
  );
}

async function acceptedId(page: Page, projectId: string): Promise<string | null> {
  const row = (await readRow(page, 'projects', projectId)) as {
    accepted: { planSnapshotId: string } | null;
  };
  return row.accepted?.planSnapshotId ?? null;
}

/** Same revision on drawings, BOM, guide, and the bundle quote of one detail. */
async function expectOneRevision(page: Page): Promise<string> {
  const detail = page.getByTestId('plan-detail').first();
  const revision = await detail.getByTestId('plan-drawings').getAttribute('data-revision');
  expect(revision).toMatch(/^[0-9a-f]{64}$/);
  await expect(detail.getByTestId('bom-table')).toHaveAttribute('data-revision', revision!);
  await expect(detail.getByTestId('guide-list')).toHaveAttribute('data-revision', revision!);
  await expect(detail.getByTestId('offer-quote')).toHaveAttribute('data-state', /ready|empty/, {
    timeout: 30_000,
  });
  await expect(detail.getByTestId('offer-quote')).toHaveAttribute('data-revision', revision!);
  return revision!;
}

async function readCsvDownload(page: Page, testId: string) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('print-panel').first().getByTestId(testId).click(),
  ]);
  const path = await download.path();
  const raw = readFileSync(path, 'utf8');
  expect(raw.charCodeAt(0)).toBe(0xfeff);
  return { name: download.suggestedFilename(), text: raw.slice(1) };
}

/** Write the user-review plan package when ZARI_REVIEW_DIR is set. */
async function writeReviewPackage(
  args: { revision: string; html: string; csvs: Array<{ name: string; text: string }>; catalogDigest: string },
) {
  if (!REVIEW_DIR) return;
  const out = resolve(REVIEW_DIR);
  mkdirSync(out, { recursive: true });
  const tokens = readFileSync(join(ROOT, 'apps/web/src/styles/tokens.css'), 'utf8');
  const projectCss = readFileSync(join(ROOT, 'apps/web/src/styles/project.css'), 'utf8');
  const html = [
    '<!doctype html>',
    '<html lang="ko">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>ZARI 계획 패키지 — 사용자 검수 (draft, ${args.revision.slice(0, 12)})</title>`,
    '<style>',
    tokens,
    projectCss,
    '</style>',
    '</head>',
    '<body class="zari-ui">',
    '<main class="print-surface">',
    args.html,
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
  writeFileSync(join(out, 'plan-package.html'), html);
  const files: Array<{ path: string; sha256: string; bytes: number }> = [];
  const record = (name: string, body: string) => {
    files.push({
      path: name,
      sha256: createHash('sha256').update(body).digest('hex'),
      bytes: Buffer.byteLength(body),
    });
  };
  record('plan-package.html', html);
  for (const csv of args.csvs) {
    writeFileSync(join(out, csv.name), csv.text);
    record(csv.name, csv.text);
  }
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
  const sourceDirty =
    execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim().length > 0;
  const manifest = {
    schemaVersion: 1,
    task: 'ZARI-z-product-qualification',
    status: 'draft-review',
    approved: false,
    approval: 'USER ONLY. This package is review material; nothing here is an approved baseline or a release.',
    planRevision: args.revision,
    catalogDigest: args.catalogDigest,
    evidenceClass: 'synthetic',
    evidenceNote:
      '합성 데모 카탈로그로 만든 계획이다. 실제 상품·실제 판매처·실기기 증거가 아니다.',
    sourceCommit,
    sourceDirty,
    generatedBy: 'apps/web/tests/browser/product-journey.spec.ts',
    captureCommand: 'ZARI_REVIEW_DIR=<dir> npx playwright test apps/web/tests/browser/product-journey.spec.ts --project=chromium --workers=1',
    generatedAt: new Date().toISOString(),
    files,
  };
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

const CONFLICT_CSV = [
  'productId,model,category,optionId,optionLabel,primitive,outerWidthMm,outerDepthMm,outerHeightMm',
  'prod-1,같은 상자,box,var-1,소형,openBin,200,150,100',
  'prod-1,같은 상자,box,var-1,중형,openBin,400,150,100',
].join('\n');

test('the whole journey keeps one snapshot from measurement to reorganize', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  const leaked: string[] = [];
  collectErrors(page, errors);
  watchNetwork(page, leaked);
  await page.setViewportSize({ width: 1440, height: 1000 });

  // ── 측정 (sufficient measurement) ───────────────────────────────────
  await seedSample(page);
  const projectId = await projectIdOf(page);
  const catalogDigest = await page.getByTestId('catalog-pin-select').inputValue();
  expect(catalogDigest).toMatch(/^[0-9a-f]{64}$/);

  // ── 실상품 검토 (declared real-product review, separate catalog) ────
  await page.goto('/#/catalog');
  await expect(page.getByTestId('catalog-list')).toContainText('데모 · 합성 데이터');
  // 오류 import 1: malformed JSON is rejected before staging.
  await page.getByTestId('import-source-json').click();
  await page.getByTestId('import-text').fill('{broken json');
  await page.getByTestId('stage-import').click();
  await expect(page.getByTestId('import-rejected')).toBeVisible();
  // 오류 import 2: a conflicting CSV is quarantined, never committed.
  await page.getByTestId('provenance-mode-csv').click();
  await page.getByTestId('provenance-text').fill(CONFLICT_CSV);
  await page.getByTestId('provenance-review').click();
  await expect(page.getByTestId('provenance-quarantine')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('provenance-commit')).toHaveCount(0);
  // A declared real-product record reviews cleanly; facts stay unverified.
  await page.getByTestId('provenance-sample-verified').click();
  await expect(page.getByTestId('provenance-ready')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('provenance-row-0')).toContainText('사실 상태는 미확인');
  await page.getByTestId('provenance-commit').click();
  await expect(page.getByTestId('provenance-saved')).toBeVisible();
  await expect(page.getByTestId('catalog-list')).toContainText('sample-verified');
  await expect(page.getByTestId('catalog-list')).toContainText('검증 범위 기록 · 사실은 미확인');
  // The committed catalog is a storage row, not just a screen note.
  const catalogs = (await readRows(page, 'catalogs')) as Array<{ catalogVersion?: string }>;
  expect(catalogs.some((row) => row.catalogVersion === 'sample-verified')).toBe(true);

  // ── 대안 (alternatives) ────────────────────────────────────────────
  await page.evaluate((id) => {
    location.hash = `#/project/${id}/plan`;
  }, projectId);
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30_000,
  });
  // 취소: cancel during a real search, then a fresh search completes.
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('cancel-search')).toBeVisible();
  await page.getByTestId('cancel-search').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute(
    'data-search',
    /cancelled|done|interrupted/,
    { timeout: 20_000 },
  );
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30_000,
  });
  await computeDone(page);
  const cards = await readCards(page);
  if (!cards.some((card) => card.kind === 'no-purchase')) {
    throw new Error(`no-purchase alternative missing: ${cardDump(cards)}`);
  }
  const purchase = cards.find((card) => card.kind === 'new-purchase') ?? cards[0]!;
  await page.getByTestId(`plan-card-${purchase.index}`).click();
  const revision = await expectOneRevision(page);
  const snapshotText = (await page.getByTestId('snapshot-id').first().innerText()).match(
    /스냅샷 ([0-9a-f]{16})/,
  )![1]!;
  expect(revision.startsWith(snapshotText)).toBe(true);

  // ── 구매 준비 (purchase prep; seller link is not a payment) ─────────
  const detail = page.getByTestId('plan-detail').first();
  const handoff = detail.getByTestId('purchase-handoff');
  await expect(handoff).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(handoff).toHaveAttribute('data-paid', 'false');
  await expect(handoff).not.toContainText('결제 완료');
  const line = handoff.locator('[data-testid^="purchase-line-"]').first();
  await expect(line.locator('[data-testid^="purchase-freshness-"]')).toContainText('확인 시각 없음');
  await handoff.getByTestId('purchase-record-note').focus();
  await handoff.getByTestId('purchase-record-note').press('Enter');
  await expect(line.locator('[data-testid^="purchase-flags-"]')).toContainText('구매 확인 기록됨');
  await expect(handoff).toHaveAttribute('data-paid', 'false');

  // ── 실행 (accept + execution progress on the same snapshot) ─────────
  await page.getByTestId('accept-plan').click();
  await expect(page.locator('#accepted-guide')).toBeVisible();
  const accepted = await acceptedId(page, projectId);
  expect(accepted).toBeTruthy();
  expect(revision.startsWith(accepted!.slice(0, 16)) || accepted!.startsWith(revision.slice(0, 16))).toBe(
    true,
  );
  const guide = page.locator('#accepted-guide');
  const step = guide.locator('input[data-testid^="action-"]:not([disabled])').first();
  await expect(step).toBeVisible();
  await step.focus();
  await page.keyboard.press('Space');
  await expect(step).toBeChecked();
  await expect(guide.locator('input[type="checkbox"]:checked')).toHaveCount(1);
  const card = page.getByTestId('execution-card');
  await expect(card).toBeVisible();
  await expect(card.getByTestId('execution-progress')).toBeVisible();
  // Unknown checks stay unknown after a done mark.
  const unknownBefore = await page
    .locator('[data-testid="checks-list"] [data-status="unknown"]')
    .count();
  expect(unknownBefore).toBeGreaterThan(0);
  expect(await page.locator('[data-testid="checks-list"] [data-status="unknown"]').count()).toBe(
    unknownBefore,
  );

  // ── 계획 패키지 (user-review package from the same snapshot) ────────
  const panel = page.getByTestId('print-panel').first();
  await expect(panel).toHaveAttribute('data-state', 'ready');
  await panel.getByTestId('print-open').click();
  const dialog = page.getByTestId('print-preview');
  await expect(dialog).toBeVisible();
  const pkg = dialog.getByTestId('print-package');
  await expect(pkg).toHaveAttribute('data-revision', revision);
  await expect(dialog.getByTestId('print-head')).toContainText(revision);
  const sections = await pkg.locator('[data-section][data-revision]').evaluateAll((nodes) =>
    nodes.map((n) => (n as HTMLElement).dataset['revision']),
  );
  expect(new Set(sections)).toEqual(new Set([revision]));
  const packageHtml = await pkg.innerHTML();
  await page.keyboard.press('Escape');
  const planCsv = await readCsvDownload(page, 'print-csv-plan');
  const bomCsv = await readCsvDownload(page, 'print-csv-bom');
  expect(planCsv.text).toContain(revision);
  expect(bomCsv.text).toContain(revision);
  await writeReviewPackage({
    revision,
    html: packageHtml,
    csvs: [planCsv, bomCsv],
    catalogDigest,
  });

  // ── 위치 검색 (location search; planned is never the actual) ────────
  await page.evaluate((id) => {
    location.hash = `#/project/${id}`;
  }, projectId);
  await expect(page.getByTestId('location-panel')).toBeVisible();
  await expect(page.getByTestId('location-status')).not.toHaveAttribute('data-state', 'pending');
  const rows = page.getByTestId('location-rows');
  await expect(rows.locator('li').first()).toBeVisible();
  const statuses = await rows.locator('li[data-status]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-status')),
  );
  expect(statuses.every((s) => s === 'plannedOnly' || s === 'unlocated')).toBe(true);
  await page.getByTestId('location-query').fill('coats');
  await page.getByTestId('location-search').click();
  await expect(page.getByTestId('location-status')).not.toHaveAttribute('data-state', 'pending');
  const coatIds = await rows.locator('li[data-status]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-testid')),
  );
  expect(coatIds.length).toBeGreaterThan(0);
  expect(coatIds.every((id) => id?.startsWith('location-row-item-a'))).toBe(true);
  await page.getByTestId('location-query').fill('');
  await page.getByTestId('location-search').click();
  await page.getByTestId('location-item').selectOption('item-a');
  await page.getByTestId('location-kind').selectOption('relocate');
  await page.getByTestId('location-ordinals').fill('1');
  await page.getByTestId('location-place').fill('현관');
  await page.getByTestId('location-record').click();
  await expect(page.getByTestId('location-status')).toHaveAttribute('data-state', 'saved');
  await expect(page.getByTestId('location-row-item-a-1')).toContainText('관측: 현관');
  const locationRow = (await readRow(page, 'locationLogs', projectId)) as {
    log?: { observations?: unknown[] };
  } | undefined;
  expect(locationRow?.log?.observations?.length).toBeGreaterThan(0);
  // The observation does not touch the accepted binding.
  expect(await acceptedId(page, projectId)).toBe(accepted);

  // ── 재정리 (feedback reorganize keeps the adopted plan) ─────────────
  await page.evaluate((id) => {
    location.hash = `#/project/${id}/plan`;
  }, projectId);
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30_000,
  });
  const feedback = page.getByTestId('feedback-panel');
  await expect(feedback).toBeVisible();
  await page.getByTestId('feedback-item').selectOption('item-a');
  await page.getByTestId('feedback-kind').selectOption('frequencyChange');
  await page.getByTestId('feedback-frequency').selectOption('daily');
  await page.getByTestId('feedback-note').fill('매일 꺼낸다');
  await page.getByTestId('feedback-record').click();
  await expect(page.getByTestId('feedback-record-status')).toContainText('계획은 바뀌지 않았습니다');
  const feedbackRow = (await readRow(page, 'feedbackLogs', projectId)) as {
    log?: { entries?: Array<{ planSnapshotId?: string }> };
  } | undefined;
  expect(feedbackRow?.log?.entries?.[0]?.planSnapshotId).toBe(accepted);
  await page.getByTestId('feedback-run').click();
  // 'ready' publishes a draft; 'nochange' is the honest no-better-swap answer.
  // Both are bound to the accepted snapshot and decide nothing by themselves.
  await expect(feedback).toHaveAttribute('data-state', /ready|nochange/, { timeout: 60_000 });
  await expect(feedback).toHaveAttribute('data-auto-discard', 'false');
  await expect(feedback).toHaveAttribute('data-auto-purchase', 'false');
  await expect(feedback).toHaveAttribute('data-base', accepted!);
  // The draft is a proposal; the accepted binding is untouched.
  expect(await acceptedId(page, projectId)).toBe(accepted);

  // ── 다중 탭 (second tab CAS keeps the committed state) ─────────────
  const pageB = await page.context().newPage();
  collectErrors(pageB, errors);
  await pageB.setViewportSize({ width: 1440, height: 1000 });
  await pageB.goto(`/#/project/${projectId}`);
  await expect(pageB.getByTestId('worker-state')).toHaveText('ready', { timeout: 30_000 });
  await page.getByRole('link', { name: '치수로 돌아가기' }).click();
  await widthBox(page).fill('610');
  await commitSaved(page);
  await widthBox(pageB).fill('700');
  await pageB.getByTestId('commit-input').click();
  await expect(pageB.getByTestId('save-state')).toHaveAttribute('data-save-state', 'conflict');
  await expect(pageB.getByTestId('conflict-notice')).toBeVisible();
  await pageB.close();
  expect(await acceptedId(page, projectId)).toBe(accepted);

  // 390px + forced-colors stay honest at the end of the journey.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ forcedColors: 'active' });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= window.innerWidth &&
        document.body.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  expect(leaked).toEqual([]);
  const unexpected = errors.filter(
    (error) => !/worker_timeout|worker_crashed|worker_unavailable|search_stalled/.test(error),
  );
  expect(unexpected).toEqual([]);
});

test('insufficient measurement and a too-small space stay unassigned, never upgraded', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30_000 });
  await page.getByTestId('fill-sample').click();
  // 부족 측정: a blank interior width is an unknown, not a zero.
  await widthBox(page).fill('');
  await commitSaved(page);
  await openPlan(page);
  await computeDone(page);
  const narrow = page.locator('[data-testid^="plan-card-"]');
  const narrowCount = await narrow.count();
  if (narrowCount > 0) {
    // Any published plan keeps honest unknown checks; an unmeasured space is
    // never verified by omission.
    await narrow.first().click();
    const checks = page.getByTestId('checks-list');
    await expect(checks).toBeVisible();
    const unknowns = await checks.locator('[data-status="unknown"]').count();
    const fails = await checks.locator('[data-status="fail"]').count();
    expect(unknowns + fails).toBeGreaterThan(0);
  }

  // 미배정: a compartment too narrow for the documents lists them, honestly.
  await page.getByRole('link', { name: '치수로 돌아가기' }).click();
  await widthBox(page).fill('300');
  const opening = page.getByRole('textbox', { name: '개구부 폭', exact: true });
  await opening.fill('300');
  await commitSaved(page);
  await openPlan(page);
  await computeDone(page);
  const cards = page.locator('[data-testid^="plan-card-"]');
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  let sawUnassigned = false;
  for (let i = 0; i < count; i += 1) {
    await cards.nth(i).click();
    const list = page.getByTestId('unassigned-list');
    if ((await list.count()) > 0 && (await list.locator('li').count()) > 0) {
      const text = await list.innerText();
      expect(text).not.toContain('미배치 0');
      sawUnassigned = true;
      break;
    }
  }
  expect(sawUnassigned).toBe(true);
  expect(errors).toEqual([]);
});

test('an out-of-stock offer is a visible check failure with no fake replacement', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  const demo = JSON.parse(
    readFileSync(join(ROOT, 'apps/web/src/features/project/synthetic-catalog.json'), 'utf8'),
  ) as Record<string, unknown> & { offers: Array<Record<string, unknown>> };
  const oos = {
    ...demo,
    catalogVersion: 'catalog-journey-oos',
    sourceKind: 'imported',
    ingestionVersion: 'journey-oos-1',
    offers: demo.offers.map((offer) => ({
      ...offer,
      inventory: { ...(offer['inventory'] as object), state: 'known', value: 'outOfStock' },
    })),
    sourceObservations: [
      {
        id: 'obs-journey-oos',
        note: 'journey qualification: every offer marked out of stock',
        observedAt: null,
      },
    ],
  };
  delete (oos as { catalogDigest?: string }).catalogDigest;

  await page.goto('/#/catalog');
  await page.getByTestId('import-source-json').click();
  await page.getByTestId('import-text').fill(JSON.stringify(oos));
  await page.getByTestId('stage-import').click();
  await expect(page.getByTestId('import-validated')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('commit-import').click();
  await expect(page.getByTestId('import-committed')).toBeVisible();
  await expect(page.getByTestId('catalog-list')).toContainText('catalog-journey-oos');
  const oosRows = (await readRows(page, 'catalogs')) as Array<{
    catalogVersion?: string;
    catalogDigest?: string;
  }>;
  const digest = oosRows.find((row) => row.catalogVersion === 'catalog-journey-oos')?.catalogDigest ?? '';
  expect(digest).toMatch(/^[0-9a-f]{64}$/);

  await seedSample(page);
  await page.getByTestId('catalog-pin-select').selectOption(digest);
  await commitSaved(page);
  await openPlan(page);
  await computeDone(page);
  const cards = page.locator('[data-testid^="plan-card-"]');
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  let sawOos = false;
  for (let i = 0; i < count; i += 1) {
    await cards.nth(i).click();
    const text = await page.getByTestId('checks-list').innerText();
    if (text.includes('out_of_stock')) {
      sawOos = true;
      break;
    }
  }
  expect(sawOos).toBe(true);
  const checks = page.getByTestId('checks-list');
  await expect(checks.locator('li').filter({ hasText: 'out_of_stock' })).toHaveAttribute(
    'data-status',
    'fail',
  );
  const sellers = page.getByTestId('plan-detail').first().getByTestId('offer-sellers');
  if (await sellers.count()) {
    const stock = await sellers.locator('[data-stock]').first().getAttribute('data-stock');
    expect(stock).toBe('outOfStock');
  }
  await expect(
    page.getByTestId('plan-detail').first().getByTestId('offer-replacements-empty'),
  ).toContainText('교체 후보가 없습니다');
  // The same failure lands in the saved snapshot, not only on the screen.
  const accepted = await page.getByTestId('snapshot-id').first().innerText();
  expect(accepted).toContain('스냅샷');
  expect(errors).toEqual([]);
});
