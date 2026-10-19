import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Channel, Job, Reply } from '../channel.ts';
import { normalizeConfig } from '../config.ts';
import type { Config } from '../config.ts';
import { statePaths } from '../paths.ts';
import type { Clock } from '../scheduler.ts';
import { fixture, snapshotFromHtml } from '../../catalog-extension/tests/html-snapshot.mjs';
import { handleJob } from '../../catalog-extension/lib/runner.js';

export { fixture };

export const T0 = Date.UTC(2026, 9, 16, 0, 0, 0);

export function fakeClock(start = T0): Clock & { set(ms: number): void } {
  let now = start;
  return {
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    random: () => 0.5,
    set: (ms) => {
      now = ms;
    },
  };
}

export function tempPaths() {
  return statePaths(mkdtempSync(join(tmpdir(), 'zari-bot-')));
}

export type Page = { html?: string; text?: string; status?: number; finalUrl?: string };

/** An extension without Chrome: the real job runner over fixture pages. */
export function fakeExtension(pages: Record<string, Page>, clock: Clock, onRequest?: (job: Job, count: number) => void) {
  const requests: { kind: string; url: string; at: number }[] = [];
  const closeListeners: (() => void)[] = [];
  const channel: Channel & { requests: typeof requests; close(): Promise<void>; drop(): void } = {
    requests,
    waitForExtension: async () => true,
    onClose: (listener) => closeListeners.push(listener),
    close: async () => {},
    drop: () => closeListeners.forEach((listener) => listener()),
    request: async (job: Job): Promise<Reply> => {
      requests.push({ kind: job.kind, url: job.url, at: clock.now() });
      onRequest?.(job, requests.length);
      const reply = await handleJob(job, {
        now: () => clock.now(),
        collect: async (url: string, kind: string) => {
          const page = pages[url];
          if (!page) throw new Error('navigation failed');
          const finalUrl = page.finalUrl ?? url;
          if (kind === 'robots') return { url: finalUrl, status: page.status ?? 200, contentType: 'text/plain', text: page.text ?? '' };
          return snapshotFromHtml(page.html ?? '', finalUrl, page.status ?? 200);
        },
      });
      return reply as Reply;
    },
  };
  return channel;
}

export const FAST: Config = normalizeConfig({ minIntervalMs: 8000, jitterMs: 4000 });

export const IKEA_LISTING = 'https://www.ikea.com/kr/ko/cat/bookcases-10382/';
export const KALLAX = 'https://www.ikea.com/kr/ko/p/kallax-shelf-unit-white-80275887/';
export const BILLY = 'https://www.ikea.com/kr/ko/p/billy-bookcase-white-00263850/';

export function ikeaPages(): Record<string, Page> {
  return {
    'https://www.ikea.com/robots.txt': { text: fixture('robots', 'ikea.txt') },
    [IKEA_LISTING]: { html: fixture('ikea', 'listing.html') },
    [KALLAX]: { html: fixture('ikea', 'product.html') },
    [BILLY]: { html: fixture('ikea', 'product.html') },
  };
}
