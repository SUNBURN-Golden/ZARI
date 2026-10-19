// Local control channel between the bot and the native messaging host that
// Chrome starts for the extension. A Unix domain socket in the 0700 state
// directory with 0600 permissions; no TCP/HTTP listener, no debugging port.
// The native host proves itself with a per-run token kept in a 0600 file.
import { chmodSync, existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { randomBytes } from 'node:crypto';
import { ensureDir } from './fsx.ts';
import type { StatePaths } from './paths.ts';

export type Job = { id: string; kind: 'robots' | 'listing' | 'product'; url: string };
export type Reply = { type: string; id?: string; [key: string]: unknown };

const MAX_LINE = 2 * 1024 * 1024;

export interface Channel {
  waitForExtension(timeoutMs: number): Promise<boolean>;
  request(job: Job, timeoutMs: number): Promise<Reply>;
  onClose(listener: () => void): void;
  close(): Promise<void>;
}

export class SocketChannel implements Channel {
  private client: Socket | null = null;
  private ready = false;
  private readyWaiters: ((ok: boolean) => void)[] = [];
  private pending = new Map<string, (reply: Reply | null) => void>();
  private closeListeners: (() => void)[] = [];
  private server: Server;
  private token: string;
  private paths: StatePaths;

  private constructor(server: Server, token: string, paths: StatePaths) {
    this.server = server;
    this.token = token;
    this.paths = paths;
  }

  static async listen(paths: StatePaths): Promise<SocketChannel> {
    ensureDir(paths.dir);
    if (existsSync(paths.socket)) unlinkSync(paths.socket);
    const token = randomBytes(24).toString('hex');
    writeFileSync(paths.token, token, { mode: 0o600 });
    const server = createServer();
    const channel = new SocketChannel(server, token, paths);
    server.on('connection', (socket) => channel.accept(socket));
    // The mask keeps the socket file owner-only from the instant it exists.
    const previous = process.umask(0o177);
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(paths.socket, () => resolve());
      });
    } finally {
      process.umask(previous);
    }
    chmodSync(paths.socket, 0o600);
    return channel;
  }

  private accept(socket: Socket): void {
    if (this.client) {
      socket.destroy();
      return;
    }
    let buffer = '';
    let authed = false;
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      if (buffer.length > MAX_LINE) {
        socket.destroy();
        return;
      }
      let at: number;
      while ((at = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 1);
        let message: Reply;
        try {
          message = JSON.parse(line) as Reply;
        } catch {
          socket.destroy();
          return;
        }
        if (!authed) {
          if (message.type !== 'auth' || message.token !== this.token) {
            socket.destroy();
            return;
          }
          authed = true;
          this.client = socket;
          continue;
        }
        if (message.type === 'hello') {
          this.ready = true;
          for (const waiter of this.readyWaiters.splice(0)) waiter(true);
        } else if (typeof message.id === 'string') {
          const settle = this.pending.get(message.id);
          if (settle) {
            this.pending.delete(message.id);
            settle(message);
          }
        }
      }
    });
    socket.on('close', () => {
      if (this.client !== socket) return;
      this.client = null;
      this.ready = false;
      for (const settle of this.pending.values()) settle(null);
      this.pending.clear();
      for (const waiter of this.readyWaiters.splice(0)) waiter(false);
      for (const listener of this.closeListeners) listener();
    });
    socket.on('error', () => socket.destroy());
  }

  waitForExtension(timeoutMs: number): Promise<boolean> {
    if (this.ready) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      this.readyWaiters.push((ok) => {
        clearTimeout(timer);
        resolve(ok);
      });
    });
  }

  request(job: Job, timeoutMs: number): Promise<Reply> {
    return new Promise((resolve) => {
      const client = this.client;
      if (!client || !this.ready) {
        resolve({ type: 'error', id: job.id, code: 'channel_closed' });
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(job.id);
        resolve({ type: 'error', id: job.id, code: 'timeout' });
      }, timeoutMs);
      this.pending.set(job.id, (reply) => {
        clearTimeout(timer);
        resolve(reply ?? { type: 'error', id: job.id, code: 'channel_closed' });
      });
      client.write(`${JSON.stringify({ type: 'job', ...job })}\n`);
    });
  }

  onClose(listener: () => void): void {
    this.closeListeners.push(listener);
  }

  async close(): Promise<void> {
    this.client?.destroy();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
    for (const file of [this.paths.socket, this.paths.token]) if (existsSync(file)) unlinkSync(file);
  }
}
