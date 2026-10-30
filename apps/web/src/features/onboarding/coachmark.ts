export const COACHMARK_KEY = 'zari-coachmark:v1';
export const COACHMARK_FORCE_KEY = 'zari-coachmark:force';
export function shouldShowCoachmark(storage: Storage | null, nav: { webdriver?: boolean }): boolean {
  try {
    if (!storage || storage.getItem(COACHMARK_KEY)) return false;
    // Verify persistence without changing completion; disabled storage fails closed.
    const probe = 'zari-coachmark:probe';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return nav.webdriver !== true || storage.getItem(COACHMARK_FORCE_KEY) === '1';
  } catch { return false; }
}
