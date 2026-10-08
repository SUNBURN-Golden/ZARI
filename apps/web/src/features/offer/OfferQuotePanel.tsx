import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type {
  LayoutEditCommand,
  OfferQuoteReply,
  PlanSnapshot,
  PreviewShipping,
  TaxStatus,
} from '../../contracts/generated/dto';
import { workerController } from '../../app/sessionRegistry';
import {
  forgetSnapshotQuote,
  OfferQuoteController,
  quoteSnapshotOnce,
} from './controller';
import {
  quotedCountText,
  quotedMoneyText,
  rolePhrase,
  shippingPhrase,
  stockPhrase,
  taxPhrase,
  unconfirmedPhrase,
} from './phrases';

const controller = new OfferQuoteController(workerController);

type PanelState = 'pending' | 'ready' | 'empty' | 'error';

function panelState(reply: OfferQuoteReply): PanelState {
  return reply.lines.length === 0 && reply.sellers.length === 0 ? 'empty' : 'ready';
}

function parseWhole(text: string): number | null | 'bad' {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return 'bad';
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : 'bad';
}

/**
 * Seller comparison beside one immutable plan. Rust quotes packs, surplus,
 * and confirmed money. The preview does not publish a snapshot.
 */
export function OfferQuotePanel({
  snapshot,
  canReplace,
  onReplace,
}: {
  snapshot: PlanSnapshot;
  canReplace: boolean;
  onReplace: (command: LayoutEditCommand) => void;
}) {
  const titleId = useId();
  const planId = snapshot.planSnapshotId;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const [panel, setPanel] = useState<PanelState>('pending');
  const [reply, setReply] = useState<OfferQuoteReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needed, setNeeded] = useState('3');
  const [pack, setPack] = useState('2');
  const [price, setPrice] = useState('1000');
  const [shipping, setShipping] = useState<'free' | 'unknown' | 'complex'>('free');
  const [tax, setTax] = useState<TaxStatus>('included');
  const [preview, setPreview] = useState<OfferQuoteReply | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<'idle' | 'pending' | 'ready' | 'error'>('idle');

  useEffect(() => {
    let alive = true;
    setPanel('pending');
    setError(null);
    void quoteSnapshotOnce(controller, snapshotRef.current)
      .then((next) => {
        if (!alive) return;
        setReply(next);
        setPanel(panelState(next));
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        setPanel('error');
        setError(caught instanceof Error ? caught.message : 'failed');
      });
    return () => {
      alive = false;
    };
  }, [planId]);

  function retry() {
    forgetSnapshotQuote(planId);
    setPanel('pending');
    setError(null);
    void quoteSnapshotOnce(controller, snapshot)
      .then((next) => {
        setReply(next);
        setPanel(panelState(next));
      })
      .catch((caught: unknown) => {
        setPanel('error');
        setError(caught instanceof Error ? caught.message : 'failed');
      });
  }

  function submitPreview(event: FormEvent) {
    event.preventDefault();
    const physicalNeeded = parseWhole(needed);
    const packQuantity = parseWhole(pack);
    const priceText = price.trim();
    const packPrice = priceText === '' ? null : /^\d+$/.test(priceText) ? priceText : 'bad';
    if (physicalNeeded === 'bad' || packQuantity === 'bad' || packPrice === 'bad') {
      setPreviewState('error');
      setPreviewError('정수만 보낼 수 있습니다. 빈 칸은 미확인이고 0으로 바꾸지 않습니다.');
      setPreview(null);
      return;
    }
    const ship: PreviewShipping =
      shipping === 'free'
        ? { kind: 'free' }
        : shipping === 'complex'
          ? { kind: 'complex' }
          : { kind: 'unknown' };
    setPreviewState('pending');
    setPreviewError(null);
    void controller
      .quote({
        kind: 'preview',
        preview: {
          sellerNotes: [{ sellerId: 'preview-seller', tax }],
          lines: [
            {
              id: 'preview-line',
              role: 'container',
              sellerId: 'preview-seller',
              variantId: null,
              offerId: null,
              physicalNeeded,
              reused: 0,
              packQuantity,
              packPrice,
              stock: 'inStock',
              shipping: ship,
              includedInParent: false,
              minimumPacks: null,
              replacementOfferId: null,
            },
          ],
        },
      })
      .then((next) => {
        setPreview(next);
        setPreviewState('ready');
      })
      .catch((caught: unknown) => {
        setPreview(null);
        setPreviewState('error');
        setPreviewError(caught instanceof Error ? caught.message : 'failed');
      });
  }

  const bound = reply?.boundRevision ?? '';
  const sameRevision = bound !== '' && bound === planId;
  const previewLine = preview?.lines[0];
  const previewSeller = preview?.sellers[0];

  return (
    <section
      className="offer-quote"
      aria-labelledby={titleId}
      data-testid="offer-quote"
      data-revision={planId}
      data-state={panel}
    >
      <div className="section-kicker">판매 묶음</div>
      <h3 id={titleId}>판매처와 확인된 금액</h3>
      <p className="session-note" data-testid="offer-quote-status" data-state={panel}>
        {panel === 'pending' && '묶음과 배송을 확인하는 중입니다.'}
        {panel === 'ready' && '이 계획의 묶음 계산입니다. 미확인 금액은 합계에 넣지 않습니다.'}
        {panel === 'empty' && '이 계획에서 주문할 판매 묶음이 없습니다.'}
        {panel === 'error' && '묶음을 계산하지 못했습니다. 금액을 0으로 두지 않습니다.'}
      </p>
      <p className="session-note" data-testid="offer-quote-bound">
        {bound || '—'}
      </p>
      {panel === 'error' && (
        <p className="field-error" role="alert" data-testid="offer-quote-error">
          {error}
          <button type="button" className="button button-quiet" onClick={retry}>
            다시 계산
          </button>
        </p>
      )}
      {reply && panel !== 'error' && (
        <>
          <div className="table-scroll">
            <table className="bom-table" data-testid="offer-lines">
              <thead>
                <tr>
                  <th>구분</th>
                  <th>필요</th>
                  <th>주문 묶음</th>
                  <th>공급</th>
                  <th>남는 개수</th>
                  <th>상품 소계</th>
                </tr>
              </thead>
              <tbody>
                {reply.lines.map((line) => (
                  <tr key={line.id} data-testid={`offer-line-${line.id}`}>
                    <td>
                      {rolePhrase(line.role)}
                      {line.includedInParent ? ' · 세트에 포함' : ''}
                    </td>
                    <td>{quotedCountText(line.physicalNeeded)}</td>
                    <td data-testid={`offer-packs-${line.id}`}>{quotedCountText(line.packsToOrder)}</td>
                    <td>{quotedCountText(line.supplied)}</td>
                    <td data-testid={`offer-surplus-${line.id}`}>{quotedCountText(line.surplus)}</td>
                    <td>{quotedMoneyText(line.productSubtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-scroll">
            <table className="bom-table" data-testid="offer-sellers">
              <thead>
                <tr>
                  <th>판매처</th>
                  <th>재고</th>
                  <th>배송</th>
                  <th>세금</th>
                </tr>
              </thead>
              <tbody>
                {reply.sellers.map((seller) => (
                  <tr
                    key={seller.sellerId}
                    data-testid={`offer-seller-${seller.sellerId}`}
                    data-stock={seller.stock}
                    data-shipping={seller.shippingStatus}
                    data-tax={seller.tax}
                  >
                    <td>{seller.sellerId}</td>
                    <td>{stockPhrase(seller.stock)}</td>
                    <td>{shippingPhrase(seller.shippingStatus, seller.shipping)}</td>
                    <td>{taxPhrase(seller.tax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p data-testid="offer-known-product">상품 {quotedMoneyText(reply.knownProduct)}</p>
          <p data-testid="offer-known-shipping">
            배송 {quotedMoneyText(reply.knownShipping, reply.sellers.length === 1 ? reply.sellers[0]?.shippingStatus : undefined)}
          </p>
          <p data-testid="offer-grand">합계 {quotedMoneyText(reply.grandTotal)}</p>
          <ul data-testid="offer-unconfirmed">
            {reply.unconfirmed.length === 0 ? (
              <li>미확인 금액 없음</li>
            ) : (
              reply.unconfirmed.map((row, index) => (
                <li key={`${row.code}-${index}`} data-code={row.code}>
                  {unconfirmedPhrase(row.code)}
                </li>
              ))
            )}
          </ul>
          {reply.replacements.length === 0 ? (
            <p className="session-note" data-testid="offer-replacements-empty">
              품절된 옵션의 교체 후보가 없습니다.
            </p>
          ) : (
            <ul data-testid="offer-replacements">
              {reply.replacements.map((item) => (
                <li key={`${item.fromOfferId}-${item.toOfferId}`}>
                  <button
                    type="button"
                    className="button button-quiet"
                    data-testid={`offer-replace-${item.toOfferId}`}
                    disabled={!canReplace || !sameRevision || item.boundRevision !== planId}
                    onClick={() =>
                      onReplace({
                        kind: 'selectOffer',
                        variantId: item.variantId,
                        offerId: item.toOfferId,
                      })
                    }
                  >
                    품절 {item.fromOfferId}을 {item.toOfferId}(으)로 바꾸기
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <form data-testid="offer-preview-form" onSubmit={submitPreview}>
        <p className="session-note">미리보기는 이 계획을 바꾸지 않습니다.</p>
        <label>
          필요 개수
          <input
            value={needed}
            onChange={(event) => setNeeded(event.target.value)}
            inputMode="numeric"
            data-testid="offer-preview-needed"
          />
        </label>
        <label>
          묶음당 수량
          <input
            value={pack}
            onChange={(event) => setPack(event.target.value)}
            inputMode="numeric"
            data-testid="offer-preview-pack"
          />
        </label>
        <label>
          묶음 가격
          <input
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            inputMode="numeric"
            data-testid="offer-preview-price"
          />
        </label>
        <label>
          배송
          <select
            value={shipping}
            onChange={(event) => setShipping(event.target.value as 'free' | 'unknown' | 'complex')}
            data-testid="offer-preview-shipping-kind"
          >
            <option value="free">무료로 확인됨</option>
            <option value="unknown">배송비 미확인</option>
            <option value="complex">복잡한 조건</option>
          </select>
        </label>
        <label>
          세금
          <select
            value={tax}
            onChange={(event) => setTax(event.target.value as TaxStatus)}
            data-testid="offer-preview-tax"
          >
            <option value="included">포함으로 확인됨</option>
            <option value="unknown">포함 여부 미확인</option>
            <option value="excluded">별도 · 금액 미확인</option>
          </select>
        </label>
        <button type="submit" className="button button-secondary" data-testid="offer-preview-submit">
          묶음 미리보기
        </button>
      </form>
      {previewState === 'pending' && (
        <p data-testid="offer-preview-status" data-state="pending">
          미리보기를 계산하는 중입니다.
        </p>
      )}
      {previewState === 'error' && (
        <p className="field-error" role="alert" data-testid="offer-preview-error">
          {previewError}
        </p>
      )}
      {preview && previewLine && (
        <div data-testid="offer-preview" data-revision="">
          <p data-testid="offer-preview-packs">주문 묶음 {quotedCountText(previewLine.packsToOrder)}</p>
          <p data-testid="offer-preview-supplied">공급 {quotedCountText(previewLine.supplied)}</p>
          <p data-testid="offer-preview-surplus">남는 개수 {quotedCountText(previewLine.surplus)}</p>
          <p data-testid="offer-preview-shipping">
            배송 {previewSeller ? shippingPhrase(previewSeller.shippingStatus, previewSeller.shipping) : quotedMoneyText(preview.knownShipping)}
          </p>
          <p data-testid="offer-preview-grand">합계 {quotedMoneyText(preview.grandTotal)}</p>
        </div>
      )}
    </section>
  );
}
