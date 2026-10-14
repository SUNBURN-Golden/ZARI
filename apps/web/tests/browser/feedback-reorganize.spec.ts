import { expect, test, type Page } from '@playwright/test';

/**
 * Real browser evidence for z-feedback-reorganize: real IndexedDB and the real
 * Rust WASM Worker. A recorded use feedback is a statement, not a decision.
 * Rust explains each entry's rule and builds a draft that passed the same
 * validator as every plan; the adopted plan and the actual locations stay put
 * until the person adopts the draft.
 */

type Counters = { propose: number; record: number };

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('request', (request) => {
    const host = new URL(request.url()).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') errors.push(`external request ${request.url()}`);
  });
}

/** Counts worker commands and can hold the next proposal so a late reply can be released. */
async function countWorkerCommands(page: Page) {
  await page.addInitScript(() => {
    const holder = window as unknown as {
      __feedback?: { propose: number; record: number };
      __holdPropose?: boolean;
      __queued?: unknown[];
      __worker?: Worker;
      __post?: (this: Worker, ...args: unknown[]) => void;
    };
    holder.__feedback = { propose: 0, record: 0 };
    holder.__holdPropose = false;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      const body = args[0];
      if (typeof body === 'string') {
        if (body.includes('"applyFeedbackLog"')) holder.__feedback!.record += 1;
        if (body.includes('"proposeFeedbackReorganize"')) {
          holder.__feedback!.propose += 1;
          if (holder.__holdPropose) {
            holder.__queued = args;
            holder.__worker = this;
            holder.__post = post as (this: Worker, ...inner: unknown[]) => void;
            return;
          }
        }
      }
      return (post as (...inner: unknown[]) => void).apply(this, args);
    } as Worker['postMessage'];
  });
}

async function counters(page: Page): Promise<Counters> {
  return page.evaluate(() => (window as unknown as { __feedback: Counters }).__feedback);
}

async function holdNextProposal(page: Page, hold: boolean) {
  await page.evaluate((value) => {
    (window as unknown as { __holdPropose: boolean }).__holdPropose = value;
  }, hold);
}

async function releaseHeldProposal(page: Page) {
  await page.evaluate(() => {
    const holder = window as unknown as {
      __holdPropose?: boolean;
      __queued?: unknown[];
      __worker?: Worker;
      __post?: (this: Worker, ...args: unknown[]) => void;
    };
    holder.__holdPropose = false;
    if (!holder.__queued || !holder.__worker || !holder.__post) throw new Error('missing_held_proposal');
    holder.__post.apply(holder.__worker, holder.__queued);
  });
}

async function readRow(page: Page, store: string, key: string): Promise<unknown> {
  return page.evaluate(
    async ([storeName, rowKey]) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('zari-local');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const row = await new Promise((resolve) => {
        const request = db.transaction(storeName as string, 'readonly').objectStore(storeName as string).get(rowKey as string);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve('error');
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

/**
 * The sample's documents may only be pulled out of a bin. This draft edit
 * lets them stand loose and narrows them, so a plan holds two different items
 * directly. The search budget is small enough to finish. Rust still plans.
 */
async function looseDocumentsDraft(page: Page, projectId: string) {
  await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('zari-local');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      const store = tx.objectStore('drafts');
      const request = store.get(id);
      request.onsuccess = () => {
        const row = request.result as {
          form: {
            search: { budget: Record<string, unknown> };
            items: Array<{
              requirement: { allowedRetrievalModes: string[] };
              dimensions: { envelope: Record<string, { text: string }> };
            }>;
          };
        };
        const docs = row.form.items[1]!;
        docs.requirement.allowedRetrievalModes = ['directFrontExtraction', 'pullContainerThenRetrieve'];
        docs.dimensions.envelope.width!.text = '150';
        docs.dimensions.envelope.depth!.text = '100';
        row.form.search.budget.maxWorkUnits = '20000';
        row.form.search.budget.maxNodes = 512;
        row.form.search.budget.maxAlternatives = 12;
        store.put(row);
        tx.oncomplete = () => resolve();
      };
      request.onerror = () => reject(request.error);
    });
    db.close();
  }, projectId);
}

type Spot = { name: string; x: number; y: number };

async function placementSpots(page: Page): Promise<Spot[]> {
  // The selected plan is the first detail on the screen; the adopted one follows.
  const text = await page.getByTestId('placements-list').first().innerText();
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const spots: Spot[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const match = /^\((-?\d+), (-?\d+), (-?\d+)\) mm/.exec(lines[index]!);
    if (match) spots.push({ name: lines[index - 1]!, x: Number(match[1]), y: Number(match[2]) });
  }
  return spots;
}

/** A project, its plan, and the first no-purchase card whose documents sit behind a coat. */
async function acceptedPlan(page: Page): Promise<{ projectId: string; spots: Spot[] }> {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30000 });
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  const projectId = page.url().match(/project\/([^/?#]+)/)?.[1] ?? '';
  expect(projectId).not.toBe('');
  await looseDocumentsDraft(page, projectId);
  await page.reload();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30000 });
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 90_000,
  });
  const cards = page.locator('[data-testid^="plan-card-"]');
  const count = await cards.count();
  let found: Spot[] | null = null;
  for (let index = 0; index < count && !found; index += 1) {
    await cards.nth(index).click();
    const spots = await placementSpots(page);
    const docs = spots.find((spot) => spot.name === 'Documents');
    const coats = spots.filter((spot) => spot.name.startsWith('Winter coats'));
    if (docs && coats.length > 0 && coats.some((coat) => coat.y < docs.y)) found = spots;
  }
  expect(found, 'a plan with the documents behind a coat').not.toBeNull();
  await page.getByTestId('accept-plan').click();
  await expect(page.getByTestId('accepted-badge')).toBeVisible();
  await expect(page.getByTestId('feedback-record-status')).not.toHaveText('기록을 불러오는 중');
  return { projectId, spots: found! };
}

async function recordFrequency(page: Page, itemId: string, frequency: string, note = '') {
  await page.getByTestId('feedback-item').selectOption(itemId);
  await page.getByTestId('feedback-kind').selectOption('frequencyChange');
  await page.getByTestId('feedback-frequency').selectOption(frequency);
  await page.getByTestId('feedback-note').fill(note);
  await page.getByTestId('feedback-record').click();
}

test('feedback becomes an explained draft; cancel keeps the plan and the actual locations; adoption is explicit', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await countWorkerCommands(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { projectId, spots } = await acceptedPlan(page);
  const adopted = await acceptedId(page, projectId);
  expect(adopted).toBeTruthy();

  // A person records where the adopted plan actually holds a unit. This is the
  // only actual location; the draft below must leave it alone.
  const panel = page.getByTestId('feedback-panel');
  await expect(panel).toHaveAttribute('data-state', 'idle');
  await expect(page.getByTestId('feedback-no-live')).toBeVisible();
  await expect(page.getByTestId('feedback-run')).toBeDisabled();
  expect(await counters(page)).toEqual({ propose: 0, record: 0 });
  expect(await readRow(page, 'feedbackLogs', projectId)).toBeUndefined();

  // Frequency feedback: the documents are now used every day. Recording is a
  // statement; it changes no plan, no input, and sends no proposal.
  await recordFrequency(page, 'item-b', 'daily', '매일 아침에 꺼낸다');
  await expect(page.getByTestId('feedback-record-status')).toHaveText(
    '기록을 저장했습니다. 계획은 바뀌지 않았습니다',
  );
  await expect(page.getByTestId('feedback-entry')).toHaveCount(1);
  await expect(page.getByTestId('feedback-entry')).toContainText('사용 빈도 변경 → 매일');
  await expect(page.getByTestId('feedback-entry')).toHaveAttribute('data-live', 'true');
  await expect(panel).toHaveAttribute('data-live', '1');
  expect(await counters(page)).toEqual({ propose: 0, record: 1 });
  const logRow = (await readRow(page, 'feedbackLogs', projectId)) as {
    revision: string;
    log: { entries: Array<{ planSnapshotId: string; kind: string }> };
  };
  expect(logRow.revision).toBe('1');
  // Rust stamped the adopted plan; the page never supplied it.
  expect(logRow.log.entries[0]!.planSnapshotId).toBe(adopted);
  expect(await acceptedId(page, projectId)).toBe(adopted);
  expect(await readRow(page, 'locationLogs', projectId)).toBeUndefined();

  // The proposal: one command, a published draft, an explained cause.
  await page.getByTestId('feedback-run').click();
  await expect(panel).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  expect(await counters(page)).toEqual({ propose: 1, record: 1 });
  await expect(panel).toHaveAttribute('data-outcome', 'published');
  await expect(panel).toHaveAttribute('data-read-model', 'zari-feedback-1');
  await expect(panel).toHaveAttribute('data-rule-set', 'zari-feedback-rules-1');
  await expect(panel).toHaveAttribute('data-auto-discard', 'false');
  await expect(panel).toHaveAttribute('data-auto-purchase', 'false');
  await expect(panel).toHaveAttribute('data-base', adopted!);
  const draftId = (await panel.getAttribute('data-draft')) ?? '';
  expect(draftId).toMatch(/^[0-9a-f]{64}$/);
  expect(draftId).not.toBe(adopted);
  const firstRequest = (await panel.getAttribute('data-request')) ?? '';
  const cause = page.getByTestId('feedback-cause');
  await expect(cause).toHaveCount(1);
  await expect(cause).toHaveAttribute('data-outcome', 'applied');
  await expect(cause).toHaveAttribute('data-reason', 'swapped_depth');
  await expect(cause).toHaveAttribute('data-rule', 'feedback:frequency:v1');
  await expect(cause).toContainText('입력 빈도 드물게 → 기록 빈도 매일');
  await expect(page.getByTestId('feedback-measure')).toContainText('순서가 뒤바뀐 쌍 2개 → 0개');
  // Compare: the documents move toward the opening, a coat takes the deeper spot.
  const moves = page.getByTestId('feedback-move');
  expect(await moves.count()).toBe(2);
  await expect(page.getByTestId('feedback-moves')).toContainText('Documents');
  const docsBefore = spots.find((spot) => spot.name === 'Documents')!;
  await expect(page.getByTestId('feedback-moves')).toContainText(`현재 (${docsBefore.x}, ${docsBefore.y}) mm`);
  // Nothing is discarded or bought, and the checks are fresh.
  for (const kept of await page.getByTestId('feedback-preserved').locator('li').all()) {
    await expect(kept).toHaveAttribute('data-kept', 'true');
  }
  await expect(page.getByTestId('feedback-no-decision')).toHaveText(
    '물건을 버리거나 사는 결정은 하지 않았습니다.',
  );
  await expect(page.getByTestId('feedback-fresh')).toContainText('이전 통과를 다시 쓰지 않습니다');
  await page.getByTestId('feedback-reproduction').locator('summary').click();
  await expect(page.getByTestId('feedback-reproduction')).toContainText('규칙 zari-feedback-rules-1');
  // Still not adopted.
  expect(await acceptedId(page, projectId)).toBe(adopted);

  // Same request: the same single command answers; no second command.
  await page.getByTestId('feedback-run').click();
  await expect(panel).toHaveAttribute('data-state', 'ready');
  expect(await counters(page)).toEqual({ propose: 1, record: 1 });
  expect(await panel.getAttribute('data-request')).toBe(firstRequest);

  // A new budget is a new request with the same deterministic draft.
  await page.getByTestId('feedback-budget').selectOption('32');
  await page.getByTestId('feedback-run').click();
  await expect(panel).toHaveAttribute('data-state', 'ready');
  expect(await counters(page)).toEqual({ propose: 2, record: 1 });
  expect(await panel.getAttribute('data-draft')).toBe(draftId);
  expect(await panel.getAttribute('data-request')).not.toBe(firstRequest);
  await page.getByTestId('feedback-budget').selectOption('16');

  // Cancel while Rust is thinking: plan and locations stay, the late reply is ignored.
  await page.getByTestId('feedback-budget').selectOption('8');
  await holdNextProposal(page, true);
  await page.getByTestId('feedback-run').click();
  await expect(panel).toHaveAttribute('data-state', 'pending');
  expect(await counters(page)).toEqual({ propose: 3, record: 1 });
  await page.getByTestId('feedback-cancel').click();
  await expect(panel).toHaveAttribute('data-state', 'cancelled');
  await expect(page.getByTestId('feedback-status')).toContainText('채택한 계획과 실제 위치는 그대로입니다');
  expect(await acceptedId(page, projectId)).toBe(adopted);
  await releaseHeldProposal(page);
  await expect(panel).toHaveAttribute('data-ignored', '1');
  await expect(panel).toHaveAttribute('data-state', 'cancelled');
  await expect(page.getByTestId('feedback-open')).toHaveCount(0);
  await expect(page.getByTestId('feedback-ignored')).toHaveText('늦은 응답은 채택한 계획을 바꾸지 않았습니다.');
  expect(await acceptedId(page, projectId)).toBe(adopted);
  expect(await readRow(page, 'locationLogs', projectId)).toBeUndefined();
  await page.getByTestId('feedback-budget').selectOption('16');

  // The cached 16-evaluation answer comes back without a new command.
  await page.getByTestId('feedback-run').click();
  await expect(panel).toHaveAttribute('data-state', 'ready');
  expect(await counters(page)).toEqual({ propose: 3, record: 1 });
  await expect(panel).toHaveAttribute('data-draft', draftId);

  // Open the draft to compare it; it is selected, still not adopted.
  await page.getByTestId('feedback-open').click();
  await expect(page.getByTestId('feedback-accept')).toBeVisible();
  expect(await acceptedId(page, projectId)).toBe(adopted);
  const draftSpots = await placementSpots(page);
  const docsDraft = draftSpots.find((spot) => spot.name === 'Documents')!;
  expect(docsDraft.y).toBeLessThan(docsBefore.y);
  // The coats are the same two units; only their positions can differ.
  expect(draftSpots.map((spot) => spot.name).sort()).toEqual(spots.map((spot) => spot.name).sort());

  // Adopt the draft: now the adopted plan changes, and the entry is no longer live.
  await page.getByTestId('feedback-accept').click();
  await expect.poll(async () => acceptedId(page, projectId)).toBe(draftId);
  await expect(panel).toHaveAttribute('data-live', '0');
  await expect(page.getByTestId('feedback-entry')).toHaveAttribute('data-live', 'false');
  await expect(page.getByTestId('feedback-entry')).toContainText('다른 계획에 기록됨 · 적용 안 함');
  await expect(page.getByTestId('feedback-run')).toBeDisabled();
  await expect(panel).toHaveAttribute('data-state', 'idle');
  expect(await counters(page)).toEqual({ propose: 3, record: 1 });

  // The record survives a reload and still names the older plan.
  await page.reload();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await expect(page.getByTestId('feedback-entry')).toHaveCount(1);
  await expect(page.getByTestId('feedback-entry')).toHaveAttribute('data-live', 'false');
  expect(errors).toEqual([]);
});

test('actual locations are untouched by cancel and become stale confirmations only when a new plan is adopted', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await countWorkerCommands(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { projectId } = await acceptedPlan(page);

  // The person confirms where the documents are right now.
  await page.evaluate((id) => {
    location.hash = `#/project/${id}`;
  }, projectId);
  await expect(page.getByTestId('location-panel')).toBeVisible();
  await expect(page.getByTestId('location-status')).not.toHaveAttribute('data-state', 'pending');
  await page.getByTestId('location-item').selectOption('item-b');
  await page.getByTestId('location-kind').selectOption('confirm');
  await page.getByTestId('location-record').click();
  await expect(page.getByTestId('location-status')).toHaveAttribute('data-state', 'saved');
  await expect(page.getByTestId('location-row-item-b-0')).toHaveAttribute('data-status', 'confirmed');
  const before = JSON.stringify(await readRow(page, 'locationLogs', projectId));
  expect(before).toContain('confirm');

  // Feedback, a proposal, then cancel: the location log is byte-identical.
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await expect(page.getByTestId('feedback-record-status')).not.toHaveText('기록을 불러오는 중');
  await recordFrequency(page, 'item-b', 'daily');
  await expect(page.getByTestId('feedback-record-status')).toHaveText(
    '기록을 저장했습니다. 계획은 바뀌지 않았습니다',
  );
  const panel = page.getByTestId('feedback-panel');
  await holdNextProposal(page, true);
  await page.getByTestId('feedback-run').click();
  await expect(panel).toHaveAttribute('data-state', 'pending');
  // The proposal read the location log as context only.
  await page.getByTestId('feedback-cancel').click();
  await expect(panel).toHaveAttribute('data-state', 'cancelled');
  await releaseHeldProposal(page);
  await expect(panel).toHaveAttribute('data-ignored', '1');
  expect(JSON.stringify(await readRow(page, 'locationLogs', projectId))).toBe(before);
  await page.evaluate((id) => {
    location.hash = `#/project/${id}`;
  }, projectId);
  await expect(page.getByTestId('location-row-item-b-0')).toHaveAttribute('data-status', 'confirmed');

  // A real proposal now: the cause may cite the user's location claim, never rewrite it.
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('feedback-record-status')).not.toHaveText('기록을 불러오는 중');
  await page.getByTestId('feedback-run').click();
  await expect(panel).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(page.getByTestId('feedback-observed')).toContainText('계획 위치 확인');
  expect(JSON.stringify(await readRow(page, 'locationLogs', projectId))).toBe(before);

  // Adopting the draft is a new plan: the old confirmation becomes stale, not a current location.
  await page.getByTestId('feedback-open').click();
  await page.getByTestId('feedback-accept').click();
  await expect(panel).toHaveAttribute('data-live', '0');
  expect(JSON.stringify(await readRow(page, 'locationLogs', projectId))).toBe(before);
  await page.evaluate((id) => {
    location.hash = `#/project/${id}`;
  }, projectId);
  await expect(page.getByTestId('location-row-item-b-0')).toHaveAttribute(
    'data-status',
    'staleConfirmation',
  );
  expect(errors).toEqual([]);
});

test('empty, refused, unchanged, stale, and deleted states are honest and keyboard reachable', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await countWorkerCommands(page);
  await page.setViewportSize({ width: 1440, height: 1000 });

  // No adopted plan: nothing to record against.
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30000 });
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await expect(page.getByTestId('feedback-panel')).toHaveAttribute('data-state', 'empty');
  await expect(page.getByTestId('feedback-empty')).toBeVisible();
  await expect(page.getByTestId('feedback-form')).toHaveCount(0);
  await expect(page.getByTestId('feedback-run')).toHaveCount(0);
  expect(await counters(page)).toEqual({ propose: 0, record: 0 });
  await page.evaluate(() => {
    location.hash = '#/';
  });
  const staleProject = page.url();
  expect(staleProject).toBeTruthy();

  // A fresh project with an adopted plan for the remaining states.
  const { projectId } = await acceptedPlan(page);
  const panel = page.getByTestId('feedback-panel');

  // Refusals are Rust codes and store nothing.
  await page.getByTestId('feedback-item').selectOption('item-a');
  await page.getByTestId('feedback-kind').selectOption('frequencyChange');
  await page.getByTestId('feedback-frequency').selectOption('weekly');
  await page.getByTestId('feedback-record').click();
  await expect(page.getByTestId('feedback-record-error')).toHaveAttribute('data-reason', 'frequency_unchanged');
  await expect(panel).toHaveAttribute('data-record-state', 'error');
  expect(await readRow(page, 'feedbackLogs', projectId)).toBeUndefined();
  await page.getByTestId('feedback-kind').selectOption('accessDifficulty');
  await page.getByTestId('feedback-record').click();
  await expect(panel).toHaveAttribute('data-record-state', 'saved');
  await expect(page.getByTestId('feedback-record-error')).toHaveCount(0);
  await page.getByTestId('feedback-record').click();
  await expect(page.getByTestId('feedback-record-error')).toHaveAttribute('data-reason', 'duplicate_feedback');
  await expect(page.getByTestId('feedback-entry')).toHaveCount(1);

  // A coat is already ahead of the documents: nothing to improve, the plan is unchanged.
  const adopted = await acceptedId(page, projectId);
  await page.getByTestId('feedback-run').click();
  await expect(panel).toHaveAttribute('data-state', 'nochange', { timeout: 30_000 });
  await expect(panel).toHaveAttribute('data-outcome', 'noChange');
  await expect(page.getByTestId('feedback-summary')).toContainText('현재 계획이 그대로입니다');
  await expect(page.getByTestId('feedback-cause')).toHaveAttribute('data-outcome', 'noBetterSlot');
  await expect(page.getByTestId('feedback-cause')).toHaveAttribute('data-reason', 'already_ordered');
  await expect(page.getByTestId('feedback-open')).toHaveCount(0);
  expect(await acceptedId(page, projectId)).toBe(adopted);

  // Withdrawing leaves no live record; the run button is off and says why.
  await page.getByTestId('feedback-withdraw-0').click();
  await expect(panel).toHaveAttribute('data-live', '0');
  await expect(page.getByTestId('feedback-entry')).toHaveAttribute('data-withdrawn', 'true');
  await expect(page.getByTestId('feedback-run')).toBeDisabled();
  await expect(page.getByTestId('feedback-no-live')).toBeVisible();
  await expect(panel).toHaveAttribute('data-state', 'idle');

  // Keyboard only: choose, record, and run without a pointer.
  await page.getByTestId('feedback-item').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('feedback-item')).toHaveValue('item-b');
  await page.getByTestId('feedback-kind').selectOption('maintenanceDifficulty');
  await page.getByTestId('feedback-note').focus();
  await page.keyboard.type('정리해도 금방 흐트러진다');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('feedback-record')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(panel).toHaveAttribute('data-live', '1');
  await page.getByTestId('feedback-run').focus();
  await expect(page.getByTestId('feedback-run')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(panel).toHaveAttribute('data-state', /ready|nochange/, { timeout: 30_000 });
  await expect(
    page.locator('[data-testid="feedback-cause"][data-rule="feedback:maintenance:v1"]'),
  ).toHaveCount(1);
  // The withdrawn access entry is still listed, and says it was not used.
  await expect(
    page.locator('[data-testid="feedback-cause"][data-outcome="withdrawn"]'),
  ).toHaveCount(1);

  // Reload keeps the record; a changed input makes the adopted plan stale and the run stays off.
  await page.reload();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await expect(page.getByTestId('feedback-entry')).toHaveCount(2);
  await page.getByRole('link', { name: '← 치수로 돌아가기' }).click();
  const width = page.getByRole('textbox', { name: '물건 A 폭' });
  await page.getByLabel('물건 A 폭 단위').selectOption('mm');
  await width.fill('180');
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await expect(page.getByTestId('feedback-stale-plan')).toBeVisible();
  await expect(page.getByTestId('feedback-run')).toBeDisabled();

  // Narrow screen and forced colors keep the panel readable.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.getByTestId('feedback-record')).toBeVisible();
  const colors = await panel.evaluate((node) => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(colors.background).not.toBe('');
  expect(colors.color).not.toBe('');

  // Deleting the project removes the feedback log, not just the screen.
  await page.evaluate(() => {
    location.hash = '#/';
  });
  await page.getByTestId(`delete-${projectId}`).click();
  await page.getByTestId('delete-confirm-yes').click();
  await expect(page.getByTestId(`delete-${projectId}`)).toHaveCount(0);
  expect(await readRow(page, 'feedbackLogs', projectId)).toBeUndefined();
  expect(errors).toEqual([]);
});
