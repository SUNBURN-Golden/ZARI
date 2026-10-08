import { expect, type Page } from '@playwright/test';

/**
 * Wide-bin copy. It fits the sample items, so a no-purchase plan can reuse it.
 * Quantity is one, not unknown.
 */
export const REUSE_ID = 'reuse-bin';
/**
 * 20L copy. Documents are wider than its cavity, so it cannot finish the sample
 * alone. Beside a purchased wide bin, in a wider compartment, it is a mixed plan.
 */
export const SMALL_ID = 'shelf-bin';
/** Interior, floor, and opening width used only for the mixed-plan commit. */
export const MIXED_WIDTH = '900';

export function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

export function watchNetwork(page: Page, leaked: string[]) {
  page.on('request', (request) => {
    const host = new URL(request.url()).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') leaked.push(request.url());
  });
}

async function copyVariant(page: Page, label: string, id: string) {
  const select = page.getByTestId('owned-variant-pick');
  const choice = await select.locator('option').evaluateAll((options, needle) => {
    const found = options.find((option) => (option.textContent ?? '').includes(needle));
    return found instanceof HTMLOptionElement ? found.value : '';
  }, label);
  if (!choice) throw new Error(`${label} option is missing from the owned catalog copy list.`);
  await select.selectOption(choice);
  await page.getByTestId('owned-id').fill(id);
  await page.getByTestId('owned-quantity-owned').fill('1');
  await page.getByTestId('owned-quantity-available').fill('1');
  await page.getByTestId('owned-register').click();
  await expect(page.getByTestId('owned-list')).toContainText(id, { timeout: 30_000 });
}

/** Register a wide-bin copy and a 20L copy. The project draft adds them later. */
export async function registerOwnedCopies(page: Page) {
  await page.goto('/#/catalog');
  await expect(page.getByTestId('owned-list')).toBeVisible();
  await expect.poll(async () => page.getByTestId('owned-variant-pick').locator('option').count()).toBeGreaterThan(1);
  await copyVariant(page, 'Wide bin', REUSE_ID);
  await copyVariant(page, '20L clear', SMALL_ID);
}

export async function seedSample(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30_000 });
  await page.getByTestId('fill-sample').click();
  await commitSaved(page);
}

export async function commitSaved(page: Page) {
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
}

export async function addOwned(page: Page, id: string) {
  await page.getByTestId(`draft-owned-add-${id}`).click();
  await expect(page.getByTestId('draft-owned-list')).toContainText(id);
}

export async function removeOwned(page: Page, id: string) {
  await page.getByTestId(`draft-owned-remove-${id}`).click();
  await expect(page.getByTestId('draft-owned-list')).not.toContainText(id);
}

export async function backToFacts(page: Page) {
  await page.getByRole('link', { name: '치수로 돌아가기' }).click();
  await expect(page.getByTestId('commit-input')).toBeVisible();
}

/**
 * The sample group is `oneTarget`, so the solver never enumerates an
 * owned-plus-new option, and the sample compartment cannot hold the wide bin
 * and the 20L bin together. This draft edit is the saved form: there is no
 * split-policy control. Rust still chooses every alternative.
 */
export async function enableMixedSearch(page: Page) {
  await commitSaved(page);
  const projectId = await projectIdOf(page);
  await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolveDb, reject) => {
      const request = indexedDB.open('zari-local');
      request.onsuccess = () => resolveDb(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolveWrite, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      const store = tx.objectStore('drafts');
      const request = store.get(id);
      request.onsuccess = () => {
        const row = request.result as {
          form?: {
            groups?: Array<{ splitPolicy?: string }>;
            search?: {
              budget?: {
                maxAlternatives?: number;
                maxCandidatesPerGroup?: number;
                maxNodes?: number;
                maxWorkUnits?: string;
              };
            };
            space?: {
              interior?: { width?: { text?: string }; depth?: { text?: string } };
              opening?: { width?: { text?: string } };
              support?: { footprint?: { width?: { text?: string }; depth?: { text?: string } } };
            };
          };
        };
        const form = row?.form;
        const group = form?.groups?.[0];
        const budget = form?.search?.budget;
        const interior = form?.space?.interior;
        const opening = form?.space?.opening;
        const footprint = form?.space?.support?.footprint;
        if (!group || !budget || !interior?.width || !interior.depth || !opening?.width || !footprint?.width || !footprint.depth) {
          reject(new Error('draft form is missing the group, budget, or space'));
          return;
        }
        group.splitPolicy = 'allowMultipleTargets';
        budget.maxCandidatesPerGroup = 8;
        budget.maxAlternatives = 24;
        budget.maxNodes = 65536;
        budget.maxWorkUnits = '2000000';
        interior.width.text = '900';
        interior.depth.text = '480';
        opening.width.text = '900';
        footprint.width.text = '900';
        footprint.depth.text = '480';
        store.put(row);
        tx.oncomplete = () => resolveWrite();
      };
      request.onerror = () => reject(request.error);
    });
    db.close();
  }, projectId);
  await page.reload();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30_000 });
  await expect(page.getByTestId('draft-owned-list')).toContainText(SMALL_ID);
  await expect(page.getByTestId('draft-owned-list')).not.toContainText(REUSE_ID);
  await expect(widthBox(page)).toHaveValue(MIXED_WIDTH);
  await commitSaved(page);
}

export async function openPlan(page: Page) {
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('strategy-select')).toBeVisible();
}

export async function computeDone(page: Page) {
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 120_000,
  });
  await expect(page.locator('[data-testid^="plan-card-"]').first()).toBeVisible();
}

export type PlanCard = {
  index: number;
  title: string;
  placements: string;
  kind: 'no-purchase' | 'reuse' | 'mixed-purchase' | 'new-purchase';
};

export async function readCards(page: Page): Promise<PlanCard[]> {
  const cards = page.locator('[data-testid^="plan-card-"]');
  const count = await cards.count();
  const rows: PlanCard[] = [];
  for (let index = 0; index < count; index += 1) {
    await cards.nth(index).click();
    const title = await cards.nth(index).locator('.plan-card-title').innerText();
    const placements = await page.getByTestId('placements-list').innerText();
    const owned = placements.includes(REUSE_ID) || placements.includes(SMALL_ID);
    const noPurchase = title.includes('구매 없음');
    let kind: PlanCard['kind'] = 'new-purchase';
    if (noPurchase && owned) kind = 'reuse';
    else if (noPurchase) kind = 'no-purchase';
    else if (owned) kind = 'mixed-purchase';
    rows.push({ index, title, placements, kind });
  }
  return rows;
}

export function cardDump(cards: PlanCard[]): string {
  return cards.map((card) => `${card.index}:${card.kind}:${card.title}`).join(' | ');
}

export async function selectKind(page: Page, cards: PlanCard[], kind: PlanCard['kind']) {
  const found = cards.find((card) => card.kind === kind);
  if (!found) throw new Error(`missing ${kind}; saw ${cardDump(cards)}`);
  await page.getByTestId(`plan-card-${found.index}`).click();
  return found;
}

/** Block the calculator thread so the host reports interruption instead of a finished plan. */
export async function interruptRunningSearch(page: Page) {
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('cancel-search')).toBeVisible({ timeout: 30_000 });
  const workers = page.workers();
  if (workers.length === 0) throw new Error('search started without a dedicated worker');
  for (const worker of workers) {
    const blocker = worker.evaluate(() => {
      const until = Date.now() + 20_000;
      let spins = 0;
      while (Date.now() < until) spins += 1;
      return spins;
    });
    void blocker.catch(() => undefined);
  }
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'interrupted', {
    timeout: 20_000,
  });
}

export function widthBox(page: Page) {
  return page.getByRole('textbox', { name: '공간 안쪽 폭', exact: true });
}

export async function projectIdOf(page: Page): Promise<string> {
  const id = await page.evaluate(() => location.hash.split('/')[2] ?? '');
  if (!id) throw new Error('project id missing from the hash');
  return id;
}
