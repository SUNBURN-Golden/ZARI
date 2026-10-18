// The unattended crawl loop. It only decides *what* to ask the extension for
// and *when*; every guardrail lives here so it is testable with a fake clock
// and a fake extension: per-host pacing, run and daily caps, robots.txt,
// block detection with persisted cooldown, kill switch.
import type { Channel, Job, Reply } from './channel.ts';
import { LIMITS } from './config.ts';
import type { Config } from './config.ts';
import { parseRobots, robotsAllows } from './robots.ts';
import { emptyHost, enqueue, entryFor, loadStore, requeueStale, saveStore, stopRequested } from './state.ts';
import type { HostState, QueueEntry, Store } from './state.ts';
import type { StatePaths } from './paths.ts';

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
  random(): number;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: () => Math.random(),
};

export type StopReason = 'queue_empty' | 'hosts_paused' | 'run_cap' | 'stop_file' | 'chrome_closed' | 'extension_missing';

export interface RunSummary {
  reason: StopReason;
  pages: number;
  itemsStored: number;
  queued: number;
  blocked: string[];
}

export interface RunDeps {
  paths: StatePaths;
  config: Config;
  channel: Channel;
  clock: Clock;
  log: (line: string) => void;
  /** Called after every `config.publishEvery` pages (0 disables). */
  checkpoint?: (store: Store) => Promise<void>;
}

const iso = (ms: number): string => new Date(ms).toISOString();
const dayOf = (ms: number): string => iso(ms).slice(0, 10);
const QUEUE_CAP = 20000;

function hostOf(store: Store, host: string, nowMs: number): HostState {
  const state = (store.hosts[host] ??= emptyHost());
  if (state.daily.date !== dayOf(nowMs)) state.daily = { date: dayOf(nowMs), count: 0 };
  return state;
}

function intervalMs(host: HostState, config: Config): number {
  const delay = host.robots?.rules.crawlDelaySec;
  return Math.max(config.minIntervalMs, delay ? Math.ceil(delay * 1000) : 0);
}

function pathAndQuery(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

type Pick = { entry: QueueEntry } | { entry: null; paused: boolean };

function pickNext(store: Store, config: Config, nowMs: number): Pick {
  let best: QueueEntry | null = null;
  let bestAt = Infinity;
  let paused = false;
  for (const entry of store.queue) {
    if (entry.state !== 'pending') continue;
    if (entry.retryAfter && Date.parse(entry.retryAfter) > nowMs) {
      paused = true;
      continue;
    }
    const host = hostOf(store, entry.host, nowMs);
    if (host.disabled || (host.cooldownUntil && Date.parse(host.cooldownUntil) > nowMs) || host.daily.count >= config.dailyPerHost) {
      paused = true;
      continue;
    }
    const at = host.nextRequestAt ? Date.parse(host.nextRequestAt) : 0;
    if (at < bestAt) {
      best = entry;
      bestAt = at;
    }
  }
  return best ? { entry: best } : { entry: null, paused };
}

/** A block signal: stop this host now, back off, never retry or work around. */
export function applyBlock(host: HostState, reason: string, nowMs: number, config: Config): void {
  host.consecutiveBlocks += 1;
  const hours = Math.min(LIMITS.cooldownMaxHours, config.blockCooldownHours * 2 ** (host.consecutiveBlocks - 1));
  host.cooldownUntil = iso(nowMs + hours * 3600000);
  if (host.consecutiveBlocks >= 2) host.disabled = { reason: `repeated_block:${reason}`, at: iso(nowMs) };
}

export async function runCrawl(deps: RunDeps): Promise<RunSummary> {
  const { paths, config, channel, clock, log } = deps;
  const store = loadStore(paths);
  requeueStale(store, clock.now(), config.recrawlDays);
  saveStore(paths, store, ['queue']);
  let closed = false;
  channel.onClose(() => {
    closed = true;
  });
  const summary: RunSummary = { reason: 'queue_empty', pages: 0, itemsStored: 0, queued: 0, blocked: [] };
  let jobCounter = 0;
  let sinceCheckpoint = 0;

  const send = async (host: HostState, job: Omit<Job, 'id'>): Promise<Reply> => {
    const now = clock.now();
    host.daily.count += 1;
    host.lastRequestAt = iso(now);
    host.nextRequestAt = iso(now + intervalMs(host, config) + Math.floor(clock.random() * config.jitterMs));
    saveStore(paths, store, ['hosts']);
    jobCounter += 1;
    return channel.request({ ...job, id: `j${jobCounter}` }, config.jobTimeoutMs);
  };

  const sleepChecked = async (ms: number): Promise<void> => {
    let left = ms;
    while (left > 0 && !stopRequested(paths) && !closed) {
      const slice = Math.min(1000, left);
      await clock.sleep(slice);
      left -= slice;
    }
  };

  while (true) {
    if (stopRequested(paths)) return finish('stop_file');
    if (closed) return finish('chrome_closed');
    if (summary.pages >= config.pagesPerRun) return finish('run_cap');
    const picked = pickNext(store, config, clock.now());
    if (picked.entry === null) return finish(picked.paused ? 'hosts_paused' : 'queue_empty');
    const entry = picked.entry;
    const host = hostOf(store, entry.host, clock.now());

    const wait = host.nextRequestAt ? Date.parse(host.nextRequestAt) - clock.now() : 0;
    if (wait > 0) {
      await sleepChecked(wait);
      continue;
    }

    const robotsAge = host.robots ? clock.now() - Date.parse(host.robots.fetchedAt) : Infinity;
    if (robotsAge >= config.robotsTtlHours * 3600000) {
      const reply = await send(host, { kind: 'robots', url: `https://${entry.host}/robots.txt` });
      if (reply.type === 'error' && reply.code === 'channel_closed') return finish('chrome_closed');
      if (reply.type === 'blocked') {
        applyBlock(host, String(reply.reason), clock.now(), config);
        summary.blocked.push(entry.host);
        log(`${iso(clock.now())} robots ${entry.host} blocked ${String(reply.reason)}`);
      } else if (reply.type === 'result' && reply.kind === 'robots') {
        const parsed = parseRobots(String(reply.text ?? ''), typeof reply.status === 'number' ? reply.status : null);
        if (parsed.ok) {
          host.robots = { fetchedAt: iso(clock.now()), status: 200, rules: parsed.robots };
          // Crawl-delay is only known now; it applies to the very next request.
          const floor = Date.parse(host.lastRequestAt ?? iso(clock.now())) + intervalMs(host, config);
          host.nextRequestAt = iso(Math.max(Date.parse(host.nextRequestAt ?? '') || 0, floor + Math.floor(clock.random() * config.jitterMs)));
          log(`${iso(clock.now())} robots ${entry.host} ok`);
        } else {
          host.disabled = { reason: parsed.reason, at: iso(clock.now()) };
          log(`${iso(clock.now())} robots ${entry.host} unreadable ${parsed.reason}: host closed`);
        }
      } else {
        host.disabled = { reason: `robots_unreadable:${String(reply.code ?? reply.type)}`, at: iso(clock.now()) };
        log(`${iso(clock.now())} robots ${entry.host} failed: host closed`);
      }
      saveStore(paths, store, ['hosts']);
      continue;
    }
    if (!host.robots || !robotsAllows(host.robots.rules, pathAndQuery(entry.url))) {
      entry.state = 'skipped';
      entry.reason = 'robots_disallow';
      saveStore(paths, store, ['queue']);
      log(`${iso(clock.now())} skip ${entry.url} robots_disallow`);
      continue;
    }

    summary.pages += 1;
    const reply = await send(host, { kind: entry.kind, url: entry.url });
    const at = iso(clock.now());
    if (reply.type === 'error' && reply.code === 'channel_closed') {
      summary.pages -= 1;
      return finish('chrome_closed');
    }
    if (reply.type === 'blocked') {
      applyBlock(host, String(reply.reason), clock.now(), config);
      summary.blocked.push(entry.host);
      log(`${at} ${entry.kind} ${entry.url} blocked ${String(reply.reason)}: ${entry.host} paused`);
    } else if (reply.type === 'result') {
      host.consecutiveBlocks = 0;
      host.cooldownUntil = null;
      entry.state = 'done';
      entry.lastVisitedAt = at;
      if (reply.kind === 'listing' && Array.isArray(reply.links)) {
        let added = 0;
        for (const link of reply.links as unknown[]) {
          const next = typeof link === 'string' && store.queue.length < QUEUE_CAP ? entryFor(link, 'product', entry.url) : null;
          if (next && enqueue(store, next)) added += 1;
        }
        summary.queued += added;
        log(`${at} listing ${entry.url} links=${(reply.links as unknown[]).length} queued=${added}`);
      } else if (reply.kind === 'product' && Array.isArray(reply.items)) {
        let stored = 0;
        for (const raw of reply.items as unknown[]) {
          const item = raw as Record<string, unknown>;
          if (item && typeof item.id === 'string' && item.id.startsWith('crawl:') && item.source === entry.site) {
            store.items[item.id] = { item, seenAt: at };
            stored += 1;
          }
        }
        summary.itemsStored += stored;
        log(`${at} product ${entry.url} items=${stored}`);
        sinceCheckpoint += 1;
      }
      saveStore(paths, store, ['items']);
    } else {
      const code = String(reply.code ?? 'error');
      if (code === 'out_of_scope' || code === 'bad_job' || code === 'not_product_url' || code === 'name_missing') {
        entry.state = 'skipped';
        entry.reason = code;
      } else {
        entry.attempts += 1;
        entry.lastVisitedAt = at;
        entry.retryAfter = iso(clock.now() + 6 * 3600000);
        if (entry.attempts >= 3) entry.state = 'failed';
      }
      log(`${at} ${entry.kind} ${entry.url} error ${code}`);
    }
    saveStore(paths, store, ['queue', 'hosts']);
    if (deps.checkpoint && config.publishEvery > 0 && sinceCheckpoint >= config.publishEvery) {
      sinceCheckpoint = 0;
      await deps.checkpoint(store);
    }
  }

  function finish(reason: StopReason): RunSummary {
    summary.reason = reason;
    saveStore(paths, store);
    log(`${iso(clock.now())} end ${reason} pages=${summary.pages} items=${summary.itemsStored} queued=${summary.queued}`);
    return summary;
  }
}
