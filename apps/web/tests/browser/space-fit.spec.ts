import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const catalog=resolve('tests/fixtures/space-fit/catalog.json');
const input=readFileSync('tests/fixtures/space-fit/input.json','utf8');
test.use({storageState:{cookies:[],origins:[]},serviceWorkers:'block'});
async function fill(page: import('@playwright/test').Page,values=['60','40','40']) {
  for(const [i,name] of ['가로','깊이','높이'].entries()) await page.getByRole('textbox',{name,exact:true}).fill(values[i]!);
}
async function importCatalog(page: import('@playwright/test').Page) {
  await page.getByText('개발용 상품 파일',{exact:true}).click();
  await page.getByLabel('치수 번들 JSON').setInputFiles(catalog);
  await expect(page.getByText(/개발용 파일: catalog.json/)).toBeVisible();
}
test('three fields, one primary button, real WASM results, collapsed unconfirmed and stale/cancel behavior',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toHaveText('빈 공간에 맞는 수납함을 찾아요');
  await expect(page.getByRole('textbox')).toHaveCount(3);
  await expect(page.getByRole('button')).toHaveCount(1);
  await importCatalog(page); await fill(page);
  await page.getByRole('button',{name:'맞는 수납함 찾기',exact:true}).click();
  await expect(page.getByText('상품 2개를 확인했어요.')).toBeVisible();
  for(const title of ['딱 맞음','조합']) {
    const group=page.getByRole('region',{name:title,exact:true});
    await expect(group.getByText(/치수 확인 중/)).toBeVisible();
    expect(await group.locator('details').first().getAttribute('open')).toBeNull();
  }
  const singles=page.getByRole('region',{name:'딱 맞음',exact:true});
  await singles.getByText(/치수 확인 중/).click();
  await expect(singles.getByText(/합성 수납함/).first()).toBeVisible();
  await singles.getByText('놓는 모양 보기').first().click();
  await expect(singles.getByRole('img')).toBeVisible();
  await fill(page,['50','40','40']);
  await expect(page.getByText('크기를 바꿨어요. 다시 찾아 주세요.')).toBeVisible();
  await page.getByRole('button',{name:'맞는 수납함 찾기',exact:true}).click();
  await expect(page.getByText('상품 2개를 확인했어요.')).toBeVisible();
  await page.reload(); await expect(page.getByRole('textbox',{name:'가로',exact:true})).toHaveValue('50');
});
test('invalid inputs focus the associated field and offline errors preserve inputs',async({page})=>{
  await page.goto('/#/space-fit');await importCatalog(page);await fill(page,['0','40','40']);
  await page.getByRole('button',{name:'맞는 수납함 찾기',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('가로를');
  await expect(page.getByRole('textbox',{name:'가로',exact:true})).toBeFocused();
  await expect(page.getByRole('textbox',{name:'가로',exact:true})).toHaveAttribute('aria-invalid','true');
  await page.reload();await fill(page);
  await page.getByRole('button',{name:'맞는 수납함 찾기',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('상품 자료를 아직 받지 못했어요');
  await expect(page.getByRole('textbox',{name:'가로',exact:true})).toHaveValue('60');
});
for(const theme of ['light','dark'] as const) test(`mobile keyboard, contrast and no overflow ${theme}`,async({page},info)=>{
  await page.setViewportSize({width:320,height:844});await page.emulateMedia({colorScheme:theme});await page.goto('/#/space-fit');
  const findings=await new AxeBuilder({page}).analyze(); expect(findings.violations).toEqual([]);
  await page.keyboard.press('Tab');await expect(page.getByRole('textbox',{name:'가로',exact:true})).toBeFocused();
  await fill(page);await importCatalog(page);await page.getByRole('button',{name:'맞는 수납함 찾기',exact:true}).click();
  await expect(page.getByText('상품 2개를 확인했어요.')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  const button=await page.getByRole('button',{name:'맞는 수납함 찾기',exact:true}).boundingBox();expect(button!.height).toBeGreaterThanOrEqual(48);
  await page.screenshot({path:info.outputPath(`space-fit-${theme}-draft.png`),fullPage:true});
  await page.emulateMedia({forcedColors:'active'});await expect(page.getByRole('button',{name:'맞는 수납함 찾기',exact:true})).toBeVisible();
});
test('Space Fit pages match native Rust in a real browser Worker/WASM',async({page})=>{
  const native=JSON.parse(execFileSync('cargo',['run','-q','--locked','-p','zari-core','--example','space_fit'],{input,encoding:'utf8',maxBuffer:16*1024*1024}));
  await page.goto('/tests/harness.html');
  const browser=await page.evaluate(async(input)=>{
    const worker=window.spaceFitWorker();
    return await new Promise((resolve,reject)=>{
      const pages:unknown[]=[];
      worker.onmessage=(e:MessageEvent<{ok:boolean;json?:string}>)=>{
        if(!e.data.ok){worker.terminate();reject(new Error('worker failed'));return;}
        pages.push(JSON.parse(e.data.json!));
        if(pages.length===3){worker.terminate();resolve(pages);}else worker.postMessage({type:'next'});
      };
      worker.onerror=()=>{worker.terminate();reject(new Error('worker failed'));};
      worker.postMessage({type:'start',json:input});
    });
  },input);
  expect(native[0].combinationsComplete).toBe(false);
  expect(native[1].combinations.length).toBeGreaterThan(0);
  expect(browser).toEqual(native);
});

test('editing cancels an in-flight Worker and keeps the next search usable', async({page})=>{
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page);
  // Queue an actual start and input event in the same browser task. Termination
  // and the revision fence must discard the worker's eventual old response.
  await page.evaluate(()=>{
    const form=document.querySelector('form')!;
    form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    const field=document.getElementById('space-0') as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,'50');
    field.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await expect(page.getByRole('textbox',{name:'가로',exact:true})).toHaveValue('50');
  await expect(page.getByRole('button',{name:'맞는 수납함 찾기',exact:true})).toBeEnabled();
  await expect(page.getByRole('region',{name:'찾은 수납함',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'맞는 수납함 찾기',exact:true}).click();
  await expect(page.getByText('상품 2개를 확인했어요.')).toBeVisible();
});
