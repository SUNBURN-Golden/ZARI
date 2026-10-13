import { expect, it } from 'vitest';
import type {
  LocationLog,
  LocationObservation,
  LocationSearchReply,
} from '../../src/contracts/generated/dto';
import { EMPTY_LOG, LocationController, type LocationClient } from '../../src/features/location/controller';
import {
  kindPhrase,
  ordinalsPhrase,
  plannedPhrase,
  statusPhrase,
} from '../../src/features/location/phrases';
import { quantityPhrase } from '../../src/features/inventory/phrases';
import type { ProjectRepository } from '../../src/persistence/repository';

const log: LocationLog = { observations: [] };
const input = { items: [], ownedContainers: [] } as never;

function observation(): LocationObservation {
  return {
    id: 'obs-1',
    itemId: 'item-a',
    kind: 'relocate',
    label: '수건',
    location: '서랍',
    unitOrdinals: [],
    planSnapshotId: null,
  };
}

it('a planned location phrase is never the confirmed one', () => {
  expect(statusPhrase('plannedOnly')).toBe('계획 위치 · 미확인');
  expect(statusPhrase('plannedOnly')).not.toBe(statusPhrase('confirmed'));
  expect(statusPhrase('staleConfirmation')).toBe('다른 계획의 확인');
  expect(statusPhrase('lost')).toBe('분실 신고');
  expect(statusPhrase('unlocated')).toBe('위치 기록 없음');
  expect(kindPhrase('alias')).toBe('별칭');
  expect(plannedPhrase({ kind: 'direct', label: null, reasonCode: null })).toBe(
    '공간 직접 배치',
  );
  expect(
    plannedPhrase({ kind: 'contained', label: '수납함', reasonCode: null }),
  ).toBe('수납함 안');
  expect(
    plannedPhrase({ kind: 'provisional', label: '수납함', reasonCode: 'fit_unverified' }),
  ).toBe('수납함 안 (임시 수납 · fit_unverified)');
  expect(ordinalsPhrase([], null)).toBe('물건 전체');
  expect(ordinalsPhrase([0, 2], 3)).toBe('단위 0, 2');
  expect(quantityPhrase('unknown', null)).toBe('수량 미상');
});

it('persists only a log Rust changed and surfaces failure codes without saving', async () => {
  let requests = 0;
  let saves = 0;
  const applied: { log: LocationLog; changed: boolean } = {
    log: { observations: [observation()] },
    changed: true,
  };
  const workers = {
    async ensure() {
      return {
        async systemRequest(command: { kind: string }) {
          requests += 1;
          if (command.kind === 'applyLocationLog') {
            return { kind: 'locationLogApplied' as const, reply: applied };
          }
          const reply: LocationSearchReply = { rows: [], truncated: false };
          return { kind: 'locationSearchQueried' as const, reply };
        },
      };
    },
  };
  const repository = {
    async saveLocationLog() {
      saves += 1;
      return { status: 'saved' as const, revision: '1' };
    },
  };
  const controller = new LocationController(
    workers as { ensure(): Promise<LocationClient> },
    repository as unknown as ProjectRepository,
  );
  const recorded = await controller.record('p', log, '0', input, null, observation());
  expect(recorded.persisted).toBe(true);
  expect(recorded.revision).toBe('1');
  const searched = await controller.search(input, null, applied.log, '수건');
  expect(searched.rows).toEqual([]);
  expect(requests).toBe(2);
  expect(saves).toBe(1);

  applied.changed = false;
  const unchanged = await controller.record('p', applied.log, '1', input, null, observation());
  expect(unchanged.persisted).toBe(false);
  expect(saves).toBe(1);
});

it('a rejected observation is a failure, not a save', async () => {
  let saves = 0;
  const workers = {
    async ensure() {
      return {
        async systemRequest() {
          return {
            kind: 'operationFailed' as const,
            code: 'confirm_needs_plan',
            affectedFields: [],
            affectedIds: [],
            reasonParameters: {},
            retryable: false,
          };
        },
      };
    },
  };
  const repository = {
    async saveLocationLog() {
      saves += 1;
      return { status: 'saved' as const, revision: '1' };
    },
  };
  const controller = new LocationController(
    workers as { ensure(): Promise<LocationClient> },
    repository as unknown as ProjectRepository,
  );
  await expect(controller.record('p', log, '0', input, null, observation())).rejects.toThrow(
    'confirm_needs_plan',
  );
  expect(saves).toBe(0);
});

it('the empty log constant has no observations', () => {
  expect(EMPTY_LOG.observations).toEqual([]);
});
