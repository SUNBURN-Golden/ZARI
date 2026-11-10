import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/** Below this many rendered rows the plain list is kept. */
export const WINDOW_THRESHOLD = 1000;
export const WINDOW_OVERSCAN = 20;
/** Used until a rendered row has been measured. */
export const FALLBACK_ROW_HEIGHT = 480;

export interface RowRange {
  /** First rendered row, inclusive. */
  start: number;
  /** Last rendered row, exclusive. */
  end: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Pure index math for a fixed/mixed-height windowed list. `listTop` and
 * `scrollTop` are document coordinates; `rowHeight` is the measured average.
 * The returned range always lies inside `[0, count]`.
 */
export function windowRange(
  scrollTop: number,
  viewportHeight: number,
  listTop: number,
  rowHeight: number,
  count: number,
  overscan: number = WINDOW_OVERSCAN,
): RowRange {
  if (count <= 0) return { start: 0, end: 0 };
  const height = rowHeight > 0 ? rowHeight : 1;
  const firstVisible = Math.floor((scrollTop - listTop) / height);
  const visible = Math.ceil(viewportHeight / height);
  const start = clamp(firstVisible - overscan, 0, count);
  const end = clamp(firstVisible + visible + overscan, start, count);
  return { start, end };
}

export interface WindowedRows {
  /** True once more than WINDOW_THRESHOLD rows are rendered. */
  active: boolean;
  range: RowRange;
  /** Spacer height before and after the rendered rows, in pixels. */
  topHeight: number;
  bottomHeight: number;
  /** Attach to the results `<ul>`. */
  listRef: RefObject<HTMLUListElement | null>;
}

/**
 * Render only the rows near the viewport once the visible list grows past
 * WINDOW_THRESHOLD. Row height starts at `estimate` and is replaced by the
 * average height of the mounted rows, measured with ResizeObserver.
 */
export function useWindowedRows(count: number, estimate: number = FALLBACK_ROW_HEIGHT): WindowedRows {
  const active = count > WINDOW_THRESHOLD;
  const listRef = useRef<HTMLUListElement | null>(null);
  const [scrollTop, setScrollTop] = useState(() => (typeof window === 'undefined' ? 0 : window.scrollY));
  const [viewportHeight, setViewportHeight] = useState(() => (typeof window === 'undefined' ? 0 : window.innerHeight));
  const [listTop, setListTop] = useState(0);
  const [rowHeight, setRowHeight] = useState(estimate);

  const measure = useCallback(() => {
    setScrollTop(window.scrollY);
    setViewportHeight(window.innerHeight);
    const node = listRef.current;
    if (node) setListTop(node.getBoundingClientRect().top + window.scrollY);
  }, []);

  useEffect(() => {
    if (!active) return;
    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [active, measure, count]);

  const range = active
    ? windowRange(scrollTop, viewportHeight, listTop, rowHeight, count, WINDOW_OVERSCAN)
    : { start: 0, end: count };

  useEffect(() => {
    if (!active) return;
    const node = listRef.current;
    if (!node) return;
    const rows = node.querySelectorAll<HTMLElement>('li[data-candidate-id]');
    if (rows.length === 0) return;
    const observer = new ResizeObserver(() => {
      let total = 0;
      let seen = 0;
      for (const row of rows) {
        const height = row.getBoundingClientRect().height;
        if (height > 0) {
          total += height;
          seen += 1;
        }
      }
      if (seen === 0) return;
      const average = total / seen;
      setRowHeight((previous) => (Math.abs(previous - average) > 0.5 ? average : previous));
    });
    for (const row of rows) observer.observe(row);
    return () => observer.disconnect();
  }, [active, count, range.start, range.end]);

  return {
    active,
    range,
    topHeight: active ? range.start * rowHeight : 0,
    bottomHeight: active ? (count - range.end) * rowHeight : 0,
    listRef,
  };
}
