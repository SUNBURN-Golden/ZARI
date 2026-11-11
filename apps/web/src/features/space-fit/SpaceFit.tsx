import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SpaceFitCandidate, SpaceFitInput, SpaceFitPage, SpaceFitUnmeasured } from '../../contracts/generated/dto';
import { validateSpaceFitPage } from '../../contracts/generated/validators.mjs';
import { readBundleFile, workerReviewer } from '../catalog/bundle';
import { LOCAL_IMPORT_ALLOWED, loadCatalog, localCatalog, type LoadedCatalog } from './catalog';
import '../easy/easy.css';
import './space-fit.css';
const DRAFT_KEY = 'zari.space-fit.v1';
const LABELS = ['가로', '깊이', '높이'];
function initialSpace(): [string, string, string] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    if (Array.isArray(parsed) && parsed.length === 3 && parsed.every((v) => typeof v === 'string' && v.length <= 64)) return parsed as [string, string, string];
  } catch { /* A broken draft never changes the old easy-mode draft. */ }
  return ['', '', ''];
}
export function SpaceFit() {
  const [space, setSpace] = useState(initialSpace);
  const [error, setError] = useState('');
  const [invalidAxis, setInvalidAxis] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [loaded, setLoaded] = useState<LoadedCatalog | null>(null);
  const [page, setPage] = useState<SpaceFitPage | null>(null);
  const [singles, setSingles] = useState<SpaceFitCandidate[]>([]);
  const [combos, setCombos] = useState<SpaceFitCandidate[]>([]);
  const [storageError, setStorageError] = useState(false);
  const [localLabel, setLocalLabel] = useState('');
  const worker = useRef<Worker | null>(null);
  const revision = useRef(0);
  // The first page carries the unmeasured preview; later pages send an empty
  // list, so keep the first non-empty snapshot without changing the UI yet.
  const unmeasured = useRef<SpaceFitUnmeasured[]>([]);
  const fields = useRef<(HTMLInputElement | null)[]>([]);
  const stop = () => { worker.current?.terminate(); worker.current = null; revision.current += 1; setBusy(false); };
  useEffect(() => () => { worker.current?.terminate(); revision.current += 1; }, []);
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(space)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [space]);
  const edit = (index: number, value: string) => {
    stop(); setStale(true); setError(''); setInvalidAxis(null);
    setSpace((old) => old.map((s,i) => i === index ? value : s) as [string,string,string]);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); stop(); const current = revision.current;
    setBusy(true); setError(''); setInvalidAxis(null); setPage(null); setSingles([]); setCombos([]); unmeasured.current = [];
    try {
      const catalog = loaded ?? await loadCatalog(workerReviewer());
      if (revision.current !== current) return;
      setLoaded(catalog); setStale(false);
      const next = new Worker(new URL('../../worker/spaceFitWorker.ts', import.meta.url), { type: 'module' });
      worker.current = next;
      next.onerror = () => { if (current === revision.current) { stop(); setError('계산하지 못했어요. 다시 찾아 주세요.'); } };
      next.onmessage = (message: MessageEvent<{ ok: boolean; json?: string; code?: string }>) => {
        if (revision.current !== current) return;
        setBusy(false);
        if (!message.data.ok || !message.data.json) {
          const axisMatch = /^space_axis_([012])$/.exec(message.data.code ?? '');
          if (axisMatch) {
            const axis = Number(axisMatch[1]); setInvalidAxis(axis); fields.current[axis]?.focus();
            setError(`${LABELS[axis]}를 0.1~1000cm, 소수 한 자리까지 적어 주세요.`);
          } else setError('계산하지 못했어요. 다시 찾아 주세요.');
          next.terminate(); worker.current = null; return;
        }
        try {
          const result: unknown = JSON.parse(message.data.json);
          if (!validateSpaceFitPage(result) || result.inputRevision !== String(current) || result.catalogDigest !== catalog.snapshot.catalogDigest) throw new Error('stale_result');
          if (unmeasured.current.length === 0) unmeasured.current = result.unmeasured;
          setPage(result); setSingles((old) => [...old, ...result.singles]); setCombos((old) => [...old, ...result.combinations]);
        } catch { stop(); setError('결과를 읽지 못했어요. 다시 찾아 주세요.'); }
      };
      const input: SpaceFitInput = { schemaVersion: 1, inputRevision: String(current), space, catalog: catalog.snapshot, clearanceMm: [5,5,5], listings: catalog.listings };
      next.postMessage({ type: 'start', json: JSON.stringify(input) });
    } catch {
      if (revision.current === current) { setBusy(false); setError('상품 자료를 아직 받지 못했어요. 연결을 확인한 뒤 다시 찾아 주세요.'); }
    }
  };
  const importLocal = async (file: File) => {
    stop(); const current = revision.current; setError(''); setStale(true);
    try {
      const read = await readBundleFile(file);
      if (!('text' in read)) throw new Error('file_large');
      const catalog = await localCatalog(read.text, workerReviewer());
      if (current !== revision.current) return;
      setLoaded(catalog); setLocalLabel(file.name);
    } catch { if (current === revision.current) setError('상품 파일을 읽지 못했어요. 올바른 치수 번들 파일을 골라 주세요.'); }
  };
  return <div className="easy-shell space-fit-shell">
    <header className="easy-header"><span className="easy-brand">ZARI</span></header>
    <main className="easy-main space-fit-main">
      <h1>빈 공간에 맞는 수납함을 찾아요</h1>
      <p id="space-help">안쪽을 재 주세요. 깊이는 앞에서 뒤까지예요. cm로 적어 주세요.</p>
      <form onSubmit={(event) => void submit(event)} aria-describedby="space-help">
        <div className="easy-dimensions">{LABELS.map((label, i) => <div key={label}>
          <label htmlFor={`space-${i}`}>{label}<span className="easy-input-unit"><input id={`space-${i}`} ref={(node) => { fields.current[i] = node; }} value={space[i]} onChange={(e) => edit(i,e.target.value)} inputMode="decimal" maxLength={64} placeholder={['60','40','40'][i]} aria-invalid={invalidAxis === i || undefined} aria-describedby={invalidAxis === i ? 'space-error' : 'space-help'} /><span aria-hidden="true">cm</span></span></label>
        </div>)}</div>
        <button className="space-find" type="submit" disabled={busy}>맞는 수납함 찾기</button>
      </form>
      {storageError && <p role="status">입력은 이 화면에 있어요. 이 기기에 임시 저장하지 못했어요.</p>}
      {error && <p id="space-error" role="alert" className="easy-error">{error}</p>}
      <p role="status" aria-live="polite">{busy ? '찾고 있어요.' : stale && page ? '크기를 바꿨어요. 다시 찾아 주세요.' : page ? `상품 ${page.inspectedVariants}개를 확인했어요.` : ''}</p>
      {busy && <button type="button" onClick={() => { stop(); setError('찾기를 멈췄어요. 입력은 그대로 있어요.'); }}>찾기 멈추기</button>}
      {page && <section aria-label="찾은 수납함" aria-busy={busy} data-stale={stale}>
        <p>입력한 크기 기준이에요. 축마다 0.5cm를 남겨요.</p>
        <p>문 열기·설치·꺼내기·오차·하중은 확인이 필요해요. 물건이 안에 들어가는지는 검사하지 않았어요.</p>
        <ResultGroup title="딱 맞음" candidates={singles} spaceMm={page.spaceMm} />
        <ResultGroup title="조합" candidates={combos} spaceMm={page.spaceMm} />
        {page.missingDimensions > 0 && <p>치수가 부족한 상품 {page.missingDimensions}개는 계산하지 못했어요.</p>}
        {page.unavailableVariants > 0 && <p>품절로 표시된 상품 {page.unavailableVariants}개는 뺐어요.</p>}
        {!page.combinationsComplete && <><p>조합을 더 찾아볼 수 있어요. 두 종류까지, 바닥에 나란히 놓는 조합을 찾아요. 서로 다른 제품을 쌓지는 않아요.</p><button type="button" disabled={busy || stale || combos.length >= 2000} onClick={() => { setBusy(true); worker.current?.postMessage({ type: 'next', budget: Math.min(1000, 2000-combos.length) }); }}>조합 더 찾기</button></>}
        {combos.length >= 2000 && <p>이 화면에서 보여 줄 수 있는 조합 수에 도달했어요. 공간 크기를 좁혀 다시 찾아 주세요. 모든 조합을 확인한 것은 아니에요.</p>}
        <p>상품 자료: {localLabel ? '개발용 파일' : 'R2에서 받은 자료'}{loaded?.cached ? ' · 저장된 자료로 찾았어요' : ''}</p>
        {loaded?.cacheFailed && <p>상품 자료를 이 기기에 저장하지 못했어요.</p>}
      </section>}
      {LOCAL_IMPORT_ALLOWED && <details className="easy-details"><summary>개발용 상품 파일</summary><label>치수 번들 JSON<input type="file" accept="application/json,.json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importLocal(file); }} /></label>{localLabel && <p role="status">개발용 파일: {localLabel}. 실상품 확인 완료를 뜻하지 않아요.</p>}</details>}
    </main>
    <footer className="easy-footer"><a href="#/easy">물건 크기 비교</a><a href="#/projects">전문가 모드</a></footer>
  </div>;
}
function ResultGroup({ title, candidates, spaceMm }: { title: string; candidates: SpaceFitCandidate[]; spaceMm: number[] }) {
  const [limit, setLimit] = useState(20);
  const confirmed = candidates.filter((c) => !c.unconfirmed), unconfirmed = candidates.filter((c) => c.unconfirmed);
  return <section aria-label={title}><h2>{title}</h2>
    {confirmed.length === 0 && <p>치수를 확인한 수납함은 아직 찾지 못했어요.</p>}
    <ul className="space-results">{confirmed.slice(0,limit).map((c) => <Candidate key={c.id} candidate={c} spaceMm={spaceMm} />)}</ul>
    {confirmed.length > limit && <button type="button" onClick={() => setLimit((n) => n+20)}>더 보기</button>}
    {unconfirmed.length > 0 && <details><summary>치수 확인 중 ({unconfirmed.length}개)</summary><p>치수 근거를 확인하기 전의 개략 결과예요.</p><ul className="space-results">{unconfirmed.slice(0,limit).map((c) => <Candidate key={c.id} candidate={c} spaceMm={spaceMm} />)}</ul>{unconfirmed.length > limit && <button type="button" onClick={() => setLimit((n) => n+20)}>확인 중인 후보 더 보기</button>}</details>}
  </section>;
}
function Candidate({ candidate, spaceMm }: { candidate: SpaceFitCandidate; spaceMm: number[] }) {
  return <li>
    <p>{candidate.blocks.map((b) => `${b.name.replace(/\s+o[0-9a-f]{8}$/, '')} ${b.quantity}개`).join(' + ')}</p>
    {candidate.blocks.map((b) => <div key={b.variantId}>
      <p>{b.unitMm.map((n) => n/10).join(' × ')}cm · 옆으로 {b.grid[0]}개, 앞뒤로 {b.grid[1]}줄{b.grid[2] > 1 ? `, ${b.grid[2]}단으로 쌓기` : ''}{b.orientation === 'upright90' ? ' · 옆으로 돌려 놓아요' : ''}</p>
      <details><summary>크기와 판매처 보기</summary><p>위치: 왼쪽 {b.originMm[0]/10}cm, 앞쪽 {b.originMm[1]/10}cm, 바닥 {b.originMm[2]/10}cm</p><p>가격·재고·판매 묶음은 판매처에서 확인해 주세요.</p>{b.urls.map((url) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">판매처에서 보기 (새 탭)</a>)}</details>
    </div>)}
    <details><summary>놓는 모양 보기</summary><svg className="space-diagram" viewBox={`-5 -5 ${spaceMm[0]!+10} ${spaceMm[1]!+10}`} role="img" aria-label="위에서 본 배치. 왼쪽 앞 바닥을 기준으로 놓아요."><rect className="space-outline" x="0" y="0" width={spaceMm[0]} height={spaceMm[1]} />{candidate.blocks.map((b) => <rect key={b.variantId} className="space-block" x={b.originMm[0]} y={b.originMm[1]} width={b.unitMm[0]*b.grid[0]} height={b.unitMm[1]*b.grid[1]} />)}</svg><p>위에서 본 모양이에요. 수량과 층수는 위의 글자를 확인해 주세요.</p></details>
    <p>{candidate.remainingMm.map((n,i) => `${LABELS[i]}로 ${n/10}cm 남아요`).join(' · ')}</p>
    {(candidate.checks.outer === 'unknown' || candidate.checks.orientation === 'unknown') && <p>손잡이·뚜껑 포함 크기와 놓는 방향을 확인해 주세요.</p>}
    {candidate.blocks.some((b) => b.grid[2] > 1) && <p>쌓을 때 하중과 지지 조건을 확인해 주세요.</p>}
  </li>;
}
