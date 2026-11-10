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
async function search(page: import('@playwright/test').Page) {
  await page.getByRole('button',{name:'맞는 수납함 찾기',exact:true}).click();
  await expect(page.locator('#space-summary')).toContainText(/이 자리에 맞는 수납함|고르신 내용에 맞는 수납함이 아직 없어요/);
  await expect(page.locator('#space-summary')).toBeFocused();
}
test('combined results, summary focus, unmeasured group, sticky action and stale/search flow',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toHaveText('빈 공간에 맞는 수납함을 찾아요');
  await expect(page.getByRole('textbox')).toHaveCount(3);
  await expect(page.getByRole('button')).toHaveCount(1);
  expect(await page.locator('.space-find-bar').evaluate((el)=>getComputedStyle(el).position)).toBe('sticky');
  await importCatalog(page); await fill(page);
  await search(page);
  // One combined list: the old single/combo regions are gone.
  await expect(page.getByRole('region',{name:'딱 맞음',exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'조합',exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'찾은 수납함',exact:true})).toBeVisible();
  await expect(page.locator('#space-summary')).toHaveText('이 자리에 맞는 수납함 9개를 찾았어요');
  const rows=page.locator('.space-results > li');
  await expect(rows).toHaveCount(9);
  const first=rows.first();
  await expect(first.getByText('무인양품')).toBeVisible();
  await expect(first.getByText(/수납함 \d+개가 딱 들어가요/)).toBeVisible();
  await expect(first.getByText(/남아요/)).toBeVisible();
  await expect(first.getByText('가격은 파는 곳에서 봐 주세요').first()).toBeVisible();
  // A combination names each product in its link, so identical link texts never point to different products.
  const links=first.getByRole('link',{name:/판매처에서 보기 \(새 탭\)$/});
  for(const link of await links.all()) await expect(link).toHaveAttribute('target','_blank');
  expect(new Set(await links.allTextContents()).size).toBe(await links.count());
  await first.getByText('놓는 모양 보기').click();
  await expect(first.getByRole('img')).toBeVisible();
  // Unmeasured variants stay in one collapsed details group after the list.
  const unmeasured=page.locator('.space-unmeasured');
  await expect(unmeasured).toBeVisible();
  await expect(unmeasured.getByText('치수 확인 중 (1개)')).toBeVisible();
  expect(await unmeasured.getAttribute('open')).toBeNull();
  await unmeasured.locator('summary').click();
  await expect(unmeasured.getByText('합성 수납함 (치수 미확인)')).toBeVisible();
  await expect(unmeasured.getByText('다이소')).toBeVisible();
  await expect(unmeasured.getByRole('link',{name:'판매처에서 보기 (새 탭)'})).toHaveCount(1);
  // Editing marks the visible result stale and keeps the inputs.
  await fill(page,['200','200','40']);
  await expect(page.getByText('크기를 바꿨어요. 다시 찾아 주세요.')).toBeVisible();
  await search(page);
  await expect(rows).toHaveCount(20);
  await page.getByRole('button',{name:'더 보기',exact:true}).click();
  await expect(rows).toHaveCount(40);
  const ids=await rows.evaluateAll((items)=>items.map((item)=>item.getAttribute('data-candidate-id')));
  expect(new Set(ids).size).toBe(ids.length);
  await page.reload(); await expect(page.getByRole('textbox',{name:'가로',exact:true})).toHaveValue('200');
});
test('reference size badge is visible, toggles its explanation and works from the keyboard',async({page})=>{
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page); await search(page);
  const row=page.locator('.space-results > li').first();
  const badge=row.getByRole('button',{name:'참고치',exact:true});
  await expect(badge).toBeVisible();
  const noteId=await badge.getAttribute('aria-controls');
  expect(noteId).toBeTruthy();
  const note=page.locator(`#${noteId}`);
  await expect(note).toBeHidden();
  await expect(badge).toHaveAttribute('aria-expanded','false');
  const box=await badge.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(48);
  await badge.click();
  await expect(badge).toHaveAttribute('aria-expanded','true');
  await expect(note).toBeVisible();
  await expect(note).toHaveText('참고치는 사진이나 이름에서 찾은 크기라 사기 전에 파는 곳에서 한 번 더 봐 주세요');
  await badge.press('Enter');
  await expect(badge).toHaveAttribute('aria-expanded','false');
  await expect(note).toBeHidden();
  await badge.focus();
  await badge.press('Space');
  await expect(badge).toHaveAttribute('aria-expanded','true');
  await expect(note).toBeVisible();
});
test('a space nothing fits shows the approved empty summary and no rows',async({page})=>{
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page,['1','1','1']); await search(page);
  await expect(page.locator('#space-summary')).toHaveText('고르신 내용에 맞는 수납함이 아직 없어요');
  await expect(page.locator('.space-results > li')).toHaveCount(0);
});
test('reference badge shows a visible focus ring from the keyboard',async({page})=>{
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page); await search(page);
  const badge=page.locator('.space-results > li').first().getByRole('button',{name:'참고치',exact:true});
  await page.keyboard.press('Tab');
  await expect(badge).toBeFocused();
  const outline=await badge.evaluate((el)=>{const s=getComputedStyle(el);return {style:s.outlineStyle,width:parseFloat(s.outlineWidth)};});
  expect(outline.style).not.toBe('none'); expect(outline.width).toBeGreaterThan(0);
});
test('unknown pack quantity keeps the honest price copy',async({page})=>{
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page); await search(page);
  const prices=page.locator('.space-price-line');
  // Nine combined results; a combination whose prices are all unknown shows one line.
  await expect(prices).toHaveCount(9);
  for(const text of await prices.allTextContents()) {
    expect(text.trim()).toBe('가격은 파는 곳에서 봐 주세요');
  }
});
test('invalid inputs focus the associated field and offline errors preserve inputs',async({page})=>{
  await page.goto('/#/space-fit');await importCatalog(page);await fill(page,['0','40','40']);
  await page.getByRole('button',{name:'맞는 수납함 찾기',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('가로를');
  await expect(page.getByRole('textbox',{name:'가로',exact:true})).toBeFocused();
  await expect(page.getByRole('textbox',{name:'가로',exact:true})).toHaveAttribute('aria-invalid','true');
  await page.reload();await fill(page);
  await page.getByRole('button',{name:'맞는 수납함 찾기',exact:true}).click();
  // A catalog failure is its own empty state, not a role=alert error.
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
  const badge=await page.getByRole('button',{name:'참고치',exact:true}).first().boundingBox();expect(badge!.height).toBeGreaterThanOrEqual(48);
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

test('mobile chip row, sheet focus trap and sort persistence',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page); await search(page);
  const chipRow=page.locator('.space-chip-row');
  await expect(chipRow).toBeVisible();
  expect(await chipRow.evaluate((el)=>getComputedStyle(el).overflowX)).toBe('auto');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  const opener=page.getByRole('button',{name:'순서·가게 고르기',exact:true});
  await opener.click();
  const dialog=page.getByRole('dialog',{name:'순서·가게 고르기'});
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('heading',{name:'순서·가게 고르기'})).toBeFocused();
  // Tab and Shift+Tab stay inside the modal while it is open.
  for(let i=0;i<12;i++) {
    await page.keyboard.press(i%3===0?'Shift+Tab':'Tab');
    expect(await page.evaluate(()=>Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.click();
  const price=dialog.getByRole('button',{name:'가격 싼 순',exact:true});
  await price.click();
  await expect(price).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>location.hash)).toContain('sort=price');
  await dialog.getByRole('button',{name:'이대로 보기',exact:true}).click();
  await expect(dialog).toBeHidden();
  // The URL keeps the chosen sort; a reload and a new search still show it pressed.
  await page.reload(); await importCatalog(page); await fill(page); await search(page);
  await page.getByRole('button',{name:'순서·가게 고르기',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('button',{name:'가격 싼 순',exact:true})).toHaveAttribute('aria-pressed','true');
});
test('seller chip filters the rows and reset restores the default view',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page); await search(page);
  const rows=page.locator('.space-results > li');
  await expect(rows).toHaveCount(9);
  const chip=page.locator('.space-chip-row').getByRole('button',{name:'무인양품',exact:true});
  await expect(chip).toHaveAttribute('aria-pressed','false');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed','true');
  // Every candidate in this fixture is sold by MUJI, so all rows remain and name it.
  await expect(rows).toHaveCount(9);
  for(const row of await rows.all()) await expect(row.getByText('무인양품').first()).toBeVisible();
  await page.getByRole('button',{name:'순서·가게 고르기',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'순서·가게 고르기'});
  await dialog.getByRole('button',{name:'처음대로 돌리기',exact:true}).click();
  await dialog.getByRole('button',{name:'이대로 보기',exact:true}).click();
  await expect(chip).toHaveAttribute('aria-pressed','false');
  expect(await page.evaluate(()=>location.hash)).not.toContain('seller=');
});
test('desktop filter column is sticky and the result list stays within 720px',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page); await search(page);
  const column=page.locator('.space-filter-column');
  await expect(column).toBeVisible();
  expect(await column.evaluate((el)=>getComputedStyle(el).position)).toBe('sticky');
  await expect(page.getByRole('button',{name:'순서·가게 고르기',exact:true})).toBeHidden();
  const width=await page.locator('.space-results').evaluate((el)=>el.getBoundingClientRect().width);
  expect(width).toBeLessThanOrEqual(720);
});
test('mobile filter sheet has no axe violations',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page); await search(page);
  await page.getByRole('button',{name:'순서·가게 고르기',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'순서·가게 고르기'})).toBeVisible();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
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
  await search(page);
});
test('a view query on the root hash still opens Space Fit with that sort',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/#/?sort=count');
  await expect(page.getByRole('heading',{level:1})).toHaveText('빈 공간에 맞는 수납함을 찾아요');
  await importCatalog(page); await fill(page); await search(page);
  await expect(page.locator('.space-filter-column').getByRole('button',{name:'수납함 많이 들어가는 순',exact:true})).toHaveAttribute('aria-pressed','true');
});
test('auto-steps surface two-product combinations without pressing 조합 더 찾기',async({page})=>{
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page,['200','200','40']); await search(page);
  // The results stay usable while background steps run: no busy region, search enabled.
  await expect(page.getByRole('region',{name:'찾은 수납함',exact:true})).toHaveAttribute('aria-busy','false');
  await expect(page.getByRole('button',{name:'맞는 수납함 찾기',exact:true})).toBeEnabled();
  // Page 0 holds 100 single-product grids; mixed rows only come from later steps.
  await expect.poll(async()=>Number((await page.locator('#space-summary').textContent())?.match(/(\d+)개/)?.[1] ?? 0),{timeout:20000}).toBeGreaterThan(100);
  await expect(page.locator('.space-results > li .space-row-title',{hasText:'+'}).first()).toBeAttached({timeout:20000}).catch(async()=>{
    // The mixed rows may sort below the first 20; reveal more rows until one appears.
    for(let i=0;i<10 && await page.locator('.space-results > li .space-row-title',{hasText:'+'}).count()===0;i++) await page.getByRole('button',{name:'더 보기',exact:true}).click();
    await expect(page.locator('.space-results > li .space-row-title',{hasText:'+'}).first()).toBeAttached();
  });
});
test('clicking a non-focusable part of the sheet keeps Tab and Escape inside it',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page); await search(page);
  const opener=page.getByRole('button',{name:'순서·가게 고르기',exact:true});
  await opener.click();
  const dialog=page.getByRole('dialog',{name:'순서·가게 고르기'});
  await dialog.getByText('파는 곳',{exact:true}).click();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(()=>Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await page.evaluate(()=>document.getElementById('root')?.hasAttribute('inert'))).toBe(false);
});
test('a view link opens Space Fit even after expert mode was used',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('zari.mode.v1','expert'));
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/#/space-fit?sort=price');
  await expect(page.getByRole('heading',{level:1})).toHaveText('빈 공간에 맞는 수납함을 찾아요');
});

test('clearance defaults, persists and re-runs from the desktop column without moving focus',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/#/space-fit');
  const details=page.locator('.space-clearance-details');
  await expect(details).not.toHaveAttribute('open','');
  const formClearance=details.locator('.space-clearance');
  await expect(formClearance.getByRole('button',{name:'0.5cm',exact:true})).toHaveAttribute('aria-pressed','true');
  await details.locator('summary').click();
  await formClearance.getByRole('button',{name:'1cm',exact:true}).click();
  await expect(formClearance.getByRole('button',{name:'1cm',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>localStorage.getItem('zari.space-fit.clearance.v1'))).toBe('10');
  await importCatalog(page); await fill(page); await search(page);
  await expect(page.getByText('축마다 1cm를 남겨요.')).toBeVisible();
  // The stored choice survives a reload.
  await page.reload();
  const reloaded=page.locator('.space-clearance-details');
  await reloaded.locator('summary').click();
  await expect(reloaded.locator('.space-clearance').getByRole('button',{name:'1cm',exact:true})).toHaveAttribute('aria-pressed','true');
  await importCatalog(page); await fill(page); await search(page);
  // A change on the visible results screen repeats the search; the pressed
  // chip keeps focus and the summary stays mounted.
  const column=page.locator('.space-filter-column');
  const two=column.getByRole('button',{name:'2cm',exact:true});
  await two.click();
  await expect(two).toBeFocused();
  await expect(page.locator('#space-summary')).toBeVisible();
  await expect(page.getByText('축마다 2cm를 남겨요.')).toBeVisible();
});

test('desktop 처음대로 돌리기 restores the default view and clearance',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page); await search(page);
  const column=page.locator('.space-filter-column');
  await column.getByRole('button',{name:'가격 싼 순',exact:true}).click();
  await column.getByRole('button',{name:'2cm',exact:true}).click();
  await expect(page.getByText('축마다 2cm를 남겨요.')).toBeVisible();
  await column.getByRole('button',{name:'처음대로 돌리기',exact:true}).click();
  await expect(column.getByRole('button',{name:'빈틈없이 꽉 차는 순',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(column.getByRole('button',{name:'0.5cm',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByText('축마다 0.5cm를 남겨요.')).toBeVisible();
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
  // The first page can beat the click; both outcomes are valid, but the
  // screen must say something and keep the inputs.
  await page.getByRole('button',{name:'찾기 멈추기',exact:true}).click({timeout:2000}).catch(()=>undefined);
  await expect(page.getByText('찾기를 멈췄어요. 입력은 그대로 있어요.').or(page.getByRole('region',{name:'찾은 수납함'}))).toBeVisible();
  await expect(page.getByRole('textbox',{name:'가로',exact:true})).toHaveValue('200');
});

for(const width of [320,390,1440] as const) for(const theme of ['light','dark'] as const) test(`space fit results have no axe violations at ${width} ${theme}`,async({page})=>{
  await page.setViewportSize({width,height:width===1440?900:844});
  await page.emulateMedia({colorScheme:theme});
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page); await search(page);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});

test('mobile filter sheet with clearance has no axe violations',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/space-fit'); await importCatalog(page); await fill(page); await search(page);
  await page.getByRole('button',{name:'순서·가게 고르기',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'순서·가게 고르기'})).toBeVisible();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
});
