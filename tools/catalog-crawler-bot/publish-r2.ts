// Optional, disabled-by-default publisher to an S3-compatible bucket (R2).
// Only PutObject is ever sent. Account/bucket/keys come from the environment at
// run time; nothing here names a real account, and no secret is printed.
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LATEST_REL } from './bundle.ts';
import type { StatePaths } from './paths.ts';

export interface R2Config {
  endpoint: string;
  host: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
}

export type R2Setup = { enabled: false; message: string } | { enabled: true; config: R2Config };

const REQUIRED = ['ZARI_R2_ENDPOINT', 'ZARI_R2_BUCKET', 'ZARI_R2_ACCESS_KEY_ID', 'ZARI_R2_SECRET_ACCESS_KEY'] as const;
const ENDPOINT = /^https:\/\/([a-f0-9]{32})\.r2\.cloudflarestorage\.com\/?$/;
const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const PREFIX = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

export function r2Setup(env: Record<string, string | undefined>): R2Setup {
  if (env.ZARI_R2_ENABLED !== '1') {
    return { enabled: false, message: 'R2 게시는 꺼져 있습니다 (ZARI_R2_ENABLED=1 이 아님). 요청을 보내지 않았고 번들은 로컬에만 저장됩니다.' };
  }
  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length > 0) {
    return { enabled: false, message: `R2 설정이 부족합니다: ${missing.join(', ')}. 요청을 보내지 않았습니다.` };
  }
  const match = ENDPOINT.exec(env.ZARI_R2_ENDPOINT!);
  if (!match) return { enabled: false, message: 'ZARI_R2_ENDPOINT 형식이 맞지 않습니다 (https://<ACCOUNT_ID>.r2.cloudflarestorage.com). 요청을 보내지 않았습니다.' };
  if (!BUCKET.test(env.ZARI_R2_BUCKET!)) return { enabled: false, message: 'ZARI_R2_BUCKET 형식이 맞지 않습니다. 요청을 보내지 않았습니다.' };
  const prefix = (env.ZARI_R2_PREFIX ?? '').replace(/^\/+|\/+$/g, '');
  if (prefix !== '' && (!PREFIX.test(prefix) || prefix.split('/').some((part) => part === '..' || part === '.'))) {
    return { enabled: false, message: 'ZARI_R2_PREFIX 형식이 맞지 않습니다. 요청을 보내지 않았습니다.' };
  }
  return {
    enabled: true,
    config: {
      endpoint: env.ZARI_R2_ENDPOINT!.replace(/\/$/, ''),
      host: `${match[1]}.r2.cloudflarestorage.com`,
      bucket: env.ZARI_R2_BUCKET!,
      accessKeyId: env.ZARI_R2_ACCESS_KEY_ID!,
      secretAccessKey: env.ZARI_R2_SECRET_ACCESS_KEY!,
      prefix,
    },
  };
}

const sha256Hex = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Uint8Array, data: string): Buffer => createHmac('sha256', key).update(data).digest();
const encodeSegment = (segment: string): string =>
  encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export interface SignedRequest {
  method: 'PUT';
  url: string;
  headers: Record<string, string>;
  body: Uint8Array;
}

/** AWS Signature V4 for a single PutObject, region `auto`, service `s3`. */
export function signPut(config: R2Config, key: string, body: Uint8Array, contentType: string, now: Date): SignedRequest {
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const date = amzDate.slice(0, 8);
  const path = `/${[config.bucket, ...key.split('/')].map(encodeSegment).join('/')}`;
  const payloadHash = sha256Hex(body);
  const headers: Record<string, string> = {
    'content-type': contentType,
    host: config.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonical = ['PUT', path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/auto/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonical)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, date), 'auto'), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(toSign).digest('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { method: 'PUT', url: `${config.endpoint}${path}`, headers, body };
}

export type Send = (request: SignedRequest) => Promise<{ status: number }>;

/** The only network call in the bot, and only to the validated R2 endpoint. */
export const sendHttp: Send = async (request) => {
  const response = await fetch(request.url, { method: request.method, headers: request.headers, body: new Uint8Array(request.body), redirect: 'error' });
  return { status: response.status };
};

export function redact(text: string, config: R2Config): string {
  let out = text;
  for (const secret of [config.secretAccessKey, config.accessKeyId]) if (secret) out = out.split(secret).join('***');
  return out;
}

export interface PublishFile {
  rel: string;
  contentType: string;
}

export interface PublishResult {
  ok: boolean;
  uploaded: string[];
  message: string;
}

/** Bundle first, manifest second, `latest.json` last so readers never see a dangling pointer. */
export async function publishBundle(
  config: R2Config,
  files: PublishFile[],
  readFile: (rel: string) => Uint8Array,
  send: Send = sendHttp,
  now: () => Date = () => new Date(),
): Promise<PublishResult> {
  const uploaded: string[] = [];
  for (const file of files) {
    const key = [config.prefix, file.rel].filter(Boolean).join('/');
    try {
      const reply = await send(signPut(config, key, readFile(file.rel), file.contentType, now()));
      if (reply.status < 200 || reply.status >= 300) {
        return { ok: false, uploaded, message: `업로드 실패: ${file.rel} (HTTP ${reply.status})` };
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      return { ok: false, uploaded, message: `업로드 실패: ${file.rel} (${redact(text, config)})` };
    }
    uploaded.push(file.rel);
  }
  return { ok: true, uploaded, message: `게시했습니다: ${uploaded.join(', ')}` };
}

export function publishLocalBundle(
  paths: StatePaths,
  pointer: { bundlePath: string; manifestPath: string },
  setup: R2Setup,
  send?: Send,
): Promise<PublishResult> {
  if (!setup.enabled) return Promise.resolve({ ok: false, uploaded: [], message: setup.message });
  return publishBundle(
    setup.config,
    [
      { rel: pointer.bundlePath, contentType: 'application/json' },
      { rel: pointer.manifestPath, contentType: 'application/json' },
      { rel: LATEST_REL, contentType: 'application/json' },
    ],
    (rel) => readFileSync(join(paths.out, rel)),
    send,
  );
}
