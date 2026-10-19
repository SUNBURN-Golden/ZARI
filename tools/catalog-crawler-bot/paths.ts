import { homedir } from 'node:os';
import { join } from 'node:path';

export interface StatePaths {
  dir: string;
  config: string;
  seeds: string;
  queue: string;
  hosts: string;
  items: string;
  stop: string;
  lock: string;
  socket: string;
  token: string;
  log: string;
  report: string;
  out: string;
  profile: string;
  launcher: string;
}

export const HOST_NAME = 'com.zari.catalog_bot';

export function statePaths(dir: string = defaultStateDir()): StatePaths {
  return {
    dir,
    config: join(dir, 'config.json'),
    seeds: join(dir, 'seeds.json'),
    queue: join(dir, 'queue.json'),
    hosts: join(dir, 'hosts.json'),
    items: join(dir, 'items.json'),
    stop: join(dir, 'STOP'),
    lock: join(dir, 'run.lock'),
    socket: join(dir, 'bot.sock'),
    token: join(dir, 'run.token'),
    log: join(dir, 'run.log'),
    report: join(dir, 'build-report.json'),
    out: join(dir, 'out'),
    profile: join(dir, 'chrome-profile'),
    launcher: join(dir, 'native-host.sh'),
  };
}

export function defaultStateDir(): string {
  return process.env.ZARI_CRAWLER_STATE_DIR ?? join(process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'), 'zari-catalog-crawler');
}
