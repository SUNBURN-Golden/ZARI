import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { SpaceFitCandidate, SpaceFitInput, SpaceFitPage, SpaceFitUnmeasured } from '../../contracts/generated/dto';
import { validateSpaceFitPage } from '../../contracts/generated/validators.mjs';
import { readBundleFile, workerReviewer } from '../catalog/bundle';
import { LOCAL_IMPORT_ALLOWED, loadCatalog, localCatalog, type LoadedCatalog } from './catalog';
import {
  REFERENCE_BADGE_COPY,
  REFERENCE_NOTE_COPY,
  candidateTitle,
  displayName,
  distinctMeta,
  isReferencePrice,
  mergeCandidates,
  placementText,
  priceLine,
  remainingText,
  sellerLabel,
  totalQuantityText,
} from './results';
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
  const [combinations, setCombinations] = useState<SpaceFitCandidate[]>([]);
  const [unmeasured, setUnmeasured] = useState<SpaceFitUnmeasured[]>([]);
  const [limit, setLimit] = useState(20);
  const [storageError, setStorageError] = useState(false);
  const [localLabel, setLocalLabel] = useState('');
  const worker = useRef<Worker | null>(null);
  const revision = useRef(0);
  const summary = useRef<HTMLHeadingElement | null>(null);
  // Only the first page of a search moves focus; page appends must not steal it.
  const moveFocus = useRef(false);
  const fields = useRef<(HTMLInputElement | null)[]>([]);
  const results = useMemo(() => mergeCandidates(singles, combinations), [singles, combinations]);
  const stop = () => { worker.current?.terminate(); worker.current = null; revision.current += 1; setBusy(false); };
  useEffect(() => () => { worker.current?.terminate(); revision.current += 1; }, []);
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(space)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [space]);
  useEffect(() => {
    if (!page || !moveFocus.current) return;
    moveFocus.current = false;
    const node = summary.current;
    if (!node) return;
    node.focus();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }, [page]);
  const edit = (index: number, value: string) => {
    stop(); setStale(true); setError(''); setInvalidAxis(null);
    setSpace((old) => old.map((s,i) => i === index ? value : s) as [string,string,string]);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); stop(); const current = revision.current;
    setBusy(true); setError(''); setInvalidAxis(null); setPage(null); setSingles([]); setCombinations([]);
    setUnmeasured([]); setLimit(20); moveFocus.current = true;
    try {
      const catalog = loaded ?? await loadCatalog(workerReviewer());
      if (revision.current !== current) return;
      setLoaded(catalog); setStale(false);
      const next = new Worker(new URL('../../worker/spaceFitWorker.ts', import.meta.url), { type: 'module' });
      worker.current = next;
      // The first page carries `unmeasured`; later pages send an empty list.
      let firstPage = true;
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
          if (firstPage) { setUnmeasured(result.unmeasured); firstPage = false; }
          setPage(result); setSingles((old) => [...old, ...result.singles]); setCombinations((old) => [...old, ...result.combinations]);
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
  const findMoreCombinations = () => {
    if (!worker.current) return;
    setBusy(true);
    worker.current.postMessage({ type: 'next', budget: Math.min(1000, 2000 - combinations.length) });
  };
  return <div className="easy-shell space-fit-shell">
    <header className="easy-header"><span className="easy-brand">ZARI</span></header>
    <main className="easy-main space-fit-main">
      <h1>빈 공간에 맞는 수납함을 찾아요</h1>
      <p id="space-help">안쪽을 재 주세요. 깊이는 앞에서 뒤까지예요. cm로 적어 주세요.</p>
      <form className="space-fit-form" onSubmit={(event) => void submit(event)} aria-describedby="space-help">
        <div className="easy-dimensions">{LABELS.map((label, i) => <div key={label}>
          <label htmlFor={`space-${i}`}>{label}<span className="easy-input-unit"><input id={`space-${i}`} ref={(node) => { fields.current[i] = node; }} value={space[i]} onChange={(e) => edit(i,e.target.value)} inputMode="decimal" enterKeyHint="search" maxLength={64} placeholder={['60','40','40'][i]} aria-invalid={invalidAxis === i || undefined} aria-describedby={invalidAxis === i ? 'space-error' : 'space-help'} /><span aria-hidden="true">cm</span></span></label>
        </div>)}</div>
        <div className="space-find-bar">
          <button className="space-find" type="submit" disabled={busy}>맞는 수납함 찾기</button>
        </div>
      </form>
      {storageError && <p role="status">입력은 이 화면에 있어요. 이 기기에 임시 저장하지 못했어요.</p>}
      {error && <p id="space-error" role="alert" className="easy-error">{error}</p>}
      <p role="status" aria-live="polite">{busy ? '들어갈 수 있는지 맞춰 보고 있어요.' : stale && page ? '크기를 바꿨어요. 다시 찾아 주세요.' : ''}</p>
      {busy && <button type="button" onClick={() => { stop(); setError('찾기를 멈췄어요. 입력은 그대로 있어요.'); }}>찾기 멈추기</button>}
      {page && <section aria-label="찾은 수납함" aria-busy={busy} data-stale={stale}>
        <p>적어 주신 크기대로만 맞춰 본 결과예요. 축마다 0.5cm를 남겨요.</p>
        <p>문이 잘 열리는지, 넣고 빼기 편한지는 따로 살펴봐 주세요.</p>
        {/* The number is outside the live announcement so appends do not re-announce. */}
        <h2 id="space-summary" ref={summary} className="space-summary" tabIndex={-1} aria-live="polite" aria-atomic="true">
          {results.length === 0 ? '고르신 내용에 맞는 수납함이 아직 없어요' : <>이 자리에 맞는 수납함 <span aria-live="off">{results.length}</span>개를 찾았어요</>}
        </h2>
        <ul className="space-results">
          {results.slice(0, limit).map((candidate) => <Candidate key={candidate.id} candidate={candidate} spaceMm={page.spaceMm} />)}
        </ul>
        {results.length > limit && <button type="button" className="space-more" onClick={() => setLimit((n) => n + 20)}>더 보기</button>}
        {!page.combinationsComplete && <><p>조합을 더 찾아볼 수 있어요. 두 종류까지, 바닥에 나란히 놓는 조합을 찾아요. 서로 다른 제품을 쌓지는 않아요.</p><button type="button" disabled={busy || stale || combinations.length >= 2000} onClick={findMoreCombinations}>조합 더 찾기</button></>}
        {combinations.length >= 2000 && <p>이 화면에서 보여 줄 수 있는 조합 수에 도달했어요. 공간 크기를 좁혀 다시 찾아 주세요. 모든 조합을 확인한 것은 아니에요.</p>}
        {page.missingDimensions > 0 && <UnmeasuredGroup items={unmeasured} count={page.missingDimensions} />}
        {page.unavailableVariants > 0 && <p>품절로 표시된 상품 {page.unavailableVariants}개는 뺐어요.</p>}
        <p>상품 자료: {localLabel ? '개발용 파일' : 'R2에서 받은 자료'}{loaded?.cached ? ' · 저장된 자료로 찾았어요' : ''}</p>
        {loaded?.cacheFailed && <p>상품 자료를 이 기기에 저장하지 못했어요.</p>}
      </section>}
      {LOCAL_IMPORT_ALLOWED && <details className="easy-details"><summary>개발용 상품 파일</summary><label>치수 번들 JSON<input type="file" accept="application/json,.json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importLocal(file); }} /></label>{localLabel && <p role="status">개발용 파일: {localLabel}. 실상품 확인 완료를 뜻하지 않아요.</p>}</details>}
    </main>
    <footer className="easy-footer"><a href="#/easy">물건 크기 비교</a><a href="#/projects">전문가 모드</a></footer>
  </div>;
}
function ReferenceBadge({ controlsId, expanded, onToggle }: { controlsId: string; expanded: boolean; onToggle: () => void }) {
  return <button type="button" className="space-badge" aria-expanded={expanded} aria-controls={controlsId} onClick={onToggle}>{REFERENCE_BADGE_COPY}</button>;
}
function Candidate({ candidate, spaceMm }: { candidate: SpaceFitCandidate; spaceMm: number[] }) {
  const [metaOpen, setMetaOpen] = useState(false);
  const [openPrices, setOpenPrices] = useState<string[]>([]);
  const meta = distinctMeta(candidate);
  const noteId = `space-note-${candidate.id}`;
  const links = [...new Set(candidate.blocks.flatMap((block) => block.urls))];
  const stacked = candidate.blocks.some((block) => block.grid[2] > 1);
  const togglePrice = (key: string) => setOpenPrices((old) => old.includes(key) ? old.filter((value) => value !== key) : [...old, key]);
  return <li>
    {(meta.length > 0 || candidate.dimensionProvenance === 'reference') && <div className="space-meta-block">
      <p className="space-meta">
        {meta.map((entry, index) => <span className="space-meta-entry" key={`${entry.seller ?? ''}-${entry.category ?? ''}-${index}`}>
          {index > 0 && <span aria-hidden="true"> · </span>}
          {entry.seller && <span className="space-seller">{entry.seller}</span>}
          {entry.seller && entry.category && <span aria-hidden="true"> · </span>}
          {entry.category}
        </span>)}
        {candidate.dimensionProvenance === 'reference' && <ReferenceBadge controlsId={noteId} expanded={metaOpen} onToggle={() => setMetaOpen((open) => !open)} />}
      </p>
      <p id={noteId} className="space-badge-note" hidden={!metaOpen}>{REFERENCE_NOTE_COPY}</p>
    </div>}
    <h3 className="space-row-title">{candidateTitle(candidate)}</h3>
    <p className="space-count">수납함 {totalQuantityText(candidate)}개가 딱 들어가요</p>
    <p className="space-remaining">{remainingText(candidate)}</p>
    {candidate.blocks.map((block, index) => {
      const line = priceLine(block);
      const key = `${block.variantId}-${index}`;
      const priceNoteId = `space-price-note-${candidate.id}-${index}`;
      const open = openPrices.includes(key);
      return <div className="space-price-block" key={key}>
        <p className="space-price-line">{line.text}{line.kind === 'priced' && isReferencePrice(block) && <ReferenceBadge controlsId={priceNoteId} expanded={open} onToggle={() => togglePrice(key)} />}</p>
        <p id={priceNoteId} className="space-badge-note" hidden={!open}>{REFERENCE_NOTE_COPY}</p>
      </div>;
    })}
    {links.length > 0 && <p className="space-links">{links.map((url) => <a key={url} className="space-link" href={url} target="_blank" rel="noopener noreferrer">판매처에서 보기 (새 탭)</a>)}</p>}
    <details className="space-shape"><summary>놓는 모양 보기</summary>
      <svg className="space-diagram" viewBox={`-5 -5 ${spaceMm[0]!+10} ${spaceMm[1]!+10}`} role="img" aria-label="위에서 본 배치. 왼쪽 앞 바닥을 기준으로 놓아요."><rect className="space-outline" x="0" y="0" width={spaceMm[0]} height={spaceMm[1]} />{candidate.blocks.map((block) => <rect key={block.variantId} className="space-block" x={block.originMm[0]} y={block.originMm[1]} width={block.unitMm[0]*block.grid[0]} height={block.unitMm[1]*block.grid[1]} />)}</svg>
      {candidate.blocks.map((block, index) => <p key={`${block.variantId}-${index}`}>{placementText(block)}</p>)}
      <p>위에서 본 모양이에요. 수량과 층수는 위의 글자를 확인해 주세요.</p>
      {(candidate.checks.outer === 'unknown' || candidate.checks.orientation === 'unknown') && <p>손잡이·뚜껑 포함 크기와 놓는 방향을 확인해 주세요.</p>}
      {stacked && <p>쌓을 때 하중과 지지 조건을 확인해 주세요.</p>}
    </details>
  </li>;
}
function UnmeasuredGroup({ items, count }: { items: SpaceFitUnmeasured[]; count: number }) {
  return <details className="space-unmeasured"><summary>치수 확인 중 ({count}개)</summary>
    <ul className="space-unmeasured-list">
      {items.map((item) => {
        const seller = sellerLabel(item.source);
        return <li key={item.variantId}>
          <p className="space-unmeasured-name">{displayName(item.name)}</p>
          {seller && <p className="space-meta"><span className="space-seller">{seller}</span></p>}
          {item.urls.map((url) => <a key={url} className="space-link" href={url} target="_blank" rel="noopener noreferrer">판매처에서 보기 (새 탭)</a>)}
        </li>;
      })}
    </ul>
  </details>;
}
