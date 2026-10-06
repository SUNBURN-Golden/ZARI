/**
 * Display-only pan/zoom. Fit scale is 1. The range is 0.5–8× that fit.
 * Domain millimetres are not changed. Screen inversion is `scale(1,-1)`
 * applied by the SVG; this module's CTM is the same transform inverted.
 */

export const TOP_PAD = 20;
export const FRONT_PAD = 16;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 8;
export const ZOOM_STEP = 1.25;

export type PlaneView = 'top' | 'front';

export type Viewport = {
  zoom: number;
  /** Pan is in SVG user units, added to the fit-viewBox center. */
  panX: number;
  panY: number;
};

export type FrameMm = { width: number; height: number };

export type ViewBox = { x: number; y: number; width: number; height: number };

export type Point = { x: number; y: number };

export function viewPad(view: PlaneView): number {
  return view === 'top' ? TOP_PAD : FRONT_PAD;
}

export function fitViewport(): Viewport {
  return { zoom: 1, panX: 0, panY: 0 };
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** View box at zoom 1. Matches the pre-workspace diagram exactly. */
export function fittedViewBox(frame: FrameMm, pad: number): ViewBox {
  return {
    x: -pad,
    y: -(frame.height + pad),
    width: frame.width + pad * 2,
    height: frame.height + pad * 2,
  };
}

export function zoomedViewBox(frame: FrameMm, pad: number, viewport: Viewport): ViewBox {
  const fit = fittedViewBox(frame, pad);
  const width = fit.width / viewport.zoom;
  const height = fit.height / viewport.zoom;
  const cx = fit.x + fit.width / 2 + viewport.panX;
  const cy = fit.y + fit.height / 2 + viewport.panY;
  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
  };
}

export function viewBoxAttr(box: ViewBox): string {
  return `${box.x} ${box.y} ${box.width} ${box.height}`;
}

/** Domain plane point → SVG user point under `scale(1,-1)`. */
export function domainToSvg(domain: Point): Point {
  return { x: domain.x, y: -domain.y };
}

/** Inverse of {@link domainToSvg}. */
export function svgToDomain(svg: Point): Point {
  return { x: svg.x, y: -svg.y };
}

export function svgToFraction(svg: Point, viewBox: ViewBox): Point {
  return {
    x: (svg.x - viewBox.x) / viewBox.width,
    y: (svg.y - viewBox.y) / viewBox.height,
  };
}

export function fractionToSvg(fraction: Point, viewBox: ViewBox): Point {
  return {
    x: viewBox.x + fraction.x * viewBox.width,
    y: viewBox.y + fraction.y * viewBox.height,
  };
}

export function domainToFraction(
  domain: Point,
  frame: FrameMm,
  pad: number,
  viewport: Viewport,
): Point {
  return svgToFraction(domainToSvg(domain), zoomedViewBox(frame, pad, viewport));
}

export function fractionToDomain(
  fraction: Point,
  frame: FrameMm,
  pad: number,
  viewport: Viewport,
): Point {
  return svgToDomain(fractionToSvg(fraction, zoomedViewBox(frame, pad, viewport)));
}

/**
 * Change zoom while keeping `anchor` (domain mm) at the same viewBox fraction.
 * The fraction is the inverse of the same CTM used to paint.
 */
export function zoomAboutDomain(
  frame: FrameMm,
  pad: number,
  viewport: Viewport,
  anchor: Point,
  nextZoom: number,
): Viewport {
  const zoom = clampZoom(nextZoom);
  const fraction = domainToFraction(anchor, frame, pad, viewport);
  const fit = fittedViewBox(frame, pad);
  const svg = domainToSvg(anchor);
  const width = fit.width / zoom;
  const height = fit.height / zoom;
  const centerX = fit.x + fit.width / 2;
  const centerY = fit.y + fit.height / 2;
  return {
    zoom,
    panX: svg.x - centerX + width / 2 - fraction.x * width,
    panY: svg.y - centerY + height / 2 - fraction.y * height,
  };
}

export function frameCenter(frame: FrameMm): Point {
  return { x: frame.width / 2, y: frame.height / 2 };
}

export function zoomBy(viewport: Viewport, frame: FrameMm, pad: number, factor: number): Viewport {
  return zoomAboutDomain(frame, pad, viewport, frameCenter(frame), viewport.zoom * factor);
}
