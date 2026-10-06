import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * ZARI-SPATIAL-003: one move command on pointerup, none during pointermove.
 * Real Chromium, IndexedDB, and WASM Worker. Rust accepts or rejects.
 */

async function seededProject(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
}

async function computeDone(page: Page) {
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 60000,
  });
}

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
}

async function installCounters(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __zariEditRequests: number; __zariIdb: number };
    w.__zariEditRequests = 0;
    w.__zariIdb = 0;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      if (typeof args[0] === 'string' && args[0].includes('"evaluateLayoutEdit"'))
        w.__zariEditRequests += 1;
      return (post as (...a: unknown[]) => void).apply(this, args);
    } as Worker['postMessage'];
    const tx = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: unknown[]) {
      w.__zariIdb += 1;
      return (tx as (...a: unknown[]) => IDBTransaction).apply(this, args);
    } as IDBDatabase['transaction'];
  });
}

function counts(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __zariEditRequests: number; __zariIdb: number };
    return { worker: w.__zariEditRequests, idb: w.__zariIdb };
  });
}

async function openFirstPlan(page: Page) {
  await page.getByTestId('plan-card-0').click();
  await expect(page.getByTestId('plan-diagram-top').first()).toBeVisible();
  await page.locator('.placement-pick').first().click();
  await expect(page.locator('[data-testid="plan-diagram-top"] [data-selected="true"]').first()).toBeVisible();
}

function alternativeDetail(page: Page): Locator {
  return page.locator('section').filter({ has: page.locator('#alts-title') }).locator('[data-testid="plan-detail"]');
}

async function placementAt(scope: Locator) {
  const item = scope.getByTestId('placements-list').locator('li').first();
  const note = await item.locator('.session-note').innerText();
  const match = note.match(/\((-?\d+), (-?\d+), (-?\d+)\)/);
  if (!match) throw new Error(`placement note: ${note}`);
  return { x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) };
}

async function checkStatuses(scope: Locator) {
  return scope.locator('[data-testid="checks-list"] li').evaluateAll((els) =>
    els.map((el) => ({
      status: el.getAttribute('data-status'),
      text: el.textContent ?? '',
    })),
  );
}

async function selectedBox(scope: Locator) {
  const svg = scope.getByTestId('plan-diagram-top');
  await svg.scrollIntoViewIfNeeded();
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
  if (!hit) {
    const sample = await svg.evaluate((el, placementTarget) => {
      const node = el.querySelector(`[data-target="${placementTarget}"]`);
      if (!(node instanceof SVGGraphicsElement)) return 'missing';
      const box = node.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const under = document.elementFromPoint(x, y);
      return `${box.width.toFixed(1)}x${box.height.toFixed(1)} @${x.toFixed(0)},${y.toFixed(0)} -> ${under?.tagName}.${under?.className?.toString?.() ?? ''} ${under?.getAttribute?.('data-testid') ?? ''} ${under?.getAttribute?.('data-target') ?? ''}`;
    }, target);
    throw new Error(`no uncovered point on ${target} (${sample})`);
  }
  const scale = await svg.locator('[data-testid="plan-diagram-top-plane"]').evaluate((el) => {
    const ctm = (el as SVGGraphicsElement).getScreenCTM();
    return ctm ? { x: ctm.a, y: ctm.d } : { x: 0, y: 0 };
  });
  if (Math.abs(scale.x) < 0.01) throw new Error('missing screen CTM');
  const box = await rect.boundingBox();
  if (!box) throw new Error('selected placement has no box');
  return { svg, start: hit, scale, box };
}

/** Screen delta for a domain delta. The plane CTM is flipped on Y. */
function screenDelta(scale: { x: number; y: number }, domainX: number, domainY: number) {
  return { x: scale.x * domainX, y: scale.y * domainY };
}

async function pointerSession(page: Page) {
  return page.context().newCDPSession(page);
}

async function pointerDown(page: Page, at: { x: number; y: number }) {
  const cdp = await pointerSession(page);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: at.x,
    y: at.y,
    button: 'left',
    clickCount: 1,
  });
  return cdp;
}

async function pointerMove(cdp: Awaited<ReturnType<typeof pointerSession>>, at: { x: number; y: number }) {
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: at.x,
    y: at.y,
    button: 'left',
  });
}

async function pointerUp(cdp: Awaited<ReturnType<typeof pointerSession>>, at: { x: number; y: number }) {
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: at.x,
    y: at.y,
    button: 'left',
    clickCount: 1,
  });
}

test.describe('plane drag matches one Rust move', () => {
  test.setTimeout(180000);

  test('mouse drag commits once, and cancel paths send nothing', async ({ page }) => {
    const errors: string[] = [];
    collectErrors(page, errors);
    await installCounters(page);
    await seededProject(page);
    await computeDone(page);
    await openFirstPlan(page);
    const detail = alternativeDetail(page);
    const beforeChecks = await checkStatuses(detail);
    const origin = await placementAt(detail);
    await expect(detail.getByTestId('plan-workspace')).toHaveAttribute('data-pointer', 'direct');
    await expect(detail.getByTestId('plan-workspace')).toHaveAttribute('data-move', 'on');
    await expect(detail.getByTestId('drag-quantum')).toContainText('1mm');
    await expect(detail.getByTestId('move-step')).toContainText('1 mm');

    const placed = await selectedBox(detail);
    const base = await counts(page);

    // No-op: under the 4px threshold, and a 2px move, send nothing.
    let cdp = await pointerDown(page, placed.start);
    await pointerMove(cdp, { x: placed.start.x + 2, y: placed.start.y });
    const tiny = await counts(page);
    expect(tiny.worker).toBe(base.worker);
    expect(tiny.idb).toBe(base.idb);
    await pointerUp(cdp, { x: placed.start.x + 2, y: placed.start.y });
    expect((await counts(page)).worker).toBe(base.worker);
    await expect(page.getByTestId('edit-section')).toBeHidden();

    // Escape cancels an armed drag before pointerup.
    cdp = await pointerDown(page, placed.start);
    await pointerMove(cdp, { x: placed.start.x + 36, y: placed.start.y });
    await expect(detail.getByTestId('plan-workspace')).toHaveAttribute('data-gesture-phase', 'preview');
    await expect(detail.getByTestId('drag-phase')).toContainText('검사 전');
    const preview = detail.locator('[data-testid="drag-preview"]');
    await expect(preview).toHaveAttribute('data-valid', 'false');
    const mid = await counts(page);
    expect(mid.worker).toBe(base.worker);
    expect(mid.idb).toBe(base.idb);
    await page.keyboard.press('Escape');
    await pointerUp(cdp, { x: placed.start.x + 36, y: placed.start.y });
    expect((await counts(page)).worker).toBe(base.worker);
    await expect(detail.getByTestId('drag-phase')).toBeHidden();

    // A second pointer cancels.
    cdp = await pointerDown(page, placed.start);
    await pointerMove(cdp, { x: placed.start.x + 28, y: placed.start.y });
    await page.evaluate(() => {
      document.querySelector('[data-testid="plan-diagram-top"]')?.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 7,
          clientX: 12,
          clientY: 12,
          isPrimary: false,
          pointerType: 'touch',
        }),
      );
    });
    await pointerUp(cdp, { x: placed.start.x + 28, y: placed.start.y });
    expect((await counts(page)).worker).toBe(base.worker);

    // Resize cancels.
    cdp = await pointerDown(page, placed.start);
    await pointerMove(cdp, { x: placed.start.x + 28, y: placed.start.y });
    await page.setViewportSize({ width: 1280, height: 900 });
    await pointerUp(cdp, { x: placed.start.x + 28, y: placed.start.y });
    expect((await counts(page)).worker).toBe(base.worker);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(detail.getByTestId('plan-diagram-top')).toBeVisible();

    // Outside the canvas still ends as one command, with none during the move.
    const again = await selectedBox(detail);
    const svgBox = await again.svg.boundingBox();
    const outside = {
      x: Math.max(1, (svgBox?.x ?? again.start.x) - 8),
      y: again.start.y,
    };
    cdp = await pointerDown(page, again.start);
    await pointerMove(cdp, outside);
    const outsideMid = await counts(page);
    expect(outsideMid.worker).toBe(base.worker);
    expect(outsideMid.idb).toBe(base.idb);
    await pointerUp(cdp, outside);
    await expect
      .poll(async () => (await counts(page)).worker, { timeout: 15000 })
      .toBe(base.worker + 1);
    const outsideSettled = await counts(page);
    await expect(page.getByTestId('edit-rejected').or(page.getByTestId('edit-section')).first()).toBeVisible({
      timeout: 15000,
    });
    // The release posted exactly one edit. A rejection keeps the prior plan.
    if (await page.getByTestId('edit-section').isVisible()) {
      const moved = await placementAt(page.getByTestId('edit-section'));
      expect(Number.isInteger(moved.x)).toBe(true);
      expect(Number.isInteger(moved.y)).toBe(true);
      expect(moved.z).toBe(origin.z);
      expect(moved.x !== origin.x || moved.y !== origin.y).toBe(true);
      expect(await placementAt(detail)).toEqual(origin);
      await expect(page.getByTestId('edit-section').getByTestId('accepted-badge')).toHaveCount(0);
      await expect(page.getByTestId('undo-edit')).toContainText('(1)');
    } else {
      expect(await placementAt(detail)).toEqual(origin);
      await expect(page.getByTestId('edit-section')).toBeHidden();
    }
    expect(outsideSettled.worker).toBe(base.worker + 1);

    // If the outside gesture was rejected, a modest in-range drag is the valid one.
    // If it committed, undo back to a clean chain and drag a known +30mm.
    if (await page.getByTestId('edit-section').isVisible()) {
      await page.getByTestId('undo-edit').click();
      await expect(page.getByTestId('undo-edit')).toContainText('(0)', { timeout: 15000 });
    }
    const quiet = await counts(page);
    const fresh = await selectedBox(alternativeDetail(page));
    // The sample bin sits on the back edge, so the free direction is decreasing depth.
    const towardFront = screenDelta(fresh.scale, 0, -15);
    const halfway = {
      x: fresh.start.x + towardFront.x / 2,
      y: fresh.start.y + towardFront.y / 2,
    };
    const end = { x: fresh.start.x + towardFront.x, y: fresh.start.y + towardFront.y };
    cdp = await pointerDown(page, fresh.start);
    await pointerMove(cdp, halfway);
    const dragging = await counts(page);
    expect(dragging.worker).toBe(quiet.worker);
    expect(dragging.idb).toBe(quiet.idb);
    await expect(alternativeDetail(page).getByTestId('drag-preview')).toHaveAttribute('data-valid', 'false');
    await pointerMove(cdp, end);
    expect((await counts(page)).worker).toBe(quiet.worker);
    await pointerUp(cdp, end);
    await expect(page.getByTestId('edit-section')).toBeVisible({ timeout: 15000 });
    expect((await counts(page)).worker).toBe(quiet.worker + 1);
    const edited = await placementAt(page.getByTestId('edit-section'));
    expect(edited.z).toBe(origin.z);
    expect(edited.x).toBe(origin.x);
    expect(Math.abs(edited.y - (origin.y - 15))).toBeLessThanOrEqual(2);
    expect(await placementAt(alternativeDetail(page))).toEqual(origin);
    const afterChecks = await checkStatuses(page.getByTestId('edit-section'));
    const unknownBefore = beforeChecks.filter((row) => row.status === 'unknown');
    const unknownAfter = afterChecks.filter((row) => row.status === 'unknown');
    expect(unknownAfter).toHaveLength(unknownBefore.length);
    for (const row of unknownAfter) {
      expect(row.text).toContain('미확인');
      expect(row.text.includes('확인됨')).toBe(false);
    }
    const altId = await alternativeDetail(page).getByTestId('snapshot-id').innerText();
    const editId = await page.getByTestId('edit-section').getByTestId('snapshot-id').innerText();
    expect(editId).not.toBe(altId);
    await expect(page.getByTestId('edit-section').getByTestId('bom-table')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
      timeout: 30000,
    });
    await expect(page.getByTestId('edit-section')).toBeVisible({ timeout: 30000 });
    expect(await placementAt(page.getByTestId('edit-section'))).toEqual(edited);
    await page.getByTestId('undo-edit').click();
    await expect(page.getByTestId('undo-edit')).toContainText('(0)', { timeout: 15000 });
    expect(await placementAt(page.getByTestId('edit-section'))).toEqual(origin);
    await page.getByTestId('redo-edit').click();
    await expect(page.getByTestId('undo-edit')).toContainText('(1)', { timeout: 15000 });
    expect(await placementAt(page.getByTestId('edit-section'))).toEqual(edited);

    // Front view does not drag a placement into a command.
    const held = await counts(page);
    await page.getByTestId('edit-section').getByTestId('view-front').click();
    const front = page.getByTestId('edit-section').getByTestId('plan-diagram-front');
    const frontBox = await front.boundingBox();
    if (frontBox) {
      const from = { x: frontBox.x + 40, y: frontBox.y + 40 };
      cdp = await pointerDown(page, from);
      await pointerMove(cdp, { x: from.x + 40, y: from.y });
      await pointerUp(cdp, { x: from.x + 40, y: from.y });
    }
    expect((await counts(page)).worker).toBe(held.worker);
    expect(errors).toEqual([]);
  });

  test('keyboard step is 1 mm, Shift is 10 mm, and a pending edit is not replaced', async ({ page }) => {
    const errors: string[] = [];
    collectErrors(page, errors);
    await page.addInitScript(() => {
      const w = window as unknown as { __zariEditRequests: number; __zariHoldEdit: boolean };
      w.__zariEditRequests = 0;
      w.__zariHoldEdit = false;
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
        const text = args[0];
        const edit = typeof text === 'string' && text.includes('"evaluateLayoutEdit"');
        if (edit) w.__zariEditRequests += 1;
        if (edit && w.__zariHoldEdit) {
          window.setTimeout(() => (post as (...a: unknown[]) => void).apply(this, args), 600);
          return;
        }
        return (post as (...a: unknown[]) => void).apply(this, args);
      } as Worker['postMessage'];
    });
    const workerCount = () =>
      page.evaluate(() => (window as unknown as { __zariEditRequests: number }).__zariEditRequests);
    await seededProject(page);
    await computeDone(page);
    await openFirstPlan(page);
    const detail = alternativeDetail(page);
    const origin = await placementAt(detail);
    const diagram = detail.getByTestId('plan-diagram-top');
    await diagram.focus();
    await expect(detail.getByTestId('move-step')).toContainText('1 mm');

    const before = await workerCount();
    await diagram.evaluate((el) => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });
    expect(await workerCount()).toBe(before);
    await expect(detail.getByTestId('drag-preview')).toBeVisible();
    await page.keyboard.up('ArrowUp');
    await expect(page.getByTestId('edit-section')).toBeVisible({ timeout: 15000 });
    expect(await workerCount()).toBe(before + 1);
    const nudged = await placementAt(page.getByTestId('edit-section'));
    expect(nudged).toEqual({ x: origin.x, y: origin.y - 2, z: origin.z });

    await page.getByTestId('undo-edit').click();
    await expect(page.getByTestId('undo-edit')).toContainText('(0)', { timeout: 15000 });

    const editDetail = page.getByTestId('edit-section').locator('[data-testid="plan-detail"]');
    await editDetail.getByTestId('plan-diagram-top').focus();
    await page.keyboard.down('Shift');
    await expect(editDetail.getByTestId('move-step')).toContainText('10 mm');
    const held = await workerCount();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.up('Shift');
    await expect(page.getByTestId('undo-edit')).toContainText('(1)', { timeout: 15000 });
    expect(await workerCount()).toBe(held + 1);
    expect(await placementAt(page.getByTestId('edit-section'))).toEqual({
      x: origin.x,
      y: origin.y - 10,
      z: origin.z,
    });
    await expect(editDetail.getByTestId('move-step')).toContainText('1 mm');

    // Space inside the coordinate field does not start a canvas pan.
    await detail.getByTestId('move-x').focus();
    await page.keyboard.press('Space');
    await expect(editDetail.getByTestId('plan-diagram-top')).toHaveAttribute('data-gesture', 'idle');
    await expect(editDetail.getByTestId('plan-workspace')).toHaveAttribute('data-canvas-mode', 'select');

    // While the worker reply is held, a second command is not posted.
    await page.evaluate(() => {
      (window as unknown as { __zariHoldEdit: boolean }).__zariHoldEdit = true;
    });
    await editDetail.getByTestId('plan-diagram-top').focus();
    const pendingBase = await workerCount();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByTestId('edit-pending').last()).toBeVisible();
    expect(await workerCount()).toBe(pendingBase + 1);
    await expect(detail.getByTestId('move-apply')).toBeDisabled();
    await page.keyboard.press('ArrowUp');
    expect(await workerCount()).toBe(pendingBase + 1);
    await expect(page.getByTestId('undo-edit')).toContainText('(2)', { timeout: 15000 });
    expect(await workerCount()).toBe(pendingBase + 1);
    expect(await placementAt(page.getByTestId('edit-section'))).toEqual({
      x: origin.x,
      y: origin.y - 11,
      z: origin.z,
    });
    expect(errors).toEqual([]);
  });

  test.describe('compact touch', () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

    test('a 390px touch move uses an explicit mode and does not freeze page scroll', async ({ page }) => {
    const errors: string[] = [];
    collectErrors(page, errors);
    await installCounters(page);
    await seededProject(page);
    await computeDone(page);
    await openFirstPlan(page);
    const detail = alternativeDetail(page);
    await expect(detail.getByTestId('plan-workspace')).toHaveAttribute('data-pointer', 'explicit');
    await expect(detail.getByTestId('plan-workspace')).toHaveAttribute('data-band', 'compact');
    const idleTouch = await detail.getByTestId('plan-diagram-top').evaluate((el) => getComputedStyle(el).touchAction);
    expect(idleTouch).not.toBe('none');
    const pageTouch = await page.evaluate(() => ({
      body: getComputedStyle(document.body).touchAction,
      html: getComputedStyle(document.documentElement).touchAction,
      scalable: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '',
    }));
    expect(pageTouch.body).not.toBe('none');
    expect(pageTouch.html).not.toBe('none');
    expect(pageTouch.scalable).not.toContain('user-scalable=no');

    // Close the inspector, then a drag in selection mode is not a command.
    const origin = await placementAt(detail);
    await detail.getByTestId('close-inspector').click();
    const blocked = await selectedBox(detail);
    const before = await counts(page);
    const blockedDrag = await pointerDown(page, blocked.start);
    await pointerMove(blockedDrag, { x: blocked.start.x + 40, y: blocked.start.y });
    await pointerUp(blockedDrag, { x: blocked.start.x + 40, y: blocked.start.y });
    expect((await counts(page)).worker).toBe(before.worker);

    const sheet = detail.locator('dialog');
    const sheetOpen = await sheet.evaluate((el) => el instanceof HTMLDialogElement && el.open).catch(() => false);
    if (!sheetOpen) await detail.getByTestId('open-inspector').click();
    await sheet.getByTestId('mode-move').click();
    await expect(detail.getByTestId('plan-workspace')).toHaveAttribute('data-canvas-mode', 'move');
    await expect(detail.getByTestId('plan-diagram-top')).toHaveAttribute('data-gesture', 'active');
    await expect(detail.getByTestId('plan-diagram-front')).toHaveAttribute('data-gesture', 'idle');
    expect(
      await detail.getByTestId('plan-diagram-top').evaluate((el) => getComputedStyle(el).touchAction),
    ).toBe('none');
    expect(await page.evaluate(() => getComputedStyle(document.body).touchAction)).not.toBe('none');
    expect(
      await page.evaluate(() => {
        const dialog = document.querySelector('dialog');
        return dialog instanceof HTMLDialogElement ? dialog.open : false;
      }),
    ).toBe(false);

    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { __zariInput: string[] }).__zariInput = seen;
      document.addEventListener('touchstart', () => seen.push('touchstart'), { capture: true });
      document.addEventListener(
        'pointerdown',
        (event) => {
          if (event.pointerType !== 'touch') return;
          (window as unknown as { __zariTouchId: number }).__zariTouchId = event.pointerId;
          seen.push(`pointer:touch:${event.pointerId}`);
        },
        { capture: true },
      );
    });
    const armed = await selectedBox(detail);
    const startCount = await counts(page);
    const towardFront = screenDelta(armed.scale, 0, -15);
    const drag = await pointerSession(page);
    const end = { x: armed.start.x + towardFront.x, y: armed.start.y + towardFront.y };
    await drag.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: armed.start.x, y: armed.start.y, radiusX: 1, radiusY: 1, force: 1 }],
    });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __zariInput: string[] }).__zariInput.join(',')))
      .toContain('pointer:touch');
    await drag.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: end.x, y: end.y, radiusX: 1, radiusY: 1, force: 1 }],
    });
    await expect(detail.getByTestId('plan-workspace')).toHaveAttribute('data-gesture-phase', 'preview');
    const mid = await counts(page);
    expect(mid.worker).toBe(startCount.worker);
    expect(mid.idb).toBe(startCount.idb);
    // CDP touchEnd does not carry the release point (empty touchPoints), so the
    // page commits from the pointerup at the last touch position.
    await page.evaluate(({ x, y }) => {
      const pointerId = (window as unknown as { __zariTouchId: number }).__zariTouchId;
      document.querySelector('[data-testid="plan-diagram-top"]')?.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          pointerId,
          clientX: x,
          clientY: y,
          isPrimary: true,
          pointerType: 'touch',
          button: 0,
        }),
      );
    }, end);
    await drag.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const finish = await detail.getByTestId('plan-diagram-top').getAttribute('data-last-finish');
    expect(finish).toBe('commit');
    expect((await counts(page)).worker).toBe(startCount.worker + 1);
    const moved = await placementAt(page.getByTestId('edit-section'));
    expect(moved.z).toBe(origin.z);
    expect(moved.x).toBe(origin.x);
    expect(Math.abs(moved.y - (origin.y - 15))).toBeLessThanOrEqual(2);
    expect(await placementAt(detail)).toEqual(origin);

    await page.emulateMedia({ forcedColors: 'active' });
    const contents = detail.getByTestId('layer-contents');
    if ((await contents.getAttribute('aria-pressed')) === 'true') await contents.click();
    const colored = await selectedBox(detail);
    const colorDrag = await pointerDown(page, colored.start);
    await pointerMove(colorDrag, { x: colored.start.x + 30, y: colored.start.y });
    const ghost = detail.locator('[data-testid="drag-preview"]');
    await expect(ghost).toBeVisible();
    const stroke = await ghost.evaluate((el) => getComputedStyle(el).stroke);
    expect(stroke === '' || stroke === 'none' || stroke === 'rgba(0, 0, 0, 0)').toBe(false);
    await pointerUp(colorDrag, { x: colored.start.x + 30, y: colored.start.y });
    expect(errors).toEqual([]);
    });
  });
});
