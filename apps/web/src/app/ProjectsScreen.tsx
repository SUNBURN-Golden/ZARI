import { useEffect, useRef, useState } from 'react';
import { Button } from 'react-aria-components';
import { EXAMPLE_NAME, isExampleName } from '../features/onboarding/guide';
import { describeStoreFailure } from '../features/privacy/connections';
import { emptyProjectForm, sampleProjectForm } from '../features/project/draft';
import { isZipMagic, stagePortableBundle } from '../features/project/portable';
import {
  commitProjectImport,
  duplicateVerifiedProject,
  stageProjectImport,
  type StagedImport,
  type TransferIssue,
} from '../features/project/transfer';
import type { ProjectRow } from '../persistence/db';
import {
  ensureBundledCatalog,
  libraryController,
  repository,
} from './sessionRegistry';
import { navigate } from './router';
import { ExampleSheet } from './ExampleSheet';

const IMPORT_ISSUE_TEXT: Record<string, string> = {
  invalid_envelope: '보내기 파일 형식이 아닙니다.',
  unsupported_schema: '더 새로운 형식의 파일입니다 — 내용은 읽지 않았습니다.',
  recovery_not_importable: '복구용 파일은 가져올 수 없습니다 (미검증 원본).',
  invalid_json: '파일을 읽을 수 없습니다 (JSON 아님).',
  import_too_large: '파일이 너무 크거나 항목이 너무 많습니다.',
  too_deep: '파일 구조가 너무 깊습니다.',
  record_corrupt: '손상된 기록이 포함되어 있습니다.',
  duplicate_id: '같은 식별자의 기록이 두 번 들어 있습니다.',
  dangling_reference: '참조하는 기록이 파일에 없습니다.',
  digest_mismatch: '기록의 다이제스트가 내용과 다릅니다.',
  path_escape: '경로가 묶음 밖으로 나갑니다.',
  compression_bomb: '압축 폭탄으로 보여 거절했습니다. 내용은 풀지 않았습니다.',
  unsupported_version: '지원하지 않는 묶음 버전입니다.',
  unsupported_compression: '이 묶음의 압축 방식은 지원하지 않습니다.',
  bundle_corrupt: '묶음이 손상되었습니다.',
  photo_bytes_forbidden: '사진 바이트는 넣을 수 없습니다.',
  location_present: '위치정보가 있어 거절했습니다.',
  personal_data_present: '개인정보 항목이 있어 거절했습니다.',
  policy_rejected: '사진·위치·개인정보 정책이 이 앱과 다릅니다.',
  missing_member: '필요한 항목이 묶음에 없습니다.',
  unexpected_member: '허용되지 않은 항목이 묶음에 있습니다.',
  project_required: '프로젝트를 포함한 묶음만 가져올 수 있습니다.',
};

/**
 * Import review (Ticket 009 §7): every record in the file passed bounded
 * parsing, envelope guards, cross-reference checks and Rust verifyRecord
 * before this panel renders. Nothing is written until the user confirms;
 * a rejection here never disturbs existing projects.
 */
function ImportReview({
  staged,
  onDone,
  onCancel,
}: {
  staged: { staged: StagedImport; summary: Record<string, unknown> };
  onDone: (id: string) => void;
  onCancel: () => void;
}) {
  const s = staged.summary as {
    name: string;
    sourceProjectId: string;
    exportedAt: string;
    inputCount: number;
    snapshotCount: number;
    progressCount: number;
    catalogCount: number;
    attachmentCount: number;
    acceptedBound: boolean;
    portable?: boolean;
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="recovery-panel" data-testid="import-review" role="dialog" aria-label="가져오기 검토">
      <strong>프로젝트를 가져올까요?</strong>
      <p>
        “{s.name}” · 입력 {s.inputCount}건 · 스냅샷 {s.snapshotCount}건 · 진행{' '}
        {s.progressCount}건 · 카탈로그 {s.catalogCount}건
        {s.attachmentCount > 0
          ? ` · 사진 ${s.attachmentCount}건은 파일에 바이트가 없어 가져오지 않습니다`
          : ''}
        {s.portable
          ? ' · 이식 묶음: 사진 바이트 제외, 위치정보 제거, 개인정보 항목 제외'
          : ''}
        {s.acceptedBound ? ' · 채택 계획 포함' : ''}
      </p>
      <p className="session-note">
        원본 프로젝트를 덮어쓰지 않습니다. 새 프로젝트로 추가됩니다.
      </p>
      {error && (
        <p role="alert" className="notice notice-error" data-testid="import-error">
          {error}
        </p>
      )}
      <div className="form-actions">
        <Button
          className="button button-primary"
          isDisabled={busy}
          data-testid="import-confirm"
          onPress={() => {
            setBusy(true);
            void commitProjectImport(repository, staged.staged)
              .then((row) => onDone(row.projectId))
              .catch((e: unknown) => {
                setError(e instanceof Error ? e.message : String(e));
                setBusy(false);
              });
          }}
        >
          가져오기
        </Button>
        <Button className="button button-quiet" onPress={onCancel} isDisabled={busy}>
          취소
        </Button>
      </div>
    </div>
  );
}

/**
 * Project list + creation + portable-transfer surface. Creating writes one
 * `projects` row and one empty draft in a single transaction — no Worker
 * call happens inside it. Import stages through Rust validation first, so
 * even a crafted file cannot overwrite or corrupt an existing project.
 */
export function ProjectsScreen() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  /**
   * The empty-list row is inserted when the catalog read finishes. A press
   * that starts before that paint moves the button under the pointer, and
   * React Aria cancels it — the page stays on the list and `worker-state`
   * never mounts. The create control stays disabled until that paint.
   */
  const [listSettled, setListSettled] = useState(false);
  /**
   * True once storage fenced itself off a newer database (or already was at
   * mount). The repository rejects every open, read and write while fenced;
   * this flag keeps the mutation controls disabled so a press cannot even
   * attempt a write into a format this build does not understand.
   */
  const [incompatible, setIncompatible] = useState(() => repository.fenced);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{
    staged: StagedImport;
    summary: Record<string, unknown>;
  } | null>(null);
  const [rejections, setRejections] = useState<TransferIssue[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  async function refresh() {
    const rows = await repository.listProjects();
    setProjects(rows);
  }
  function storeFailure(e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('migration_blocked')) setIncompatible(true);
    setError(message);
  }
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await ensureBundledCatalog();
        const rows = await repository.listProjects();
        if (!alive) return;
        setProjects(rows);
        setListSettled(true);
      } catch (e) {
        if (!alive) return;
        storeFailure(e);
        setListSettled(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  async function create() {
    setBusy(true);
    setError(null);
    try {
      const row = await repository.createProject('새 정리 프로젝트', emptyProjectForm());
      navigate(`#/project/${row.projectId}`);
    } catch (e) {
      storeFailure(e);
      setBusy(false);
    }
  }
  /**
   * The example is a separate, clearly named project filled with the bundled
   * synthetic values. It never touches an existing project and a real start
   * (`create`) never copies these values.
   */
  async function createExample() {
    setBusy(true);
    setError(null);
    try {
      const row = await repository.createProject(EXAMPLE_NAME, sampleProjectForm());
      navigate(`#/project/${row.projectId}`);
    } catch (e) {
      storeFailure(e);
      setBusy(false);
    }
  }
  async function stage(file: File) {
    setBusy(true);
    setError(null);
    setRejections(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const client = await libraryController.ensure();
      const result = isZipMagic(bytes)
        ? await stagePortableBundle(bytes, repository, client)
        : await stageProjectImport(new TextDecoder().decode(bytes), repository, client);
      if (result.status === 'staged') {
        setPending({
          staged: result.staged,
          summary: result.summary as unknown as Record<string, unknown>,
        });
      } else if (result.status === 'rejected') {
        setRejections(result.issues);
      } else {
        setError(`가져오기 실패: ${result.error}`);
      }
    } catch (e) {
      storeFailure(e);
    } finally {
      setBusy(false);
    }
  }
  async function duplicate(projectId: string) {
    setBusy(true);
    setError(null);
    setRejections(null);
    try {
      const client = await libraryController.ensure();
      const result = await duplicateVerifiedProject(repository, client, projectId);
      if (result.status === 'copied') {
        sessionStorage.setItem(
          `zari-copy-notice:${result.project.projectId}`,
          String(result.excludedAttachmentIds.length),
        );
        await refresh();
        navigate(`#/project/${result.project.projectId}`);
        return;
      }
      if (result.status === 'rejected') setRejections(result.issues);
      else setError(`사본을 만들지 못했습니다: ${result.error}`);
    } catch (e) {
      storeFailure(e);
    } finally {
      setBusy(false);
    }
  }
  async function remove(projectId: string) {
    setBusy(true);
    setError(null);
    try {
      await repository.deleteProject(projectId);
      setConfirmDelete(null);
      await refresh();
    } catch (e) {
      storeFailure(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="zari-ui app-shell projects-shell">
      <header className="app-header projects-header">
        <div className="brand" aria-label="ZARI">
          <svg viewBox="0 0 26 26" aria-hidden="true">
            <path d="M2 2H24V24H2Z M2 10H24 M11 10V24" />
          </svg>
          <span>ZARI</span>
        </div>
        <span className="projects-studio-label">공간 스튜디오</span>
        <nav className="header-context" aria-label="화면 이동">
          <a href="#/catalog" onClick={(e) => { e.preventDefault(); navigate('#/catalog'); }}>
            카탈로그 보유 수납함
          </a>
          <a href="#/data" data-testid="nav-data" onClick={(e) => { e.preventDefault(); navigate('#/data'); }}>
            내 데이터
          </a>
          <a href="#/probe" onClick={(e) => { e.preventDefault(); navigate('#/probe'); }}>
            폭 확인 예제
          </a>
        </nav>
      </header>
      <main className="projects-home-main">
        <div className="home-hero-head">
          <div>
            <h1>정리할 공간을 고르세요.</h1>
          </div>

        </div>
        <section
          className="projects-content"
          aria-labelledby="projects-title"
          aria-busy={listSettled ? undefined : true}
        >
          <h2 id="projects-title" className="visually-hidden">
            프로젝트 목록
          </h2>
          {error && (
            <p role="alert" className="notice notice-error" data-testid="projects-error">
              {describeStoreFailure(error)}
            </p>
          )}
          {busy && (
            <p role="status" data-testid="transfer-busy">
              파일을 확인하고 있습니다. 기존 프로젝트는 아직 그대로입니다.
            </p>
          )}
          {rejections !== null && (
            <div className="recovery-panel" role="alert" data-testid="import-rejected">
              <strong>파일을 가져올 수 없습니다.</strong>
              <p>기존 프로젝트는 그대로입니다. 파일은 검증만 거쳤고 아무것도 바뀌지 않았습니다.</p>
              <ul className="diagnostic-list">
                {rejections.slice(0, 8).map((issue, i) => (
                  <li key={i} className="field-error">
                    {IMPORT_ISSUE_TEXT[issue.code] ?? `${issue.code} (${issue.fieldPath})`}
                  </li>
                ))}
              </ul>
              <Button className="button button-quiet" onPress={() => setRejections(null)}>
                닫기
              </Button>
            </div>
          )}
          {pending !== null && (
            <ImportReview
              staged={pending}
              onDone={(id) => {
                setPending(null);
                navigate(`#/project/${id}`);
              }}
              onCancel={() => setPending(null)}
            />
          )}
          <div className="drafting-hero">
            <ExampleSheet />
            <div className="start-choices home-entry-rows" data-testid="start-choices">
              <div className="home-entry">
                <Button
                  className="button button-primary"
                  onPress={() => void create()}
                  isDisabled={busy || !listSettled || incompatible}
                  data-testid="create-project"
                  data-list-settled={listSettled ? 'true' : 'false'}
                >
                  내 공간으로 시작
                </Button>
                <p className="home-entry-label">새 공간 도면 mm</p>
                <p className="session-note">
                  빈 칸에서 시작합니다. 줄자로 잰 값만 넣으면 되고, 비워 둔 값은 “미측정”으로 남습니다.
                </p>
              </div>
              <div className="home-entry">
                <Button
                  className="button button-secondary"
                  onPress={() => void createExample()}
                  isDisabled={busy || !listSettled || incompatible}
                  data-testid="create-example"
                >
                  예제로 둘러보기
                </Button>
                <p className="home-entry-label">예제 도면 체험 2D/3D</p>
                <p className="session-note" data-testid="example-disclosure">
                  연습용 합성 데이터입니다. 상품·가격·재고는 실제가 아니며 구매할 수 없습니다. 내 프로젝트와
                  따로 저장됩니다.
                </p>
              </div>
            </div>
          </div>
          <section className="home-saved" aria-labelledby="saved-title">
            <div className="home-saved-header">
              <h2 id="saved-title">보관된 공간 도면</h2>
              <div className="home-import-actions">
                <Button
                  className="button home-import-link"
                  isDisabled={busy || incompatible}
                  data-testid="import-project"
                  onPress={() => fileRef.current?.click()}
                >
                  파일에서 가져오기
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,.zip,application/json,application/zip"
                  data-testid="import-file"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void stage(file);
                  }}
                />
              </div>
            </div>
            <ul className="project-list" data-testid="project-list">
              {(projects ?? []).map((project) => (
                <li key={project.projectId} data-testid={`project-row-${project.projectId}`}>
                  <a
                    href={`#/project/${project.projectId}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`#/project/${project.projectId}`);
                    }}
                  >
                    <div className="room-card-meta">
                      <div className="room-card-title-row">
                        <strong>{project.name}</strong>
                        {isExampleName(project.name) && (
                          <span className="badge-example" data-testid={`example-badge-${project.projectId}`}>
                            예제 · 합성
                          </span>
                        )}
                      </div>
                      <span className="room-card-rev">
                        리비전 {project.projectRevision} · 입력 리비전{' '}
                        {project.currentInputRevision}
                        {project.importedFrom ? ' · 가져옴' : ''}
                      </span>
                    </div>
                  </a>
                  <span className="project-row-actions">
                    <Button
                      className="button button-quiet"
                      data-testid={`duplicate-${project.projectId}`}
                      isDisabled={busy || incompatible}
                      onPress={() => void duplicate(project.projectId)}
                    >
                      복제
                    </Button>
                    <Button
                      className="button button-quiet"
                      data-testid={`delete-${project.projectId}`}
                      isDisabled={busy || incompatible}
                      onPress={() => setConfirmDelete(project.projectId)}
                    >
                      삭제
                    </Button>
                  </span>
                  {confirmDelete === project.projectId && (
                    <div className="recovery-panel" role="alert" data-testid="delete-confirm">
                      <p>
                        “{project.name}”을(를) 삭제합니다. 입력·스냅샷·사진까지 이
                        프로젝트의 기록이 함께 지워지며 되돌릴 수 없습니다.
                      </p>
                      <div className="form-actions">
                        <Button
                          className="button button-secondary"
                          data-testid="delete-confirm-yes"
                          onPress={() => void remove(project.projectId)}
                        >
                          삭제
                        </Button>
                        <Button
                          className="button button-quiet"
                          onPress={() => setConfirmDelete(null)}
                        >
                          유지
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
              {projects !== null && projects.length === 0 && (
                <li className="project-empty" data-testid="project-empty">
                  아직 프로젝트가 없습니다. 위 스튜디오 카드에서 시작 방법을 고르세요.
                </li>
              )}
            </ul>
            <footer className="home-storage-notes" aria-label="저장소 및 사본 안내">
              <p>
                측정값은 이 기기의 브라우저 저장소에만 기록됩니다. 보내기가 유일한
                백업입니다.
              </p>
              <p className="session-note" data-testid="duplicate-disclosure">
                사본은 진행 기록을 비웁니다. 사진은 복사하지 않습니다. 보유품을 여러
                프로젝트에 예약하지 않습니다.
              </p>
            </footer>
          </section>
        </section>
      </main>
    </div>
  );
}
