import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
const data = (name) => JSON.parse(readFileSync(new URL(`../../src/test-data/${name}.json`, import.meta.url)));
const read = data('read.success'), health = data('health.initial'), plan = data('prepare.success');
const initial = data('check.misconception'), retry = data('retry.independent-success');
const image = new URL('../assets/synthetic-page.png', import.meta.url).pathname;
const allHealth = { ...health, capabilities: Object.fromEntries(Object.keys(health.capabilities).map((key) => [key, true])), reading_levels: ['original','easy'] };

async function mockApi(page, { readFailure = false } = {}) {
  await page.route('**/api/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    if (name === 'health') return route.fulfill({ json: allHealth });
    if (name === 'read') return readFailure ? route.fulfill({ status: 503, json: { error: { code:'AI_UNAVAILABLE', message:'Synthetic provider unavailable. Try later.', retryable:true, request_id:'synthetic-error', retry_after_seconds:null, details:[] } } }) : route.fulfill({ json: read });
    const req = route.request().postDataJSON();
    if (name === 'simplify') {
      const result = data('simplify.no-terms');
      result.items[0].terminology_check_status = 'checked';
      result.items[0].preserved_terms = read.page.key_terms.map((t) => t.term);
      return route.fulfill({ json: result });
    }
    if (name === 'define') return route.fulfill({ json: { phrase:req.phrase, language:'en', definition:'A gas used by plants.', contextual_meaning:'One material used to make glucose.', example:null, source_refs:[{ chunk_id:'c0002',quote:'carbon dioxide and water' }] } });
    if (name === 'explain') return route.fulfill({ json: { page_id:read.page.id, concept:req.concept, language:'en', text:'Sunlight supplies energy for making glucose.', important_terms:['light energy','glucose'], source_refs:[{chunk_id:'c0002',quote:'light energy from sunlight'}] } });
    if (name === 'prepare-understanding') return route.fulfill({ json: plan });
    if (name === 'check-understanding') {
      const result = structuredClone(req.previous_attempt ? retry : initial);
      Object.assign(result.attempt, { id:req.attempt_id, question:req.question, answer:req.answer, assistance:req.assistance });
      if (result.retry_result) Object.assign(result.retry_result,{ current_attempt_id:req.attempt_id, previous_attempt_id:req.previous_attempt.id, independent_in_app:!req.assistance.used });
      return route.fulfill({ json:result });
    }
    throw new Error(`Unexpected endpoint: ${name}`);
  });
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function accessible(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  expect(results.violations.map((v) => ({ id:v.id, nodes:v.nodes.map((n) => ({ target:n.target, summary:n.failureSummary })) }))).toEqual([]);
}
async function scan(page) {
  await page.goto('/scan');
  await page.locator('#scan-gallery-input').setInputFiles(image);
  await expect(page.getByAltText(/preview/i)).toBeVisible();
  await page.getByRole('button', { name:/read this page/i }).click();
  await expect(page.getByRole('heading', { name:'Photosynthesis', exact:true, level:1 })).toBeVisible();
}

for (const width of [360,390,768,1024,1440]) {
  test(`sample, settings, keyboard and themes reflow at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:900});
    await mockApi(page);
    await page.goto('/');
    await noOverflow(page);
    if (width === 390 || width === 1440) {
      await accessible(page);
      await page.screenshot({ path:`test-results/home-${width}.png`,fullPage:true,animations:'disabled' });
    }
    await page.getByRole('button',{name:'Try a sample'}).click();
    await expect(page.getByRole('heading',{level:1,name:'Photosynthesis'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Practice this section'})).toBeDisabled();
    await noOverflow(page);
    await page.getByRole('button',{name:'Reading settings',exact:true}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('radio',{name:'Dark',exact:true}).click();
    await page.getByLabel('Text size',{exact:true}).fill('32');
    await page.getByLabel('Letter spacing',{exact:true}).fill('0.12');
    await noOverflow(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button',{name:'Reading settings',exact:true})).toBeFocused();
    await noOverflow(page);
    if (width === 390 || width === 1440) {
      await accessible(page);
      await page.screenshot({path:`test-results/reader-dark-${width}.png`,fullPage:true,animations:'disabled'});
    }
    await page.getByRole('button',{name:'glucose',exact:true}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await noOverflow(page);
    if (width === 390) await accessible(page);
    await page.keyboard.press('Escape');
  });
}

for (const width of [390,1440]) {
  test(`source-linked reader and assisted retry survive navigation at ${width}px`, async ({page}) => {
    const errors=[];page.on('pageerror',(err)=>errors.push(err.message));
    await page.setViewportSize({width,height:900});
    await mockApi(page);
    await scan(page);
    await page.getByRole('radio',{name:'Simplified',exact:true}).click();
    await expect(page.getByRole('button',{name:'Open SourceLens'})).toBeVisible();
    await page.getByRole('button',{name:'Open SourceLens'}).click();
    await expect(page.getByText(/not been independently verified/i)).toBeVisible();
    await accessible(page); await noOverflow(page);
    await page.screenshot({path:`test-results/sourcelens-${width}.png`,fullPage:false,animations:'disabled'});
    await page.keyboard.press('Escape');
    await page.getByLabel('Look up a phrase from the selected section').fill('carbon dioxide');
    await page.getByRole('button',{name:'Define',exact:true}).click();
    await expect(page.getByText('A gas used by plants.')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByLabel('What would you like explained from this section?').fill('Role of sunlight');
    await page.getByRole('button',{name:'Explain',exact:true}).click();
    await expect(page.getByText('Sunlight supplies energy for making glucose.')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Practice this section'}).click();
    await expect(page.getByText(plan.initial_question.text)).toBeVisible();
    await page.getByLabel('Your explanation').fill(initial.attempt.answer);
    await page.getByRole('button',{name:'Check understanding',exact:true}).click();
    await expect(page.getByText('Possible misconception', {exact:true})).toBeVisible();
    await accessible(page);
    await page.getByRole('button',{name:'Try follow-up question'}).click();
    await page.getByLabel('Your explanation').fill(retry.attempt.answer);
    await page.getByRole('button',{name:'Back to reader'}).click();
    await expect(page.getByRole('button',{name:'Resume practice'})).toBeVisible();
    await page.getByRole('button',{name:'Resume practice'}).click();
    await expect(page.getByLabel('Your explanation')).toHaveValue(retry.attempt.answer);
    await expect(page.getByText(/In-app help opened during this retry:/)).toBeVisible();
    await page.getByRole('button',{name:'Submit retry answer'}).click();
    await expect(page.getByText('Understanding comparison', {exact:true})).toBeVisible();
    await expect(page.getByText(/Completed with in-app conceptual help/)).toBeVisible();
    await noOverflow(page); await accessible(page);
    await page.screenshot({path:`test-results/comparison-${width}.png`,fullPage:true,animations:'disabled'});
    expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.includes('mindbridge:draft')))).toEqual([]);
    expect(errors).toEqual([]);
  });
}
test('scan validation and provider failure preserve image without fixture substitution',async ({page})=>{
  await mockApi(page,{readFailure:true});
  await page.goto('/scan');
  await page.locator('#scan-gallery-input').setInputFiles({name:'page.heic',mimeType:'image/heic',buffer:Buffer.from('synthetic')});
  await expect(page.getByText(/HEIC\/HEIF photos/)).toBeVisible();
  await page.locator('#scan-gallery-input').setInputFiles(image);
  await page.getByRole('button',{name:/read this page/i}).click();
  await expect(page.getByText('Synthetic provider unavailable. Try later.')).toBeVisible();
  await expect(page.getByAltText(/preview/i)).toBeVisible();
  await expect(page).toHaveURL(/\/scan$/);
});

test('cached generated content remains reviewable after health failure', async ({page})=>{
  await mockApi(page); await scan(page);
  await page.getByRole('radio',{name:'Simplified',exact:true}).click();
  await expect(page.getByRole('button',{name:'Open SourceLens'})).toBeVisible();
  await page.getByLabel('Look up a phrase from the selected section').fill('carbon dioxide');
  await page.getByRole('button',{name:'Define',exact:true}).click();
  await expect(page.getByText('A gas used by plants.')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByLabel('What would you like explained from this section?').fill('Role of sunlight');
  await page.getByRole('button',{name:'Explain',exact:true}).click();
  await expect(page.getByText('Sunlight supplies energy for making glucose.')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.route('**/api/health', route=>route.abort('failed'));
  await page.getByRole('button',{name:'Refresh server status'}).click();
  await expect(page.getByText('Server unreachable',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Practice this section'})).toBeDisabled();
  await page.getByRole('button',{name:'Open SourceLens'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Define',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Explain',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Review carbon dioxide definition',exact:true}).click();
  await expect(page.getByText('A gas used by plants.')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Review Role of sunlight',exact:true}).click();
  await expect(page.getByText('Sunlight supplies energy for making glucose.')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('radio',{name:'Original',exact:true}).click();
  await page.getByRole('radio',{name:'Simplified',exact:true}).click();
  await expect(page.getByText('Plants use light energy from sunlight.')).toBeVisible();
});

test('unfinished learning navigation requires confirmation and clears unrelated state',async ({page})=>{
  await mockApi(page); await scan(page);
  await page.getByRole('button',{name:'Practice this section'}).click();
  await page.getByLabel('Your explanation').fill('Synthetic draft');
  await page.getByRole('link',{name:'MindBridge home'}).click();
  await page.getByRole('button',{name:'Keep practicing',exact:true}).click();
  await expect(page.getByLabel('Your explanation')).toHaveValue('Synthetic draft');
  await page.getByRole('link',{name:'MindBridge home'}).click();
  await page.getByRole('button',{name:'Leave practice',exact:true}).click();
  await expect(page).toHaveURL('/');
  await page.getByRole('button',{name:'Return to reader'}).click();
  await expect(page.getByRole('button',{name:'Resume practice'})).toHaveCount(0);
});

test('dark SourceLens and learning respect reading preferences and contrast',async ({page})=>{
  await mockApi(page); await scan(page);
  await page.getByRole('button',{name:'Reading settings',exact:true}).click();
  await page.getByRole('radio',{name:'Dark',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.getByRole('radio',{name:'Simplified',exact:true}).click();
  await page.getByRole('button',{name:'Open SourceLens'}).click();
  await accessible(page);
  await page.screenshot({path:'test-results/sourcelens-dark.png',fullPage:false,animations:'disabled'});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Practice this section'}).click();
  await page.getByLabel('Your explanation').fill(initial.attempt.answer);
  await page.getByRole('button',{name:'Check understanding',exact:true}).click();
  await expect(page.getByText('Possible misconception',{exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/repair-dark.png',fullPage:true,animations:'disabled'});
  await accessible(page);
});
