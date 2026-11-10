import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { CatalogBundleReview, CatalogSnapshot, SpaceFitPage } from '../../src/contracts/generated/dto';
import { validateSpaceFitPage } from '../../src/contracts/generated/validators.mjs';
import { configuredR2Base, r2Transport } from '../../src/features/catalog/r2Transport';
import { readRepository, type TransportRequest } from '../../src/features/catalog/bundle';
import { localCatalog } from '../../src/features/space-fit/catalog';
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
it('returns reviewed bundle items as the space-fit listing side channel',async()=>{
  const text=readFileSync('tests/fixtures/space-fit/catalog.json','utf8');
  const snapshot=JSON.parse(readFileSync('tests/fixtures/space-fit/input.json','utf8')).catalog as CatalogSnapshot;
  const reviewer={review:vi.fn(async()=>({quarantined:false,snapshot} as unknown as CatalogBundleReview))};
  const loaded=await localCatalog(text,reviewer);
  expect(loaded.listings.map((item)=>item.id)).toEqual(['crawl:daiso:0001234567:o0000abcd','crawl:muji:123456:o1aa33fda','crawl:muji:123456:oe920d1be']);
});
it('accepts a page carrying source, price, category and dimension provenance',()=>{
  const page:SpaceFitPage={
    schemaVersion:1,inputRevision:'r1',catalogDigest:'a'.repeat(64),solverVersion:'space-fit-2',
    spaceMm:[500,500,500],profile:'grids-and-two-type-floor-rows-64',singles:[{
      id:'sf-1',remainingMm:[100,100,100],occupiedVolumeMm3:'1000',unconfirmed:true,
      dimensionProvenance:'reference',
      checks:{outer:'unknown',inner:'not_applicable',installation:'unknown',opening:'unknown',access:'unknown',supportLoad:'unknown',orientation:'unknown',quantity:'pass',tolerance:'unknown'},
      blocks:[{
        variantId:'crawl:muji:1',name:'합성 수납함',orientation:'upright0',unitMm:[100,100,100],
        grid:[1,1,1],originMm:[0,0,0],quantity:'1',urls:['https://mujikorea.co.kr/products/1'],
        source:'muji',sellerId:'seller-muji',category:{hint:'bin',label:'수납함'},
        price:{state:'known',packPriceKrw:'1000',packQuantity:null,unitPriceKrw:null,basis:'reference'},
        dimensions:{provenance:'reference',basis:'low',origin:'imageOcr'},
      }],
    }],combinations:[],unmeasured:[{
      variantId:'crawl:muji:2',name:'합성 수납함 2',urls:[],source:null,sellerId:null,
      category:{hint:'bin',label:null},price:{state:'unknown'},
    }],inspectedVariants:2,missingDimensions:1,unavailableVariants:0,nodes:0,
    singlesComplete:true,combinationsComplete:true,
  };
  expect(validateSpaceFitPage(page)).toBe(true);
  const missingUnmeasured:Record<string,unknown>={...page};
  delete missingUnmeasured.unmeasured;
  expect(validateSpaceFitPage(missingUnmeasured)).toBe(false);
  const badOrigin=structuredClone(page) as unknown as {singles:{blocks:{dimensions:{origin:string}}[]}[]};
  badOrigin.singles[0]!.blocks[0]!.dimensions.origin='guess';
  expect(validateSpaceFitPage(badOrigin)).toBe(false);
});
it('aborts a stalled transport at its deadline',async()=>{
  vi.useFakeTimers();
  const http=vi.fn<typeof fetch>((_url,options)=>new Promise((_resolve,reject)=>{options?.signal?.addEventListener('abort',()=>reject(new Error('aborted')));}));
  const pending=r2Transport(BASE,http)(request()).catch((e:unknown)=>e);
  await vi.advanceTimersByTimeAsync(21);
  expect(await pending).toEqual(new Error('r2_read_failed'));
  vi.useRealTimers();
});
it('keeps a listing pack quantity in the space-fit side channel',async()=>{
  const text=readFileSync('tests/fixtures/space-fit/catalog-priced.json','utf8');
  const snapshot=JSON.parse(readFileSync('tests/fixtures/space-fit/input.json','utf8')).catalog as CatalogSnapshot;
  const reviewer={review:vi.fn(async()=>({quarantined:false,snapshot} as unknown as CatalogBundleReview))};
  const loaded=await localCatalog(text,reviewer);
  const muji=loaded.listings.filter((item)=>item.source==='muji');
  expect(muji.map((item)=>item.packQuantity)).toEqual([{basis:'confirmed',evidence:'2개입',value:2},{basis:'confirmed',evidence:'2개입',value:2}]);
  expect(loaded.listings.find((item)=>item.source==='daiso')?.packQuantity).toBeUndefined();
});
