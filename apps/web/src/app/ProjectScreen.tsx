import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button } from 'react-aria-components';
import type { ProjectInput } from '../contracts/generated/dto';
import { inputSourceKey, readInputProjection } from '../features/plan/projection';
import { MeasurementDiagram } from '../features/workspace/MeasurementDiagram';
import { useWorkspace } from '../features/workspace/Workspace';
import { fieldCaption, preferredMeasureView } from '../features/workspace/projection';
import { AttachmentManager } from '../features/attachments/model';
import { reencodeImage } from '../features/attachments/image';
import { DetailMeasure } from '../features/project/DetailPanel';
import { NextFactsList } from '../features/project/NextFactsList';
import { diagnosticText, uncertaintyLabel } from '../features/project/detailFacts';
import {
  fieldPathFor,
  getMeasurement,
  sampleProjectForm,
  MEASUREMENT_FIELDS,
  type MeasurementField,
} from '../features/project/draft';
import type { ProjectSession, SessionSnapshot } from '../features/project/session';
import type { AttachmentRow, CatalogRow, OwnedContainerRow } from '../persistence/db';
import { InventoryPanel } from '../features/inventory/InventoryPanel';
import { ownedToRaw } from '../features/owned/model';
import { DimensionField } from '../ui/DimensionField';
import {
  acquireSession,
  discardSession,
  releaseSession,
  repository,
  workerController,
} from './sessionRegistry';
import { navigate } from './router';

const FIELD_LABELS: Record<MeasurementField, string> = {
  'space.interior.width': '공간 안쪽 폭',
  'space.interior.depth': '공간 안쪽 깊이',
  'space.interior.height': '공간 안쪽 높이',
  'space.opening.width': '개구부 폭',
  'space.opening.height': '개구부 높이',
  'items.item-a.dimensions.envelope.width': '물건 A 폭',
  'items.item-a.dimensions.envelope.depth': '물건 A 깊이',
  'items.item-a.dimensions.envelope.height': '물건 A 높이',
  'items.item-b.dimensions.envelope.width': '물건 B 폭',
  'items.item-b.dimensions.envelope.depth': '물건 B 깊이',
  'items.item-b.dimensions.envelope.height': '물건 B 높이',
};

const UNKNOWN_REASON: Record<string, string> = {
  notMeasured: '미측정',
  notProvided: '미제공',
  sourceMissing: '출처 없음',
  conflictingSources: '출처 충돌',
};

/** Read one normalized measurement fact for display; never recomputes. */
function normalizedAt(input: ProjectInput | null, field: MeasurementField) {
  if (!input) return null;
  const parts = field.split('.');
  if (parts[0] === 'space') {
    let node: unknown = input.space;
    for (const seg of parts.slice(1)) {
      if (typeof node !== 'object' || node === null) return null;
      node = (node as Record<string, unknown>)[seg];
    }
    return node as { state: string; value?: { nominal: number }; reason?: string };
  }
  const item = input.items.find((i) => i.id === parts[1]);
  if (!item) return null;
  const axis = parts.at(-1) as 'width' | 'depth' | 'height';
  return item.dimensions.envelope[axis] as {
    state: string;
    value?: { nominal: number };
    reason?: string;
  };
}

function normalizedText(input: ProjectInput | null, field: MeasurementField): string {
  const fact = normalizedAt(input, field);
  if (!fact) return '—';
  if (fact.state === 'known' && fact.value) return `${fact.value.nominal} mm`;
  if (fact.state === 'notApplicable') return '해당 없음';
  return UNKNOWN_REASON[fact.reason ?? ''] ?? '미확인';
}

const SAVE_TEXT: Record<SessionSnapshot['saveState'], string> = {
  idle: '저장된 상태입니다',
  dirty: '저장 대기 중',
  saving: '저장 중…',
  saved: '저장됨',
  error: '저장 실패 — 입력은 이 화면에 유지됩니다',
  conflict: '다른 탭에서 먼저 저장되었습니다',
  unsupported: '이 프로젝트는 더 새로운 형식입니다 — 쓰기가 중단되었습니다',
};

function FieldGroup({
  session,
  state,
  fields,
  focused,
  setFocused,
  blocked,
}: {
  session: ProjectSession;
  state: SessionSnapshot;
  fields: MeasurementField[];
  focused: MeasurementField | null;
  setFocused: (f: MeasurementField | null) => void;
  blocked: (field: MeasurementField) => 'stale' | 'invalid' | null;
}) {
  const fieldError = (field: MeasurementField) => {
    const d = state.diagnostics.find((entry) => fieldPathFor(entry.fieldPath) === field);
    return d ? diagnosticText(d.code, d.fieldPath) : undefined;
  };
  return (
    <>
      {fields.map((field) => {
        const measurement = state.form ? getMeasurement(state.form, field) : null;
        if (!measurement) return null;
        return (
          <div key={field} data-focused={focused === field} className="measure-field">
            <DimensionField
              id={field}
              label={FIELD_LABELS[field]}
              value={measurement.text}
              unit={measurement.unit}
              onChange={(text) => session.edit(field, text)}
              onUnitChange={(unit) => session.setUnit(field, unit)}
              onFocus={() => setFocused(field)}
              onBlur={() => setFocused(null)}
              error={fieldError(field)}
            />
            <span className="normalized-value" data-testid={`normalized-${field}`} data-historical={blocked(field) ? 'true' : undefined}>
              {normalizedText(state.normalizedInput, field)}
            </span>
            <span
              className="uncertainty-status"
              data-testid={`uncertainty-${field}`}
              data-uncertainty={measurement.uncertainty.state}
            >
              {uncertaintyLabel(measurement.uncertainty)}
            </span>
            {blocked(field) && (
              <span className="session-note">{blocked(field) === 'invalid' ? '이전 확인 값' : '입력 변경 · 이전 측정'}</span>
            )}
          </div>
        );
      })}
    </>
  );
}

/**
 * Catalog pin + owned-container library panels (Ticket 008). The pin selects
 * the exact catalog digest the next committed input binds; owned entries are
 * embedded by value so a later catalog edit cannot rewrite stored facts.
 */
function CatalogAndOwned({
  session,
  state,
}: {
  session: ProjectSession;
  state: SessionSnapshot;
}) {
  const [catalogs, setCatalogs] = useState<CatalogRow[] | null>(null);
  const [owned, setOwned] = useState<OwnedContainerRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([repository.listCatalogs(), repository.listOwnedContainers()])
      .then(([c, o]) => {
        if (alive) {
          setCatalogs(c);
          setOwned(o);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  if (!state.form) return null;
  const pin = state.form.catalogPin;
  const inDraft = new Set(state.form.ownedContainers.map((o) => o.id));
  return (
    <section className="measurement-panel" aria-labelledby="catalog-title">
      <div className="section-kicker">02.5 · 카탈로그와 보유 수납함</div>
      <h2 id="catalog-title">계산에 사용할 자료</h2>
      <label className="edit-inspector-field">
        <span>카탈로그 선택</span>
        <select
          value={pin.catalogDigest}
          data-testid="catalog-pin-select"
          onChange={(e) => {
            const row = catalogs?.find((c) => c.catalogDigest === e.target.value);
            if (row)
              session.setCatalogPin({
                catalogVersion: row.catalogVersion,
                catalogDigest: row.catalogDigest,
              });
          }}
        >
          {!(catalogs ?? []).some((c) => c.catalogDigest === pin.catalogDigest) && (
            <option value={pin.catalogDigest}>
              {pin.catalogVersion} (목록에 없음 — 저장된 카탈로그와 다를 수 있습니다)
            </option>
          )}
          {(catalogs ?? []).map((row) => (
            <option key={row.catalogDigest} value={row.catalogDigest}>
              {row.catalogVersion}
              {row.origin === 'synthetic-bundled' ? ' — 데모·합성' : ` — ${row.origin}`}
            </option>
          ))}
        </select>
      </label>
      {catalogs?.find((c) => c.catalogDigest === pin.catalogDigest)?.origin ===
        'synthetic-bundled' && (
        <p className="session-note" data-testid="catalog-demo-note">
          현재 선택은 데모·합성 데이터입니다 — 실제 상품이 아닙니다.
        </p>
      )}
      <ul className="plan-list" data-testid="draft-owned-list">
        {state.form.ownedContainers.map((o) => (
          <li key={o.id}>
            <strong>{o.id}</strong>
            <span className="session-note">
              {o.variantRef ? ` · 옵션 ${o.variantRef.variantId} 기반` : ' · 직접 입력'}
            </span>
            <Button
              className="button button-quiet"
              data-testid={`draft-owned-remove-${o.id}`}
              onPress={() => session.removeOwnedContainer(o.id)}
            >
              빼기
            </Button>
          </li>
        ))}
        {state.form.ownedContainers.length === 0 && (
          <li className="session-note">이 프로젝트에 연결된 보유 수납함이 없습니다.</li>
        )}
      </ul>
      {(owned ?? []).some((row) => inDraft.has(row.ownedContainerId)) && (
        <ul className="plan-list" data-testid="library-owned-apply">
          {(owned ?? [])
            .filter((row) => inDraft.has(row.ownedContainerId))
            .map((row) => (
              <li key={row.ownedContainerId}>
                <span className="session-note">라이브러리 {row.ownedContainerId}</span>
                <Button
                  className="button button-quiet"
                  data-testid={`draft-owned-apply-${row.ownedContainerId}`}
                  onPress={() => session.upsertOwnedContainer(ownedToRaw(row.container))}
                >
                  라이브러리 값으로 바꾸기
                </Button>
              </li>
            ))}
        </ul>
      )}
      <p className="session-note" data-testid="owned-copy-note">
        라이브러리를 고쳐도 이 프로젝트의 사본은 바뀌지 않습니다. 가용 수량이 미확인이면
        확정된 단위로 쓰지 않습니다. 다른 프로젝트가 같은 보유품을 예약하지 않습니다.
      </p>
      {(owned ?? []).filter((row) => !inDraft.has(row.ownedContainerId)).length > 0 && (
        <ul className="plan-list" data-testid="library-owned-list">
          {(owned ?? [])
            .filter((row) => !inDraft.has(row.ownedContainerId))
            .map((row) => (
              <li key={row.ownedContainerId}>
                <span className="session-note">{row.ownedContainerId}</span>
                <Button
                  className="button button-quiet"
                  data-testid={`draft-owned-add-${row.ownedContainerId}`}
                  onPress={() => session.upsertOwnedContainer(ownedToRaw(row.container))}
                >
                  이 프로젝트에 연결
                </Button>
              </li>
            ))}
        </ul>
      )}
      <p className="session-note">
        <a
          href="#/catalog"
          onClick={(e) => {
            e.preventDefault();
            navigate('#/catalog');
          }}
          data-testid="goto-catalog"
        >
          카탈로그 가져오기 · 보유 수납함 등록 →
        </a>
      </p>
    </section>
  );
}

/**
 * Local-only photo attachments (Ticket 009). Thumbnails come from object
 * URLs over the stored derivative bytes — no network request is involved in
 * add, list, or remove. The stored bytes are a re-encoded display
 * derivative; the UI says so and never calls them the original file.
 */
const attachmentManager = new AttachmentManager(repository, reencodeImage);

const ATTACH_ERROR_TEXT: Record<string, string> = {
  file_too_large: '10 MiB까지의 사진만 첨부할 수 있습니다.',
  unsupported_type: 'JPEG·PNG·WebP 사진만 첨부할 수 있습니다.',
  pixel_limit_exceeded: '사진 크기(픽셀)가 너무 큽니다.',
  decode_failed: '사진을 읽을 수 없습니다.',
  project_full: '사진은 프로젝트당 10장까지입니다.',
  persist_failed: '사진을 저장하지 못했습니다.',
};

function PhotosPanel({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<AttachmentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const urls = useRef(new Map<string, string>());
  useEffect(() => {
    let alive = true;
    void attachmentManager.list(projectId).then((list) => {
      if (alive) setRows(list);
    }).catch(() => undefined);
    const kept = urls.current;
    return () => {
      alive = false;
      for (const url of kept.values()) URL.revokeObjectURL(url);
      kept.clear();
    };
  }, [projectId]);
  const thumb = (row: AttachmentRow): string => {
    let url = urls.current.get(row.attachmentId);
    if (!url) {
      url = URL.createObjectURL(new Blob([row.bytes], { type: row.mime }));
      urls.current.set(row.attachmentId, url);
    }
    return url;
  };
  async function attach(file: File) {
    setBusy(true);
    setError(null);
    try {
      const result = await attachmentManager.attach(projectId, {
        name: file.name,
        type: file.type,
        size: file.size,
        bytes: await file.arrayBuffer(),
      });
      if (result.status === 'saved') {
        setRows(await attachmentManager.list(projectId));
      } else {
        setError(ATTACH_ERROR_TEXT[result.code] ?? result.code);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(attachmentId: string) {
    setBusy(true);
    setError(null);
    try {
      await attachmentManager.remove(attachmentId);
      urls.current.delete(attachmentId);
      setRows(await attachmentManager.list(projectId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="measurement-panel" aria-labelledby="photos-title">
      <div className="section-kicker">03 · 사진</div>
      <h2 id="photos-title">공간 사진 (선택)</h2>
      <p className="session-note">
        사진은 이 기기에만 저장되며 계산에는 사용되지 않습니다. 저장되는 것은
        위치·촬영 정보가 제거된 화면 표시용 사본이며 원본 파일이 아닙니다.
        최대 10장, 장당 10 MiB까지.
      </p>
      {error && (
        <p role="alert" className="notice notice-error" data-testid="photo-error">
          {error}
        </p>
      )}
      <ul className="plan-list" data-testid="photo-list">
        {(rows ?? []).map((row) => (
          <li key={row.attachmentId}>
            <img
              src={thumb(row)}
              alt={row.name}
              className="photo-thumb"
              width={96}
              height={96}
            />
            <span className="session-note">
              {row.name} · {row.width}×{row.height}
            </span>
            <Button
              className="button button-quiet"
              data-testid={`photo-remove-${row.attachmentId}`}
              isDisabled={busy}
              onPress={() => void remove(row.attachmentId)}
            >
              삭제
            </Button>
          </li>
        ))}
        {rows !== null && rows.length === 0 && (
          <li className="session-note">첨부된 사진이 없습니다.</li>
        )}
      </ul>
      <div className="form-actions">
        <Button
          className="button button-secondary"
          isDisabled={busy || (rows?.length ?? 0) >= 10}
          data-testid="photo-add"
          onPress={() => fileRef.current?.click()}
        >
          사진 추가
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          data-testid="photo-file"
          hidden
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void attach(file);
          }}
        />
      </div>
    </section>
  );
}

export function ProjectScreen({ projectId }: { projectId: string }) {
  const sessionRef = useRef<ProjectSession | null>(null);
  if (!sessionRef.current || sessionRef.current.snapshot.projectId !== projectId) {
    sessionRef.current = acquireSession(projectId);
  }
  const session = sessionRef.current;
  const state = useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.snapshot,
  );
  const [exported, setExported] = useState<string | null>(null);
  const [copyPhotos, setCopyPhotos] = useState<string | null>(null);
  useEffect(() => {
    const key = `zari-copy-notice:${projectId}`;
    const raw = sessionStorage.getItem(key);
    if (raw === null) return;
    sessionStorage.removeItem(key);
    setCopyPhotos(raw);
  }, [projectId]);
  const [detailTarget, setDetailTarget] = useState<{ path: string; token: number } | null>(null);
  const workspace = useWorkspace({
    projectId,
    sourceKey: state.inputDigest ? inputSourceKey(state.inputDigest) : `input:pending:${projectId}`,
    planSnapshotId: null,
    inputDigest: state.inputDigest ?? '',
  });
  const focused: MeasurementField | null =
    workspace.state.focus.kind === 'measurement' &&
    (MEASUREMENT_FIELDS as readonly string[]).includes(workspace.state.focus.fieldPath)
      ? (workspace.state.focus.fieldPath as MeasurementField)
      : null;
  const setFocused = (field: MeasurementField | null) => {
    if (!field) {
      workspace.setFocus({ kind: 'none' });
      return;
    }
    const entry = state.inputDigest
      ? readInputProjection(state.plan.projections, state.inputDigest)
      : null;
    workspace.setFocus({ kind: 'measurement', fieldPath: field });
    workspace.setView(preferredMeasureView(field, entry?.projection ?? null));
  };
  const fieldBlock = (field: MeasurementField): 'stale' | 'invalid' | null => {
    if (state.diagnostics.some((entry) => fieldPathFor(entry.fieldPath) === field)) return 'invalid';
    if (state.staleInput) return 'stale';
    return null;
  };
  useEffect(() => () => releaseSession(projectId), [projectId]);
  useEffect(() => {
    if (state.status !== 'ready' || state.worker !== 'ready') return;
    const snap = session.snapshot;
    if (!snap.normalizedInput || !snap.inputDigest) return;
    session.ensureInputProjection(snap.normalizedInput, snap.inputDigest);
  }, [session, state.status, state.worker, state.context, state.inputDigest]);

  async function download(kind: 'standard' | 'recovery') {
    const data = await session.exportJson(kind);
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zari-${projectId}-${kind}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(kind);
  }

  if (state.status === 'loading') {
    return <Shell name="불러오는 중"><p data-testid="project-loading">프로젝트를 불러오고 있습니다…</p></Shell>;
  }
  if (state.status === 'not-found') {
    return <Shell name="없음"><p data-testid="project-not-found">이 프로젝트는 이 기기에 없습니다.</p></Shell>;
  }
  if (state.status === 'unsupported') {
    return (
      <Shell name="새 형식">
        <p data-testid="project-unsupported" role="alert">
          이 프로젝트는 더 새로운 저장 형식으로 기록되어 있습니다. 쓰기는 중단되었고,
          보내기로 데이터를 보존할 수 있습니다.
        </p>
        <Button className="button button-secondary" onPress={() => void download('recovery')}>
          복구용보내기
        </Button>
      </Shell>
    );
  }
  const otherDiagnostics = state.diagnostics.filter((d) => fieldPathFor(d.fieldPath) === null);
  return (
    <Shell name={state.name || '프로젝트'}>
      {copyPhotos !== null && (
        <div className="recovery-panel" role="status" data-testid="copy-notice">
          <strong>사본을 만들었습니다.</strong>
          <p>
            진행 기록은 비웠습니다. 사진 {copyPhotos}건은 복사하지 않았습니다. 이 사본은
            보유품을 예약하지 않습니다.
          </p>
        </div>
      )}
      <div className="session-status" data-testid="save-state" data-save-state={state.saveState}>
        {SAVE_TEXT[state.saveState]}
        {state.saveError ? ` · ${state.saveError}` : ''}
      </div>
      {state.context === 'degraded' && (
        <p className="notice notice-stale" data-testid="degraded-notice" role="alert">
          카탈로그를 확인할 수 없어 배치 기능이 제한됩니다. 입력은 계속 저장됩니다.
          {state.degradedReason ? ` (${state.degradedReason})` : ''}
        </p>
      )}
      {state.corrupt.length > 0 && (
        <div className="recovery-panel" role="alert" data-testid="corrupt-notice">
          <strong>일부 기록이 손상되었습니다.</strong>
          <p>손상된 기록 {state.corrupt.length}건을 격리했습니다. 다른 기록은 그대로 사용할 수 있고, 보내기로 원본을 보존할 수 있습니다.</p>
          <Button className="button button-secondary" onPress={() => void download('recovery')}>
            복구용보내기
          </Button>
        </div>
      )}
      {state.saveState === 'error' && (
        <div className="recovery-panel" role="alert" data-testid="save-failed">
          <strong>저장하지 못했습니다.</strong>
          <p>화면의 입력은 그대로입니다. 이전에 저장된 완료 기록도 바꾸지 않았습니다.</p>
          <div className="form-actions">
            <Button className="button button-secondary" onPress={() => session.retrySave()} data-testid="save-failed-retry">
              다시 저장
            </Button>
            <Button className="button button-secondary" onPress={() => void session.saveAsCopy()} data-testid="save-failed-copy">
              사본으로 저장
            </Button>
            <Button className="button button-quiet" onPress={() => void download('standard')} data-testid="save-failed-export">
              보내기
            </Button>
          </div>
        </div>
      )}
      {state.conflict && (
        <div className="recovery-panel" role="alert" data-testid="conflict-notice">
          <strong>다른 탭에서 이 프로젝트가 먼저 저장되었습니다.</strong>
          <p>자동으로 덮어쓰지 않습니다. 어떻게 할지 선택해 주세요.</p>
          <div className="form-actions">
            <Button className="button button-secondary" onPress={() => void session.reloadLatest()} data-testid="conflict-reload">
              최신 버전 열기
            </Button>
            <Button className="button button-secondary" onPress={() => void session.saveAsCopy()} data-testid="conflict-copy">
              사본으로 저장
            </Button>
            <Button className="button button-quiet" onPress={() => void download('standard')} data-testid="conflict-export">
              내 변경보내기
            </Button>
          </div>
        </div>
      )}
      {state.closeBlocked && (
        <div className="recovery-panel" role="alert" data-testid="close-blocked">
          <strong>저장하지 못한 변경이 있습니다.</strong>
          <p>{state.closeBlocked}</p>
          <div className="form-actions">
            <Button className="button button-secondary" onPress={() => session.retrySave()}>
              다시 저장
            </Button>
            <Button className="button button-quiet" onPress={() => void download('recovery')}>
              복구용보내기
            </Button>
            <Button className="button button-quiet" onPress={() => discardSession(projectId)}>
              변경 버리기
            </Button>
          </div>
        </div>
      )}
      {state.worker === 'failed' && (
        <div className="recovery-panel" role="alert" data-testid="worker-failed">
          <strong>계산기가 중단되었습니다.</strong>
          <p>입력과 마지막으로 저장된 상태는 그대로입니다. 다시 연결하면 새 세션이 시작됩니다.</p>
          <Button className="button button-secondary" onPress={() => void workerController.recover()} data-testid="worker-retry">
            계산기 다시 연결
          </Button>
        </div>
      )}
      <section
        className="measurement-panel"
        aria-labelledby="measure-title"
        data-testid="measure-workspace"
        data-spatial-requests={session.spatialRequestCount}
        data-normalize-requests={state.normalizeRequests}
        data-project-revision={state.projectRevision}
      >
        <div className="section-kicker">01 · 공간 치수</div>
        <h2 id="measure-title">공간을 측정해 주세요.</h2>
        <NextFactsList
          view={state.plan.nextFacts}
          onRecompile={() => session.recompileNextFacts()}
          onField={(path) => {
            setDetailTarget({ path, token: Date.now() });
            if ((MEASUREMENT_FIELDS as readonly string[]).includes(path)) {
              setFocused(path as MeasurementField);
            }
          }}
          onCatalog={() => navigate('#/catalog')}
        />
        <div className="measure-workspace">
          <div>
        <FieldGroup
          session={session}
          state={state}
          fields={MEASUREMENT_FIELDS.filter((f) => f.startsWith('space.'))}
          focused={focused}
          setFocused={setFocused}
          blocked={fieldBlock}
        />
        <div className="section-kicker">02 · 물건 치수</div>
        <FieldGroup
          session={session}
          state={state}
          fields={MEASUREMENT_FIELDS.filter((f) => f.startsWith('items.'))}
          focused={focused}
          setFocused={setFocused}
          blocked={fieldBlock}
        />
        <p className="focus-context" data-testid="focus-context" aria-live="polite">
          {focused ? `${FIELD_LABELS[focused]}. ${fieldCaption(focused)}` : '\u00A0'}
        </p>
          </div>
          <MeasurementDiagram
            fieldPath={focused}
            projection={
              state.inputDigest
                ? (readInputProjection(state.plan.projections, state.inputDigest)?.projection ?? null)
                : null
            }
            projectionStatus={
              state.inputDigest
                ? (readInputProjection(state.plan.projections, state.inputDigest)?.status ?? 'absent')
                : 'absent'
            }
            input={state.normalizedInput}
            block={focused ? fieldBlock(focused) : null}
            onActivateField={(fieldPath) => {
              if ((MEASUREMENT_FIELDS as readonly string[]).includes(fieldPath)) {
                setFocused(fieldPath as MeasurementField);
                document.getElementById(fieldPath)?.focus();
              }
            }}
          />
        </div>
        {otherDiagnostics.length > 0 && (
          <ul className="diagnostic-list" data-testid="diagnostic-list">
            {otherDiagnostics.map((d, i) => (
              <li key={i} className="field-error">{diagnosticText(d.code, d.fieldPath)}</li>
            ))}
          </ul>
        )}
        <DetailMeasure
          session={session}
          state={state}
          focusedField={focused}
          detailTarget={detailTarget}
        />
        {state.diagnostics.length > 0 && state.saveState === 'saved' && (
          <p className="session-note" data-testid="normalize-held">
            원문은 저장되었습니다. 정규화된 입력과 근거는 이전 확인 값을 유지합니다.
          </p>
        )}
        <div className="form-actions">
          <Button className="button button-primary" onPress={() => session.commit()} data-testid="commit-input">
            측정값 확인 · 저장
          </Button>
          <Button
            className="button button-quiet"
            onPress={() => session.replaceForm(sampleProjectForm())}
            data-testid="fill-sample"
          >
            샘플 값 채우기
          </Button>
          <Button className="button button-quiet" onPress={() => void download('standard')} data-testid="export-project">
            프로젝트보내기
          </Button>
          <Button
            className="button button-secondary"
            onPress={() => navigate(`#/project/${projectId}/plan`)}
            data-testid="goto-plan"
          >
            계획 검토 →
          </Button>
        </div>
        {exported && <p className="session-note" data-testid="exported-note">{exported === 'recovery' ? '복구' : '표준'}보내기 파일을 만들었습니다.</p>}
      </section>
      <CatalogAndOwned session={session} state={state} />
      <InventoryPanel projectId={projectId} />
      <PhotosPanel projectId={projectId} />
      <aside className="inspector" aria-labelledby="state-title">
        <div className="section-kicker">정규화 상태</div>
        <h2 id="state-title">Rust가 확인한 값</h2>
        <dl className="measurement-list">
          <div><dt>프로젝트 리비전</dt><dd data-testid="project-revision">{state.projectRevision}</dd></div>
          <div><dt>입력 리비전</dt><dd data-testid="input-revision">{state.inputRevision}</dd></div>
          <div><dt>입력 다이제스트</dt><dd data-testid="input-digest">{state.inputDigest ? `${state.inputDigest.slice(0, 12)}…` : '없음'}</dd></div>
          <div><dt>작업 컨텍스트</dt><dd data-testid="context-state">{state.context}</dd></div>
          <div><dt>워커</dt><dd data-testid="worker-state">{state.worker}</dd></div>
        </dl>
        {state.staleInput && (
          <p className="notice notice-stale" data-testid="stale-notice">저장되지 않은 입력 변경이 있습니다.</p>
        )}
        {state.integrity && (
          <p className="session-note" data-testid="integrity-note">
            무결성 검사: {state.integrity.filter((i) => i.verified).length}/{state.integrity.length}개 기록 검증됨
          </p>
        )}
      </aside>
    </Shell>
  );
}

export function Shell({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="zari-ui app-shell">
      <header className="app-header">
        <div className="brand" aria-label="ZARI">
          <svg viewBox="0 0 26 26" aria-hidden="true">
            <path d="M2 2H24V24H2Z M2 10H24 M11 10V24" />
          </svg>
          <span>ZARI</span>
        </div>
        <nav className="header-context" aria-label="화면 이동">
          <a href="#/projects" onClick={(e) => { e.preventDefault(); navigate('#/projects'); }}>
            프로젝트 목록
          </a>
        </nav>
        <div className="local-note">
          <span aria-hidden="true" className="local-dot" />{name}
        </div>
      </header>
      <main className="project-main">{children}</main>
    </div>
  );
}
