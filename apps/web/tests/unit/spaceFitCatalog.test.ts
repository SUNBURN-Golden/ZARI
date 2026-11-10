import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { configuredR2Base, r2Transport } from '../../src/features/catalog/r2Transport';
import { readRepository, type TransportRequest } from '../../src/features/catalog/bundle';
const BASE='https://test-bucket.r2.dev/zari/';
const request=(path='catalog/v1/latest.json',maxBytes=4096):TransportRequest=>({url:BASE+path,method:'GET',credentials:'omit',redirect:'error',cache:'no-store',timeoutMs:20,maxBytes});
it('pins the exact configured public R2 base, never a user URL or adjacent host', async()=>{
  for(const bad of ['http://test.r2.dev','https://127.0.0.1/','https://test.r2.dev.evil.com/','https://user:test@test.r2.dev/','https://test.r2.dev:99/','https://test.r2.dev/?token=x']) expect(configuredR2Base(bad)).toBeNull();
  const http=vi.fn<typeof fetch>(async()=>new Response('{}'));
  const send=r2Transport(BASE,http);
  for(const url of ['https://evil.example/catalog/v1/latest.json',BASE+'../secret',BASE+'catalog/v1/latest.json?x=1',BASE+'private']) await expect(send({...request(),url})).rejects.toThrow('r2_path_refused');
  expect(http).not.toHaveBeenCalled();
  await send(request());expect(http.mock.calls[0]?.[1]).toMatchObject({method:'GET',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store'});
  expect(http.mock.calls[0]?.[1]).not.toHaveProperty('body');
});
it('enforces stream length without Content-Length and stops on redirects/errors',async()=>{
  const http=vi.fn<typeof fetch>(async()=>new Response('한글'));
  await expect(r2Transport(BASE,http)(request('catalog/v1/latest.json',5))).rejects.toThrow('r2_read_failed');
  const large=vi.fn<typeof fetch>(async()=>new Response('{}',{headers:{'content-length':'999999'}}));
  await expect(r2Transport(BASE,large)(request())).rejects.toThrow('r2_read_failed');
  const failed=vi.fn<typeof fetch>(async()=>{throw new Error('redirect');});
  await expect(r2Transport(BASE,failed)(request())).rejects.toThrow('r2_read_failed');
});
it('binds UTF-8 byte length and the complete items hash to latest before review',async()=>{
  const text=readFileSync('tests/fixtures/space-fit/catalog.json','utf8');
  const manifest=JSON.parse(text).manifest;
  const latest={schemaVersion:1,bundleId:manifest.bundleId,sha256:manifest.sha256,bytes:Buffer.byteLength(text),bundlePath:`catalog/v1/${manifest.bundleId}/bundle.json`};
  const reviewer={review:vi.fn(async()=>{throw new Error('should not reach invalid bytes');})};
  for(const [override,code] of [[{bytes:1},'repository_length_mismatch'],[{sha256:'0'.repeat(64)},'repository_hash_mismatch']] as const){
    const read=await readRepository(BASE,async(req)=>({status:200,text:req.url.endsWith('latest.json')?JSON.stringify({...latest,...override}):text}),reviewer);
    expect(read).toEqual({status:'rejected',code});
  }
  expect(reviewer.review).not.toHaveBeenCalled();
});
it('aborts a stalled transport at its deadline',async()=>{
  vi.useFakeTimers();
  const http=vi.fn<typeof fetch>((_url,options)=>new Promise((_resolve,reject)=>{options?.signal?.addEventListener('abort',()=>reject(new Error('aborted')));}));
  const pending=r2Transport(BASE,http)(request()).catch((e:unknown)=>e);
  await vi.advanceTimersByTimeAsync(21);
  expect(await pending).toEqual(new Error('r2_read_failed'));
  vi.useRealTimers();
});
