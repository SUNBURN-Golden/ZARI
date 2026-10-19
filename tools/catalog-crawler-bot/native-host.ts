// Native messaging host. Chrome starts this process (stdio, 4-byte length
// frames) for the extension; it relays to the bot over the local Unix socket.
// It listens on nothing.
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { statePaths } from './paths.ts';

/** Chrome → host messages may be large; host → Chrome is capped at 1 MiB. */
export const MAX_TO_CHROME = 1024 * 1024;

export function encodeFrame(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  if (body.length > MAX_TO_CHROME) throw new Error('frame_too_large');
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  return Buffer.concat([head, body]);
}

export class FrameDecoder {
  private buffer: Buffer = Buffer.alloc(0);
  push(chunk: Buffer): unknown[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const out: unknown[] = [];
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length > 8 * 1024 * 1024) throw new Error('frame_too_large');
      if (this.buffer.length < 4 + length) break;
      out.push(JSON.parse(this.buffer.subarray(4, 4 + length).toString('utf8')));
      this.buffer = this.buffer.subarray(4 + length);
    }
    return out;
  }
}

export function main(): void {
  const paths = statePaths();
  const token = readFileSync(paths.token, 'utf8').trim();
  const socket = connect(paths.socket);
  socket.setEncoding('utf8');
  socket.on('connect', () => socket.write(`${JSON.stringify({ type: 'auth', token })}\n`));
  const decoder = new FrameDecoder();
  process.stdin.on('data', (chunk: Buffer) => {
    for (const message of decoder.push(chunk)) socket.write(`${JSON.stringify(message)}\n`);
  });
  process.stdin.on('end', () => socket.end());
  let buffer = '';
  socket.on('data', (chunk: string) => {
    buffer += chunk;
    let at: number;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      process.stdout.write(encodeFrame(JSON.parse(line)));
    }
  });
  socket.on('close', () => process.exit(0));
  socket.on('error', () => process.exit(1));
}

if (import.meta.main) main();
