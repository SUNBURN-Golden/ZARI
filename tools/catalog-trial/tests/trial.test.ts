import { describe, expect, it } from 'vitest';
import { pace, stopReason } from '../trial-headed.ts';
const body = 'x'.repeat(400);
describe('trial crawler guards', () => {
  it('stops on 403/429, challenge and empty pages', () => {
    expect(stopReason(403, body, '')).toBe('http_403');
    expect(stopReason(429, body, '')).toBe('http_429');
    expect(stopReason(200, body, 'Just a moment...')).toBe('challenge');
    expect(stopReason(200, `${body} captcha`, '')).toBe('challenge');
    expect(stopReason(200, '  짧음 ', '')).toBe('empty_page');
    expect(stopReason(200, body, '상품')).toBeNull();
  });
  it('paces 4-8s, or robots Crawl-delay if longer', () => {
    expect(pace(0, () => 0)).toBe(4000);
    expect(pace(0, () => 0.999)).toBeLessThan(8000);
    expect(pace(30, () => 0.5)).toBe(30000);
  });
});
