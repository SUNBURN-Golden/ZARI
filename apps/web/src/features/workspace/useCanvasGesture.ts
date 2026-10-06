import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { LayoutEditCommand } from '../../contracts/generated/dto';
import {
  beginMove,
  beginPan,
  finishMove,
  matrixOf,
  updateMove,
  updatePan,
  type ClientPoint,
  type Gesture,
  type MmPoint,
} from './drag';
import type { WorkspaceLease } from './lease';
import type { Viewport } from './viewport';

type GestureHost = {
  enabledMove: boolean;
  enabledPan: boolean;
  placementId: string | null;
  origin: MmPoint | null;
  pending: boolean;
  blocked: boolean;
  spacePan: boolean;
  readLease: () => WorkspaceLease | null;
  fence: string;
  viewport: Viewport;
  onCommit: (command: LayoutEditCommand) => void;
  onPreview: (position: MmPoint | null) => void;
  onPan: (viewport: Viewport) => void;
  onPrecheck: (message: string | null) => void;
  onPhase: (phase: 'idle' | 'armed' | 'preview') => void;
};

function clientOf(event: { clientX: number; clientY: number }): ClientPoint {
  return { x: event.clientX, y: event.clientY };
}

function placementFromTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest('[data-target^="placement:"]');
  const raw = el?.getAttribute('data-target');
  return raw?.startsWith('placement:') ? raw.slice('placement:'.length) : null;
}

function hitSelectedSlop(svg: SVGSVGElement, placementId: string, client: ClientPoint): boolean {
  const el = svg.querySelector(`[data-target="placement:${CSS.escape(placementId)}"]`);
  if (!(el instanceof SVGGraphicsElement)) return false;
  const box = el.getBoundingClientRect();
  const minSide = Math.min(box.width, box.height);
  if (minSide >= 48) return false;
  const pad = (48 - minSide) / 2;
  return (
    client.x >= box.left - pad &&
    client.x <= box.right + pad &&
    client.y >= box.top - pad &&
    client.y <= box.bottom + pad
  );
}

/**
 * Pointer capture, threshold, and one command on pointerup.
 * pointermove only stores the latest sample and paints it on the next frame.
 */
export function useCanvasGesture(planeRef: RefObject<SVGGElement | null>, host: GestureHost) {
  const hostRef = useRef(host);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null);
  const bindSvg = useCallback((node: SVGSVGElement | null) => {
    svgRef.current = node;
    setSvgEl(node);
  }, []);
  hostRef.current = host;
  const gesture = useRef<Gesture | null>(null);
  const fenceAtStart = useRef<string>('');
  const latest = useRef<ClientPoint | null>(null);
  const raf = useRef(0);
  const releasing = useRef(false);
  const handlers = useRef<{
    move: (event: { clientX: number; clientY: number; pointerId: number }) => void;
    up: (event: { clientX: number; clientY: number; pointerId: number }) => void;
    cancel: (event: { clientX: number; clientY: number; pointerId: number }) => void;
  } | null>(null);

  function cancelRaf() {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
    latest.current = null;
  }

  function releaseCapture(pointerId: number) {
    const svg = svgRef.current;
    if (!svg || !svg.hasPointerCapture(pointerId)) return;
    releasing.current = true;
    svg.releasePointerCapture(pointerId);
  }

  function cancel() {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null;
    cancelRaf();
    releaseCapture(current.pointerId);
    hostRef.current.onPreview(null);
    hostRef.current.onPhase('idle');
  }

  function paint() {
    raf.current = 0;
    const current = gesture.current;
    const sample = latest.current;
    if (!current || !sample) return;
    const live = hostRef.current;
    if (current.kind === 'pan') {
      const svg = svgRef.current;
      if (!svg) return;
      const next = updatePan(current, sample, svg.clientWidth, svg.clientHeight);
      if (!next) {
        cancel();
        return;
      }
      live.onPan(next);
      return;
    }
    if (live.fence !== fenceAtStart.current || live.pending || live.blocked) {
      cancel();
      return;
    }
    const plane = planeRef.current;
    const ctm = plane?.getScreenCTM();
    const jsStarted = performance.now();
    const updated = updateMove(current, sample, ctm ? matrixOf(ctm) : null);
    const jsMs = performance.now() - jsStarted;
    if (updated.kind === 'cancel') {
      cancel();
      return;
    }
    gesture.current = updated.gesture;
    live.onPhase(updated.kind);
    live.onPreview(updated.kind === 'preview' ? updated.gesture.position : null);
    const svg = svgRef.current;
    if (svg && updated.kind === 'preview' && import.meta.env.MODE === 'test') {
      svg.dataset.previewJsMs = String(Math.round(jsMs * 10) / 10);
      const paintStarted = performance.now();
      requestAnimationFrame(() => {
        svg.dataset.previewPaintMs = String(Math.round((performance.now() - paintStarted) * 10) / 10);
      });
    }
  }

  function schedule() {
    if (raf.current) return;
    raf.current = requestAnimationFrame(paint);
  }

  useEffect(() => {
    if (!gesture.current) return;
    if (host.fence !== fenceAtStart.current || host.pending || host.blocked) cancel();
  }, [host.fence, host.pending, host.blocked]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel();
    };
    const onBlur = () => cancel();
    const onHide = () => {
      if (document.hidden) cancel();
    };
    const onResize = () => {
      if (gesture.current) cancel();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('resize', onResize);
    const onWindowDown = (event: PointerEvent) => {
      const current = gesture.current;
      if (current && event.pointerId !== current.pointerId) cancel();
    };
    const onWindowMove = (event: PointerEvent) => handlers.current?.move(event);
    const onWindowUp = (event: PointerEvent) => handlers.current?.up(event);
    const onWindowCancel = (event: PointerEvent) => handlers.current?.cancel(event);
    window.addEventListener('pointerdown', onWindowDown);
    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('pointerup', onWindowUp);
    window.addEventListener('pointercancel', onWindowCancel);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointerdown', onWindowDown);
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowCancel);
      cancelRaf();
    };
  }, []);

  useEffect(() => {
    const svg = svgEl;
    if (!svg || typeof ResizeObserver === 'undefined') return;
    let width = svg.clientWidth;
    let height = svg.clientHeight;
    const observer = new ResizeObserver(() => {
      if (svg.clientWidth === width && svg.clientHeight === height) return;
      width = svg.clientWidth;
      height = svg.clientHeight;
      if (gesture.current) cancel();
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [svgEl]);

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    const live = hostRef.current;
    if (gesture.current && gesture.current.pointerId !== event.pointerId) {
      cancel();
      return;
    }
    if (!event.isPrimary) {
      cancel();
      return;
    }
    const svg = svgRef.current;
    const plane = planeRef.current;
    if (!svg || !plane) return;
    const pan = event.button === 1 || (event.button === 0 && (live.enabledPan || live.spacePan));
    if (pan && !live.pending) {
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const started = beginPan({
        pointerId: event.pointerId,
        startClient: clientOf(event),
        ctm: matrixOf(ctm),
        viewport: live.viewport,
        width: svg.clientWidth,
        height: svg.clientHeight,
      });
      if (!started) return;
      gesture.current = started;
      fenceAtStart.current = live.fence;
      svg.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if ((event.button !== 0 && event.button !== -1) || !live.enabledMove || live.pending || live.blocked) return;
    const hit = placementFromTarget(event.target);
    const selected = live.placementId;
    if (!selected || !live.origin) return;
    if (hit !== selected && !hitSelectedSlop(svg, selected, clientOf(event))) return;
    const ctm = plane.getScreenCTM();
    const lease = live.readLease();
    if (!ctm || !lease) return;
    const started = beginMove({
      pointerId: event.pointerId,
      startClient: clientOf(event),
      origin: live.origin,
      placementId: selected,
      ctm: matrixOf(ctm),
      lease,
    });
    if (!started) return;
    gesture.current = started;
    fenceAtStart.current = live.fence;
    svg.setPointerCapture(event.pointerId);
    live.onPhase('armed');
    live.onPrecheck(null);
    event.preventDefault();
  }

  function onPointerMove(event: { clientX: number; clientY: number; pointerId: number }) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    latest.current = clientOf(event);
    schedule();
  }

  function onPointerUp(event: { clientX: number; clientY: number; pointerId: number }) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    cancelRaf();
    gesture.current = null;
    releaseCapture(event.pointerId);
    const live = hostRef.current;
    if (current.kind === 'pan') {
      const svg = svgRef.current;
      if (svg) {
        const next = updatePan(current, clientOf(event), svg.clientWidth, svg.clientHeight);
        if (next) live.onPan(next);
      }
      live.onPhase('idle');
      return;
    }
    const plane = planeRef.current;
    const ctm = plane?.getScreenCTM() ?? null;
    const finished = finishMove(
      current,
      clientOf(event),
      ctm ? matrixOf(ctm) : null,
      live.fence === fenceAtStart.current ? live.readLease() : null,
    );
    svgRef.current?.setAttribute(
      'data-last-finish',
      finished.kind === 'cancel' || finished.kind === 'precheck'
        ? `${finished.kind}:${'reason' in finished ? finished.reason : 'range'}`
        : finished.kind,
    );
    if (finished.kind === 'commit') live.onCommit(finished.command);
    live.onPreview(null);
    live.onPhase('idle');
    live.onPrecheck(finished.kind === 'precheck' ? finished.message : null);
  }

  function onPointerCancel(event: { pointerId: number }) {
    if (gesture.current?.pointerId === event.pointerId) cancel();
  }

  function onLostPointerCapture(event: ReactPointerEvent<SVGSVGElement>) {
    if (releasing.current) {
      releasing.current = false;
      return;
    }
    if (gesture.current?.pointerId === event.pointerId) cancel();
  }

  handlers.current = {
    move: onPointerMove,
    up: onPointerUp,
    cancel: onPointerCancel,
  };

  return { bindSvg, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture, cancel };
}
