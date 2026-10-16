import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from 'react-aria-components';
import { packageCsvText, csvFileName, type CsvKind } from './csv';
import { PrintPackageView } from './PrintPackageView';
import {
  buildPrintPackage,
  packageDigest,
  type PrintInput,
  type PrintPackage,
} from './package';
import {
  ALWAYS_EXCLUDED_TEXT,
  DEFAULT_PRINT_SCOPE,
  FULL_SCOPE,
  SCOPE_ROWS,
  SHARE_SCOPE,
  scopeEquals,
  type PrintScope,
} from './scope';

function downloadCsv(pkg: PrintPackage, kind: CsvKind): void {
  // A leading BOM keeps spreadsheet apps on the UTF-8 path.
  const blob = new Blob(['﻿', packageCsvText(pkg, kind)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = csvFileName(pkg, kind);
  anchor.click();
  URL.revokeObjectURL(url);
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Full-screen preview of the package. It is the only thing that prints: the
 * app root is inert while it is open and print CSS hides the app, so the
 * sheet is exactly the package the person is looking at.
 */
function PreviewDialog({
  pkg,
  onClose,
}: {
  pkg: PrintPackage;
  onClose: () => void;
}) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const app = document.getElementById('root');
    app?.setAttribute('inert', '');
    document.body.setAttribute('data-print-open', 'true');
    rootRef.current?.querySelector<HTMLElement>('[data-testid="print-close"]')?.focus();
    return () => {
      app?.removeAttribute('inert');
      document.body.removeAttribute('data-print-open');
    };
  }, []);
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const nodes = rootRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!nodes || nodes.length === 0) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return createPortal(
    <div
      ref={rootRef}
      className="print-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="print-preview"
      onKeyDown={onKeyDown}
    >
      <div className="print-toolbar">
        <h2 id={titleId}>인쇄 미리보기</h2>
        <p className="session-note">
          인쇄하면 모든 쪽의 위·아래 띠에 계획 ID·단위·포함 범위가 붙고, 도면은 새 쪽에서 시작합니다. 쪽 나눔은 인쇄 창의 미리보기에서 확인하세요.
        </p>
        <div className="form-actions">
          <Button
            className="button button-primary"
            data-testid="print-now"
            onPress={() => window.print()}
          >
            인쇄
          </Button>
          <Button className="button button-secondary" data-testid="print-close" onPress={onClose}>
            닫기
          </Button>
        </div>
      </div>
      <div className="print-sheet">
        <PrintPackageView pkg={pkg} />
      </div>
    </div>,
    document.body,
  );
}

/**
 * One panel per displayed plan: choose what personal text may leave the app,
 * then print or download. Everything comes from `buildPrintPackage`, which
 * refuses to build when the drawing, the purchase list and the guide are not
 * of the same `PlanSnapshot`.
 */
export function PrintPanel({ input }: { input: Omit<PrintInput, 'scope'> }) {
  const [scope, setScope] = useState<PrintScope>(DEFAULT_PRINT_SCOPE);
  const [open, setOpen] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<CsvKind | null>(null);
  const openRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const result = useMemo(
    () => buildPrintPackage({ ...input, scope }),
    // `input` is a fresh object each render; its members are what matter.
    [
      input.snapshot,
      input.projection,
      input.projectionStatus,
      input.projectionFailure,
      input.catalog,
      input.projectName,
      input.stage,
      input.current,
      input.progress,
      scope,
    ],
  );
  const pkg = result.status === 'ready' ? result.pkg : null;
  useEffect(() => {
    let live = true;
    setDigest(null);
    if (pkg) {
      void packageDigest(pkg).then((value) => {
        if (live) setDigest(value);
      });
    }
    return () => {
      live = false;
    };
  }, [pkg]);
  useEffect(() => {
    if (!pkg) setOpen(false);
  }, [pkg]);
  const wasOpen = useRef(false);
  useEffect(() => {
    // Focus returns only once the dialog is gone and the app is no longer inert.
    if (wasOpen.current && !open) {
      const node = openRef.current;
      if (node?.isConnected) node.focus();
    }
    wasOpen.current = open;
  }, [open]);
  const close = () => setOpen(false);
  const toggle = (key: keyof PrintScope, value: boolean) => {
    setDownloaded(null);
    setScope((current) => ({ ...current, [key]: value }));
  };
  const preset = scopeEquals(scope, SHARE_SCOPE)
    ? 'share'
    : scopeEquals(scope, FULL_SCOPE)
      ? 'full'
      : 'custom';
  return (
    <section
      className="print-panel"
      aria-labelledby={titleId}
      data-testid="print-panel"
      data-state={result.status}
      data-preset={preset}
    >
      <div className="section-kicker">출력</div>
      <h3 id={titleId}>도면·구매 목록·실행 순서를 한 묶음으로</h3>
      <p className="session-note">
        세 가지가 모두 같은 계획 ID에서 나옵니다. 하나라도 다른 계획이면 출력하지 않습니다.
      </p>
      <fieldset className="print-scope" data-testid="print-scope">
        <legend>개인정보 포함 범위</legend>
        <div className="print-scope-choices">
          {SCOPE_ROWS.map((row) => (
            <label key={row.key}>
              <input
                type="checkbox"
                data-testid={`print-scope-${row.key}`}
                checked={scope[row.key]}
                onChange={(event) => toggle(row.key, event.target.checked)}
              />
              <span>
                {row.label}
                <span className="session-note"> — {row.detail}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="form-actions">
          <Button
            className="button button-quiet"
            data-testid="print-preset-share"
            onPress={() => {
              setDownloaded(null);
              setScope(SHARE_SCOPE);
            }}
          >
            공유용 (개인 정보 제외)
          </Button>
          <Button
            className="button button-quiet"
            data-testid="print-preset-full"
            onPress={() => {
              setDownloaded(null);
              setScope(FULL_SCOPE);
            }}
          >
            모두 포함
          </Button>
        </div>
        <p className="session-note" data-testid="print-always-excluded">
          {ALWAYS_EXCLUDED_TEXT}
        </p>
      </fieldset>
      {result.status === 'blocked' ? (
        <div className="notice notice-stale" role="alert" data-testid="print-blocked">
          <p>이 계획은 지금 출력할 수 없습니다.</p>
          <ul className="diagnostic-list">
            {result.blocks.map((block) => (
              <li key={block.code} data-code={block.code}>
                {block.text}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="session-note" role="status" data-testid="print-ready">
          계획 ID {result.pkg.revision.slice(0, 16)}… — 도면 {result.pkg.drawings.length}장 ·
          구매 {result.pkg.bom.length}줄 · 미배치 {result.pkg.unassigned.length}건 · 검사{' '}
          {result.pkg.checks.length}건 · 단계 {result.pkg.steps.length}개
        </p>
      )}
      <div className="form-actions">
        <Button
          className="button button-primary"
          data-testid="print-open"
          isDisabled={!pkg}
          onPress={() => {
            openRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            setOpen(true);
          }}
        >
          인쇄 미리보기
        </Button>
        <Button
          className="button button-secondary"
          data-testid="print-csv-bom"
          isDisabled={!pkg}
          onPress={() => {
            if (!pkg) return;
            downloadCsv(pkg, 'bom');
            setDownloaded('bom');
          }}
        >
          구매 목록 CSV
        </Button>
        <Button
          className="button button-secondary"
          data-testid="print-csv-plan"
          isDisabled={!pkg}
          onPress={() => {
            if (!pkg) return;
            downloadCsv(pkg, 'plan');
            setDownloaded('plan');
          }}
        >
          계획 전체 CSV
        </Button>
      </div>
      {downloaded && pkg && (
        <p className="session-note" role="status" data-testid="print-downloaded">
          {downloaded === 'bom' ? '구매 목록' : '계획 전체'} CSV를 저장했습니다. 포함 범위:{' '}
          {pkg.scopeText}
        </p>
      )}
      {digest && (
        <p className="session-note" data-testid="print-digest">
          출력 지문 {digest.slice(0, 16)}… (같은 계획·범위면 같은 값)
        </p>
      )}
      {open && pkg && <PreviewDialog pkg={pkg} onClose={close} />}
    </section>
  );
}
