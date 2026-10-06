/**
 * Pause after a progress write so a test can switch the accepted binding
 * before the reply is merged. Read only from the test build.
 */
export async function holdProgressReply(): Promise<void> {
  const hold = (globalThis as { __zariProgressGate?: () => Promise<void> }).__zariProgressGate;
  if (typeof hold === 'function') await hold();
}
