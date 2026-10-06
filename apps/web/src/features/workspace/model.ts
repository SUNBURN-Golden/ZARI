import type { SpatialTarget } from '../../contracts/generated/dto';

/**
 * Workspace interaction model frozen for SP-003–SP-005.
 * This is a TypeScript view state, not a domain DTO and not a persisted record.
 * View, pan, zoom, layers, selection and focus never call session.edit,
 * bump the editor epoch, or write projectRevision.
 *
 * `selectedPlacementId` on ProjectSession stays the compatibility adapter:
 * it is set only when `selection` is a placement. A contained item keeps its
 * own `itemInstance` target and does not become the parent placement.
 */

export type DisplayBinding = {
  projectId: string;
  sourceKey: string;
  planSnapshotId: string | null;
  inputDigest: string;
};

export type WorkspaceFocus =
  | { kind: 'none' }
  | { kind: 'measurement'; fieldPath: string }
  | { kind: 'check'; checkId: string }
  | { kind: 'bom'; bomLineId: string }
  | { kind: 'action'; stepId: string };

/** `spatial` is reserved for SP-005. This node does not expose that control. */
export type WorkspaceView = 'top' | 'front' | 'spatial';

export type WorkspaceLayers = {
  dimensions: boolean;
  contents: boolean;
  checks: boolean;
};

export type WorkspaceState = {
  binding: DisplayBinding;
  selection: SpatialTarget | null;
  hover: SpatialTarget | null;
  focus: WorkspaceFocus;
  view: WorkspaceView;
  layers: WorkspaceLayers;
  projectionState: 'loading' | 'ready' | 'failed';
};

export function initialWorkspace(binding: DisplayBinding): WorkspaceState {
  return {
    binding,
    selection: null,
    hover: null,
    focus: { kind: 'none' },
    view: 'top',
    layers: { dimensions: true, contents: true, checks: false },
    projectionState: 'loading',
  };
}

export function sameSource(a: DisplayBinding, b: DisplayBinding): boolean {
  return a.projectId === b.projectId && a.sourceKey === b.sourceKey;
}

/**
 * A new source clears selection, hover and focus. The same project's
 * measurement focus (no plan snapshot) is kept, because that focus is the
 * field the user is editing, not an object id from the previous snapshot.
 * View is kept; the viewport fit/reset is the viewport module's job.
 */
export function bindWorkspace(state: WorkspaceState, binding: DisplayBinding): WorkspaceState {
  if (
    sameSource(state.binding, binding) &&
    state.binding.planSnapshotId === binding.planSnapshotId &&
    state.binding.inputDigest === binding.inputDigest
  ) {
    return state;
  }
  if (sameSource(state.binding, binding)) {
    return { ...state, binding };
  }
  const keepMeasurement =
    binding.planSnapshotId === null &&
    state.binding.planSnapshotId === null &&
    state.binding.projectId === binding.projectId &&
    state.focus.kind === 'measurement';
  return {
    ...initialWorkspace(binding),
    view: state.view,
    focus: keepMeasurement ? state.focus : { kind: 'none' },
  };
}

export function selectWorkspace(
  state: WorkspaceState,
  selection: SpatialTarget | null,
): WorkspaceState {
  return { ...state, selection };
}

export function hoverWorkspace(
  state: WorkspaceState,
  hover: SpatialTarget | null,
): WorkspaceState {
  return { ...state, hover };
}

export function focusWorkspace(state: WorkspaceState, focus: WorkspaceFocus): WorkspaceState {
  return { ...state, focus };
}

export function viewWorkspace(state: WorkspaceState, view: WorkspaceView): WorkspaceState {
  if (state.view === view) return state;
  return { ...state, view };
}

export function layerWorkspace(
  state: WorkspaceState,
  layer: keyof WorkspaceLayers,
  on: boolean,
): WorkspaceState {
  if (state.layers[layer] === on) return state;
  return { ...state, layers: { ...state.layers, [layer]: on } };
}

export function projectionWorkspace(
  state: WorkspaceState,
  projectionState: WorkspaceState['projectionState'],
): WorkspaceState {
  if (state.projectionState === projectionState) return state;
  return { ...state, projectionState };
}
