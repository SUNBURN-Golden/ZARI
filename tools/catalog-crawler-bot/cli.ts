// `node tools/catalog-crawler-bot/cli.ts <command>` — see docs/CATALOG_COLLECTION.md.
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLocal, latestPointer } from './bundle.ts';
import { SocketChannel } from './channel.ts';
import { findChrome, launchChrome, refuseInCi } from './chrome.ts';
import { loadConfig } from './config.ts';
import { ensureDir } from './fsx.ts';
import { installNativeHost } from './install-native-host.ts';
import { statePaths } from './paths.ts';
import type { StatePaths } from './paths.ts';
import { publishLocalBundle, r2Setup } from './publish-r2.ts';
import type { Send } from './publish-r2.ts';
import { buildBundle } from './rust.ts';
import { realClock, runCrawl } from './scheduler.ts';
import type { Clock } from './scheduler.ts';
import { acquireLock, appendLog, emptyHost, entryForSeed, loadStore, saveStore, stopRequested } from './state.ts';
import { SITES, normalizeUrl } from '../catalog-extension/lib/sites.js';

export interface CliContext {
  paths: StatePaths;
  env: Record<string, string | undefined>;
  clock: Clock;
  out: (line: string) => void;
  send?: Send;
  extensionWaitMs: number;
}

export function defaultContext(): CliContext {
  return { paths: statePaths(), env: process.env, clock: realClock, out: (line) => console.log(line), extensionWaitMs: 90000 };
}

const isoSeconds = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const FILE_FORMAT = 'zari-collection/1';
const MAX_FILE_ITEMS = 50;
const MAX_FILES = 200;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

function siteKeys(): string[] {
  return Object.keys(SITES);
}

function ingestFile(path: string): { items: unknown[]; error: string | null } {
  if (statSync(path).size > MAX_FILE_BYTES) return { items: [], error: 'file_too_large' };
  let parsed: { format?: unknown; items?: unknown };
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { items: [], error: 'invalid_json' };
  }
  if (parsed.format !== FILE_FORMAT || !Array.isArray(parsed.items)) return { items: [], error: 'not_a_collection_file' };
  if (parsed.items.length > MAX_FILE_ITEMS) return { items: [], error: 'too_many_items' };
  return { items: parsed.items as unknown[], error: null };
}

export async function runCli(argv: string[], ctx: CliContext): Promise<number> {
  const { paths, out } = ctx;
  const [command, ...rest] = argv;
  const flag = (name: string): boolean => rest.includes(name);
  const option = (name: string): string | null => {
    const at = rest.indexOf(name);
    return at >= 0 ? (rest[at + 1] ?? null) : null;
  };
  const positional = rest.filter((arg) => !arg.startsWith('--'));
  ensureDir(paths.dir);

  switch (command) {
    case 'seed': {
      const [action, ...urls] = positional;
      const store = loadStore(paths);
      if (action === 'list') {
        for (const seed of store.seeds) out(seed);
        return 0;
      }
      if (action === 'add' || action === 'remove') {
        if (urls.length === 0) return fail(out, '주소가 필요합니다.');
        for (const raw of urls) {
          const normalized = normalizeUrl(raw);
          if (!normalized || !entryForSeed(raw)) return fail(out, `허용된 사이트의 주소가 아닙니다: ${raw}`);
          store.seeds = store.seeds.filter((seed) => seed !== normalized);
          if (action === 'add') store.seeds.push(normalized);
        }
        saveStore(paths, store, ['seeds']);
        out(`시드 ${store.seeds.length}개`);
        return 0;
      }
      return fail(out, 'seed add|list|remove');
    }
    case 'status': {
      const store = loadStore(paths);
      const counts: Record<string, number> = {};
      for (const entry of store.queue) counts[entry.state] = (counts[entry.state] ?? 0) + 1;
      out(`시드 ${store.seeds.length} · 큐 ${JSON.stringify(counts)} · 수집 항목 ${Object.keys(store.items).length}`);
      for (const [host, state] of Object.entries(store.hosts)) {
        out(`${host}: ${state.disabled ? `비활성(${state.disabled.reason})` : state.cooldownUntil ? `쿨다운 ~${state.cooldownUntil}` : '정상'} · 오늘 ${state.daily.count}건 · 연속 차단 ${state.consecutiveBlocks}`);
      }
      out(stopRequested(paths) ? 'STOP 파일이 있습니다 (run이 시작되지 않습니다).' : 'STOP 파일 없음');
      const latest = latestPointer(paths);
      out(latest ? `최신 번들 ${latest.bundleId}` : '번들 없음');
      out(`R2: ${r2Setup(ctx.env).enabled ? '켜짐' : '꺼짐'}`);
      return 0;
    }
    case 'stop': {
      if (flag('--clear')) {
        if (existsSync(paths.stop)) unlinkSync(paths.stop);
        out('STOP 파일을 지웠습니다.');
      } else {
        writeFileSync(paths.stop, `${isoSeconds(ctx.clock.now())}\n`, { mode: 0o600 });
        out('STOP 파일을 만들었습니다. 실행 중인 run은 다음 작업 전에 멈추고, 지우기 전에는 시작되지 않습니다.');
      }
      return 0;
    }
    case 'resume-host': {
      const target = positional[0];
      if (!target) return fail(out, 'resume-host <site|host>');
      const hosts = SITES[target as keyof typeof SITES]?.hosts ?? [target];
      const store = loadStore(paths);
      let touched = 0;
      for (const host of hosts) {
        if (!store.hosts[host]) continue;
        store.hosts[host] = { ...emptyHost(), robots: null, daily: store.hosts[host]!.daily };
        touched += 1;
      }
      saveStore(paths, store, ['hosts']);
      out(touched ? `재개했습니다 (robots.txt는 다시 읽습니다): ${hosts.join(', ')}` : '해당 호스트 기록이 없습니다.');
      return 0;
    }
    case 'ingest': {
      const target = positional[0];
      if (!target || !existsSync(target)) return fail(out, 'ingest <파일|폴더>');
      const files = statSync(target).isDirectory()
        ? readdirSync(target).filter((name) => name.endsWith('.json')).sort().slice(0, MAX_FILES).map((name) => join(target, name))
        : [target];
      const store = loadStore(paths);
      let accepted = 0;
      let rejected = 0;
      for (const file of files) {
        const read = ingestFile(file);
        if (read.error) {
          out(`거부: ${file} (${read.error})`);
          rejected += 1;
          continue;
        }
        if (read.items.length === 0) continue;
        const built = buildBundle(read.items, isoSeconds(ctx.clock.now()));
        const bad = new Map(built.rejected.map((entry) => [entry.id, entry.codes]));
        for (const raw of read.items) {
          const item = raw as Record<string, unknown>;
          const id = typeof item?.id === 'string' ? item.id : '';
          if (built.codes.length > 0 && built.bundleText === null && !bad.has(id)) {
            rejected += 1;
          } else if (bad.has(id) || id === '') {
            out(`거부: ${id || '(id 없음)'} (${(bad.get(id) ?? ['item_schema_invalid']).join(',')})`);
            rejected += 1;
          } else {
            store.items[id] = { item, seenAt: isoSeconds(ctx.clock.now()) };
            accepted += 1;
          }
        }
      }
      saveStore(paths, store, ['items']);
      out(`가져옴 ${accepted}건 · 거부 ${rejected}건`);
      return 0;
    }
    case 'build': {
      const summary = buildLocal(paths, loadStore(paths), ctx.clock.now());
      out(summary.bundleId ? `번들 ${summary.bundleId} · 항목 ${summary.accepted}개${summary.changed ? '' : ' (변경 없음)'} · 거부 ${summary.rejected.length}개` : `번들을 만들지 못했습니다: ${summary.codes.join(',')}`);
      return summary.bundleId ? 0 : 1;
    }
    case 'publish': {
      if (!flag('--yes')) return fail(out, '게시하려면 --yes 가 필요합니다.');
      const setup = r2Setup(ctx.env);
      if (!setup.enabled) {
        out(setup.message);
        return 0;
      }
      const pointer = latestPointer(paths);
      if (!pointer) return fail(out, '게시할 번들이 없습니다. 먼저 build 하세요.');
      const result = await publishLocalBundle(paths, pointer, setup, ctx.send);
      out(result.message);
      return result.ok ? 0 : 1;
    }
    case 'remove-source': {
      const site = positional[0];
      if (!site || !siteKeys().includes(site)) return fail(out, `remove-source <${siteKeys().join('|')}>`);
      const store = loadStore(paths);
      const before = Object.keys(store.items).length;
      for (const [id, record] of Object.entries(store.items)) if (record.item.source === site) delete store.items[id];
      store.queue = store.queue.filter((entry) => entry.site !== site);
      store.seeds = store.seeds.filter((seed) => !SITES[site as keyof typeof SITES].hosts.some((host) => seed.startsWith(`https://${host}/`)));
      saveStore(paths, store);
      out(`${site}: 항목 ${before - Object.keys(store.items).length}개, 큐·시드 제거. 번들을 다시 만들고 게시해야 저장소에서 사라집니다.`);
      const summary = buildLocal(paths, store, ctx.clock.now());
      out(summary.bundleId ? `새 번들 ${summary.bundleId}` : '남은 항목이 없어 새 번들이 없습니다.');
      return 0;
    }
    case 'install-native-host': {
      const id = option('--extension-id');
      if (!id) return fail(out, 'install-native-host --extension-id <id>');
      try {
        const result = installNativeHost(paths, id);
        out(`등록했습니다: ${result.manifestPath}`);
        return 0;
      } catch (error) {
        return fail(out, error instanceof Error ? error.message : String(error));
      }
    }
    case 'run':
      return runCommand(ctx, flag('--attach'), flag('--no-load-extension'));
    default:
      out('명령: run | seed add|list|remove | status | stop [--clear] | resume-host <site> | ingest <파일|폴더> | build | publish --yes | remove-source <site> | install-native-host --extension-id <id>');
      return command === undefined ? 0 : 2;
  }
}

function fail(out: (line: string) => void, message: string): number {
  out(message);
  return 2;
}

async function runCommand(ctx: CliContext, attach: boolean, noLoadExtension: boolean): Promise<number> {
  const { paths, out } = ctx;
  const config = loadConfig(paths.config);
  if (stopRequested(paths)) return fail(out, 'STOP 파일이 있어 시작하지 않습니다. 지우려면: stop --clear');
  const store = loadStore(paths);
  if (store.seeds.length === 0 && store.queue.length === 0) return fail(out, '시드가 없습니다. seed add <주소> 로 추가하세요.');
  let chromePath: string | null = null;
  if (!attach) {
    try {
      refuseInCi(ctx.env);
    } catch {
      return fail(out, 'CI에서는 Chrome을 실행하지 않습니다.');
    }
    chromePath = findChrome(config.chromePath, ctx.env);
    if (!chromePath) return fail(out, 'Chrome 실행 파일을 찾지 못했습니다. ZARI_CHROME_PATH 또는 config.json의 chromePath를 지정하세요.');
  }
  let release: () => void;
  try {
    release = acquireLock(paths);
  } catch {
    return fail(out, '이미 실행 중입니다.');
  }
  const channel = await SocketChannel.listen(paths);
  const child = chromePath ? launchChrome(chromePath, paths.profile, !noLoadExtension, ctx.env) : null;
  try {
    const connected = await channel.waitForExtension(ctx.extensionWaitMs);
    if (!connected) {
      out('확장이 연결되지 않았습니다. 확장 설치와 install-native-host를 확인하세요.');
      return 1;
    }
    const summary = await runCrawl({ paths, config, channel, clock: ctx.clock, log: (line) => appendLog(paths, line) });
    out(`종료: ${summary.reason} · 방문 ${summary.pages}쪽 · 새 항목 ${summary.itemsStored}건 · 큐 추가 ${summary.queued}건${summary.blocked.length ? ` · 차단 신호 ${[...new Set(summary.blocked)].join(',')}` : ''}`);
    const built = buildLocal(paths, loadStore(paths), ctx.clock.now());
    out(built.bundleId ? `번들 ${built.bundleId} (${built.accepted}개${built.changed ? '' : ', 변경 없음'})` : `번들 없음: ${built.codes.join(',')}`);
    const setup = r2Setup(ctx.env);
    const pointer = latestPointer(paths);
    if (!setup.enabled) out(setup.message);
    else if (pointer && built.changed) out((await publishLocalBundle(paths, pointer, setup, ctx.send)).message);
    return 0;
  } finally {
    child?.kill('SIGTERM');
    await channel.close();
    release();
  }
}

if (import.meta.main) {
  runCli(process.argv.slice(2), defaultContext()).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
