import type { Locator } from '@playwright/test';

/** C1: open only the workspace whose controls the test will use. */
export async function openViewOptions(workspace: Locator): Promise<void> {
  const toggle = workspace.getByTestId('view-options-toggle');
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
}
