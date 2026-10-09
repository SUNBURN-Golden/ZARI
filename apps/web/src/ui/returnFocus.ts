import { useEffect, useRef } from 'react';

/**
 * When a save, failure, or recovery control appears, move focus onto it.
 * When it goes away, return focus to the control the user had, if it is
 * still in the document. The call does not clear field values.
 */
export function useReturnFocus(active: boolean, testId: string): void {
  const previous = useRef<HTMLElement | null>(null);
  const shown = useRef(false);
  useEffect(() => {
    if (active && !shown.current) {
      const current = document.activeElement;
      previous.current =
        current instanceof HTMLElement && current !== document.body ? current : null;
      shown.current = true;
      document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.focus();
      return;
    }
    if (!active && shown.current) {
      shown.current = false;
      const node = previous.current;
      previous.current = null;
      if (node?.isConnected) node.focus();
    }
  }, [active, testId]);
}
