import { useEffect, useState } from 'react';
import { Button } from 'react-aria-components';
import { emptyProjectForm } from '../features/project/draft';
import type { ProjectRow } from '../persistence/db';
import { ensureBundledCatalog, repository } from './sessionRegistry';
import { navigate } from './router';

/**
 * Project list + creation. Creating writes one `projects` row and one empty
 * draft in a single transaction — no Worker call happens inside it.
 */
export function ProjectsScreen() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await ensureBundledCatalog();
        const rows = await repository.listProjects();
        if (alive) setProjects(rows);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
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
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
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
          <a href="#/probe" onClick={(e) => { e.preventDefault(); navigate('#/probe'); }}>
            폭 확인 예제
          </a>
        </nav>
        <div className="local-note">
          <span aria-hidden="true" className="local-dot" />이 기기에만 저장
        </div>
      </header>
      <main>
        <div className="page-intro">
          <div>
            <p className="section-kicker">프로젝트</p>
            <h1>정리할 공간을 고르세요.</h1>
            <p>
              측정값은 이 기기의 브라우저 저장소에만 기록됩니다.보내기가 유일한
              백업입니다.
            </p>
          </div>
        </div>
        <section className="project-list-panel" aria-labelledby="projects-title">
          <h2 id="projects-title" className="visually-hidden">
            프로젝트 목록
          </h2>
          {error && (
            <p role="alert" className="notice notice-error" data-testid="projects-error">
              {error}
            </p>
          )}
          <ul className="project-list" data-testid="project-list">
            {(projects ?? []).map((project) => (
              <li key={project.projectId}>
                <a
                  href={`#/project/${project.projectId}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`#/project/${project.projectId}`);
                  }}
                >
                  <strong>{project.name}</strong>
                  <span>
                    리비전 {project.projectRevision} · 입력 리비전{' '}
                    {project.currentInputRevision}
                  </span>
                </a>
              </li>
            ))}
            {projects !== null && projects.length === 0 && (
              <li className="project-empty" data-testid="project-empty">
                아직 프로젝트가 없습니다.
              </li>
            )}
          </ul>
          <Button
            className="button button-primary"
            onPress={() => void create()}
            isDisabled={busy}
            data-testid="create-project"
          >
            새 프로젝트
          </Button>
        </section>
      </main>
    </div>
  );
}
