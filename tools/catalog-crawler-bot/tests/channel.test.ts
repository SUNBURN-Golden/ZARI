import { mkdtempSync, statSync } from 'node:fs';
import { connect } from 'node:net';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SocketChannel } from '../channel.ts';
import { buildChromeArgs, refuseInCi } from '../chrome.ts';
import { installNativeHost } from '../install-native-host.ts';
import { FrameDecoder, encodeFrame } from '../native-host.ts';
import { statePaths } from '../paths.ts';
import { handleJob } from '../../catalog-extension/lib/runner.js';
import { ikeaPages } from './helpers.ts';
import { runCli, defaultContext } from '../cli.ts';
import { readFileSync } from 'node:fs';
import { snapshotFromHtml } from '../../catalog-extension/tests/html-snapshot.mjs';

const newPaths = () => statePaths(mkdtempSync(join(tmpdir(), 'zari-ch-')));
const lines = (socket: Socket, onMessage: (m: Record<string, unknown>) => void) => {
  let buffer = '';
  socket.setEncoding('utf8');
  socket.on('data', (chunk: string) => {
    buffer += chunk;
    let at: number;
    while ((at = buffer.indexOf('\n')) >= 0) {
      onMessage(JSON.parse(buffer.slice(0, at)));
      buffer = buffer.slice(at + 1);
    }
  });
};
const open = (path: string) => new Promise<Socket>((resolve, reject) => {
  const socket = connect(path, () => resolve(socket));
  socket.once('error', reject);
});
const closed = (socket: Socket) => new Promise<void>((resolve) => socket.once('close', () => resolve()));

describe('local control channel', () => {
  it('is a Unix socket with owner-only permissions, and nothing listens on TCP', async () => {
    const paths = newPaths();
    const channel = await SocketChannel.listen(paths);
    try {
      expect(statSync(paths.socket).isSocket()).toBe(true);
      expect(statSync(paths.socket).mode & 0o777).toBe(0o600);
      expect(statSync(paths.dir).mode & 0o777).toBe(0o700);
      expect(statSync(paths.token).mode & 0o777).toBe(0o600);
      const address = (channel as unknown as { server: { address(): unknown } }).server.address();
      expect(typeof address).toBe('string'); // a path, not { port }
    } finally {
      await channel.close();
    }
  });

  it('refuses a client with a wrong or missing token', async () => {
    const paths = newPaths();
    const channel = await SocketChannel.listen(paths);
    try {
      const bad = await open(paths.socket);
      bad.write(`${JSON.stringify({ type: 'auth', token: 'nope' })}\n`);
      await closed(bad);
      const none = await open(paths.socket);
      none.write(`${JSON.stringify({ type: 'hello' })}\n`);
      await closed(none);
      expect(await channel.waitForExtension(50)).toBe(false);
    } finally {
      await channel.close();
    }
  });

  it('carries a job to the fake extension and its answer back (real job runner, fixture pages)', async () => {
    const paths = newPaths();
    const channel = await SocketChannel.listen(paths);
    try {
      const client = await open(paths.socket);
      const pages = ikeaPages();
      lines(client, (message) => {
        void handleJob(message as never, {
          now: () => Date.UTC(2026, 9, 16),
          collect: async (url: string, kind: string) => kind === 'robots'
            ? { url, status: 200, contentType: 'text/plain', text: pages[url]!.text }
            : snapshotFromHtml(pages[url]!.html!, url),
        }).then((reply) => client.write(`${JSON.stringify(reply)}\n`));
      });
      client.write(`${JSON.stringify({ type: 'auth', token: readFileSync(paths.token, 'utf8') })}\n`);
      client.write(`${JSON.stringify({ type: 'hello', protocol: 1 })}\n`);
      expect(await channel.waitForExtension(2000)).toBe(true);
      const reply = await channel.request({ id: 'j1', kind: 'robots', url: 'https://www.ikea.com/robots.txt' }, 2000);
      expect(reply).toMatchObject({ type: 'result', kind: 'robots', id: 'j1' });
      expect(String(reply.text)).toContain('Crawl-delay');
      // A second client cannot take over the channel.
      const second = await open(paths.socket);
      await closed(second);
    } finally {
      await channel.close();
    }
  });

  it('times out an unanswered job and reports a closed channel', async () => {
    const paths = newPaths();
    const channel = await SocketChannel.listen(paths);
    try {
      expect(await channel.request({ id: 'x', kind: 'robots', url: 'https://ohou.se/robots.txt' }, 20)).toMatchObject({ type: 'error', code: 'channel_closed' });
      const client = await open(paths.socket);
      client.write(`${JSON.stringify({ type: 'auth', token: readFileSync(paths.token, 'utf8') })}\n${JSON.stringify({ type: 'hello' })}\n`);
      await channel.waitForExtension(2000);
      expect(await channel.request({ id: 'y', kind: 'robots', url: 'https://ohou.se/robots.txt' }, 30)).toMatchObject({ type: 'error', code: 'timeout' });
    } finally {
      await channel.close();
    }
  });
});

describe('native messaging frames', () => {
  it('round-trips and reassembles split frames', () => {
    const frame = encodeFrame({ type: 'hello', text: '한글' });
    const decoder = new FrameDecoder();
    expect(decoder.push(frame.subarray(0, 3))).toEqual([]);
    expect(decoder.push(frame.subarray(3, 9))).toEqual([]);
    expect(decoder.push(frame.subarray(9))).toEqual([{ type: 'hello', text: '한글' }]);
  });
  it('enforces the 1 MiB host→Chrome cap', () => {
    expect(() => encodeFrame({ text: 'x'.repeat(1024 * 1024) })).toThrow('frame_too_large');
  });
});

describe('Chrome launch', () => {
  it('uses a visible window with a dedicated profile and none of the evasion/remote-control flags', () => {
    const args = buildChromeArgs('/tmp/profile', '/ext').join(' ');
    expect(args).toContain('--user-data-dir=/tmp/profile');
    expect(args).toContain('--load-extension=/ext');
    for (const banned of ['headless', 'remote-debugging', 'proxy', 'user-agent', 'incognito', 'disable-web-security', 'no-sandbox', 'enable-automation']) {
      expect(args, banned).not.toContain(banned);
    }
  });
  it('refuses to launch when CI is set', async () => {
    expect(() => refuseInCi({ CI: 'true' })).toThrow('ci_refuses_chrome_launch');
    expect(() => refuseInCi({ CI: '1' })).toThrow();
    expect(() => refuseInCi({})).not.toThrow();
    const paths = newPaths();
    const lines2: string[] = [];
    const ctx = { ...defaultContext(), paths, env: { CI: 'true' }, out: (l: string) => lines2.push(l) };
    await runCli(['seed', 'add', 'https://ohou.se/productions/1/selling'], ctx);
    expect(await runCli(['run'], ctx)).toBe(2);
    expect(lines2.join('\n')).toContain('CI');
  });
});

describe('native host registration', () => {
  it('pins the extension id in allowed_origins and writes only inside the state dir', () => {
    const paths = newPaths();
    const id = 'abcdefghijklmnopabcdefghijklmnop';
    const { manifestPath, launcher } = installNativeHost(paths, id, '/usr/bin/node');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest).toMatchObject({ name: 'com.zari.catalog_bot', type: 'stdio', allowed_origins: [`chrome-extension://${id}/`], path: launcher });
    expect(manifestPath.startsWith(paths.dir)).toBe(true);
    expect(statSync(launcher).mode & 0o777).toBe(0o700);
    expect(readFileSync(launcher, 'utf8')).toContain('native-host.ts');
    for (const bad of ['', '*', 'abc', 'ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP', 'abcdefghijklmnopabcdefghijklmnoz']) {
      expect(() => installNativeHost(paths, bad)).toThrow('invalid_extension_id');
    }
  });
});
