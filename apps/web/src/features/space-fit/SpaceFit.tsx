import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import type { SpaceFitCandidate, SpaceFitInput, SpaceFitPage } from '../../contracts/generated/dto';
import { validateSpaceFitPage } from '../../contracts/generated/validators.mjs';
import { readBundleFile, workerReviewer } from '../catalog/bundle';
import { LOCAL_IMPORT_ALLOWED, loadCatalog, localCatalog, type LoadedCatalog } from './catalog';
import { mergeCandidates, REFERENCE_NOTICE, SPACE_FIT_COPY } from './results';
import { SimpleResults } from './SimpleResults';
import {
  DEFAULT_VIEW,
  emptyReason,
  facetOptions,
  filterCandidates,
  needsMixedStep,
  parseViewState,
  serializeViewState,
  sortCandidates,
  type FacetOptions,
  type SortKey,
  type ViewState,
} from './view';
import {
  CLEARANCE_OPTIONS_MM,
  CLEARANCE_STORAGE_KEY,
  DEFAULT_CLEARANCE_MM,
  clearanceLabel,
  parseClearance,
  type ClearanceMm,
} from './clearance';
import '../easy/easy.css';
import './space-fit.css';
const DRAFT_KEY = 'zari.space-fit.v1';
const LABELS = ['가로', '깊이', '높이'];
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'leftover', label: '빈틈없이 꽉 차는 순' },
  { key: 'price', label: '가격 싼 순' },
  { key: 'count', label: '수납함 많이 들어가는 순' },
];
function initialSpace(): [string, string, string] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    if (Array.isArray(parsed) && parsed.length === 3 && parsed.every((v) => typeof v === 'string' && v.length <= 64)) return parsed as [string, string, string];
  } catch { /* A broken draft never changes the old easy-mode draft. */ }
  return ['', '', ''];
}
function initialClearance(): ClearanceMm {
  try { return parseClearance(localStorage.getItem(CLEARANCE_STORAGE_KEY)); } catch { return DEFAULT_CLEARANCE_MM; }
}
function persistClearance(value: ClearanceMm) {
  // Storage failures keep the current screen usable, like the dimension draft.
  try { localStorage.setItem(CLEARANCE_STORAGE_KEY, String(value)); } catch { /* ignored */ }
}
export function SpaceFit() {
  const [space, setSpace] = useState(initialSpace);
  const [error, setError] = useState('');
  const [invalidAxis, setInvalidAxis] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [loaded, setLoaded] = useState<LoadedCatalog | null>(null);
  const [page, setPage] = useState<SpaceFitPage | null>(null);
  // The clearance belongs to the search that produced the visible page.
  const [pageClearance, setPageClearance] = useState<ClearanceMm>(DEFAULT_CLEARANCE_MM);
  const [clearance, setClearance] = useState<ClearanceMm>(initialClearance);
  const [loadFailed, setLoadFailed] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [singles, setSingles] = useState<SpaceFitCandidate[]>([]);
  const [combinations, setCombinations] = useState<SpaceFitCandidate[]>([]);
  const [storageError, setStorageError] = useState(false);
  const [localLabel, setLocalLabel] = useState('');
  const [view, setView] = useState<ViewState>(() => parseViewState(location.hash));
  const [autoStepping, setAutoStepping] = useState(false);
  // Announces the filtered count after a 더 고르기 change (appends stay silent).
  const [filterStatus, setFilterStatus] = useState('');
  const worker = useRef<Worker | null>(null);
  const revision = useRef(0);
  const summary = useRef<HTMLHeadingElement | null>(null);
  const combinationsRef = useRef<SpaceFitCandidate[]>([]);
  // Only the first page of a search moves focus; page appends must not steal it.
  const moveFocus = useRef(false);
  const fields = useRef<(HTMLInputElement | null)[]>([]);
  const allResults = useMemo(() => mergeCandidates(singles, combinations), [singles, combinations]);
  const facets = useMemo(() => facetOptions(allResults), [allResults]);
  // Filtering and sorting only reorder the worker's candidates; fit stays in Rust.
  const shown = useMemo(() => sortCandidates(filterCandidates(allResults, view), view.sort), [allResults, view]);
  const emptyBlock = useRef<HTMLDivElement | null>(null);
  const reason = emptyReason({ hasPage: page !== null, loadFailed, stopped, total: allResults.length, shown: shown.length });
  const applyView = (next: ViewState) => {
    setView(next);
    setStopped(false);
    // The root path canonicalizes to #/space-fit so a shared view link opens
    // Space Fit even when this device last used expert mode.
    const current = location.hash.split('?')[0] ?? '';
    const path = current && current !== '#/' ? current : '#/space-fit';
    // replaceState keeps filter changes out of history and fires no hashchange.
    history.replaceState(null, '', serializeViewState(path, next));
    const count = sortCandidates(filterCandidates(allResults, next), next.sort).length;
    setFilterStatus(count === 0 ? (allResults.length === 0 ? SPACE_FIT_COPY.noFit : SPACE_FIT_COPY.filteredEmpty) : `이 자리에 맞는 수납함 ${count}개를 찾았어요`);
  };
  const stop = () => { worker.current?.terminate(); worker.current = null; revision.current += 1; setBusy(false); setAutoStepping(false); };
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
  // noData/stopped sit below the tall form; bring them into view like the summary.
  useEffect(() => {
    if (reason !== 'noData' && reason !== 'stopped') return;
    const node = emptyBlock.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  }, [reason]);
  const edit = (index: number, value: string) => {
    stop(); setStale(true); setError(''); setInvalidAxis(null); setStopped(false);
    setSpace((old) => old.map((s,i) => i === index ? value : s) as [string,string,string]);
  };
  /**
   * The single search path. `moveFocus` is true for a new search and false for
   * a clearance re-run, which keeps the results screen (and the pressed chip)
   * mounted so focus never leaves it.
   */
  const runSearch = async ({ moveFocus: focusSummary, clearanceMm = clearance }: { moveFocus: boolean; clearanceMm?: ClearanceMm }) => {
    stop(); const current = revision.current;
    const keepPage = !focusSummary && page !== null;
    setBusy(true); setError(''); setInvalidAxis(null); setLoadFailed(false); setStopped(false);
    // A clearance re-run keeps the old rows until its first page replaces them,
    // so the summary never flashes the empty text while it recomputes.
    if (!keepPage) { setPage(null); setSingles([]); setCombinations([]); }
    combinationsRef.current = []; setFilterStatus('');
    moveFocus.current = focusSummary;
    let catalog: LoadedCatalog;
    try {
      catalog = loaded ?? await loadCatalog(workerReviewer());
    } catch {
      // The catalog itself is unavailable: this is a distinct empty state from
      // a search that ran and found nothing, so no role=alert is emitted.
      if (revision.current === current) { setBusy(false); setLoadFailed(true); }
      return;
    }
    if (revision.current !== current) return;
    setLoaded(catalog); setStale(false);
    try {
      const next = new Worker(new URL('../../worker/spaceFitWorker.ts', import.meta.url), { type: 'module' });
      worker.current = next;
      let firstPage = true;
      // Bounded automatic steps toward two-product mixes (see needsMixedStep).
      let autoSteps = 0;
      // The first page of this search replaces any rows kept from the last one.
      let appended = false;
      next.onerror = () => { if (current === revision.current) { stop(); setError('계산하지 못했어요. 다시 찾아 주세요.'); } };
      next.onmessage = (message: MessageEvent<{ ok: boolean; json?: string; code?: string }>) => {
        if (revision.current !== current) return;
        if (!message.data.ok || !message.data.json) {
          setBusy(false);
          const axisMatch = /^space_axis_([012])$/.exec(message.data.code ?? '');
          setAutoStepping(false);
          if (axisMatch) {
            const axis = Number(axisMatch[1]); setInvalidAxis(axis); fields.current[axis]?.focus();
            setError(`${LABELS[axis]}를 0.1~1000cm, 소수 한 자리까지 적어 주세요.`);
          } else setError('계산하지 못했어요. 다시 찾아 주세요.');
          next.terminate(); worker.current = null; return;
        }
        try {
          const result: unknown = JSON.parse(message.data.json);
          if (!validateSpaceFitPage(result) || result.inputRevision !== String(current) || result.catalogDigest !== catalog.snapshot.catalogDigest) throw new Error('stale_result');
          if (firstPage) {
            setPageClearance(clearanceMm);
            firstPage = false;
          }
          const combined = [...combinationsRef.current, ...result.combinations];
          const replace = !appended;
          appended = true;
          combinationsRef.current = combined;
          setPage(result); setSingles((old) => replace ? result.singles : [...old, ...result.singles]); setCombinations(combined);
          // One auto-step per response, behind the same revision guard. The busy
          // status stays up until the sequence stops, and focus already moved
          // once on the first page.
          setBusy(false);
          if (needsMixedStep(result.combinationsComplete, combined, autoSteps)) {
            autoSteps += 1;
            setAutoStepping(true);
            next.postMessage({ type: 'next', budget: 1000 });
          } else setAutoStepping(false);
        } catch { stop(); setError('결과를 읽지 못했어요. 다시 찾아 주세요.'); }
      };
      const input: SpaceFitInput = { schemaVersion: 1, inputRevision: String(current), space, catalog: catalog.snapshot, clearanceMm: [clearanceMm, clearanceMm, clearanceMm], listings: catalog.listings };
      next.postMessage({ type: 'start', json: JSON.stringify(input) });
    } catch {
      if (revision.current === current) { stop(); setError('계산하지 못했어요. 다시 찾아 주세요.'); }
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void runSearch({ moveFocus: true });
  };
  const chooseClearance = (value: ClearanceMm) => {
    if (value === clearance) return;
    setClearance(value);
    persistClearance(value);
    // Only a visible result page has a search to repeat; before the first
    // search the choice is just an input for the next submit.
    // An in-flight search restarts too, so the shown page always matches the chip.
    if (page || busy) void runSearch({ moveFocus: page === null, clearanceMm: value });
  };
  const resetAll = () => {
    applyView(DEFAULT_VIEW);
    if (clearance === DEFAULT_CLEARANCE_MM) return;
    setClearance(DEFAULT_CLEARANCE_MM);
    persistClearance(DEFAULT_CLEARANCE_MM);
    // A reset that changes clearance repeats the search with the new value.
    if (page) void runSearch({ moveFocus: false, clearanceMm: DEFAULT_CLEARANCE_MM });
  };
  const stopByUser = () => {
    // A stopped clearance re-run leaves the old page; mark it stale so it is not shown as current.
    if (page && clearance !== pageClearance) setStale(true);
    stop();
    // With a page shown the results stay; only the status line changes.
    setStopped(true);
  };
  const importLocal = async (file: File) => {
    stop(); const current = revision.current; setError(''); setStale(true); setStopped(false); setLoadFailed(false);
    try {
      const read = await readBundleFile(file);
      if (!('text' in read)) throw new Error('file_large');
      const catalog = await localCatalog(read.text, workerReviewer());
      if (current !== revision.current) return;
      setLoaded(catalog); setLocalLabel(file.name);
    } catch { if (current === revision.current) setError('상품 파일을 읽지 못했어요. 올바른 치수 번들 파일을 골라 주세요.'); }
  };
  const summaryText = shown.length === 0
    ? (reason === 'noFit' ? SPACE_FIT_COPY.noFit : SPACE_FIT_COPY.filteredEmpty)
    : `이 자리에 맞는 수납함 ${shown.length}개를 찾았어요`;
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
      {reason === 'noData' && <div className="space-empty" data-reason="noData" role="status" tabIndex={-1} ref={emptyBlock}>
        <p>상품 자료를 아직 받지 못했어요. 연결을 확인한 뒤 다시 찾아 주세요.</p>
        <button type="button" className="space-empty-action" onClick={() => void runSearch({ moveFocus: true })}>맞는 수납함 찾기</button>
      </div>}
      {reason === 'stopped' && <div className="space-empty" data-reason="stopped" role="status" tabIndex={-1} ref={emptyBlock}>
        <p>찾기를 멈췄어요. 입력은 그대로 있어요.</p>
        <button type="button" className="space-empty-action" onClick={() => void runSearch({ moveFocus: true })}>맞는 수납함 찾기</button>
      </div>}
      <p role="status" aria-live="polite">{busy ? '들어갈 수 있는지 맞춰 보고 있어요.' : stopped && page ? '찾기를 멈췄어요. 입력은 그대로 있어요.' : stale && page ? '크기를 바꿨어요. 다시 찾아 주세요.' : ''}</p>
      {(busy || autoStepping) && <button type="button" onClick={stopByUser}>찾기 멈추기</button>}
      {page && <section className="sf-results" aria-labelledby="space-summary" aria-busy={busy} data-stale={stale}>
        <p className="space-visually-hidden" role="status" aria-live="polite" aria-atomic="true">{filterStatus}</p>
        <h2 id="space-summary" ref={summary} className="sf-summary" tabIndex={-1} aria-live="polite" aria-atomic="true">
          {shown.length === 0 ? summaryText : <>이 자리에 맞는 수납함 <span aria-live="off">{shown.length}</span>개를 찾았어요</>}
        </h2>
        <p className="sf-notice">{REFERENCE_NOTICE}</p>
        {!busy && reason === 'filters' && <div className="space-empty" data-reason="filters">
          <div className="space-empty-actions">
            <button type="button" className="space-reset-inline" onClick={resetAll}>처음대로 돌리기</button>
          </div>
        </div>}
        <SimpleResults key={`${page.inputRevision}-${view.sort}-${view.sellers.join(',')}`} candidates={shown} />
        <p className="sf-footnote">문이 잘 열리는지, 넣고 빼기 편한지는 따로 살펴봐 주세요.</p>
        <MoreFilters view={view} facets={facets} clearance={clearance} onClearanceChange={chooseClearance} onChange={applyView} onReset={resetAll} />
      </section>}
      {LOCAL_IMPORT_ALLOWED && <details className="easy-details"><summary>개발용 상품 파일</summary><label>치수 번들 JSON<input type="file" accept="application/json,.json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importLocal(file); }} /></label>{localLabel && <p role="status">개발용 파일: {localLabel}. 실상품 확인 완료를 뜻하지 않아요.</p>}</details>}
    </main>
  </div>;
}
/**
 * The clearance chips. The same fieldset appears in 더 고르기; useId keeps
 * each description link unique if more than one instance is ever mounted.
 */
function ClearanceField({ value, onChange, hideLegend = false }: { value: ClearanceMm; onChange: (value: ClearanceMm) => void; hideLegend?: boolean }) {
  const descriptionId = useId();
  return <fieldset className="space-filter-group space-clearance" aria-describedby={descriptionId}>
    <legend className={hideLegend ? 'space-visually-hidden' : undefined}>여유 틈</legend>
    <p id={descriptionId} className="space-clearance-description">수납함이 빡빡하지 않게 남길 틈이에요</p>
    <div className="space-filter-options">
      {CLEARANCE_OPTIONS_MM.map((option) => <button key={option} type="button" className="space-filter-option" aria-pressed={value === option} onClick={() => onChange(option)}>{clearanceLabel(option)}</button>)}
    </div>
  </fieldset>;
}

/** 여유 틈, 정렬, 판매처. Closed by default; at the bottom of the results. */
function MoreFilters({ view, facets, clearance, onClearanceChange, onChange, onReset }: {
  view: ViewState;
  facets: FacetOptions;
  clearance: ClearanceMm;
  onClearanceChange: (value: ClearanceMm) => void;
  onChange: (next: ViewState) => void;
  onReset: () => void;
}) {
  const toggleSeller = (value: string) => {
    const values = view.sellers;
    onChange({ ...view, sellers: values.includes(value) ? values.filter((item) => item !== value) : [...values, value] });
  };
  return <details className="sf-more-options">
    <summary>더 고르기</summary>
    <div className="sf-more-options-panel">
      <ClearanceField value={clearance} onChange={onClearanceChange} />
      <fieldset className="space-filter-group">
        <legend>보여주는 순서</legend>
        <div className="space-filter-options">
          {SORT_OPTIONS.map((option) => <button key={option.key} type="button" className="space-filter-option" aria-pressed={view.sort === option.key} onClick={() => onChange({ ...view, sort: option.key })}>{option.label}</button>)}
        </div>
      </fieldset>
      <fieldset className="space-filter-group">
        <legend>파는 곳</legend>
        <div className="space-filter-options">
          <button type="button" className="space-filter-option" aria-pressed={view.sellers.length === 0} onClick={() => onChange({ ...view, sellers: [] })}>모두 보기</button>
          {facets.sellers.map((seller) => <button key={seller.value} type="button" className="space-filter-option" aria-pressed={view.sellers.includes(seller.value)} onClick={() => toggleSeller(seller.value)}>{seller.label}</button>)}
        </div>
      </fieldset>
      <button type="button" className="space-filter-reset" onClick={onReset}>처음대로 돌리기</button>
    </div>
  </details>;
}
