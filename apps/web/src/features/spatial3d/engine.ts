import type { Object3D } from 'three';
import {
  BoxGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SpatialTarget } from '../../contracts/generated/dto';
import { targetKey } from '../workspace/selection';
import { ORBIT, cameraPose, orthoHalfHeight, type CameraPreset, type Fit } from './camera';
import { clearTokenCache, roleToken, SPATIAL_TOKEN, tokenRgb } from './colors';
import { bodyMatrix, bindInstances, type InstanceBinding } from './pose';
import { PICK_EPSILON_M, resolvePick } from './pick';
import { ResourceRegistry } from './resources';
import type { ScenePlan, SpatialBody } from './scene';

export class WebglUnavailable extends Error {
  constructor() {
    super('webgl_unavailable');
    this.name = 'WebglUnavailable';
  }
}

export type SpatialAnchor = {
  key: string;
  label: string;
  x: number;
  y: number;
  visible: boolean;
  minMm: string;
  maxMm: string;
  targetKey: string;
  selected: boolean;
  focused: boolean;
  pickable: boolean;
};

export type EngineHandlers = {
  onFatal: (reason: 'webgl_unavailable' | 'context_lost') => void;
  onSelect: (target: SpatialTarget) => void;
  onAmbiguous: (targets: SpatialTarget[]) => void;
  onAnchors: (anchors: SpatialAnchor[]) => void;
};

type InstanceData = {
  targets?: SpatialTarget[];
  pickable?: boolean[];
};

let liveEngines = 0;

function publishLive(): void {
  document.documentElement.dataset.spatialLive = String(liveEngines);
}

function readColor(token: string): Color {
  const color = new Color();
  try {
    const resolved = tokenRgb(token);
    if (resolved) color.setStyle(resolved);
  } catch {
    color.set('#202520');
  }
  return color;
}

/**
 * One WebGL renderer, demand-rendered. Idle does not schedule frames.
 * Shadows, postprocessing, and external textures are not used.
 */
export class SpatialEngine {
  readonly renders = { count: 0 };
  private readonly registry = new ResourceRegistry();
  private readonly scene = new Scene();
  private readonly camera: OrthographicCamera;
  private readonly renderer: WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly cuboidGeometry: BoxGeometry;
  private readonly planeGeometry: PlaneGeometry;
  private readonly edgeGeometry: EdgesGeometry;
  private readonly solidMaterial: MeshBasicMaterial;
  private readonly planeMaterial: MeshBasicMaterial;
  private readonly selectionMaterial: LineBasicMaterial;
  private readonly focusMaterial: LineDashedMaterial;
  private readonly overlayMaterial: LineBasicMaterial;
  private readonly owned: Object3D[] = [];
  private readonly pickMeshes: InstancedMesh[] = [];
  private disposed = false;
  private suppress = false;
  private dirty = false;
  private visible = true;
  private frame = 0;
  private posed = false;
  private preset: CameraPreset = 'oblique';
  private bounds: Fit | null = null;
  private bodySig = '';
  private highlight = '';
  private plan: ScenePlan | null = null;
  private readyMarked = false;
  private readonly started = performance.now();
  private readonly onControl = () => {
    if (this.suppress || this.disposed) return;
    this.requestRender();
  };
  private readonly onLost = (event: Event) => {
    event.preventDefault();
    if (this.disposed) return;
    queueMicrotask(() => {
      if (this.disposed) return;
      this.handlers.onFatal('context_lost');
    });
  };
  private readonly onClick = (event: MouseEvent) => {
    if (this.disposed) return;
    this.pick(event.clientX, event.clientY);
  };
  private readonly onVisible = () => {
    if (!document.hidden) this.requestRender();
  };
  private readonly resizeObserver: ResizeObserver;
  private readonly intersectionObserver: IntersectionObserver;

  constructor(
    private readonly root: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly handlers: EngineHandlers,
  ) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      depth: true,
      stencil: false,
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'default',
      failIfMajorPerformanceCaveat: false,
    });
    if (!gl) throw new WebglUnavailable();
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        canvas,
        context: gl,
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: false,
        powerPreference: 'default',
        failIfMajorPerformanceCaveat: false,
      });
    } catch {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      throw new WebglUnavailable();
    }
    this.renderer = renderer;
    this.renderer.setClearColor(readColor(SPATIAL_TOKEN.canvas), 1);
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = ORBIT.minPolar;
    this.controls.maxPolarAngle = ORBIT.maxPolar;
    this.controls.minZoom = ORBIT.minZoom;
    this.controls.maxZoom = ORBIT.maxZoom;
    this.controls.maxTargetRadius = 0;
    this.controls.zoomToCursor = false;
    this.controls.addEventListener('change', this.onControl);
    this.controls.addEventListener('end', this.onControl);

    const unit = new BoxGeometry(1, 1, 1);
    this.edgeGeometry = this.registry.track(new EdgesGeometry(unit));
    unit.dispose();
    this.cuboidGeometry = this.registry.track(new BoxGeometry(1, 1, 1));
    this.planeGeometry = this.registry.track(new PlaneGeometry(1, 1));
    this.solidMaterial = this.registry.track(new MeshBasicMaterial({ color: 0xffffff }));
    this.planeMaterial = this.registry.track(
      new MeshBasicMaterial({
        color: readColor(SPATIAL_TOKEN.boundary),
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    );
    this.selectionMaterial = this.registry.track(
      new LineBasicMaterial({ color: readColor(SPATIAL_TOKEN.selection) }),
    );
    this.focusMaterial = this.registry.track(
      new LineDashedMaterial({
        color: readColor(SPATIAL_TOKEN.focus),
        dashSize: 0.008,
        gapSize: 0.005,
      }),
    );
    this.overlayMaterial = this.registry.track(
      new LineBasicMaterial({ color: readColor(SPATIAL_TOKEN.overlay) }),
    );
    this.edgeGeometry.computeBoundingSphere();
    new LineSegments(this.edgeGeometry).computeLineDistances();

    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('click', this.onClick);
    document.addEventListener('visibilitychange', this.onVisible);
    this.resizeObserver = new ResizeObserver(() => this.requestRender());
    this.resizeObserver.observe(root);
    this.intersectionObserver = new IntersectionObserver((entries) => {
      this.visible = entries.some((entry) => entry.isIntersecting);
      if (this.visible) this.requestRender();
    });
    this.intersectionObserver.observe(root);
    liveEngines += 1;
    publishLive();
    this.root.dataset.status = 'loading';
    this.root.dataset.renders = '0';
  }

  sync(plan: ScenePlan, preset: CameraPreset): void {
    if (this.disposed) return;
    let draw = false;
    this.plan = plan;
    if (plan.signature !== this.bodySig) {
      this.rebuild(plan);
      this.bodySig = plan.signature;
      draw = true;
    }
    if (plan.highlight !== this.highlight) {
      this.applyHighlight(plan);
      this.highlight = plan.highlight;
      draw = true;
    }
    if (plan.fit && (!this.posed || this.preset !== preset)) {
      this.applyPreset(preset, plan.fit);
      draw = true;
    } else if (plan.fit && this.bounds && fitKey(plan.fit) !== fitKey(this.bounds)) {
      this.retarget(plan.fit);
      draw = true;
    }
    this.bounds = plan.fit;
    if (draw || !this.readyMarked) this.requestRender();
  }

  zoom(factor: number): void {
    if (this.disposed) return;
    const next = Math.min(ORBIT.maxZoom, Math.max(ORBIT.minZoom, this.camera.zoom * factor));
    if (next === this.camera.zoom) return;
    this.camera.zoom = next;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  fit(): void {
    if (this.disposed) return;
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    if (this.bounds) this.applyPreset(this.preset, this.bounds);
    this.requestRender();
  }

  refreshColors(): void {
    if (this.disposed) return;
    clearTokenCache();
    this.renderer.setClearColor(readColor(SPATIAL_TOKEN.canvas), 1);
    this.planeMaterial.color.copy(readColor(SPATIAL_TOKEN.boundary));
    this.selectionMaterial.color.copy(readColor(SPATIAL_TOKEN.selection));
    this.focusMaterial.color.copy(readColor(SPATIAL_TOKEN.focus));
    this.overlayMaterial.color.copy(readColor(SPATIAL_TOKEN.overlay));
    if (this.plan) this.tintCuboids(this.plan);
    this.requestRender();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('click', this.onClick);
    document.removeEventListener('visibilitychange', this.onVisible);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.controls.removeEventListener('change', this.onControl);
    this.controls.removeEventListener('end', this.onControl);
    this.controls.dispose();
    this.releaseOwned();
    this.registry.dispose();
    const gl = this.renderer.getContext();
    this.renderer.dispose();
    // Release the context after our listener and Three's listener are gone.
    // A browser that already dropped this context must not be asked again.
    if (gl && !gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.scene.clear();
    liveEngines = Math.max(0, liveEngines - 1);
    publishLive();
  }

  private rebuild(plan: ScenePlan): void {
    this.releaseOwned();
    this.pickMeshes.length = 0;
    if (plan.cuboids.length > 0) {
      const mesh = new InstancedMesh(this.cuboidGeometry, this.solidMaterial, plan.cuboids.length);
      bindInstances(mesh, plan.cuboids.map(bindingOf));
      this.tintCuboids(plan, mesh);
      this.scene.add(mesh);
      this.owned.push(mesh);
      this.pickMeshes.push(mesh);
    }
    if (plan.planes.length > 0) {
      const mesh = new InstancedMesh(this.planeGeometry, this.planeMaterial, plan.planes.length);
      bindInstances(mesh, plan.planes.map(bindingOf));
      this.scene.add(mesh);
      this.owned.push(mesh);
      this.pickMeshes.push(mesh);
    }
    for (const edge of plan.edges) {
      const line = new LineSegments(this.edgeGeometry, this.overlayMaterial);
      line.matrix.copy(bodyMatrix(edge));
      line.matrixAutoUpdate = false;
      this.scene.add(line);
      this.owned.push(line);
    }
    this.applyHighlight(plan);
  }

  private tintCuboids(plan: ScenePlan, mesh?: InstancedMesh): void {
    const target =
      mesh ??
      this.pickMeshes.find((item) => item.geometry === this.cuboidGeometry);
    if (!target) return;
    plan.cuboids.forEach((body, index) => {
      target.setColorAt(index, readColor(roleToken(body.role)));
    });
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
  }

  private applyHighlight(plan: ScenePlan): void {
    for (const object of [...this.owned]) {
      if (object.userData.highlight === true) {
        this.scene.remove(object);
        object.removeFromParent();
        const index = this.owned.indexOf(object);
        if (index >= 0) this.owned.splice(index, 1);
      }
    }
    for (const body of plan.cuboids) {
      const key = targetKey(body.target);
      if (key === plan.selectedKey) this.addOutline(body, this.selectionMaterial);
      if (plan.focusKeys.includes(key)) this.addOutline(body, this.focusMaterial);
    }
  }

  private addOutline(body: SpatialBody, material: LineBasicMaterial | LineDashedMaterial): void {
    const line = new LineSegments(this.edgeGeometry, material);
    line.matrix.copy(bodyMatrix(body));
    line.matrixAutoUpdate = false;
    line.userData.highlight = true;
    this.scene.add(line);
    this.owned.push(line);
  }

  private applyPreset(preset: CameraPreset, fit: Fit): void {
    const pose = cameraPose(preset, fit);
    this.suppress = true;
    this.camera.up.set(pose.up[0], pose.up[1], pose.up[2]);
    this.camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    this.camera.zoom = 1;
    this.camera.near = 0.01;
    this.camera.far = Math.max(50, fit.radius * 40);
    this.controls.cursor.set(pose.target[0], pose.target[1], pose.target[2]);
    this.controls.target.set(pose.target[0], pose.target[1], pose.target[2]);
    this.controls.minDistance = fit.radius * ORBIT.minDistanceScale;
    this.controls.maxDistance = Math.max(fit.radius * ORBIT.maxDistanceScale, this.controls.minDistance + 0.01);
    this.controls.update();
    this.suppress = false;
    this.preset = preset;
    this.posed = true;
    this.bounds = fit;
    this.root.dataset.preset = preset;
  }

  private retarget(fit: Fit): void {
    this.suppress = true;
    this.controls.cursor.set(fit.center[0], fit.center[1], fit.center[2]);
    this.controls.target.set(fit.center[0], fit.center[1], fit.center[2]);
    this.controls.minDistance = fit.radius * ORBIT.minDistanceScale;
    this.controls.maxDistance = Math.max(fit.radius * ORBIT.maxDistanceScale, this.controls.minDistance + 0.01);
    this.camera.far = Math.max(50, fit.radius * 40);
    this.controls.update();
    this.suppress = false;
  }

  private requestRender(): void {
    if (this.disposed) return;
    this.dirty = true;
    if (this.frame !== 0) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.disposed) return;
      if (document.hidden || !this.visible) return;
      if (!this.dirty) return;
      this.dirty = false;
      this.draw();
    });
  }

  private draw(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const aspect = width / height;
    const half = this.bounds ? orthoHalfHeight(this.bounds.maxSpan, aspect) : 1;
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(width, height, false);
    const drawStart = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.root.dataset.frameMs = String(Math.round((performance.now() - drawStart) * 10) / 10);
    this.renders.count += 1;
    this.root.dataset.renders = String(this.renders.count);
    this.root.dataset.geometries = String(this.renderer.info.memory.geometries);
    this.root.dataset.textures = String(this.renderer.info.memory.textures);
    this.root.dataset.preset = this.preset;
    this.projectAnchors(width, height);
    if (!this.readyMarked) {
      this.readyMarked = true;
      this.root.dataset.status = 'ready';
      this.root.dataset.readyMs = String(Math.round(performance.now() - this.started));
    }
  }

  private projectAnchors(width: number, height: number): void {
    if (!this.plan) return;
    const point = new Vector3();
    const anchors: SpatialAnchor[] = [];
    for (const body of this.plan.cuboids) {
      if (!body.label) continue;
      point.set(body.center[0], body.center[1], body.center[2]);
      point.project(this.camera);
      const key = targetKey(body.target);
      anchors.push({
        key: body.key,
        label: body.label,
        x: (point.x * 0.5 + 0.5) * width,
        y: (-point.y * 0.5 + 0.5) * height,
        visible: point.z >= -1 && point.z <= 1,
        minMm: body.minMm.join(','),
        maxMm: body.maxMm.join(','),
        targetKey: key,
        selected: key === this.plan.selectedKey,
        focused: this.plan.focusKeys.includes(key),
        pickable: body.pickable,
      });
    }
    this.handlers.onAnchors(anchors);
  }

  private pick(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickMeshes, false);
    const mapped = [];
    for (const hit of hits) {
      const data = hit.object.userData as InstanceData;
      const id = hit.instanceId;
      if (id === undefined || !data.targets) continue;
      const target = data.targets[id];
      if (!target) continue;
      mapped.push({
        target,
        distance: hit.distance,
        pickable: data.pickable?.[id] !== false,
      });
    }
    const resolved = resolvePick(mapped, PICK_EPSILON_M);
    if (resolved.kind === 'one') this.handlers.onSelect(resolved.target);
    else if (resolved.kind === 'ambiguous') this.handlers.onAmbiguous(resolved.targets);
  }

  private releaseOwned(): void {
    for (const object of this.owned) {
      this.scene.remove(object);
      object.dispose?.();
    }
    this.owned.length = 0;
  }
}

function bindingOf(body: SpatialBody): InstanceBinding {
  return { matrix: bodyMatrix(body), target: body.target, pickable: body.pickable };
}

function fitKey(fit: Fit): string {
  const round = (value: number) => String(Math.round(value * 1000));
  return [round(fit.center[0]), round(fit.center[1]), round(fit.center[2]), round(fit.maxSpan), round(fit.radius)].join(',');
}
