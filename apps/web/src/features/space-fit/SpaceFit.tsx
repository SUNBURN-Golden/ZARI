import { createPortal } from 'react-dom';
import { Fragment, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { SpaceFitCandidate, SpaceFitInput, SpaceFitPage, SpaceFitUnmeasured } from '../../contracts/generated/dto';
import { validateSpaceFitPage } from '../../contracts/generated/validators.mjs';
import { readBundleFile, workerReviewer } from '../catalog/bundle';
import { LOCAL_IMPORT_ALLOWED, loadCatalog, localCatalog, type LoadedCatalog } from './catalog';
import {
  REFERENCE_BADGE_COPY,
  REFERENCE_NOTE_COPY,
  displayName,
  distinctMeta,
  mergeCandidates,
  placementText,
  isReferencePrice,
  priceLine,
  remainingParts,
  rowTitle,
  sellerLabel,
  SPACE_FIT_COPY,
  UNMEASURED_PREVIEW_CAP,
  totalQuantityText,
} from './results';
import { sketchFor } from './sketches';
import {
  DEFAULT_VIEW,
  emptyReason,
  facetOptions,
  filterCandidates,
  needsMixedStep,
  COMBINATION_CAP,
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
  formatClearanceCm,
  parseClearance,
  type ClearanceMm,
} from './clearance';
import { useWindowedRows } from './windowing';
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
  const [unmeasured, setUnmeasured] = useState<SpaceFitUnmeasured[]>([]);
  const [limit, setLimit] = useState(20);
  const [storageError, setStorageError] = useState(false);
  const [localLabel, setLocalLabel] = useState('');
  const [view, setView] = useState<ViewState>(() => parseViewState(location.hash));
  const [sheetOpen, setSheetOpen] = useState(false);
  // Background steps toward two-product mixes; the result screen stays usable.
  const [autoStepping, setAutoStepping] = useState(false);
  // Announces the filtered count after a chip change (appends stay silent).
  const [filterStatus, setFilterStatus] = useState('');
  const worker = useRef<Worker | null>(null);
  const revision = useRef(0);
  const summary = useRef<HTMLHeadingElement | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const combinationsRef = useRef<SpaceFitCandidate[]>([]);
  // Only the first page of a search moves focus; page appends must not steal it.
  const moveFocus = useRef(false);
  const fields = useRef<(HTMLInputElement | null)[]>([]);
  const allResults = useMemo(() => mergeCandidates(singles, combinations), [singles, combinations]);
  const facets = useMemo(() => facetOptions(allResults), [allResults]);
  // Filtering and sorting only reorder the worker's candidates; fit stays in Rust.
  const shown = useMemo(() => sortCandidates(filterCandidates(allResults, view), view.sort), [allResults, view]);
  const visibleCount = Math.min(limit, shown.length);
  // Below 1,000 rendered rows this keeps every row; above it renders a window.
  const windowed = useWindowedRows(visibleCount);
  const emptyBlock = useRef<HTMLDivElement | null>(null);
  const reason = emptyReason({ hasPage: page !== null, loadFailed, stopped, total: allResults.length, shown: shown.length });
  // When the list is windowed, only the rows in view (plus overscan) render.
  const rowStart = windowed.active ? windowed.range.start : 0;
  const rowEnd = windowed.active ? windowed.range.end : visibleCount;
  const applyView = (next: ViewState) => {
    setView(next);
    setLimit(20);
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
  const toggleFacet = (key: 'sellers' | 'types', value: string) => {
    const values = view[key];
    applyView({ ...view, [key]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value] });
  };
  const closeSheet = () => setSheetOpen(false);
  // Return focus after the sheet unmounts and #root is no longer inert.
  const sheetWasOpen = useRef(false);
  useEffect(() => {
    if (sheetOpen) { sheetWasOpen.current = true; return; }
    if (sheetWasOpen.current) { sheetWasOpen.current = false; opener.current?.focus(); }
  }, [sheetOpen]);
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
    if (!keepPage) { setPage(null); setSingles([]); setCombinations([]); setUnmeasured([]); }
    combinationsRef.current = []; setFilterStatus('');
    setLimit(20); moveFocus.current = focusSummary;
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
      // The first page carries `unmeasured`; later pages send an empty list.
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
            setUnmeasured(result.unmeasured);
            // The scope line describes the clearance of the shown page.
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
  const findMoreCombinations = () => {
    if (!worker.current) return;
    setStopped(false); setBusy(true);
    worker.current.postMessage({ type: 'next', budget: Math.min(1000, COMBINATION_CAP - combinations.length) });
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
        <details className="space-clearance-details">
          <summary>여유 틈</summary>
          <ClearanceField value={clearance} onChange={chooseClearance} hideLegend />
        </details>
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
      {page && <section aria-label="찾은 수납함" aria-busy={busy} data-stale={stale}>
        <p>적어 주신 크기대로만 맞춰 본 결과예요. 축마다 {formatClearanceCm(pageClearance)}cm를 남겨요.</p>
        <p>문이 잘 열리는지, 넣고 빼기 편한지는 따로 살펴봐 주세요.</p>
        <div className="space-results-layout">
          <div className="space-filter-column">
            <FilterPanel view={view} facets={facets} clearance={clearance} onClearanceChange={chooseClearance} onChange={applyView} onReset={resetAll} />
          </div>
          <div className="space-results-main">
            {/* The number is outside the live announcement so appends do not re-announce. */}
            <p className="space-visually-hidden" role="status">{filterStatus}</p>
            <h2 id="space-summary" ref={summary} className="space-summary" tabIndex={-1} aria-live="polite" aria-atomic="true">
              {shown.length === 0 ? (reason === 'noFit' ? SPACE_FIT_COPY.noFit : SPACE_FIT_COPY.filteredEmpty) : <>이 자리에 맞는 수납함 <span aria-live="off">{shown.length}</span>개를 찾았어요</>}
            </h2>
            {!busy && reason === 'filters' && <div className="space-empty" data-reason="filters">
              <div className="space-empty-actions">
                <button type="button" className="space-reset-inline" onClick={resetAll}>처음대로 돌리기</button>
                <button type="button" className="space-empty-reselect" onClick={() => setSheetOpen(true)}>다시 골라보기</button>
              </div>
            </div>}
            {/* noFit is the summary alone; its advice (SPACE_FIT_COPY.noFit) is Argon-approved. */}
            {/* Quick toggles only; '모두 보기' per group lives in the sheet so the row has no duplicate names. */}
            <div className="space-chip-row">
              <button type="button" className="space-chip space-filter-open" ref={opener} onClick={() => setSheetOpen(true)}>순서·가게 고르기</button>
              {facets.sellers.map((seller) => <button key={seller.value} type="button" className="space-chip" aria-pressed={view.sellers.includes(seller.value)} onClick={() => toggleFacet('sellers', seller.value)}>{seller.label}</button>)}
              {facets.types.map((type) => <button key={type} type="button" className="space-chip" aria-pressed={view.types.includes(type)} onClick={() => toggleFacet('types', type)}>{type}</button>)}
            </div>
            <ul className="space-results" ref={windowed.listRef}>
              {windowed.active && windowed.topHeight > 0 && <li className="space-row-spacer" aria-hidden="true" style={{ height: windowed.topHeight }} />}
              {shown.slice(rowStart, rowEnd).map((candidate, index) => <Candidate key={candidate.id} candidate={candidate} spaceMm={page.spaceMm} deferred={!windowed.active && rowStart + index >= 200} position={windowed.active ? { setSize: visibleCount, posInSet: rowStart + index + 1 } : null} />)}
              {windowed.active && windowed.bottomHeight > 0 && <li className="space-row-spacer" aria-hidden="true" style={{ height: windowed.bottomHeight }} />}
            </ul>
            {shown.length > limit && <button type="button" className="space-more" onClick={() => setLimit((n) => n + 20)}>더 보기</button>}
            {!page.combinationsComplete && <><p>조합을 더 찾아볼 수 있어요. 두 종류까지, 바닥에 나란히 놓는 조합을 찾아요. 서로 다른 제품을 쌓지는 않아요.</p><button type="button" className="space-more" disabled={busy || autoStepping || stale || stopped || combinations.length >= COMBINATION_CAP} onClick={findMoreCombinations}>조합 더 찾기</button></>}
            {combinations.length >= COMBINATION_CAP && <p>이 화면에서 보여 줄 수 있는 조합 수에 도달했어요. 공간 크기를 좁혀 다시 찾아 주세요. 모든 조합을 확인한 것은 아니에요.</p>}
            {page.missingDimensions > 0 && <UnmeasuredGroup items={unmeasured} count={page.missingDimensions} />}
            {page.unavailableVariants > 0 && <p>품절로 표시된 상품 {page.unavailableVariants}개는 뺐어요.</p>}
            <p>상품 자료: {localLabel ? '개발용 파일' : 'R2에서 받은 자료'}{loaded?.cached ? ' · 저장된 자료로 찾았어요' : ''}</p>
            {loaded?.cacheFailed && <p>상품 자료를 이 기기에 저장하지 못했어요.</p>}
          </div>
        </div>
      </section>}
      {sheetOpen && createPortal(<FilterSheet view={view} facets={facets} clearance={clearance} onClearanceChange={chooseClearance} onChange={applyView} onReset={resetAll} onClose={closeSheet} />, document.body)}
      {LOCAL_IMPORT_ALLOWED && <details className="easy-details"><summary>개발용 상품 파일</summary><label>치수 번들 JSON<input type="file" accept="application/json,.json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importLocal(file); }} /></label>{localLabel && <p role="status">개발용 파일: {localLabel}. 실상품 확인 완료를 뜻하지 않아요.</p>}</details>}
    </main>
    <footer className="easy-footer"><a href="#/easy">물건 크기 비교</a><a href="#/projects">전문가 모드</a></footer>
  </div>;
}
/**
 * The clearance chips. The same fieldset appears in the input form, the mobile
 * sheet and the desktop column; useId keeps each description link unique.
 */
function ClearanceField({ value, onChange, hideLegend = false }: { value: ClearanceMm; onChange: (value: ClearanceMm) => void; hideLegend?: boolean }) {
  const descriptionId = useId();
  return <fieldset className="space-filter-group space-clearance" aria-describedby={descriptionId}>
    {/* In the form the <summary> already shows '여유 틈'; the legend stays for screen readers. */}
    <legend className={hideLegend ? 'space-visually-hidden' : undefined}>여유 틈</legend>
    <p id={descriptionId} className="space-clearance-description">수납함이 빡빡하지 않게 남길 틈이에요</p>
    <div className="space-filter-options">
      {CLEARANCE_OPTIONS_MM.map((option) => <button key={option} type="button" className="space-filter-option" aria-pressed={value === option} onClick={() => onChange(option)}>{clearanceLabel(option)}</button>)}
    </div>
  </fieldset>;
}

/** Shared by the mobile sheet and the desktop sticky column (CSS shows one). */
function FilterPanel({ view, facets, clearance, onClearanceChange, onChange, onReset, showReset = true }: {
  view: ViewState;
  facets: FacetOptions;
  clearance: ClearanceMm;
  onClearanceChange: (value: ClearanceMm) => void;
  onChange: (next: ViewState) => void;
  onReset: () => void;
  showReset?: boolean;
}) {
  const toggle = (key: 'sellers' | 'types', value: string) => {
    const values = view[key];
    onChange({ ...view, [key]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value] });
  };
  return <div className="space-filter-panel">
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
        {facets.sellers.map((seller) => <button key={seller.value} type="button" className="space-filter-option" aria-pressed={view.sellers.includes(seller.value)} onClick={() => toggle('sellers', seller.value)}>{seller.label}</button>)}
      </div>
    </fieldset>
    <fieldset className="space-filter-group">
      <legend>수납함 모양</legend>
      <div className="space-filter-options">
        <button type="button" className="space-filter-option" aria-pressed={view.types.length === 0} onClick={() => onChange({ ...view, types: [] })}>모두 보기</button>
        {facets.types.map((type) => <button key={type} type="button" className="space-filter-option" aria-pressed={view.types.includes(type)} onClick={() => toggle('types', type)}>{type}</button>)}
      </div>
    </fieldset>
    {showReset && <button type="button" className="space-filter-reset" onClick={onReset}>처음대로 돌리기</button>}
  </div>;
}

/**
 * Mobile bottom sheet. Focus moves to the heading on open, Tab/Shift+Tab cycle
 * inside, Esc and the scrim close, and the parent returns focus to the opener.
 */
function FilterSheet({ view, facets, clearance, onClearanceChange, onChange, onReset, onClose }: {
  view: ViewState;
  facets: FacetOptions;
  clearance: ClearanceMm;
  onClearanceChange: (value: ClearanceMm) => void;
  onChange: (next: ViewState) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement | null>(null);
  const title = useRef<HTMLHeadingElement | null>(null);
  // Like PrintPanel: the app behind the sheet is inert, so clicks on non-focusable
  // sheet parts or the scrim can never send Tab focus back into the page.
  useEffect(() => {
    const app = document.getElementById('root');
    app?.setAttribute('inert', '');
    document.body.setAttribute('data-space-sheet-open', 'true');
    title.current?.focus();
    return () => { app?.removeAttribute('inert'); document.body.removeAttribute('data-space-sheet-open'); };
  }, []);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (!nodes || nodes.length === 0) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    if (event.shiftKey) {
      if (document.activeElement === first || document.activeElement === title.current) { event.preventDefault(); last.focus(); }
    } else if (document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <div className="space-sheet-root">
    <div className="space-sheet-scrim" aria-hidden="true" onClick={onClose} />
    <div className="space-sheet" role="dialog" aria-modal="true" aria-labelledby="space-sheet-title" ref={dialog} onKeyDown={onKeyDown}>
      <div className="space-sheet-head">
        <h2 id="space-sheet-title" ref={title} tabIndex={-1}>순서·가게 고르기</h2>
        <button type="button" className="space-sheet-close" onClick={onClose}>닫기</button>
      </div>
      <FilterPanel view={view} facets={facets} clearance={clearance} onClearanceChange={onClearanceChange} onChange={onChange} onReset={onReset} showReset={false} />
      <div className="space-sheet-footer">
        <button type="button" className="space-sheet-reset" onClick={onReset}>처음대로 돌리기</button>
        <button type="button" className="space-sheet-apply" onClick={onClose}>이대로 보기</button>
      </div>
    </div>
  </div>;
}

function ReferenceBadge({ controlsId, expanded, onToggle }: { controlsId: string; expanded: boolean; onToggle: () => void }) {
  return <button type="button" className="space-badge" aria-expanded={expanded} aria-controls={controlsId} onClick={onToggle}><span className="space-badge-pill">{REFERENCE_BADGE_COPY}</span></button>;
}
function Candidate({ candidate, spaceMm, deferred = false, position = null }: {
  candidate: SpaceFitCandidate;
  spaceMm: number[];
  deferred?: boolean;
  /** aria-setsize/posinset are only needed while the list is windowed. */
  position?: { setSize: number; posInSet: number } | null;
}) {
  const [metaOpen, setMetaOpen] = useState(false);
  const meta = distinctMeta(candidate);
  const noteId = `space-note-${candidate.id}`;
  const multi = new Set(candidate.blocks.map((block) => block.variantId)).size > 1;
  // Every result link is a full-width row: product name plus the action text.
  // One link per distinct variant/url pair, numbered when a display name
  // repeats so the accessible name stays unique per row.
  const seen = new Set<string>();
  const links: { key: string; url: string; name: string }[] = [];
  for (const block of candidate.blocks) for (const url of block.urls) {
    const key = `${block.variantId}|${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ key, url, name: displayName(block.name) });
  }
  const nameCount = new Map<string, number>();
  for (const link of links) nameCount.set(link.name, (nameCount.get(link.name) ?? 0) + 1);
  const nameSeen = new Map<string, number>();
  for (const link of links) {
    const n = (nameSeen.get(link.name) ?? 0) + 1;
    nameSeen.set(link.name, n);
    if ((nameCount.get(link.name) ?? 0) > 1) link.name = `${link.name} ${n}`;
  }
  const stacked = candidate.blocks.some((block) => block.grid[2] > 1);
  // Our own drawings only, at most two per row, hidden when none exist.
  const sketches = [...new Set(candidate.blocks.map((block) => sketchFor(block.variantId)).filter((src): src is string => src !== null))].slice(0, 2);
  return <li data-candidate-id={candidate.id} className={deferred ? 'space-row-deferred' : undefined} aria-setsize={position?.setSize} aria-posinset={position?.posInSet}>
    {(meta.length > 0 || candidate.dimensionProvenance === 'reference') && <div className="space-meta-block">
      <p className="space-meta">
        {meta.map((entry, index) => <span className="space-meta-entry" key={`${entry.seller ?? ''}-${entry.category ?? ''}-${index}`}>
          {entry.seller && <span className="space-seller">{entry.seller}</span>}
          {entry.seller && entry.category && <span aria-hidden="true" className="space-meta-sep">·</span>}
          {entry.category}
        </span>)}
        {candidate.dimensionProvenance === 'reference' && <ReferenceBadge controlsId={noteId} expanded={metaOpen} onToggle={() => setMetaOpen((open) => !open)} />}
      </p>
      <p id={noteId} className="space-badge-note" hidden={!metaOpen}>{REFERENCE_NOTE_COPY}</p>
    </div>}
    {sketches.length > 0
      ? <div className="space-row-head">
        <div className="space-row-head-text">
          <h3 className="space-row-title">{rowTitle(candidate)}</h3>
          <p className="space-count">수납함 {totalQuantityText(candidate)}개가 딱 들어가요</p>
        </div>
        {/* Decorative: the title already names the product. */}
        <div className="space-sketches">{sketches.map((src) => <img key={src} className="space-sketch" src={src} alt="" width={72} height={72} loading="lazy" decoding="async" />)}</div>
      </div>
      : <>
        <h3 className="space-row-title">{rowTitle(candidate)}</h3>
        <p className="space-count">수납함 {totalQuantityText(candidate)}개가 딱 들어가요</p>
      </>}
    <p className="space-remaining">{remainingParts(candidate).map((part, index) => <Fragment key={`${index}-${part}`}>{index > 0 && ' '}<span className="space-remaining-part">{index > 0 && '· '}{part}</span></Fragment>)}</p>
    {candidate.blocks.map((block, index) => {
      const line = priceLine(block);
      // One unknown-price line is enough when every block's price is unknown.
      if (index > 0 && line.kind === 'unknown' && candidate.blocks.every((other) => priceLine(other).kind === 'unknown')) return null;
      const key = `${block.variantId}-${index}`;
      return <div className="space-price-block" key={key}>
        <p className="space-price-line" data-kind={line.kind}>{line.text}</p>
      </div>;
    })}
    {candidate.blocks.some((block) => priceLine(block).kind !== 'unknown' && isReferencePrice(block)) && <p className="space-price-note">{SPACE_FIT_COPY.referencePriceNote}</p>}
    {links.length > 0 && <div className="space-links">{links.map(({ key, url, name }) => <a key={key} className="space-link-row" href={url} target="_blank" rel="noopener noreferrer"><span className="space-link-name">{name}</span><span className="space-link-action">판매처에서 보기 (새 탭)</span></a>)}</div>}
    <details className="space-shape"><summary>놓는 모양 보기</summary>
      <div className="space-shape-body">
        <svg className="space-diagram" viewBox={`-5 -5 ${spaceMm[0]!+10} ${spaceMm[1]!+10}`} role="img" aria-label="위에서 본 배치. 왼쪽 앞 바닥을 기준으로 놓아요."><rect className="space-outline" x="0" y="0" width={spaceMm[0]} height={spaceMm[1]} />{candidate.blocks.map((block) => <rect key={block.variantId} className="space-block" x={block.originMm[0]} y={block.originMm[1]} width={block.unitMm[0]*block.grid[0]} height={block.unitMm[1]*block.grid[1]} />)}</svg>
        {candidate.blocks.map((block, index) => <p className="space-shape-placement" key={`${block.variantId}-${index}`}>{multi ? `${displayName(block.name)} · ` : ''}{placementText(block)}</p>)}
        <p className="space-shape-caveat">위에서 본 모양이에요. 수량과 층수는 위의 글자를 확인해 주세요.</p>
        {(candidate.checks.outer === 'unknown' || candidate.checks.orientation === 'unknown') && <p className="space-shape-caveat">손잡이·뚜껑 포함 크기와 놓는 방향을 확인해 주세요.</p>}
        {stacked && <p className="space-shape-caveat">쌓을 때 하중과 지지 조건을 확인해 주세요.</p>}
      </div>
    </details>
  </li>;
}
function UnmeasuredGroup({ items, count }: { items: SpaceFitUnmeasured[]; count: number }) {
  return <details className="space-unmeasured"><summary>치수 확인 중 ({count}개)</summary>
    {count > UNMEASURED_PREVIEW_CAP && <p className="space-unmeasured-cap">{SPACE_FIT_COPY.unmeasuredCapNote}</p>}
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
