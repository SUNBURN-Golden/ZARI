import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from 'react-aria-components';
import type { MeasurementField } from '../project/draft';
import type { JourneyView } from './journey';

// copy-todo: placeholder journey labels, status and accessible copy.
const STEPS = [['measure', '공간 재기'], ['items', '물건 넣기'], ['plan', '배치 고르기']] as const;
export function JourneyBar({ view, onField, measure = false }: {
  view: JourneyView; onField?: (field: MeasurementField) => void; measure?: boolean;
}) {
  const barRef = useRef<HTMLElement>(null);
  const [offsets, setOffsets] = useState({ header: 0, bar: 0, compact: false });
  useLayoutEffect(() => {
    const bar = barRef.current;
    const shell = bar?.closest<HTMLElement>('.app-shell');
    const header = shell?.querySelector<HTMLElement>('.app-header');
    if (!bar || !shell || !header) return;
    const measureOffsets = () => {
      // Actual DOM geometry; no new tokens or custom properties.
      const headerHeight = header.offsetHeight;
      const barHeight = bar.offsetHeight;
      const compact = shell.clientWidth < 62 * parseFloat(getComputedStyle(document.documentElement).fontSize);
      setOffsets((previous) => previous.header === headerHeight && previous.bar === barHeight && previous.compact === compact
        ? previous : { header: headerHeight, bar: barHeight, compact });
    };
    const observer = new ResizeObserver(measureOffsets);
    observer.observe(header);
    observer.observe(bar);
    observer.observe(shell);
    measureOffsets();
    return () => observer.disconnect();
  }, []);
  const move = () => {
    if (!view.cta) return;
    if ('field' in view.cta) onField?.(view.cta.field);
    else {
      const target = document.querySelector<HTMLElement>(`[data-testid="${view.cta.testId}"]`);
      if (!target || target.matches(':disabled,[aria-disabled="true"]')) return;
      if (view.cta.testId === 'goto-plan') { target.click(); return; }
      target.scrollIntoView({ block: 'center' });
      target.focus();
    }
  };
  return (
    <>
      {offsets.header > 0 && <style>{`
        .journey-bar { top: ${offsets.header}px; }
        html { scroll-padding-top: calc(${offsets.header + offsets.bar}px + ${offsets.compact ? '10rem' : 'var(--zari-space-4)'}); }
        @container (max-width: 61.999rem) {
          .measure-workspace > .measure-stage-column > .measure-diagram { top: calc(${offsets.header + offsets.bar}px + var(--zari-space-2)); }
        }
        @container (min-width: 62rem) {
          .measure-stage-column, .plan-workspace-body > .workspace-inspector { top: calc(${offsets.header + offsets.bar}px + var(--zari-space-4)); }
          .plan-workspace-body > .workspace-inspector { max-height: calc(100dvh - ${offsets.header + offsets.bar}px - var(--zari-space-8)); }
        }
      `}</style>}
    {/* copy-todo: accessible navigation name and state labels below. */}
    <nav ref={barRef} className="journey-bar" aria-label="진행 단계" data-testid="journey-bar" data-current={view.current} aria-describedby={!view.cta && !view.done.plan ? 'create-project' : undefined}>
      <ol>
        {STEPS.map(([id, label], i) => (
          <li key={id} data-testid={`journey-step-${id}`} data-state={view.done[id] ? 'done' : id === view.current ? 'current' : 'todo'} aria-current={id === view.current ? 'step' : undefined}>
            <span aria-hidden="true" className="journey-number">{view.done[id] ? '✓' : i + 1}</span>
            <span className="journey-label">{label}</span>
            {/* copy-todo: input completion is distinct from fit validation. */}
            <span className="visually-hidden">{view.done[id] ? '입력 완료' : id === view.current ? '현재 단계' : ''}</span>
          </li>
        ))}
      </ol>
      {/* copy-todo: numeric progress and historical qualifier. */}
      <span data-testid="journey-progress" className="journey-progress">{view.progress ? `${view.progress.filled}/${view.progress.total}칸 입력` : view.done.plan ? '채택됨' : view.candidates !== undefined ? `후보 ${view.candidates}개` : ''}{view.historical ? ' · 입력 확인 필요' : ''}</span>
      {view.cta && <span data-testid="journey-cta">
        {/* copy-todo: reuse the existing help action; only one suggested next action. */}
        <Button className="button button-primary" data-testid={measure ? 'onboarding-goto-next' : 'journey-focus-next'} isDisabled={view.disabled} onPress={move}>
          {measure ? view.cta && 'field' in view.cta ? view.current === 'items' ? '물건 크기 넣기' : '다음 칸 재기' : view.cta && 'testId' in view.cta && view.cta.testId === 'commit-input' ? '입력 확인하기' : '배치 고르러 가기 →' : '다음 단계 보기'}
        </Button>
      </span>}
    </nav>
    </>
  );
}
