import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type {
  Offer,
  PlanSnapshot,
  PreparedHandoff,
  Product,
  ProductVariant,
  PurchaseEventKind,
  PurchaseLedger,
  SubstituteReview,
} from '../../contracts/generated/dto';
import { repository, workerController } from '../../app/sessionRegistry';
import { quotedMoneyText } from '../offer/phrases';
import {
  EMPTY_PURCHASE_LEDGER,
  prepareHandoffOnce,
  PurchaseHandoffController,
  utcSecond,
} from './controller';
import {
  flagPhrase,
  handoffUnconfirmed,
  impactPhrase,
  observationPhrase,
  suitabilityPhrase,
} from './phrases';

const controller = new PurchaseHandoffController(workerController, repository);

type PanelState = 'pending' | 'ready' | 'empty' | 'error';

function parseWidth(text: string): number | null | 'bad' {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return 'bad';
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : 'bad';
}

function substituteId(id: string): string {
  const next = `sub-${id}`;
  return next.length <= 96 ? next : next.slice(0, 96);
}

function withUnknownWidth(variant: ProductVariant): ProductVariant {
  const next = structuredClone(variant);
  next.id = substituteId(variant.id);
  next.dimensions.outer.width = { state: 'unknown', reason: 'notProvided' };
  return next;
}

function withWideWidth(variant: ProductVariant): ProductVariant | null {
  const width = variant.dimensions.outer.width;
  if (width.state !== 'known') return null;
  const next = structuredClone(variant);
  next.id = substituteId(variant.id);
  next.dimensions.outer.width = {
    ...width,
    value: { ...width.value, nominal: 9000 },
  };
  return next;
}

/**
 * Seller preparation for one immutable plan. A link is an anchor with no
 * record handler. Affiliate display does not call Rust again.
 */
export function PurchaseHandoffPanel({
  projectId,
  snapshot,
}: {
  projectId: string;
  snapshot: PlanSnapshot;
}) {
  const titleId = useId();
  const planId = snapshot.planSnapshotId;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const [panel, setPanel] = useState<PanelState>('pending');
  const [prepared, setPrepared] = useState<PreparedHandoff | null>(null);
  const [ledger, setLedger] = useState<PurchaseLedger>(EMPTY_PURCHASE_LEDGER);
  const [revision, setRevision] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [markedAffiliate, setMarkedAffiliate] = useState(false);
  const [eventId, setEventId] = useState('buy-1');
  const [eventKind, setEventKind] = useState<PurchaseEventKind>('confirmedPurchase');
  const [note, setNote] = useState('');
  const [widthText, setWidthText] = useState('');
  const [offerId, setOfferId] = useState('');
  const [observedAt, setObservedAt] = useState('2020-01-01T00:00:00Z');
  const [asOf, setAsOf] = useState('2026-10-10T00:00:00Z');
  const [freshness, setFreshness] = useState<'current' | 'stale' | 'unconfirmed' | ''>('');
  const [reviewMode, setReviewMode] = useState<'unknown' | 'wide'>('unknown');
  const [review, setReview] = useState<SubstituteReview | null>(null);

  useEffect(() => {
    let alive = true;
    setPanel('pending');
    setError(null);
    setReview(null);
    void (async () => {
      try {
        const row = await controller.load(projectId);
        if (!alive) return;
        const current = row?.ledger ?? EMPTY_PURCHASE_LEDGER;
        const currentRevision = row?.revision ?? '0';
        const next = await prepareHandoffOnce(
          controller,
          projectId,
          snapshotRef.current,
          current,
          currentRevision,
          utcSecond(),
        );
        if (!alive) return;
        setLedger(current);
        setRevision(currentRevision);
        setPrepared(next);
        const first = next.sellers.flatMap((seller) => seller.lines).find((line) => line.offerId);
        if (first?.offerId) setOfferId((currentId) => currentId || first.offerId || '');
        setPanel(next.sellers.length === 0 ? 'empty' : 'ready');
      } catch (caught) {
        if (!alive) return;
        setPanel('error');
        setError(caught instanceof Error ? caught.message : 'persistence_failed');
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId, planId]);

  const lines = prepared?.sellers.flatMap((seller) => seller.lines) ?? [];
  const activeOffer = offerId || lines.find((line) => line.offerId)?.offerId || '';

  async function onRecord(event: FormEvent) {
    event.preventDefault();
    if (!activeOffer) return;
    const measuredWidthMm = eventKind === 'measured' ? parseWidth(widthText) : null;
    if (measuredWidthMm === 'bad') {
      setPanel('error');
      setError('measured_width');
      return;
    }
    try {
      const result = await controller.send(projectId, revision, {
        kind: 'record',
        snapshot: snapshotRef.current,
        ledger,
        asOf: utcSecond(),
        affiliateOfferIds: [],
        event: {
          id: eventId.trim(),
          kind: eventKind,
          offerId: activeOffer,
          note,
          measuredWidthMm,
        },
      });
      if (result.reply.kind !== 'prepared') throw new Error('unexpected_worker_event');
      setPrepared(result.reply.prepared);
      setLedger(result.reply.prepared.ledger);
      setRevision(result.revision);
      setPanel(result.reply.prepared.sellers.length === 0 ? 'empty' : 'ready');
      setError(null);
    } catch (caught) {
      setPanel('error');
      setError(caught instanceof Error ? caught.message : 'persistence_failed');
    }
  }

  async function onFreshness(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await controller.send(projectId, revision, {
        kind: 'classifyFreshness',
        observedAt: observedAt.trim() === '' ? null : observedAt.trim(),
        asOf: asOf.trim(),
      });
      if (result.reply.kind !== 'freshness') throw new Error('unexpected_worker_event');
      setFreshness(result.reply.freshness.freshness);
      setError(null);
      if (prepared) setPanel(prepared.sellers.length === 0 ? 'empty' : 'ready');
    } catch (caught) {
      setPanel('error');
      setError(caught instanceof Error ? caught.message : 'persistence_failed');
    }
  }

  async function onReview(event: FormEvent) {
    event.preventDefault();
    const line = lines.find((row) => row.offerId === activeOffer) ?? lines.find((row) => row.offerId);
    const catalog = snapshotRef.current.content.referencedCatalog;
    const bom = line
      ? snapshotRef.current.content.bom.find((row) => row.id === line.lineId)
      : undefined;
    const placementId = bom?.placementIds[0];
    const sourceOffer = catalog.offers.find((row) => row.id === line?.offerId);
    const sourceVariant = catalog.variants.find((row) => row.id === line?.variantId);
    const sourceProduct = catalog.products.find((row) => row.id === sourceVariant?.productId);
    if (!line || !placementId || !sourceOffer || !sourceVariant || !sourceProduct) {
      setPanel('error');
      setError('unknown_placement');
      return;
    }
    const variant = reviewMode === 'wide' ? withWideWidth(sourceVariant) : withUnknownWidth(sourceVariant);
    if (!variant) {
      setPanel('error');
      setError('width_unknown');
      return;
    }
    const offer: Offer = { ...structuredClone(sourceOffer), id: substituteId(sourceOffer.id), variantId: variant.id };
    const product: Product = structuredClone(sourceProduct);
    try {
      const result = await controller.send(projectId, revision, {
        kind: 'reviewSubstitute',
        snapshot: snapshotRef.current,
        placementId,
        product,
        variant,
        offer,
        affiliateOfferIds: [],
      });
      if (result.reply.kind !== 'reviewed') throw new Error('unexpected_worker_event');
      setReview(result.reply.review);
      setError(null);
      setPanel(prepared && prepared.sellers.length === 0 ? 'empty' : 'ready');
    } catch (caught) {
      setPanel('error');
      setError(caught instanceof Error ? caught.message : 'persistence_failed');
    }
  }

  return (
    <section
      className="offer-quote purchase-handoff"
      aria-labelledby={titleId}
      data-testid="purchase-handoff"
      data-state={panel}
      data-paid="false"
      data-records-payment="false"
      data-revision={prepared?.boundRevision ?? ''}
      data-affiliate-mark={markedAffiliate ? 'on' : 'off'}
    >
      <div className="section-kicker">구매 준비</div>
      <h3 id={titleId}>판매처별 확인</h3>
      <p className="session-note" data-testid="purchase-link-note">
        링크를 열어도 구매 확인으로 기록하지 않습니다.
      </p>
      {panel === 'pending' && (
        <p className="session-note" data-testid="purchase-pending">
          확인 중
        </p>
      )}
      {panel === 'error' && (
        <p className="notice notice-stale" role="alert" data-testid="purchase-error">
          {error}
        </p>
      )}
      {panel === 'empty' && (
        <p data-testid="purchase-empty">주문할 판매처가 없습니다.</p>
      )}
      {(panel === 'ready' || panel === 'empty') && prepared && (
        <div data-testid="purchase-sellers">
          {prepared.sellers.map((seller) => (
            <section key={seller.sellerId} data-testid={`purchase-seller-${seller.sellerId}`}>
              <h4>{seller.sellerId === 'unlisted' ? '판매처 없음' : seller.sellerId}</h4>
              <ul>
                {seller.lines.map((line) => (
                  <li
                    key={line.lineId}
                    data-testid={`purchase-line-${line.lineId}`}
                    data-offer={line.offerId ?? ''}
                  >
                    <p
                      data-testid={`purchase-freshness-${line.lineId}`}
                      data-freshness={line.freshness}
                    >
                      {observationPhrase(line.freshness, line.stock)}
                      {line.observedAt ? ` · ${line.observedAt}` : ''}
                    </p>
                    <p data-testid={`purchase-price-${line.lineId}`}>
                      묶음 금액 {quotedMoneyText(line.packPrice)} · 소계 {quotedMoneyText(line.subtotal)}
                    </p>
                    <p
                      data-testid={`purchase-suitability-${line.lineId}`}
                      data-suitability={line.suitability}
                    >
                      적합성 {suitabilityPhrase(line.suitability)}
                      {markedAffiliate ? ' · 광고·제휴 표시' : ''}
                    </p>
                    <p data-testid={`purchase-flags-${line.lineId}`}>
                      구매 확인 {flagPhrase(line.confirmedPurchase)} · 수령 {flagPhrase(line.received)} · 실측{' '}
                      {flagPhrase(line.measured)} · 반품 {flagPhrase(line.returned)}
                    </p>
                    <p
                      data-testid={`purchase-impact-${line.lineId}`}
                      data-impact={line.impact}
                      data-historical-pass={String(line.historicalPassReused)}
                      data-measurement-pass={String(line.measurementPromotesPass)}
                    >
                      {impactPhrase(line.impact)}
                    </p>
                    <p data-testid={`purchase-paid-${line.lineId}`} data-paid={String(line.paid)}>
                      {line.link.kind === 'http' ? (
                        <a
                          href={line.link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid={`purchase-link-${line.lineId}`}
                        >
                          판매처에서 보기
                        </a>
                      ) : (
                        <span data-testid={`purchase-link-${line.lineId}`}>
                          {line.link.kind === 'rejected' ? '주소가 구매 링크가 아닙니다' : '구매 링크 없음'}
                        </span>
                      )}
                    </p>
                    {line.unconfirmed.length > 0 && (
                      <p data-testid={`purchase-line-unconfirmed-${line.lineId}`}>
                        {line.unconfirmed.map(handoffUnconfirmed).join(' · ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {prepared.sellers.some((seller) => seller.unconfirmed.length > 0) && (
            <p data-testid="purchase-unconfirmed">
              {prepared.sellers
                .flatMap((seller) => seller.unconfirmed)
                .map(handoffUnconfirmed)
                .join(' · ')}
            </p>
          )}
        </div>
      )}

      <label>
        <input
          type="checkbox"
          data-testid="purchase-affiliate"
          checked={markedAffiliate}
          onChange={(event) => setMarkedAffiliate(event.target.checked)}
        />
        광고·제휴로 표시
      </label>

      {(panel === 'ready' || panel === 'empty') && (
        <>
          <form onSubmit={(event) => void onRecord(event)}>
            <label>
              사건 번호
              <input
                data-testid="purchase-record-id"
                value={eventId}
                onChange={(event) => setEventId(event.target.value)}
              />
            </label>
            <label>
              사건
              <select
                data-testid="purchase-record-kind"
                value={eventKind}
                onChange={(event) => setEventKind(event.target.value as PurchaseEventKind)}
              >
                <option value="confirmedPurchase">구매 확인</option>
                <option value="received">수령</option>
                <option value="measured">실측</option>
                <option value="returned">반품</option>
              </select>
            </label>
            {lines.some((line) => line.offerId) && (
              <label>
                판매 항목
                <select
                  data-testid="purchase-record-offer"
                  value={activeOffer}
                  onChange={(event) => setOfferId(event.target.value)}
                >
                  {lines
                    .filter((line) => line.offerId)
                    .map((line) => (
                      <option key={line.lineId} value={line.offerId ?? ''}>
                        {line.offerId}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label>
              메모
              <input
                data-testid="purchase-record-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            {eventKind === 'measured' && (
              <label>
                실측 너비 mm
                <input
                  data-testid="purchase-record-width"
                  inputMode="numeric"
                  value={widthText}
                  onChange={(event) => setWidthText(event.target.value)}
                />
              </label>
            )}
            <button className="button button-secondary" type="submit" data-testid="purchase-record-submit">
              사건 기록
            </button>
          </form>

          <form onSubmit={(event) => void onFreshness(event)}>
            <label>
              확인 시각
              <input
                data-testid="purchase-fresh-observed"
                value={observedAt}
                onChange={(event) => setObservedAt(event.target.value)}
              />
            </label>
            <label>
              기준 시각
              <input
                data-testid="purchase-fresh-asof"
                value={asOf}
                onChange={(event) => setAsOf(event.target.value)}
              />
            </label>
            <button className="button button-secondary" type="submit" data-testid="purchase-fresh-submit">
              확인 시점 분류
            </button>
            <p data-testid="purchase-fresh-result" data-freshness={freshness}>
              {freshness ? observationPhrase(freshness, 'unknown') : ''}
            </p>
          </form>

          <form onSubmit={(event) => void onReview(event)}>
            <label>
              대체품
              <select
                data-testid="purchase-review-mode"
                value={reviewMode}
                onChange={(event) => setReviewMode(event.target.value as 'unknown' | 'wide')}
              >
                <option value="unknown">너비 미확인</option>
                <option value="wide">너비 9000mm</option>
              </select>
            </label>
            <button className="button button-secondary" type="submit" data-testid="purchase-review-submit">
              대체품 재검증
            </button>
          </form>
          {review && (
            <p
              data-testid="purchase-review"
              data-suitability={review.suitability}
              data-identity-assumed={String(review.identityAssumed)}
              data-reused-pass={String(review.reusedPass)}
              data-same-variant={String(review.sameVariantId)}
              data-adopted={String(review.adopted)}
              data-records-payment={String(review.recordsPayment)}
            >
              {suitabilityPhrase(review.suitability)}
            </p>
          )}
        </>
      )}
    </section>
  );
}
