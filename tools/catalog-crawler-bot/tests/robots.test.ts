import { describe, expect, it } from 'vitest';
import { parseRobots, robotsAllows } from '../robots.ts';
import { fixture } from './helpers.ts';

const parsed = (name: string) => {
  const result = parseRobots(fixture('robots', name), 200);
  if (!result.ok) throw new Error(result.reason);
  return result.robots;
};

describe('robots.txt for UA *', () => {
  it('29cm: allows everything except the observed prefixes', () => {
    const robots = parsed('29cm.txt');
    expect(robotsAllows(robots, '/products/3001')).toBe(true);
    for (const path of ['/embed/x', '/home/embed/y', '/my-page/z', '/order/1', '/auth/login', '/inbox/', '/content/post/preview?id=1']) {
      expect(robotsAllows(robots, path), path).toBe(false);
    }
  });
  it('ikea: wildcard query rules, longest match wins, Crawl-delay is read', () => {
    const robots = parsed('ikea.txt');
    expect(robots.crawlDelaySec).toBe(12);
    expect(robotsAllows(robots, '/kr/ko/p/kallax-12345678/')).toBe(true);
    expect(robotsAllows(robots, '/kr/ko/p/kallax-12345678/?sort=price')).toBe(false);
    expect(robotsAllows(robots, '/kr/ko/search/?q=a')).toBe(false);
    expect(robotsAllows(parsed('ikea.txt'), '/kr/ko/compare/')).toBe(false);
  });
  it('Allow beats Disallow at equal length, $ anchors, empty Disallow adds nothing', () => {
    const r = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a\nDisallow: /b$\nDisallow:\n', 200);
    if (!r.ok) throw new Error('parse');
    expect(robotsAllows(r.robots, '/a/x')).toBe(true);
    expect(robotsAllows(r.robots, '/b')).toBe(false);
    expect(robotsAllows(r.robots, '/b/c')).toBe(true);
  });
  it('rules of other agents are ignored, shared groups are honored', () => {
    const r = parseRobots('User-agent: bad\nDisallow: /\n\nUser-agent: other\nUser-agent: *\nDisallow: /x\n', 200);
    if (!r.ok) throw new Error('parse');
    expect(robotsAllows(r.robots, '/y')).toBe(true);
    expect(robotsAllows(r.robots, '/x')).toBe(false);
  });
});

describe('unreadable robots.txt is never "allow all"', () => {
  it.each([
    ['an HTML error page', fixture('robots', 'ohou-html-error.html'), 200, 'robots_not_text'],
    ['a 403', 'Access Denied', 403, 'robots_status_403'],
    ['a 404', 'not found', 404, 'robots_status_404'],
    ['an empty body', '', 200, 'robots_empty'],
    ['text without any user-agent line', 'hello world\nDisallow: /', 200, 'robots_unparseable'],
    ['no status', 'User-agent: *\n', null, 'robots_status_unknown'],
  ])('%s', (_label, text, status, reason) => {
    expect(parseRobots(text as string, status as number | null)).toEqual({ ok: false, reason });
  });
});
