import { expect, test, type Page } from '@playwright/test';

/**
 * Real-browser evidence for the portable zip bundle. Chromium runs the full
 * suite; this file is also the Firefox and WebKit slice. No mocks.
 */

const WIDTH = { name: '공간 안쪽 폭', exact: true } as const;

function u16(value: number) {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
}
function u32(value: number) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}
function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (~crc) >>> 0;
}
function storedZip(name: string, data: Buffer, method = 0, uncompressed = data.length) {
  const nameBytes = Buffer.from(name);
  const crc = crc32(data);
  const local = Buffer.concat([
    u32(0x04034b50),
    u16(20),
    u16(0),
    u16(method),
    u16(0),
    u16(0),
    u32(crc),
    u32(data.length),
    u32(uncompressed),
    u16(nameBytes.length),
    u16(0),
    nameBytes,
    data,
  ]);
  const central = Buffer.concat([
    u32(0x02014b50),
    u16(20),
    u16(20),
    u16(0),
    u16(method),
    u16(0),
    u16(0),
    u32(crc),
    u32(data.length),
    u32(uncompressed),
    u16(nameBytes.length),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(0),
    nameBytes,
  ]);
  return Buffer.concat([
    local,
    central,
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(1),
    u16(1),
    u32(central.length),
    u32(local.length),
    u16(0),
  ]);
}

async function createProject(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
}

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

test('portable export and import keep the measurement and state the photo policy', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  await page.getByRole('textbox', WIDTH).fill('640');
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  const sourceId = page.url().split('/').pop()!;
  await expect(page.getByTestId('portable-policy')).toContainText('사진 바이트는 포함하지 않습니다');
  await expect(page.getByTestId('portable-policy')).toContainText('위치정보');
  await expect(page.getByTestId('portable-policy')).toContainText('원본은 지우지 않습니다');
  await page.getByTestId('portable-include-catalog').focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('portable-include-catalog')).not.toBeChecked();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('portable-include-catalog')).toBeChecked();

  await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="portable-panel"]');
    const states = new Set<string>();
    if (panel) {
      const observer = new MutationObserver(() => {
        states.add(panel.getAttribute('data-state') ?? '');
      });
      observer.observe(panel, { attributes: true, attributeFilter: ['data-state'] });
    }
    (window as unknown as { __portableStates: Set<string> }).__portableStates = states;
  });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('portable-export').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-portable\.zip$/);
  await expect(page.getByTestId('portable-ready')).toBeVisible();
  const states = await page.evaluate(() => [
    ...(window as unknown as { __portableStates: Set<string> }).__portableStates,
  ]);
  expect(states).toContain('working');
  const file = await download.path();

  await page.getByRole('link', { name: '프로젝트 목록' }).click();
  await page.getByTestId('import-file').setInputFiles(file!);
  await expect(page.getByTestId('import-review')).toContainText('사진 바이트 제외');
  await page.getByTestId('import-confirm').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  expect(page.url()).not.toContain(sourceId);
  await expect(page.getByRole('textbox', WIDTH)).toHaveValue('640');

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(true);
  }
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.getByTestId('portable-policy')).toBeVisible();
  await expect(page.getByTestId('portable-export')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('a bomb, a path escape, and an old bundle leave the project in place', async ({ page }) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  await page.getByRole('textbox', WIDTH).fill('640');
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  const sourceId = page.url().split('/').pop()!;
  await page.getByRole('link', { name: '프로젝트 목록' }).click();

  const cases: { name: string; body: Buffer; text: string }[] = [
    {
      name: 'bomb.zip',
      body: storedZip('manifest.json', Buffer.from([1, 2, 3, 4]), 8, 50_000_000),
      text: '압축 폭탄',
    },
    {
      name: 'escape.zip',
      body: storedZip('../secret.json', Buffer.from('{}')),
      text: '경로가 묶음 밖으로',
    },
    {
      name: 'old.zip',
      body: storedZip(
        'manifest.json',
        Buffer.from(
          '{"portableBundleVersion":0,"kind":"zari-portable","producer":{"app":"zari-web","schemaVersion":1,"buildId":"zari-domain-7"},"exportedAt":"2026-10-09T00:00:00.000Z","inclusion":{"project":false,"observations":false,"catalog":false,"snapshotAttachments":false},"policy":{"photoBytes":"excluded","location":"stripped","personalData":"omitted"},"members":[]}',
        ),
      ),
      text: '지원하지 않는 묶음 버전',
    },
  ];
  for (const item of cases) {
    await page.getByTestId('import-file').setInputFiles({
      name: item.name,
      mimeType: 'application/zip',
      buffer: item.body,
    });
    await expect(page.getByTestId('import-rejected')).toContainText(item.text);
    await expect(page.getByTestId('project-list').locator('li')).toHaveCount(1);
    await expect(page.getByTestId(`project-row-${sourceId}`)).toBeVisible();
  }
  expect(errors).toEqual([]);
});
