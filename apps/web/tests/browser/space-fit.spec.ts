import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const catalog=resolve('tests/fixtures/space-fit/catalog.json');
const pricedCatalog=resolve('tests/fixtures/space-fit/catalog-listing.json');
const input=readFileSync('tests/fixtures/space-fit/input.json','utf8');
test.use({storageState:{cookies:[],origins:[]},serviceWorkers:'block'});
async function fill(page: import('@playwright/test').Page,values=['60','40','40']) {
  for(const [i,name] of ['가로','깊이','높이'].entries()) await page.getByRole('textbox',{name,exact:true}).fill(values[i]!);
}
async function importCatalog(page: import('@playwright/test').Page, file=catalog) {
  await page.getByText('개발용 상품 파일',{exact:true}).click();
  await page.getByLabel('치수 번들 JSON').setInputFiles(file);
  await expect(page.getByText(/개발용 파일: catalog(-priced|-listing)?\.json/)).toBeVisible();
}
async function search(page: import('@playwright/test').Page) {
  await page.getByRole('button',{name:'맞는 수납함 찾기',exact:true}).click();
  await expect(page.locator('#space-summary')).toContainText(/이 자리에 맞는 수납함|고르신 내용에 맞는 수납함이 아직 없어요|이 자리에 맞는 수납함이 없어요/);
  await expect(page.locator('#space-summary')).toBeFocused();
}
async function openMore(page: import('@playwright/test').Page) {
  const details=page.locator('.sf-more-options');
  await expect(details).toBeVisible();
  if(!(await details.evaluate((el)=>(el as HTMLDetailsElement).open))) await details.locator('summary').click();
  await expect(details).toHaveAttribute('open','');
  return details;
}

test('combined placements, summary focus, no unmeasured or footer links, 더 보기 names and focus',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toHaveText('빈 공간에 맞는 수납함을 찾아요');
  await expect(page.getByRole('textbox')).toHaveCount(3);
  await expect(page.getByRole('button')).toHaveCount(1);
  expect(await page.locator('.space-find-bar').evaluate((el)=>getComputedStyle(el).position)).toBe('sticky');
  await expect(page.getByRole('link',{name:'물건 크기 비교'})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'전문가 모드'})).toHaveCount(0);
  await importCatalog(page); await fill(page);
  await search(page);
  await expect(page.locator('#space-summary')).toHaveText('이 자리에 맞는 수납함 9개를 찾았어요');
  await expect(page.getByText('치수 확인 중',{exact:false})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'조합 더 찾기'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'참고치'})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'물건 크기 비교'})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'전문가 모드'})).toHaveCount(0);
  const singles=page.getByRole('list',{name:'찾은 수납함'}).locator('.sf-card');
  const visible=await singles.count();
  expect(visible).toBeGreaterThan(0);
  expect(visible).toBeLessThanOrEqual(6);
  const first=singles.first();
  await expect(first.getByText(/수납함 \d+개가 딱 들어가요/)).toBeVisible();
  await expect(first.getByText('가격은 파는 곳에서 봐 주세요').first()).toBeVisible();
  const links=first.getByRole('link',{name:/판매처에서 보기 \(새 탭\)$/});
  for(const link of await links.all()) await expect(link).toHaveAttribute('target','_blank');
  expect(new Set(await links.allTextContents()).size).toBe(await links.count());
  // The two 더 보기 controls, when both exist, must not share an accessible name.
  const moreSingles=page.getByRole('button',{name:'수납함 더 보기',exact:true});
  const moreCombos=page.getByRole('button',{name:'조합 더 보기',exact:true});
  if(await moreSingles.count()) {
    const before=await singles.count();
    const nextId=await page.evaluate(()=>{
      const cards=[...document.querySelectorAll('.sf-cards[aria-label="찾은 수납함"] .sf-card')];
      // The first not-yet-rendered card is at index `before` in the full candidate
      // list, which we cannot read; after click we assert focus on a newly visible card.
      return cards.length;
    });
    expect(nextId).toBe(before);
    await moreSingles.click();
    await expect(singles).toHaveCount(await page.locator('.sf-cards[aria-label="찾은 수납함"] .sf-card').count());
    expect(await singles.count()).toBeGreaterThan(before);
    const focused=await page.evaluate(()=>(document.activeElement as HTMLElement|null)?.dataset.cardId ?? '');
    expect(focused).not.toBe('');
    const ids=await singles.evaluateAll((items)=>items.map((item)=>item.getAttribute('data-card-id')));
    expect(ids.slice(before)).toContain(focused);
    expect(new Set(ids).size).toBe(ids.length);
  }
  if(await moreCombos.count() && await moreSingles.count()) {
    const names=await page.getByRole('button',{name:/더 보기/}).evaluateAll((btns)=>btns.map((b)=>b.getAttribute('aria-label')||b.textContent||''));
    expect(new Set(names).size).toBe(names.length);
  }
  await fill(page,['200','200','40']);
  await expect(page.getByText('크기를 바꿨어요. 다시 찾아 주세요.')).toBeVisible();
  await search(page);
  await expect(page.locator('#space-summary')).toContainText(/이 자리에 맞는 수납함 \d+개를 찾았어요/);
  await expect(page.getByRole('button',{name:'수납함 더 보기',exact:true})).toBeVisible();
  await page.reload(); await expect(page.getByRole('textbox',{name:'가로',exact:true})).toHaveValue('200');
});

test('a space nothing fits shows the approved no-fit advice and no cards',async({page})=>{
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page,['1','1','1']); await search(page);
  await expect(page.locator('#space-summary')).toHaveText('이 자리에 맞는 수납함이 없어요. 크기를 조금 넓히거나 여유 틈을 줄여 보세요');
  await expect(page.locator('.sf-card')).toHaveCount(0);
});

test('unknown pack quantity keeps the honest price copy',async({page})=>{
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page); await search(page);
  const prices=page.locator('.sf-price');
  expect(await prices.count()).toBeGreaterThan(0);
  for(const text of await prices.allTextContents()) {
    expect(text.trim()).toBe('가격은 파는 곳에서 봐 주세요');
  }
});

test('a catalog pack quantity shows a reference unit and total price',async({page})=>{
  await page.goto('/#/space-fit');
  await page.getByText('개발용 상품 파일',{exact:true}).click();
  await page.getByLabel('치수 번들 JSON').setInputFiles(resolve('tests/fixtures/space-fit/catalog-priced.json'));
  await expect(page.getByText(/개발용 파일: catalog-priced.json/)).toBeVisible();
  await fill(page); await search(page);
  const priced=page.locator('.sf-price',{hasText:/^한 개 1,000원 · 다 해서 [\d,]+원$/});
  expect(await priced.count()).toBeGreaterThan(0);
});

test('a listing price without pack quantity shows as the listing price with the reference note',async({page})=>{
  await page.goto('/#/space-fit'); await importCatalog(page,pricedCatalog); await fill(page); await search(page);
  const prices=page.locator('.sf-price');
  const texts=(await prices.allTextContents()).map((t)=>t.trim());
  expect(texts.length).toBeGreaterThan(0);
  for(const text of texts) {
    expect(text).toMatch(/^(19,900|29,900)원 · 몇 개 값인지는 파는 곳에서 봐 주세요$/);
    expect(text).not.toMatch(/한 개|다 해서/);
  }
  const first=page.locator('.sf-card').first();
  await expect(first.getByText('글에서 찾은 가격이라 다를 수 있어요',{exact:true})).toBeVisible();
  // Fixture products have no drawings, so the grey placeholder stays.
  await expect(first.locator('.sf-pic-empty')).toBeVisible();
  // The Argon notice is a placeholder and must not invent copy.
  await expect(page.locator('.sf-notice')).toHaveCount(0);
});

test('invalid inputs focus the associated field and offline errors preserve inputs',async({page})=>{
  await page.goto('/#/space-fit');await importCatalog(page);await fill(page,['0','40','40']);
  await page.getByRole('button',{name:'맞는 수납함 찾기',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('가로를');
  await expect(page.getByRole('textbox',{name:'가로',exact:true})).toBeFocused();
  await expect(page.getByRole('textbox',{name:'가로',exact:true})).toHaveAttribute('aria-invalid','true');
  await page.reload();await fill(page);
  await page.getByRole('button',{name:'맞는 수납함 찾기',exact:true}).click();
  await expect(page.locator('.space-empty[data-reason="noData"]')).toContainText('상품 자료를 아직 받지 못했어요');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'가로',exact:true})).toHaveValue('60');
});

for(const theme of ['light','dark'] as const) test(`mobile keyboard, contrast and no overflow ${theme}`,async({page},info)=>{
  await page.setViewportSize({width:320,height:844});await page.emulateMedia({colorScheme:theme});await page.goto('/#/space-fit');
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.keyboard.press('Tab');await expect(page.getByRole('textbox',{name:'가로',exact:true})).toBeFocused();
  await fill(page);await importCatalog(page);await search(page);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  const button=await page.getByRole('button',{name:'맞는 수납함 찾기',exact:true}).boundingBox();expect(button!.height).toBeGreaterThanOrEqual(48);
  const more=page.locator('.sf-more-options > summary');
  const moreBox=await more.boundingBox();expect(moreBox!.height).toBeGreaterThanOrEqual(48);
  const link=await page.locator('.sf-link').first().boundingBox();expect(link!.height).toBeGreaterThanOrEqual(48);
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

test('더 고르기 hides clearance, sort and seller filters and is keyboard accessible',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page); await search(page);
  const details=page.locator('.sf-more-options');
  await expect(details).toBeVisible();
  await expect(details).not.toHaveAttribute('open','');
  // Closed content stays out of the way; the summary is a 48px control.
  const summary=details.locator('summary');
  await expect(summary).toHaveText('더 고르기');
  const box=await summary.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(48);
  await summary.focus();
  await expect(summary).toBeFocused();
  await summary.press('Enter');
  await expect(details).toHaveAttribute('open','');
  await expect(details.getByRole('group',{name:'여유 틈'})).toBeVisible();
  await expect(details.getByRole('group',{name:'보여주는 순서'})).toBeVisible();
  await expect(details.getByRole('group',{name:'파는 곳'})).toBeVisible();
  await expect(page.getByRole('button',{name:'순서·가게 고르기'})).toHaveCount(0);
  await expect(page.locator('.space-chip-row')).toHaveCount(0);
  await expect(page.locator('.space-filter-column')).toHaveCount(0);
  const price=details.getByRole('button',{name:'가격 싼 순',exact:true});
  await price.click();
  await expect(price).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>location.hash)).toContain('sort=price');
  await page.reload(); await importCatalog(page); await fill(page); await search(page);
  const reopened=await openMore(page);
  await expect(reopened.getByRole('button',{name:'가격 싼 순',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('seller filter in 더 고르기 announces the new count and reset restores the default',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page); await search(page);
  await expect(page.locator('#space-summary')).toHaveText('이 자리에 맞는 수납함 9개를 찾았어요');
  const details=await openMore(page);
  const chip=details.getByRole('button',{name:'무인양품',exact:true});
  await expect(chip).toHaveAttribute('aria-pressed','false');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed','true');
  // Every candidate in this fixture is sold by MUJI, so the count stays 9 and is announced.
  await expect(page.locator('#space-summary')).toHaveText('이 자리에 맞는 수납함 9개를 찾았어요');
  const status=page.locator('.sf-results .space-visually-hidden[role="status"]');
  await expect(status).toHaveText('이 자리에 맞는 수납함 9개를 찾았어요');
  await details.getByRole('button',{name:'처음대로 돌리기',exact:true}).click();
  await expect(chip).toHaveAttribute('aria-pressed','false');
  expect(await page.evaluate(()=>location.hash)).not.toContain('seller=');
});

test('editing cancels an in-flight Worker and keeps the next search usable', async({page})=>{
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page);
  await page.evaluate(()=>{
    const form=document.querySelector('form')!;
    form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    const field=document.getElementById('space-0') as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,'50');
    field.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await expect(page.getByRole('textbox',{name:'가로',exact:true})).toHaveValue('50');
  await expect(page.getByRole('button',{name:'맞는 수납함 찾기',exact:true})).toBeEnabled();
  await expect(page.locator('.sf-results')).toHaveCount(0);
  await search(page);
});

test('a view query on the root hash still opens Space Fit with that sort',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/#/?sort=count');
  await expect(page.getByRole('heading',{level:1})).toHaveText('빈 공간에 맞는 수납함을 찾아요');
  await importCatalog(page); await fill(page); await search(page);
  const details=await openMore(page);
  await expect(details.getByRole('button',{name:'수납함 많이 들어가는 순',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('auto-steps surface two-product combinations without pressing 조합 더 찾기',async({page})=>{
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page,['200','200','40']); await search(page);
  await expect(page.locator('.sf-results')).toHaveAttribute('aria-busy','false');
  await expect(page.getByRole('button',{name:'맞는 수납함 찾기',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'조합 더 찾기'})).toHaveCount(0);
  await expect.poll(async()=>Number((await page.locator('#space-summary').textContent())?.match(/(\d+)개/)?.[1] ?? 0),{timeout:20000}).toBeGreaterThan(100);
  await expect(page.locator('.sf-combos')).toBeVisible({timeout:20000});
  await expect(page.locator('.sf-combos .sf-name',{hasText:'+'}).first()).toBeVisible();
});

test('a view link opens Space Fit even after expert mode was used',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('zari.mode.v1','expert'));
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/#/space-fit?sort=price');
  await expect(page.getByRole('heading',{level:1})).toHaveText('빈 공간에 맞는 수납함을 찾아요');
});

test('clearance in 더 고르기 defaults, persists and re-runs without moving focus',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/#/space-fit');
  await importCatalog(page); await fill(page); await search(page);
  const details=await openMore(page);
  const half=details.getByRole('button',{name:'0.5cm',exact:true});
  await expect(half).toHaveAttribute('aria-pressed','true');
  const one=details.getByRole('button',{name:'1cm',exact:true});
  await one.click();
  await expect(one).toHaveAttribute('aria-pressed','true');
  await expect(one).toBeFocused();
  expect(await page.evaluate(()=>localStorage.getItem('zari.space-fit.clearance.v1'))).toBe('10');
  await expect(page.locator('#space-summary')).toBeVisible();
  await page.reload();
  await importCatalog(page); await fill(page); await search(page);
  const reloaded=await openMore(page);
  await expect(reloaded.getByRole('button',{name:'1cm',exact:true})).toHaveAttribute('aria-pressed','true');
  const two=reloaded.getByRole('button',{name:'2cm',exact:true});
  await two.click();
  await expect(two).toBeFocused();
  await expect(page.locator('#space-summary')).toBeVisible();
});

test('처음대로 돌리기 in 더 고르기 restores the default view and clearance',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page); await search(page);
  const details=await openMore(page);
  await details.getByRole('button',{name:'가격 싼 순',exact:true}).click();
  await details.getByRole('button',{name:'2cm',exact:true}).click();
  await details.getByRole('button',{name:'처음대로 돌리기',exact:true}).click();
  await expect(details.getByRole('button',{name:'빈틈없이 꽉 차는 순',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(details.getByRole('button',{name:'0.5cm',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('a failed catalog load shows the noData empty state with a retry action',async({page})=>{
  await page.route('**/catalog/v1/**',(route)=>route.abort());
  await page.goto('/#/space-fit'); await fill(page);
  await page.getByRole('button',{name:'맞는 수납함 찾기',exact:true}).click();
  const empty=page.locator('.space-empty[data-reason="noData"]');
  await expect(empty).toBeVisible();
  await expect(empty).toHaveAttribute('role','status');
  await expect(empty).toContainText('상품 자료를 아직 받지 못했어요. 연결을 확인한 뒤 다시 찾아 주세요.');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'가로',exact:true})).toHaveValue('60');
  await empty.getByRole('button',{name:'맞는 수납함 찾기',exact:true}).click();
  await expect(empty).toBeVisible();
});

test('stopping a search keeps the inputs and reports a stopped state or the shown rows',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page,['200','200','40']);
  await page.getByRole('button',{name:'맞는 수납함 찾기',exact:true}).click();
  await page.getByRole('button',{name:'찾기 멈추기',exact:true}).click({timeout:2000}).catch(()=>undefined);
  await expect(page.getByText('찾기를 멈췄어요. 입력은 그대로 있어요.').or(page.locator('.sf-results'))).toBeVisible();
  await expect(page.getByRole('textbox',{name:'가로',exact:true})).toHaveValue('200');
});

for(const width of [320,390,1440] as const) for(const theme of ['light','dark'] as const) test(`space fit results have no axe violations at ${width} ${theme}`,async({page})=>{
  await page.setViewportSize({width,height:width===1440?900:844});
  await page.emulateMedia({colorScheme:theme});
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page); await search(page);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});

test('열린 더 고르기 has no axe violations',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page); await search(page);
  await openMore(page);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
});
