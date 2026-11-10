import { describe, expect, it } from 'vitest';
import { categoryHintOf } from '../lib/extract.js';

describe('storage bin keywords (MUJI + Daiso)', () => {
  it.each([
    '일체형 직사각 보관함 26 X 10 X 9 cm', '도이 수납함 소형', '비닐 봉투 보관함 짧은형', '투명 가로 3단 서랍장',
    '슬림 수납장', '원목 보관장', '폴리프로필렌 수납박스', '보관 박스 대', '수납케이스 깊은형', '보관케이스',
    '수납바구니', '정리함 칸막이 포함', '정리박스', '리빙박스 50L', '브릭스 멀티 바스켓 1호', '수납통', '수납 트레이',
    '폴리프로필렌 소형수납 캐리박스ㆍ화이트그레이',
  ])('%s → bin', (name) => expect(categoryHintOf('', name)).toBe('bin'));

  it.each([
    ['미끄럼 방지 스틸 바지걸이 2개입', 'other'], ['접착 패드 L자형 후크 3개입', 'other'],
    ['코트용 고급 옷커버', 'other'], ['2단 도어걸이 수납 선반 대형', 'shelf'], ['논슬립 스틸 고리 옷걸이 5P', 'other'],
    ['원목 옷장', 'cabinet'], ['아카시아 튼튼한 수납 박스 · L용 상판', 'bin'],
  ])('%s → %s', (name, hint) => expect(categoryHintOf('', name)).toBe(hint));

  it('hooks/hangers with 수납 are never bins', () => {
    expect(categoryHintOf('', '옷장용 수납걸이 9칸')).not.toBe('bin');
    expect(categoryHintOf('', '프린팅 선풍기 보관커버 밴드형')).not.toBe('bin');
  });
});
