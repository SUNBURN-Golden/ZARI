import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { EasyFitResult } from '../../contracts/generated/dto';
import { validateEasyFitResult } from '../../contracts/generated/validators.mjs';
import { EASY_KEY, emptyDraft, restoreDraft, type Dimensions, type EasyDraft } from './state';
import './easy.css';

const labels = ['가로', '세로', '높이'];
// Illustrative objects only; choosing one never invents its dimensions.
const objects = ['수납함', '전자레인지', '서랍장', '책장', '세탁기'];
function Icon({ kind }: { kind: string }) {
  return <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === '거실' ? <><path d="M12 34V22a6 6 0 0 1 6-6h28a6 6 0 0 1 6 6v12M8 32h9v12h30V32h9v19H8zM14 51v5m36-5v5" /></> :
      kind === '주방' ? <><path d="M8 28h48v27H8zM6 22h52M32 28v27M39 36h9M16 36h7M20 22V12h13v5" /></> :
      kind === '방' ? <><path d="M8 48V19h48v29M8 34h48M8 48h48M8 54v-6m48 6v-6M15 26h13v8H15zm21 0h13v8H36z" /></> :
      kind === 'fits' ? <><circle cx="32" cy="32" r="25" /><path d="m19 32 9 9 18-19" /></> :
      kind === 'tight' ? <><path d="m32 6 28 49H4zM32 23v13m0 9v1" /></> :
      kind === 'doesNotFit' ? <><circle cx="32" cy="32" r="25" /><path d="m23 23 18 18m0-18L23 41" /></> :
      <><path d="m8 20 24-12 24 12v28L32 60 8 48zM8 20l24 12 24-12M32 32v28" /></>}
  </svg>;
}
function Tape() {
  return <svg className="easy-tape" viewBox="0 0 360 140" role="img" aria-label="안쪽을 기준으로 가로(왼쪽~오른쪽), 세로(앞~뒤), 높이(아래~위)를 재 주세요.">
    <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path fill="none" d="M30 70C5 70 5 110 30 110" />
      <rect className="easy-tape-case" x="26" y="28" width="110" height="94" rx="28" />
      <rect className="easy-tape-blade" x="136" y="82" width="188" height="28" />
      <g fill="none">
        <rect x="63" y="23" width="36" height="12" rx="4" />
        <circle cx="81" cy="75" r="26" /><circle cx="81" cy="75" r="9" />
        <path d="M148 83v10m12-10v6m12-6v10m12-10v6m12-6v10m12-10v6m12-6v10m12-10v6m12-6v10m12-10v6m12-6v10m12-10v6m12-6v10m12-10v6M324 78v38h9V78z" />
      </g>
    </g>
  </svg>;
}
function SizeFields({ kind, value, onChange }: { kind: 'item' | 'space'; value: Dimensions; onChange: (v: Dimensions) => void }) {
  return <div className="easy-dimensions">
    {labels.map((label, i) => <label key={label} htmlFor={`easy-${kind}-${i}`}>
      <span>{label}</span><span className="easy-input-unit">
        <input id={`easy-${kind}-${i}`} inputMode="numeric" autoComplete="off" maxLength={40}
          aria-label={`${kind === 'item' ? '물건' : '놓을 곳'} ${label}`} value={value[i]}
          onChange={(e) => { const next: Dimensions = [...value]; next[i] = e.target.value; onChange(next); }} />
        <span>cm</span></span>
    </label>)}
  </div>;
}
function ResultDetails({ result }: { result: EasyFitResult }) {
  const sizes = result.axes.map((axis) => [axis.itemMm ?? 0, axis.spaceMm ?? 0]);
  const extent = Math.max(...sizes.flat(), 1);
  // Projection only: all physical dimensions and fit decisions come from Rust.
  const box = (item: boolean) => {
    const x = (sizes[0]?.[item ? 0 : 1] ?? 0) / extent * 180;
    const y = (sizes[1]?.[item ? 0 : 1] ?? 0) / extent * 65;
    const z = (sizes[2]?.[item ? 0 : 1] ?? 0) / extent * 120;
    return `M55 175h${x}v${-z}H55v${z}m0 ${-z} ${y} ${-y}h${x}v${z}l${-y} ${y}m0 ${-z} ${y} ${-y}`;
  };
  return <details className="easy-details"><summary>자세히 보기</summary>
    <p>적어 주신 방향 그대로 맞춰 봤어요. 돌려서 넣는 건 빼고 봤어요.</p>
    <svg className="easy-size-picture" viewBox="0 0 340 210" role="img" aria-label="점선은 놓을 곳, 실선은 물건 크기예요.">
      <path d={box(false)} className="easy-space-outline" /><path d={box(true)} className="easy-item-outline" />
    </svg>
    <p>점선은 놓을 곳, 실선은 물건 크기예요.</p>
    <table><caption>크기 비교(cm)</caption><thead><tr><th scope="col">방향</th><th scope="col">물건</th><th scope="col">놓을 곳</th></tr></thead>
      <tbody>{result.axes.map((a) => <tr key={a.label}><th scope="row">{a.label}</th><td>{a.itemMm == null ? '아직 안 잼' : a.itemMm / 10}</td><td>{a.spaceMm == null ? '아직 안 잼' : a.spaceMm / 10}</td></tr>)}</tbody></table>
    <p>문 열릴 자리나 손이 닿는지는 빼고, 딱 물건 크기만 맞춰 봤어요.</p>
  </details>;
}
export function EasyMode({ onExpert }: { onExpert: () => void }) {
  const [draft, setDraft] = useState<EasyDraft>(restoreDraft);
  const [saveError, setSaveError] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<EasyFitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(draft.step);
  const workerRef = useRef<Worker | null>(null);
  useEffect(() => {
    try { localStorage.setItem(EASY_KEY, JSON.stringify(draft)); setSaveError(false); }
    catch { setSaveError(true); }
  }, [draft]);
  useEffect(() => {
    if (previousStep.current !== draft.step) heading.current?.focus();
    previousStep.current = draft.step;
    setError('');
    setConfirmed(false);
    window.scrollTo(0, 0);
  }, [draft.step]);
  useEffect(() => () => workerRef.current?.terminate(), []);
  // A restored result is always recalculated, never trusted from storage.
  useEffect(() => {
    if (draft.step !== 4) { setResult(null); setBusy(false); return; }
    let active = true;
    let worker: Worker;
    try {
      worker = new Worker(new URL('../../worker/easyWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      setError('결과를 불러오지 못했어요. 이전으로 가서 다시 해 주세요.');
      return;
    }
    workerRef.current = worker;
    setBusy(true);
    const failed = () => { if (active) { active = false; worker.terminate(); setResult(null); setBusy(false); setError('결과를 불러오지 못했어요. 이전으로 가서 다시 해 주세요.'); } };
    const timer = window.setTimeout(failed, 30000);
    worker.onerror = failed;
    worker.onmessageerror = failed;
    worker.onmessage = (event: MessageEvent<{ ok: boolean; json?: string }>) => {
      if (!active) return;
      window.clearTimeout(timer);
      try {
        const value: unknown = JSON.parse(event.data.json ?? 'null');
        if (!event.data.ok || !validateEasyFitResult(value)) { failed(); return; }
        setResult(value); setBusy(false);
      } catch { failed(); }
    };
    worker.postMessage(JSON.stringify({ item: draft.item, space: draft.space }));
    return () => { active = false; window.clearTimeout(timer); worker.terminate(); workerRef.current = null; };
  }, [draft.step, draft.item, draft.space]);
  const patch = (value: Partial<EasyDraft>) => { setDraft((d) => ({ ...d, ...value })); setConfirmed(false); setError(''); };
  const step = (n: number) => patch({ step: n });
  const unusual = draft.step === 1 || draft.step === 3 ? (draft.step === 1 ? draft.item : draft.space)
    .some((text) => { const n = Number(text); return n > 0 && (n <= 5 || n >= 1000); }) : false;
  function next(e: FormEvent) {
    e.preventDefault();
    if (draft.step === 1 || draft.step === 3) {
      const values = draft.step === 1 ? draft.item : draft.space;
      if (values.some((v) => !v.trim())) { setError('가로·세로·높이를 모두 적어 주세요.'); return; }
      if (unusual && !confirmed) { setError('혹시 mm로 재셨나요?'); return; }
    }
    if (draft.step === 2 && !draft.room) { setError('놓을 곳을 골라 주세요.'); return; }
    step(draft.step + 1);
  }
  const title = ['물건이 들어갈지 함께 확인해요.', '무엇을 넣을까요?', '어디에 둘까요?', '빈 공간을 재 주세요', '결과'][draft.step];
  const status = result?.status;
  const resultText = status === 'fits' ? '들어가요' : status === 'tight' ? '아슬아슬해요' : status === 'doesNotFit' ? '안 들어가요' : '치수를 확인해 주세요';
  return <div className="easy-shell" data-testid="easy-mode">
    <header className="easy-header"><span className="easy-brand">ZARI</span><span>쉬운 모드</span></header>
    <main className="easy-main">
      {draft.step > 0 && <div className="easy-progress"><button type="button" className="easy-link" onClick={() => step(draft.step - 1)}>이전으로</button><span aria-label={`전체 4단계 중 ${draft.step}번째`}>{draft.step}/4</span></div>}
      <h1 ref={heading} tabIndex={-1} className={draft.step === 0 ? 'easy-welcome-title' : ''}>{title}</h1>
      {draft.example && draft.step > 0 && <p className="easy-note">연습 화면이에요. 내 물건은 직접 재서 적어 주세요.</p>}
      {saveError && <p role="alert">기록을 남기지 못했어요. 화면을 닫기 전에 숫자를 따로 적어 두세요.</p>}
      {error && <p className="easy-error" role="alert">{error}</p>}
      {draft.step === 0 ? <>
        <div className="easy-welcome-art"><Icon kind="box" /></div>
        <div className="easy-example-links"><a className="easy-example" href="#/easy" onClick={(e) => { e.preventDefault(); setDraft({ version: 1, step: 1, name: '수납함', room: '거실', item: ['30', '20', '40'], space: ['40', '30', '50'], example: true }); }}>예제 보기</a></div>
        <div className="easy-actions"><button className="easy-primary" onClick={() => step(1)}>시작하기</button></div>
      </> : draft.step < 4 ? <form noValidate onSubmit={next}>
        {draft.step === 1 && <>
          <label className="easy-search" htmlFor="easy-search">어떤 물건을 놓으시나요? (예: 수납함, 전자레인지, 책장)<input id="easy-search" type="search" maxLength={120} value={draft.name} onChange={(e) => patch({ name: e.target.value })} /></label>
          {draft.name && <div className="easy-search-results" aria-label="찾은 물건">{objects.filter((o) => o.includes(draft.name) && o !== draft.name).map((o) => <button className="easy-link" type="button" key={o} onClick={() => patch({ name: o })}>{o}</button>)}</div>}
          <p className="easy-note">물건의 가장 튀어나온 곳을 기준으로 재 주세요.</p>
          <SizeFields kind="item" value={draft.item} onChange={(item) => patch({ item })} />
        </>}
        {draft.step === 2 && <div className="easy-rooms" role="group" aria-label="놓을 곳">{['거실', '주방', '방'].map((room) => <button type="button" className="easy-room" aria-pressed={draft.room === room} key={room} onClick={() => patch({ room })}><Icon kind={room} /><span>{room}</span></button>)}</div>}
        {draft.step === 3 && <>
          <Tape /><p className="easy-note">놓을 곳의 안쪽을 재 주세요. 세로는 앞뒤 깊이예요.</p>
          <SizeFields kind="space" value={draft.space} onChange={(space) => patch({ space })} />
        </>}
        {unusual && <div className="easy-confirm"><p id="easy-unit-hint">혹시 mm로 재셨나요?</p><p>cm로 잰 숫자가 맞는지 확인해 주세요.</p><button type="button" className="easy-secondary" aria-pressed={confirmed} onClick={() => setConfirmed(!confirmed)} aria-describedby="easy-unit-hint">네, cm가 맞아요</button></div>}
        <div className="easy-actions"><button className="easy-primary" type="submit">{draft.step === 3 ? '결과 보기' : '다음으로'}</button></div>
      </form> : <>
        <div aria-live="polite" aria-busy={busy} className={`easy-result easy-result-${status ?? 'unknown'}`}>
          {busy ? <p>들어갈 수 있는지 맞춰 보고 있어요.</p> : result && <><Icon kind={status ?? ''} /><h2 data-testid="easy-result-title">{resultText}</h2><p>적어 주신 크기대로만 맞춰 본 결과예요.</p>
            <ul>{result.axes.map((a) => <li key={a.label}>{a.itemMm != null && a.spaceMm != null && a.itemMm > a.spaceMm
              ? <strong className="easy-shortage">{a.message}</strong> : a.message}</li>)}</ul>
            <p className="easy-note">문이 잘 열리는지, 넣고 빼기 편한지는 따로 살펴봐 주세요.</p></>}
        </div>
        {result && <ResultDetails result={result} />}
        <div className="easy-actions easy-result-actions"><button className="easy-primary" onClick={() => patch({ step: 1, name: '', item: ['', '', ''] })}>다른 물건 해보기</button><button className="easy-secondary" onClick={() => setDraft(emptyDraft())}>처음으로</button></div>
      </>}
    </main>
    <footer className="easy-footer"><a href="#/projects" onClick={(e) => { e.preventDefault(); onExpert(); }}>전문가 모드</a></footer>
  </div>;
}
