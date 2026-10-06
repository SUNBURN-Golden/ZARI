import type { SnapshotContent, SpatialProjection } from '../src/contracts/generated/dto';
import { SpatialEngine, WebglUnavailable } from '../src/features/spatial3d/engine';
import { accountElements, planScene, type Cutaway } from '../src/features/spatial3d/scene';
import type { WorkspaceLayers } from '../src/features/workspace/model';

const layers: WorkspaceLayers = { dimensions: true, contents: true, checks: false };
const closed: Cutaway = { hideFront: true, hideTop: true, interiorPlacementId: null };

export interface SpatialStageSample {
  webgl: boolean;
  reason: string | null;
  sceneMs: number[];
  readyMs: number | null;
  frameMs: number[];
  idleDelta: number | null;
  pendingAfterIdle: string | null;
  geometries: number | null;
  geometriesAtReady: number | null;
  textures: number | null;
  unclassified: number;
  drawn: number;
  unavailable: number;
  elementCount: number;
  liveAfter: string | null;
  disposeCycles: number;
  geometryStable: boolean | null;
}

function host(): { root: HTMLDivElement; canvas: HTMLCanvasElement } {
  const root = document.createElement('div');
  root.style.width = '640px';
  root.style.height = '480px';
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  root.append(canvas);
  document.body.append(root);
  return { root, canvas };
}

function waitReady(root: HTMLElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const tick = () => {
      if (root.dataset.status === 'ready') {
        resolve();
        return;
      }
      if (performance.now() - started > 8000) {
        reject(new Error('spatial_ready_timeout'));
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/**
 * Time scene build, first frame, changed frames, a 5s idle window, and
 * dispose. The caller supplies one Rust projection. This does not fetch.
 */
export async function measureSpatial(
  projection: SpatialProjection,
  content: SnapshotContent,
  frameSamples: number,
): Promise<SpatialStageSample> {
  const accounts = accountElements(projection, layers, closed);
  const base = {
    unclassified: accounts.filter((item) => item.disposition === 'unclassified').length,
    drawn: accounts.filter((item) => item.disposition === 'mesh' || item.disposition === 'boundary').length,
    unavailable: accounts.filter((item) => item.disposition === 'unavailable').length,
    elementCount: projection.elements.length,
  };
  const { root, canvas } = host();
  let engine: SpatialEngine;
  try {
    engine = new SpatialEngine(root, canvas, {
      onFatal: () => undefined,
      onSelect: () => undefined,
      onAmbiguous: () => undefined,
      onAnchors: () => undefined,
    });
  } catch (error) {
    root.remove();
    return {
      ...base,
      webgl: false,
      reason: error instanceof WebglUnavailable ? 'webgl_unavailable' : 'spatial_engine_failed',
      sceneMs: [],
      readyMs: null,
      frameMs: [],
      idleDelta: null,
      pendingAfterIdle: null,
      geometries: null,
      geometriesAtReady: null,
      textures: null,
      liveAfter: document.documentElement.dataset.spatialLive ?? null,
      disposeCycles: 0,
      geometryStable: null,
    };
  }
  const sceneMs: number[] = [];
  const frameMs: number[] = [];
  const plan = () => {
    const started = performance.now();
    const next = planScene(projection, content, layers, null, { kind: 'none' }, closed);
    sceneMs.push(performance.now() - started);
    return next;
  };
  try {
    const original = plan();
    engine.sync(original, 'oblique');
    await waitReady(root);
    const readyMs = Number(root.dataset.readyMs ?? 'NaN');
    const geometriesAtReady = root.dataset.geometries ?? null;
    for (let i = 0; i < frameSamples; i += 1) {
      const selection =
        projection.elements.find((element) => element.target.kind === 'placement')?.target ?? null;
      const started = performance.now();
      const next = planScene(
        projection,
        content,
        layers,
        i % 2 === 0 ? selection : null,
        { kind: 'none' },
        closed,
      );
      sceneMs.push(performance.now() - started);
      const before = root.dataset.renders ?? '0';
      engine.sync(next, i % 2 === 0 ? 'top' : 'front');
      const frames = performance.now();
      await new Promise<void>((resolve) => {
        const check = () => {
          if ((root.dataset.renders ?? '0') !== before || performance.now() - frames > 1000) {
            resolve();
            return;
          }
          requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      });
      const draw = Number(root.dataset.frameMs);
      frameMs.push(Number.isFinite(draw) ? draw : performance.now() - frames);
    }
    const waitDrawn = (before: string) =>
      new Promise<void>((resolve) => {
        const started = performance.now();
        const check = () => {
          if ((root.dataset.renders ?? '0') !== before || performance.now() - started > 1000) {
            resolve();
            return;
          }
          requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      });
    const idleStart = Number(root.dataset.renders ?? '0');
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const idleDelta = Number(root.dataset.renders ?? '0') - idleStart;
    const pendingAfterIdle = root.dataset.pendingFrame ?? '0';
    engine.sync(original, 'oblique');
    await waitDrawn(String(idleStart + idleDelta));
    // The shared EdgesGeometry is uploaded on the first selection outline, so
    // the count may be one higher than first ready. A second selection must
    // not allocate another geometry.
    const warmed = root.dataset.geometries ?? null;
    const selection =
      projection.elements.find((element) => element.target.kind === 'placement')?.target ?? null;
    const selected = planScene(projection, content, layers, selection, { kind: 'none' }, closed);
    engine.sync(selected, 'oblique');
    await waitDrawn(root.dataset.renders ?? '0');
    engine.sync(original, 'oblique');
    await waitDrawn(root.dataset.renders ?? '0');
    const geometries = Number(root.dataset.geometries ?? 'NaN');
    const textures = Number(root.dataset.textures ?? 'NaN');
    const geometryStable = warmed !== null && root.dataset.geometries === warmed;
    engine.dispose();
    root.remove();
    let disposeCycles = 0;
    let disposeReason: string | null = null;
    for (let i = 0; i < 20; i += 1) {
      const again = host();
      try {
        const next = new SpatialEngine(again.root, again.canvas, {
          onFatal: () => undefined,
          onSelect: () => undefined,
          onAmbiguous: () => undefined,
          onAnchors: () => undefined,
        });
        next.sync(planScene(projection, content, layers, null, { kind: 'none' }, closed), 'oblique');
        await waitReady(again.root);
        next.dispose();
        disposeCycles += 1;
      } catch (error) {
        disposeReason = error instanceof Error ? error.message : 'dispose_cycle_failed';
        break;
      } finally {
        again.root.remove();
      }
    }
    return {
      ...base,
      webgl: true,
      reason: disposeReason,
      sceneMs,
      readyMs: Number.isFinite(readyMs) ? readyMs : null,
      frameMs,
      idleDelta,
      pendingAfterIdle,
      geometries: Number.isFinite(geometries) ? geometries : null,
      geometriesAtReady: geometriesAtReady === null ? null : Number(geometriesAtReady),
      textures: Number.isFinite(textures) ? textures : null,
      liveAfter: document.documentElement.dataset.spatialLive ?? null,
      disposeCycles,
      geometryStable,
    };
  } catch (error) {
    engine.dispose();
    root.remove();
    return {
      ...base,
      webgl: true,
      reason: error instanceof Error ? error.message : 'spatial_measure_failed',
      sceneMs,
      readyMs: null,
      frameMs,
      idleDelta: null,
      pendingAfterIdle: null,
      geometries: null,
      geometriesAtReady: null,
      textures: null,
      liveAfter: document.documentElement.dataset.spatialLive ?? null,
      disposeCycles: 0,
      geometryStable: null,
    };
  }
}
