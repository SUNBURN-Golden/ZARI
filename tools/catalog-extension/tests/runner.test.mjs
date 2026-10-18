import { describe, expect, it } from 'vitest';
import { handleJob } from '../lib/runner.js';
import { fixture, snapshotFromHtml } from './html-snapshot.mjs';

const NOW = () => Date.UTC(2026, 9, 15);

function env(pages) {
  const calls = [];
  return {
    calls,
    now: NOW,
    collect: async (url, kind) => {
      calls.push([kind, url]);
      const page = pages[url];
      if (!page) throw new Error('no page');
      if (kind === 'robots') return { url: page.finalUrl ?? url, status: page.status ?? 200, contentType: 'text/plain', text: page.text };
      return snapshotFromHtml(page.html, page.finalUrl ?? url, page.status ?? 200);
    },
  };
}

describe('the extension only runs what the bot sends, inside the allowlist', () => {
  it('rejects hosts, schemes, paths and kinds outside scope without opening a tab', async () => {
    const e = env({});
    for (const job of [
      { id: 'a', kind: 'product', url: 'https://evil.example/productions/1/selling' },
      { id: 'b', kind: 'product', url: 'http://ohou.se/productions/1/selling' },
      { id: 'c', kind: 'listing', url: 'https://www.29cm.co.kr/my-page/orders' },
      { id: 'd', kind: 'listing', url: 'https://www.ikea.com/kr/ko/search/?q=a' },
      { id: 'e', kind: 'robots', url: 'https://ohou.se/anything' },
      { id: 'f', kind: 'robots', url: 'https://evil.example/robots.txt' },
      { id: 'g', kind: 'product', url: 'https://ohou.se/contents/9' },
      { id: 'h', kind: 'visit', url: 'https://ohou.se/productions/1/selling' },
      { id: 'i', kind: 'robots', url: 'https://ohou.se/robots.txt?x=1' },
    ]) {
      expect((await handleJob(job, e)).type, job.url).toBe('error');
    }
    expect(e.calls).toEqual([]);
  });
  it('a redirect out of scope is refused', async () => {
    const url = 'https://ohou.se/productions/1/selling';
    const e = env({ [url]: { html: fixture('ohou', 'product.html'), finalUrl: 'https://evil.example/p' } });
    expect(await handleJob({ id: 'x', kind: 'product', url }, e)).toMatchObject({ type: 'error', code: 'out_of_scope' });
  });
  it('reads robots.txt text and status for the bot to judge', async () => {
    const url = 'https://www.ikea.com/robots.txt';
    const e = env({ [url]: { text: fixture('robots', 'ikea.txt') } });
    expect(await handleJob({ id: 'r', kind: 'robots', url }, e)).toMatchObject({ type: 'result', kind: 'robots', status: 200, host: 'www.ikea.com' });
  });
});

describe('block / login / captcha pages report blocked and extract nothing', () => {
  const url = 'https://ohou.se/productions/1/selling';
  it('captcha page', async () => {
    expect(await handleJob({ id: 'c', kind: 'product', url }, env({ [url]: { html: fixture('ohou', 'product-captcha.html') } }))).toMatchObject({ type: 'blocked', reason: 'captcha' });
  });
  it.each([[429, 'http_429'], [403, 'http_403'], [401, 'login_required']])('HTTP %i', async (status, reason) => {
    const reply = await handleJob({ id: 's', kind: 'product', url }, env({ [url]: { html: fixture('ohou', 'product.html'), status } }));
    expect(reply).toMatchObject({ type: 'blocked', reason });
    expect(reply).not.toHaveProperty('items');
  });
  it('login wall without product evidence', async () => {
    const html = '<html><head><title>로그인</title></head><body><h1>로그인이 필요합니다</h1><input type="password"></body></html>';
    expect(await handleJob({ id: 'l', kind: 'listing', url }, env({ [url]: { html } }))).toMatchObject({ type: 'blocked', reason: 'login_required' });
  });
  it('a normal product that mentions login in its text is not a block', async () => {
    const html = fixture('ohou', 'product.html').replace('<h1>', '<p>로그인 후 후기를 볼 수 있습니다. 접근이 제한되지 않습니다</p><h1>');
    expect((await handleJob({ id: 'n', kind: 'product', url }, env({ [url]: { html } }))).type).toBe('result');
  });
  it('429 on robots.txt is a block signal', async () => {
    const robots = 'https://ohou.se/robots.txt';
    expect(await handleJob({ id: 'z', kind: 'robots', url: robots }, env({ [robots]: { text: '', status: 429 } }))).toMatchObject({ type: 'blocked', reason: 'http_429' });
  });
});
