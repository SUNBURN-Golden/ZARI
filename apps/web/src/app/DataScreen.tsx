import { useCallback, useEffect, useState } from 'react';
import { Button } from 'react-aria-components';
import { exportProject } from '../persistence/export';
import type { ProjectRow } from '../persistence/db';
import type { CompatibilityReport, ProjectDataScope } from '../persistence/repository';
import {
  ABSENT_CONNECTIONS,
  CONNECTIONS,
  KIND_TEXT,
  describeStoreFailure,
} from '../features/privacy/connections';
import {
  lowSpace,
  readShellCache,
  readStorageFacts,
  type ShellCacheFacts,
  type StorageFacts,
} from '../features/privacy/device';
import {
  downloadBlob,
  downloadJson,
  locationLogExport,
  photoFilename,
} from '../features/privacy/exports';
import { navigate } from './router';
import { ENGINE_BUILD_ID, repository } from './sessionRegistry';

type DeleteScope = 'photos' | 'location' | 'project';
type Photo = { attachmentId: string; name: string; mime: string; byteSize: number };
type Notice = { kind: 'ok' | 'error'; text: string } | null;

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '알 수 없음';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

const COMPAT_TEXT: Record<CompatibilityReport['status'], string> = {
  ok: '이 앱이 저장된 형식을 읽을 수 있습니다.',
  newer_rows:
    '이 앱보다 새로운 형식의 기록이 있습니다. 그 기록은 읽기만 하고 고치거나 지우지 않습니다.',
  newer_database:
    '저장소가 이 앱보다 새로운 버전입니다. 열지 않았고 아무것도 바꾸지 않았습니다. 이 탭을 새로고침해 최신 앱으로 여세요.',
};

const SCOPE_TEXT: Record<DeleteScope, { title: string; effect: string; stays: string }> = {
  photos: {
    title: '사진',
    effect: '이 프로젝트에 첨부한 사진 사본이 모두 지워집니다.',
    stays: '프로젝트 입력·채택 계획·위치 기록은 그대로입니다.',
  },
  location: {
    title: '검색(위치 기록)',
    effect: '이 프로젝트의 실제 위치 관측이 모두 지워집니다.',
    stays: '프로젝트 입력·채택 계획·사진은 그대로입니다.',
  },
  project: {
    title: '프로젝트 전체',
    effect: '입력·스냅샷·진행·사진·위치 기록·구매 기록·피드백·보유 이력이 지워집니다.',
    stays: '공용 카탈로그와 보유 수납함은 그대로입니다.',
  },
};

function ProjectData({
  project,
  scope,
  photos,
  busy,
  onExport,
  onExportLocation,
  onDownloadPhoto,
  onDelete,
}: {
  project: ProjectRow;
  scope: ProjectDataScope | undefined;
  photos: Photo[];
  busy: boolean;
  onExport: () => void;
  onExportLocation: () => void;
  onDownloadPhoto: (photo: Photo) => void;
  onDelete: (scope: DeleteScope) => void;
}) {
  const id = project.projectId;
  const observations = scope?.location.observations ?? null;
  return (
    <li className="data-project" data-testid={`data-project-${id}`}>
      <h3>{project.name}</h3>
      {scope === undefined ? (
        <p role="status">범위를 확인하고 있습니다…</p>
      ) : (
        <ul className="data-scope-list">
          <li data-testid={`scope-project-${id}`}>
            <div>
              <strong>프로젝트</strong>
              <span>입력·채택 스냅샷·진행 기록</span>
              {(scope.otherLogs.purchase > 0 ||
                scope.otherLogs.feedback > 0 ||
                scope.otherLogs.inventory > 0) && (
                <span>
                  구매 기록 {scope.otherLogs.purchase} · 피드백 {scope.otherLogs.feedback} ·
                  보유 이력 {scope.otherLogs.inventory}
                </span>
              )}
            </div>
            <span className="project-row-actions">
              <Button
                className="button button-quiet"
                isDisabled={busy}
                data-testid={`export-project-${id}`}
                onPress={onExport}
              >
                JSON 보내기
              </Button>
              <Button
                className="button button-quiet"
                isDisabled={busy}
                data-testid={`delete-project-${id}`}
                onPress={() => onDelete('project')}
              >
                프로젝트 삭제
              </Button>
            </span>
          </li>
          <li data-testid={`scope-photos-${id}`}>
            <div>
              <strong>사진</strong>
              <span data-testid={`photo-count-${id}`}>
                {scope.photos.count}장 · {formatBytes(scope.photos.bytes)}
                {scope.photos.corrupt > 0 ? ` · 읽을 수 없는 기록 ${scope.photos.corrupt}건` : ''}
              </span>
              <span>내려받는 것은 위치·촬영 정보를 제거한 표시용 사본이며 원본이 아닙니다.</span>
              {photos.length > 0 && (
                <ul className="data-photo-list">
                  {photos.map((photo) => (
                    <li key={photo.attachmentId}>
                      <span>
                        {photo.name} · {formatBytes(photo.byteSize)}
                      </span>
                      <Button
                        className="button button-quiet"
                        isDisabled={busy}
                        data-testid={`download-photo-${photo.attachmentId}`}
                        onPress={() => onDownloadPhoto(photo)}
                      >
                        내려받기
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <span className="project-row-actions">
              <Button
                className="button button-quiet"
                isDisabled={busy || (scope.photos.count === 0 && scope.photos.corrupt === 0)}
                data-testid={`delete-photos-${id}`}
                onPress={() => onDelete('photos')}
              >
                사진 삭제
              </Button>
            </span>
          </li>
          <li data-testid={`scope-location-${id}`}>
            <div>
              <strong>검색(위치 기록)</strong>
              <span data-testid={`location-count-${id}`}>
                {observations === null
                  ? '읽을 수 없는 기록'
                  : `관측 ${observations}건`}
              </span>
              <span>내 물건 찾기에 쓴 위치 관측입니다. 보낸 파일은 이 앱이 가져오지 않습니다.</span>
            </div>
            <span className="project-row-actions">
              <Button
                className="button button-quiet"
                isDisabled={busy || observations === null || observations === 0}
                data-testid={`export-location-${id}`}
                onPress={onExportLocation}
              >
                JSON 보내기
              </Button>
              <Button
                className="button button-quiet"
                isDisabled={busy || (observations === 0 && !scope.location.corrupt)}
                data-testid={`delete-location-${id}`}
                onPress={() => onDelete('location')}
              >
                위치 기록 삭제
              </Button>
            </span>
          </li>
        </ul>
      )}
    </li>
  );
}

/**
 * User data control (z-privacy-offline). Everything here reads or deletes on
 * this device only. A deletion is reported as done only after the rows are
 * read back as gone; a failure says nothing was removed.
 */
export function DataScreen() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [scopes, setScopes] = useState<Record<string, ProjectDataScope>>({});
  const [photos, setPhotos] = useState<Record<string, Photo[]>>({});
  const [storage, setStorage] = useState<StorageFacts | null>(null);
  const [compat, setCompat] = useState<CompatibilityReport | null>(null);
  const [compatError, setCompatError] = useState<string | null>(null);
  const [shell, setShell] = useState<ShellCacheFacts | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirm, setConfirm] = useState<{ projectId: string; scope: DeleteScope } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadScope = useCallback(async (projectId: string) => {
    const [scope, list] = await Promise.all([
      repository.dataScope(projectId),
      repository.listPhotoMeta(projectId),
    ]);
    setScopes((prev) => ({ ...prev, [projectId]: scope }));
    setPhotos((prev) => ({ ...prev, [projectId]: list }));
    return scope;
  }, []);

  const loadDevice = useCallback(async () => {
    setStorage(await readStorageFacts());
    setShell(await readShellCache());
    setCompatError(null);
    try {
      setCompat(await repository.compatibility());
    } catch (e) {
      setCompat(null);
      setCompatError(describeStoreFailure(e instanceof Error ? e.message : String(e)));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const rows = await repository.listProjects();
        if (!alive) return;
        setProjects(rows);
        for (const row of rows) await loadScope(row.projectId).catch(() => undefined);
      } catch (e) {
        if (alive) {
          setProjects([]);
          setLoadError(describeStoreFailure(e instanceof Error ? e.message : String(e)));
        }
      }
      if (alive) await loadDevice();
    })();
    return () => {
      alive = false;
    };
  }, [loadDevice, loadScope]);

  const fail = (e: unknown) =>
    setNotice({
      kind: 'error',
      text: `지우지 못했습니다. 지워진 것은 없습니다. (${e instanceof Error ? e.message : String(e)})`,
    });

  async function exportProjectJson(project: ProjectRow) {
    setBusy(true);
    setNotice(null);
    try {
      const bundle = await repository.loadBundle(project.projectId);
      const data = await exportProject(repository, bundle, ENGINE_BUILD_ID, 'standard');
      downloadJson(`zari-${project.projectId}-standard.json`, data);
      setNotice({
        kind: 'ok',
        text: '프로젝트 파일을 내려받았습니다. 사진 바이트는 이 파일에 들어 있지 않습니다. 파일은 이 기기에만 있습니다.',
      });
    } catch (e) {
      setNotice({ kind: 'error', text: `보내지 못했습니다. ${describeStoreFailure(e instanceof Error ? e.message : String(e))}` });
    } finally {
      setBusy(false);
    }
  }
  async function exportLocation(project: ProjectRow) {
    setBusy(true);
    setNotice(null);
    try {
      const row = await repository.getLocationLog(project.projectId);
      if (!row || row.log.observations.length === 0) {
        setNotice({ kind: 'error', text: '내보낼 위치 기록이 없습니다.' });
        return;
      }
      downloadJson(
        `zari-${project.projectId}-location.json`,
        locationLogExport(project.projectId, row, new Date().toISOString()),
      );
      setNotice({ kind: 'ok', text: '위치 기록 파일을 내려받았습니다. 파일은 이 기기에만 있습니다.' });
    } catch (e) {
      setNotice({ kind: 'error', text: `보내지 못했습니다. ${describeStoreFailure(e instanceof Error ? e.message : String(e))}` });
    } finally {
      setBusy(false);
    }
  }
  async function downloadPhoto(photo: Photo) {
    setBusy(true);
    setNotice(null);
    try {
      const row = await repository.getAttachment(photo.attachmentId);
      if (!row) {
        setNotice({ kind: 'error', text: '사진을 찾을 수 없습니다.' });
        return;
      }
      downloadBlob(
        photoFilename(row.name, row.mime, row.attachmentId),
        new Blob([row.bytes], { type: row.mime }),
      );
      setNotice({
        kind: 'ok',
        text: '사진 사본을 내려받았습니다. 위치·촬영 정보가 제거된 표시용 사본입니다.',
      });
    } catch (e) {
      setNotice({ kind: 'error', text: `내려받지 못했습니다. ${describeStoreFailure(e instanceof Error ? e.message : String(e))}` });
    } finally {
      setBusy(false);
    }
  }

  async function runDelete(projectId: string, scope: DeleteScope) {
    setBusy(true);
    setNotice(null);
    try {
      let text: string;
      if (scope === 'photos') {
        const removed = await repository.deleteProjectPhotos(projectId);
        const after = await loadScope(projectId);
        if (after.photos.count + after.photos.corrupt !== 0)
          throw new Error('persistence_failed: 삭제 뒤에도 사진이 남아 있습니다.');
        text = `사진 ${removed}건을 이 기기에서 지웠습니다.`;
      } else if (scope === 'location') {
        const existed = await repository.deleteLocationLog(projectId);
        const after = await loadScope(projectId);
        if (after.location.observations !== 0 || after.location.corrupt)
          throw new Error('persistence_failed: 삭제 뒤에도 위치 기록이 남아 있습니다.');
        text = existed
          ? '위치 기록을 이 기기에서 지웠습니다.'
          : '지울 위치 기록이 없었습니다.';
      } else {
        await repository.deleteProject(projectId);
        const rows = await repository.listProjects();
        if (rows.some((row) => row.projectId === projectId))
          throw new Error('persistence_failed: 삭제 뒤에도 프로젝트가 남아 있습니다.');
        setProjects(rows);
        setScopes((prev) => {
          const next = { ...prev };
          delete next[projectId];
          return next;
        });
        text = '프로젝트와 그 기록을 이 기기에서 지웠습니다.';
      }
      setConfirm(null);
      setNotice({
        kind: 'ok',
        text: `${text} 내려받은 파일과 브라우저·운영체제 백업은 지워지지 않습니다.`,
      });
      setStorage(await readStorageFacts());
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  const confirmProject = confirm ? projects?.find((p) => p.projectId === confirm.projectId) : null;

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
            프로젝트
          </a>
        </nav>
        <div className="local-note">
          <span aria-hidden="true" className="local-dot" />이 기기에만 저장
        </div>
      </header>
      <main>
        <div className="page-intro">
          <div>
            <p className="section-kicker">내 데이터</p>
            <h1>이 기기에 있는 데이터를 관리합니다.</h1>
            <p>
              프로젝트·사진·위치 기록은 이 브라우저에만 있습니다. 여기서 범위를 골라
              내려받거나 지울 수 있습니다. 지운 데이터는 되돌릴 수 없습니다.
            </p>
          </div>
        </div>

        {notice && (
          <p
            role={notice.kind === 'error' ? 'alert' : 'status'}
            className={`notice ${notice.kind === 'error' ? 'notice-error' : 'notice-ready'}`}
            data-testid="data-notice"
            data-kind={notice.kind}
          >
            {notice.text}
          </p>
        )}
        {loadError && (
          <p role="alert" className="notice notice-error" data-testid="data-load-error">
            {loadError}
          </p>
        )}

        <section className="project-list-panel data-section" aria-labelledby="data-storage-title">
          <h2 id="data-storage-title">저장 공간</h2>
          {storage === null ? (
            <p role="status">확인하고 있습니다…</p>
          ) : (
            <>
              <p data-testid="storage-usage">
                사용 {formatBytes(storage.usage)} / 허용 {formatBytes(storage.quota)}
                {storage.usage === null || storage.quota === null
                  ? ' — 이 브라우저는 용량을 알려 주지 않습니다. 비어 있다는 뜻이 아닙니다.'
                  : ''}
              </p>
              <p data-testid="storage-persisted">
                {storage.persisted === true
                  ? '브라우저가 이 데이터를 임의로 지우지 않도록 보관합니다.'
                  : storage.persisted === false
                    ? '브라우저가 공간이 모자랄 때 이 데이터를 지울 수 있습니다. 중요한 프로젝트는 보내기로 내려받아 두세요.'
                    : '보관 방식을 확인할 수 없습니다. 중요한 프로젝트는 보내기로 내려받아 두세요.'}
              </p>
              {lowSpace(storage) && (
                <p role="alert" className="notice notice-error" data-testid="storage-low">
                  저장 공간이 거의 찼습니다. 저장이 실패하면 “저장하지 못함”으로 표시되며 저장된 것으로
                  보이지 않습니다. 사진이나 오래된 프로젝트를 정리하세요.
                </p>
              )}
            </>
          )}
        </section>

        <section className="project-list-panel data-section" aria-labelledby="data-projects-title">
          <h2 id="data-projects-title">프로젝트별 데이터</h2>
          {projects === null && <p role="status">불러오고 있습니다…</p>}
          {projects !== null && projects.length === 0 && (
            <p data-testid="data-empty">이 기기에 저장된 프로젝트가 없습니다.</p>
          )}
          <ul className="data-project-list" data-testid="data-project-list">
            {(projects ?? []).map((project) => (
              <ProjectData
                key={project.projectId}
                project={project}
                scope={scopes[project.projectId]}
                photos={photos[project.projectId] ?? []}
                busy={busy}
                onExport={() => void exportProjectJson(project)}
                onExportLocation={() => void exportLocation(project)}
                onDownloadPhoto={(photo) => void downloadPhoto(photo)}
                onDelete={(scope) => setConfirm({ projectId: project.projectId, scope })}
              />
            ))}
          </ul>
          {confirm && confirmProject && (
            <div className="recovery-panel" role="alert" data-testid="data-confirm">
              <strong>
                “{confirmProject.name}” {SCOPE_TEXT[confirm.scope].title}을(를) 지웁니까?
              </strong>
              <p>
                {SCOPE_TEXT[confirm.scope].effect} {SCOPE_TEXT[confirm.scope].stays} 되돌릴 수
                없습니다. 내려받은 파일과 브라우저·운영체제 백업은 지울 수 없습니다.
              </p>
              <div className="form-actions">
                <Button
                  className="button button-secondary"
                  isDisabled={busy}
                  data-testid="data-confirm-yes"
                  onPress={() => void runDelete(confirm.projectId, confirm.scope)}
                >
                  지우기
                </Button>
                <Button
                  className="button button-quiet"
                  isDisabled={busy}
                  data-testid="data-confirm-no"
                  onPress={() => setConfirm(null)}
                >
                  유지
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className="project-list-panel data-section" aria-labelledby="data-connect-title">
          <h2 id="data-connect-title">연결이 필요한 것과 완전 로컬인 것</h2>
          <ul className="data-connection-list" data-testid="connection-list">
            {CONNECTIONS.map((entry) => (
              <li key={entry.id} data-testid={`connection-${entry.id}`} data-kind={entry.kind}>
                <strong>{entry.label}</strong>
                <span className="data-kind">{KIND_TEXT[entry.kind]}</span>
                <span>{entry.note}</span>
              </li>
            ))}
          </ul>
          <p data-testid="connection-absent">
            없는 기능: {ABSENT_CONNECTIONS.join(' · ')}. 파일은 사용자가 보낼 때가 아니면 어디로도
            전송되지 않습니다.
          </p>
        </section>

        <section className="project-list-panel data-section" aria-labelledby="data-compat-title">
          <h2 id="data-compat-title">앱 버전과 저장 형식 호환</h2>
          {compatError && (
            <p role="alert" className="notice notice-error" data-testid="compat-error">
              {compatError}
            </p>
          )}
          {compat && (
            <div data-testid="compat-report" data-status={compat.status}>
              <p>{COMPAT_TEXT[compat.status]}</p>
              <p>
                저장소 버전 {compat.openedVersion ?? '열지 않음'} · 이 앱이 아는 버전{' '}
                {compat.supportedVersion} · 기록 형식 {compat.schemaVersion}
              </p>
              <p data-testid="compat-journal">
                업그레이드 기록:{' '}
                {compat.journals.length === 0
                  ? '없음'
                  : compat.journals.map((j) => `${j.from}→${j.to}`).join(', ')}
              </p>
              {compat.newerSchemaRows > 0 && (
                <p data-testid="compat-newer">더 새로운 형식의 기록 {compat.newerSchemaRows}건</p>
              )}
              {compat.quarantined > 0 && <p>보관 중인 손상 기록 {compat.quarantined}건</p>}
            </div>
          )}
          {shell && (
            <p data-testid="shell-cache" data-available={String(shell.available)}>
              {shell.available
                ? `앱 캐시: 사용 중 ${shell.active ?? '없음'} · 이전 ${shell.previous ?? '없음'} · 받는 중 ${shell.staged ?? '없음'}. 이전 빌드는 복구용으로 남겨 두며 프로젝트 데이터는 캐시에 넣지 않습니다.`
                : '앱 캐시를 쓸 수 없습니다(개발 서버이거나 브라우저가 막음). 오프라인 첫 방문은 지원하지 않습니다.'}
            </p>
          )}
          <div className="form-actions">
            <Button
              className="button button-quiet"
              isDisabled={busy}
              data-testid="compat-recheck"
              onPress={() => void loadDevice()}
            >
              다시 검사
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
