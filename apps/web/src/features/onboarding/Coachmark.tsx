import { useEffect, useRef, useState } from 'react';
import { COACHMARK_KEY, shouldShowCoachmark } from './coachmark';
import { MeasureIcon } from '../../ui/MeasureIcon';

// copy-todo: all three first-visit cards are placeholder copy.
const CARDS = [
  ['공간 재기', '줄자로 공간 안쪽 폭·깊이·높이만 재세요.'],
  ['물건 넣기', '넣을 물건 크기를 적고 확인할 조건을 살펴보세요.'],
  ['배치 고르기', '후보 배치 중 하나를 고르면 살 것과 순서를 볼 수 있어요.'],
];
export function Coachmark() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  const [card, setCard] = useState(0);
  useEffect(() => {
    let storage: Storage | null = null;
    try { storage = localStorage; } catch { /* unavailable storage skips coaching */ }
    if (!shouldShowCoachmark(storage, navigator)) return;
    previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.showModal();
    return () => dialogRef.current?.close();
  }, []);
  const finish = (value: 'done' | 'skipped') => {
    try { localStorage.setItem(COACHMARK_KEY, value); } catch { /* dismissal must always work */ }
    dialogRef.current?.close();
    const target = document.querySelector<HTMLElement>('[data-testid="create-project"]');
    (target && !target.matches(':disabled') ? target : previous.current)?.focus();
  };
  return (
    <dialog ref={dialogRef} className="coachmark" data-testid="coachmark" data-card={card + 1} aria-labelledby="coachmark-title" aria-describedby="coachmark-body" onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const controls = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button');
      const first = controls?.[0], last = controls?.[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }} onCancel={(event) => { event.preventDefault(); finish('skipped'); }}>
      <MeasureIcon field={card === 0 ? 'width' : card === 1 ? 'depth' : 'height'} />
      <h2 id="coachmark-title">{card + 1}. {CARDS[card]![0]}</h2>
      <p id="coachmark-body">{CARDS[card]![1]}</p>
      <p aria-live="polite">{card + 1}/3</p>
      <div className="form-actions">
        {/* copy-todo: coachmark actions. */}
        <button type="button" className="button button-quiet" data-testid="coachmark-skip" onClick={() => finish('skipped')}>건너뛰기</button>
        {/* copy-todo: next / finish action. */}
        <button type="button" className="button button-primary" data-testid="coachmark-next" onClick={() => card === 2 ? finish('done') : setCard(card + 1)}>{card === 2 ? '시작하기' : '다음'}</button>
      </div>
    </dialog>
  );
}
