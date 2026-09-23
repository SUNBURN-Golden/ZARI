import { useCallback, useEffect, useRef, useState } from 'react';
import type { BootstrapProbeDto, BootstrapProbeResult } from '../contracts/generated/dto';
import { ProbeClient, StaleRequest } from './client';
type Unit = 'mm' | 'cm';
type Dimension = 'compartmentWidth' | 'unitWidth';
type Raw = Record<Dimension, { text: string; unit: Unit }> & {
  unitCount: string;
  neededNewUnits: string;
  packQuantity: string;
};
type Phase = 'loading' | 'ready' | 'stale' | 'invalid' | 'error';
const initial = (): Raw => ({
  compartmentWidth: { text: '600', unit: 'mm' },
  unitWidth: { text: '190', unit: 'mm' },
  unitCount: '3',
  neededNewUnits: '5',
  packQuantity: '2',
});
const increment = (value: string) => {
  const next = BigInt(value) + 1n;
  if (next > 18446744073709551615n) throw new Error('revision_exhausted');
  return String(next);
};
function toProbe(raw: Raw): BootstrapProbeDto {
  const measurement = (value: Raw[Dimension]): BootstrapProbeDto['compartmentWidth'] => ({
    ...value,
    uncertainty: { state: 'unknown' },
    origin: 'userDeclared',
    evidenceIds: [],
  });
  const gap: BootstrapProbeDto['leftGapMm'] = {
    state: 'known',
    value: 5,
    provenance: {
      origin: 'synthetic',
      verification: 'unverified',
      evidenceIds: [],
      ruleIds: [],
      inputRefs: [],
      observedAt: null,
    },
  };
  return {
    compartmentWidth: measurement(raw.compartmentWidth),
    unitWidth: measurement(raw.unitWidth),
    unitCount: { text: raw.unitCount },
    leftGapMm: gap,
    rightGapMm: gap,
    betweenGapMm: gap,
    neededNewUnits: { text: raw.neededNewUnits },
    packQuantity: { text: raw.packQuantity },
  };
}
export function useProbe() {
  const [raw, setRaw] = useState<Raw>(initial);
  const rawRef = useRef(raw);
  const [phase, setPhase] = useState<Phase>('loading');
  const [result, setResult] = useState<BootstrapProbeResult | null>(null);
  const [unitSwitchError, setUnitSwitchError] = useState<string | null>(null);
  const epoch = useRef('0');
  const revision = useRef('0');
  const digest = useRef<string | null>(null);
  const clientRef = useRef<ProbeClient | null>(null);
  const ready = useRef<Promise<void>>(Promise.resolve());
  const [generation, setGeneration] = useState(0);
  const evaluate = useCallback(async (snapshot: Raw, captured: string, client: ProbeClient) => {
    const current = () => clientRef.current === client && epoch.current === captured;
    try {
      await ready.current;
      if (!current()) return;
      await client.activate('bootstrap-project', captured, revision.current);
      const probe = toProbe(snapshot);
      const normalized = await client.request({
        kind: 'normalizeInput',
        input: { kind: 'bootstrap', probe },
        priorInputDigest: digest.current,
        formatRequests: [],
      });
      if (!current() || normalized.kind !== 'normalized') return;
      if (normalized.inputDigest !== null && normalized.inputDigest !== digest.current) {
        revision.current = increment(revision.current);
        digest.current = normalized.inputDigest;
        await client.activate('bootstrap-project', captured, revision.current);
      }
      if (!current()) return;
      const response = await client.request({ kind: 'evaluateProbe', probe });
      if (!current() || response.kind !== 'probeEvaluated') return;
      setResult(response.result);
      setPhase(response.result.diagnostics.length ? 'invalid' : 'ready');
    } catch (error) {
      if (current() && !(error instanceof StaleRequest)) setPhase('error');
    }
  }, []);
  useEffect(() => {
    const client = new ProbeClient(
      () => new Worker(new URL('./entry.ts', import.meta.url), { type: 'module' }),
      () => {
        if (clientRef.current === client) setPhase('error');
      },
    );
    clientRef.current = client;
    setPhase('loading');
    ready.current = client.start();
    void evaluate(rawRef.current, epoch.current, client);
    return () => {
      clientRef.current = null;
      client.dispose();
    };
  }, [generation, evaluate]);
  const invalidate = () => {
    epoch.current = increment(epoch.current);
    clientRef.current?.setEpoch(epoch.current);
    setPhase((previous) => (previous === 'error' ? 'error' : 'stale'));
    setUnitSwitchError(null);
    return epoch.current;
  };
  const replace = (next: Raw) => {
    rawRef.current = next;
    setRaw(next);
  };
  const edit = (field: keyof Raw, text: string) => {
    invalidate();
    replace(
      field === 'compartmentWidth' || field === 'unitWidth'
        ? { ...rawRef.current, [field]: { ...rawRef.current[field], text } }
        : { ...rawRef.current, [field]: text },
    );
  };
  const commit = () => {
    const client = clientRef.current;
    if (client && phase !== 'error') void evaluate(rawRef.current, invalidate(), client);
  };
  const changeUnit = async (field: Dimension, unit: Unit) => {
    if (unit === rawRef.current[field].unit) return;
    const snapshot = rawRef.current;
    const captured = invalidate();
    const client = clientRef.current;
    if (!client) return;
    const current = () => clientRef.current === client && epoch.current === captured;
    try {
      await ready.current;
      if (!current()) return;
      await client.activate('bootstrap-project', captured, revision.current);
      const response = await client.request({
        kind: 'normalizeInput',
        input: { kind: 'bootstrap', probe: toProbe(snapshot) },
        priorInputDigest: digest.current,
        formatRequests: [{ fieldPath: field, unit }],
      });
      if (!current() || response.kind !== 'normalized') return;
      const formatted = response.formattedFields.find(
        (value) => value.fieldPath === field && value.unit === unit,
      );
      if (!formatted) {
        setUnitSwitchError('입력값을 먼저 확인해 주세요. 단위와 입력값은 그대로 유지했습니다.');
        return;
      }
      const next = { ...snapshot, [field]: { text: formatted.text, unit } };
      replace(next);
      void evaluate(next, captured, client);
    } catch (error) {
      if (current() && !(error instanceof StaleRequest)) setPhase('error');
    }
  };
  const reset = () => {
    const next = initial();
    replace(next);
    const captured = invalidate();
    const client = clientRef.current;
    if (client && phase !== 'error') void evaluate(next, captured, client);
  };
  return {
    raw,
    edit,
    changeUnit,
    commit,
    reset,
    retry: () => setGeneration((value) => value + 1),
    phase,
    result,
    diagnostics: phase === 'invalid' ? (result?.diagnostics ?? []) : [],
    unitSwitchError,
  };
}
