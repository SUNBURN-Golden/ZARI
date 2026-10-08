import { useEffect, useState, type FormEvent } from 'react';
import type {
  ContainerUse,
  EventKind,
  HoldingKind,
  InventoryAction,
  InventoryLedger,
  InventoryReply,
  QuantityLabel,
  SubjectKind,
} from '../../contracts/generated/dto';
import { repository, workerController } from '../../app/sessionRegistry';
import { EMPTY_LEDGER, InventoryController } from './controller';
import { eventPhrase, holdingPhrase, quantityPhrase, usagePhrase } from './phrases';

const controller = new InventoryController(workerController, repository);
const ZERO_DIGEST = '0'.repeat(64);

type PanelState = 'empty' | 'pending' | 'saved' | 'read' | 'error';

function labelFor(
  labels: QuantityLabel[],
  id: string,
  role: SubjectKind,
): QuantityLabel | undefined {
  return labels.find((label) => label.subjectId === id && label.role === role);
}

function eventId(): string {
  return `evt-${crypto.randomUUID()}`;
}

/**
 * Item and container life ledger for one project. Rust owns quantity and
 * conservation. A historical plan id is only a reference: the current ledger
 * is not written.
 */
export function InventoryPanel({ projectId }: { projectId: string }) {
  const [ledger, setLedger] = useState<InventoryLedger>(EMPTY_LEDGER);
  const [revision, setRevision] = useState('0');
  const [labels, setLabels] = useState<QuantityLabel[]>([]);
  const [reply, setReply] = useState<InventoryReply | null>(null);
  const [panel, setPanel] = useState<PanelState>('pending');
  const [error, setError] = useState<string | null>(null);
  const [subjectKind, setSubjectKind] = useState<SubjectKind>('item');
  const [subjectId, setSubjectId] = useState('');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<EventKind>('purchase');
  const [quantityText, setQuantityText] = useState('');
  const [location, setLocation] = useState('');
  const [holding, setHolding] = useState<HoldingKind>('individual');
  const [usage, setUsage] = useState<ContainerUse>('empty');
  const [claimId, setClaimId] = useState('');
  const [ordinalA, setOrdinalA] = useState('');
  const [ordinalB, setOrdinalB] = useState('');
  const [planId, setPlanId] = useState('');

  useEffect(() => {
    let alive = true;
    setPanel('pending');
    void (async () => {
      try {
        const row = await controller.load(projectId);
        if (!alive) return;
        const current = row?.ledger ?? EMPTY_LEDGER;
        const currentRevision = row?.revision ?? '0';
        const refreshed = await controller.apply(projectId, current, currentRevision, {
          kind: 'conserve',
          claims: [],
        });
        if (!alive) return;
        setLedger(current);
        setRevision(currentRevision);
        setLabels(refreshed.reply.labels);
        setReply(refreshed.reply);
        setPanel(current.items.length === 0 && current.containers.length === 0 ? 'empty' : 'read');
        setError(null);
      } catch (caught) {
        if (!alive) return;
        setPanel('error');
        setError(caught instanceof Error ? caught.message : 'failed');
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId]);

  async function run(action: InventoryAction) {
    setPanel('pending');
    setError(null);
    try {
      const result = await controller.apply(projectId, ledger, revision, action);
      setReply(result.reply);
      setLabels(result.reply.labels);
      if (result.persisted) {
        setLedger(result.reply.ledger);
        setRevision(result.revision);
        setPanel('saved');
      } else {
        setPanel(
          ledger.items.length === 0 && ledger.containers.length === 0 && !result.reply.changed
            ? 'empty'
            : 'read',
        );
      }
    } catch (caught) {
      setPanel('error');
      setError(caught instanceof Error ? caught.message : 'failed');
    }
  }

  function record(event: FormEvent) {
    event.preventDefault();
    void run({
      kind: 'record',
      event: {
        id: eventId(),
        subjectKind,
        subjectId,
        kind,
        quantityText,
        label,
        location: location.trim() === '' ? null : location,
        holding: subjectKind === 'item' ? holding : null,
        usage: subjectKind === 'container' ? usage : null,
      },
    });
  }

  function conserve(event: FormEvent) {
    event.preventDefault();
    const ordinals = [ordinalA, ordinalB]
      .map((value) => value.trim())
      .filter((value) => value !== '');
    if (ordinals.length === 0 || ordinals.some((value) => !/^\d+$/.test(value))) {
      setPanel('error');
      setError('invalid_input');
      return;
    }
    void run({
      kind: 'conserve',
      claims: ordinals.map((value) => ({ containerId: claimId, unitOrdinal: Number(value) })),
    });
  }

  function openHistorical(event: FormEvent) {
    event.preventDefault();
    void run({ kind: 'openHistorical', planSnapshotId: planId });
  }

  const statusText =
    panel === 'pending'
      ? '확인 중'
      : panel === 'saved'
        ? '저장됨'
        : panel === 'error'
          ? '저장하지 않음'
          : panel === 'empty'
            ? '기록이 없습니다'
            : '현재 재고는 바뀌지 않았습니다';

  return (
    <section className="measurement-panel inventory-panel" aria-labelledby="inventory-title" data-testid="inventory-panel">
      <div className="section-kicker">02.6 · 보유 이력</div>
      <h2 id="inventory-title">물건과 용기</h2>
      <p
        className="session-note"
        data-testid="inventory-status"
        data-state={panel}
        role="status"
      >
        {statusText}
      </p>
      {error && (
        <p className="session-note" data-testid="inventory-error" data-reason={error}>
          {error}
        </p>
      )}
      {panel === 'empty' && ledger.events.length === 0 && (
        <p className="session-note" data-testid="inventory-empty">
          기록이 없습니다. 구매로 물건이나 용기를 남깁니다. 빈 수량은 0개가 아닙니다.
        </p>
      )}
      <ul className="plan-list" data-testid="inventory-subjects">
        {ledger.items.map((item) => {
          const itemLabel = labelFor(labels, item.id, 'item');
          return (
            <li
              key={item.id}
              data-testid={`inventory-subject-${item.id}`}
              data-quantity-code={itemLabel?.code ?? 'unknown'}
              data-count={itemLabel?.count ?? ''}
            >
              <strong>{item.label}</strong>
              <span className="session-note">
                {' '}
                · {holdingPhrase(item.holding)} · {quantityPhrase(itemLabel?.code ?? 'unknown', itemLabel?.count ?? null)}
                {item.location ? ` · ${item.location}` : ''}
              </span>
            </li>
          );
        })}
        {ledger.containers.map((container) => {
          const containerLabel = labelFor(labels, container.id, 'container');
          return (
            <li
              key={container.id}
              data-testid={`inventory-subject-${container.id}`}
              data-quantity-code={containerLabel?.code ?? 'unknown'}
              data-count={containerLabel?.count ?? ''}
              data-usage={container.usage}
            >
              <strong>{container.label}</strong>
              <span className="session-note">
                {' '}
                · {usagePhrase(container.usage)} ·{' '}
                {quantityPhrase(containerLabel?.code ?? 'unknown', containerLabel?.count ?? null)}
                {container.location ? ` · ${container.location}` : ''}
              </span>
            </li>
          );
        })}
      </ul>
      <ul className="plan-list" data-testid="inventory-events">
        {ledger.events.map((entry) => (
          <li key={entry.id} data-quantity-text={entry.quantityText}>
            {eventPhrase(entry.kind)} · {entry.label}
            {entry.quantityText === '' ? ' · 수량 미입력' : ` · 수량 ${entry.quantityText}`}
          </li>
        ))}
      </ul>
      <form onSubmit={record} data-testid="inventory-record-form">
        <label className="field">
          <span className="field-label">구분</span>
          <select
            value={subjectKind}
            data-testid="inventory-subject-kind"
            onChange={(event) => setSubjectKind(event.target.value as SubjectKind)}
          >
            <option value="item">물건</option>
            <option value="container">용기</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">식별자</span>
          <input
            type="text"
            value={subjectId}
            data-testid="inventory-subject-id"
            onChange={(event) => setSubjectId(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">이름</span>
          <input
            type="text"
            value={label}
            data-testid="inventory-label"
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">이력</span>
          <select
            value={kind}
            data-testid="inventory-event-kind"
            onChange={(event) => setKind(event.target.value as EventKind)}
          >
            <option value="purchase">구매</option>
            <option value="return">반품</option>
            <option value="move">다른 위치로 이동</option>
            <option value="quantityEdit">수량 수정</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">수량 (비우면 미상, 0은 0개)</span>
          <input
            type="text"
            inputMode="numeric"
            value={quantityText}
            data-testid="inventory-quantity"
            onChange={(event) => setQuantityText(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">위치</span>
          <input
            type="text"
            value={location}
            data-testid="inventory-location"
            onChange={(event) => setLocation(event.target.value)}
          />
        </label>
        {subjectKind === 'item' ? (
          <label className="field">
            <span className="field-label">보유 형태</span>
            <select
              value={holding}
              data-testid="inventory-holding"
              onChange={(event) => setHolding(event.target.value as HoldingKind)}
            >
              <option value="individual">개별</option>
              <option value="bundle">묶음</option>
            </select>
          </label>
        ) : (
          <label className="field">
            <span className="field-label">사용 상태</span>
            <select
              value={usage}
              data-testid="inventory-usage"
              onChange={(event) => setUsage(event.target.value as ContainerUse)}
            >
              <option value="empty">빈 용기</option>
              <option value="inUse">사용 중</option>
            </select>
          </label>
        )}
        <button className="button button-primary" type="submit" data-testid="inventory-record" disabled={panel === 'pending'}>
          이력 기록
        </button>
      </form>
      <form onSubmit={conserve} data-testid="inventory-conserve-form">
        <label className="field">
          <span className="field-label">확인할 용기</span>
          <input
            type="text"
            value={claimId}
            data-testid="inventory-claim-id"
            onChange={(event) => setClaimId(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">단위 번호</span>
          <input
            type="text"
            inputMode="numeric"
            value={ordinalA}
            data-testid="inventory-ordinal-a"
            onChange={(event) => setOrdinalA(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">같은 용기의 다른 배치</span>
          <input
            type="text"
            inputMode="numeric"
            value={ordinalB}
            data-testid="inventory-ordinal-b"
            onChange={(event) => setOrdinalB(event.target.value)}
          />
        </label>
        <button className="button button-secondary" type="submit" data-testid="inventory-conserve" disabled={panel === 'pending'}>
          중복 사용 확인
        </button>
      </form>
      {reply && (
        <p
          className="session-note"
          data-testid="inventory-conservation"
          data-reason={reply.conservation.reasonCode}
          data-status={reply.conservation.status}
        >
          보존 판정 {reply.conservation.reasonCode}
        </p>
      )}
      <form onSubmit={openHistorical} data-testid="inventory-historical-form">
        <label className="field">
          <span className="field-label">과거 계획 다이제스트</span>
          <input
            type="text"
            value={planId}
            data-testid="inventory-plan-id"
            onChange={(event) => setPlanId(event.target.value)}
            placeholder={ZERO_DIGEST}
          />
        </label>
        <button className="button button-secondary" type="submit" data-testid="inventory-open-historical" disabled={panel === 'pending'}>
          과거 계획 열기
        </button>
      </form>
      {reply?.historicalPlanId && (
        <p className="session-note" data-testid="inventory-historical" data-changed="false">
          과거 계획 {reply.historicalPlanId.slice(0, 12)}… 을 참조했습니다. 현재 재고는 바꾸지 않습니다.
        </p>
      )}
    </section>
  );
}
