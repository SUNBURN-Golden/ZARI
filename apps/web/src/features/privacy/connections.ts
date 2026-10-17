/**
 * z-privacy-offline: which ZARI actions stay on this device and which need a
 * connection. This is the one list the data screen renders and the guard
 * tests check. ZARI has no account, no analytics, and no external AI call;
 * a new network use must be added here first, with its reason, or the guard
 * test fails.
 */
export type ConnectionKind =
  /** Works with no network at all. */
  | 'local'
  /** Needs the network only to fetch ZARI's own static files. No user data leaves. */
  | 'same-origin-update'
  /** The user opens another site. ZARI sends nothing but the browser's own request. */
  | 'user-opened-link';

export interface ConnectionEntry {
  id: string;
  kind: ConnectionKind;
  label: string;
  note: string;
}

export const CONNECTIONS: readonly ConnectionEntry[] = [
  {
    id: 'plan',
    kind: 'local',
    label: '측정·배치 계산·도면·BOM·실행 가이드',
    note: '계산은 이 기기의 WASM에서만 합니다.',
  },
  {
    id: 'photos',
    kind: 'local',
    label: '사진 첨부',
    note: '화면 표시용 사본만 이 기기에 둡니다. 계산에 쓰지 않습니다.',
  },
  {
    id: 'search',
    kind: 'local',
    label: '내 물건 찾기·위치 기록',
    note: '검색어와 위치 글자는 이 기기를 떠나지 않습니다.',
  },
  {
    id: 'files',
    kind: 'local',
    label: '보내기·가져오기·출력',
    note: '내려받는 파일과 고른 파일만 다룹니다. 자동으로 올리지 않습니다.',
  },
  {
    id: 'update',
    kind: 'same-origin-update',
    label: '앱 새 버전 받기',
    note: '네트워크가 있을 때 ZARI 자체 파일만 받습니다. 프로젝트·사진은 보내지 않습니다. 오프라인에서는 저장된 앱으로 열립니다.',
  },
  {
    id: 'purchase-link',
    kind: 'user-opened-link',
    label: '판매처 링크 열기',
    note: '직접 누를 때만 새 탭으로 열립니다. 이 앱은 프로젝트 내용을 링크에 싣지 않습니다.',
  },
] as const;

export const KIND_TEXT: Record<ConnectionKind, string> = {
  local: '완전 로컬',
  'same-origin-update': '연결 필요: 앱 파일 받기',
  'user-opened-link': '연결 필요: 직접 연 링크',
};

/** Capabilities ZARI does not have. Shown so absence is stated, not implied. */
export const ABSENT_CONNECTIONS = ['외부 AI로 사진·치수 전송', '사용 통계·분석 전송', '계정·클라우드 동기화'] as const;

/** Korean text for a store failure. A failed save is never worded as saved. */
export function describeStoreFailure(message: string): string {
  if (message.includes('persistence_failed:quota'))
    return '저장 공간이 부족해 저장하지 못했습니다. 저장되지 않았습니다. 사진·프로젝트를 정리하거나 보내기로 내려받은 뒤 다시 시도하세요.';
  if (message.includes('migration_blocked'))
    return '이 앱보다 새로운 저장 형식입니다. 데이터는 그대로 두었습니다. 이 탭을 새로고침해 최신 앱으로 여세요.';
  if (message.includes('unsupported_schema'))
    return '더 새로운 형식의 기록이라 쓰지 않았습니다. 데이터는 그대로입니다.';
  if (message.includes('record_corrupt')) return '손상된 기록이라 읽지 않았습니다.';
  if (message.includes('persistence_failed'))
    return '이 기기에 저장하지 못했습니다. 저장되지 않았습니다.';
  return message;
}
