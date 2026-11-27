import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const data = (name) => JSON.parse(readFileSync(new URL(`../../src/test-data/${name}.json`, import.meta.url)));
const read = data('read.success'), health = data('health.initial'), plan = data('prepare.success');
const initial = data('check.misconception'), retry = data('retry.independent-success');
const image = new URL('../assets/synthetic-page.png', import.meta.url).pathname;
test.use({baseURL:process.env.MB_BASELINE_URL || 'http://127.0.0.1:5173'});
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


for (const width of [390,1440]) {
 test(`visual record ${width}`,async ({page})=>{
  await page.setViewportSize({width,height:1000});
  const folder = `${process.env.MB_CAPTURE_DIR || 'test-results/visual'}/${width}`;
  mkdirSync(folder,{recursive:true});
  const shot=async(name)=>{await page.evaluate(()=>document.fonts.ready); expect(await page.evaluate(()=>document.fonts.check('16px Manrope'))).toBe(true); if(!['source','settings'].includes(name)) await page.evaluate(()=>scrollTo(0,0)); await page.screenshot({path:`${folder}/${name}.png`,fullPage:!['source','settings'].includes(name),animations:'disabled'});};
  await mockApi(page);
  await page.goto('/'); await shot('landing');
  await page.locator('.mb-product-preview').screenshot({path:`${folder}/hero-demo.png`,animations:'disabled'});
  writeFileSync(`${folder}/computed-theme.json`,JSON.stringify(await page.locator('.mb-app').evaluate(el=>({canvas:getComputedStyle(el).backgroundColor,filter:getComputedStyle(el).filter,font:getComputedStyle(el).fontFamily,heading:getComputedStyle(el.querySelector('h1')).fontSize})),null,2));
  if(!process.env.MB_BASELINE_URL) {
   await page.getByRole('button',{name:'Use dark theme'}).click(); await shot('landing-dark');
   await page.getByRole('button',{name:'Use light theme'}).click();
  }
  await page.goto('/scan'); await shot('scan');
  await page.locator('#scan-gallery-input').setInputFiles(image); await shot('scan-preview');
  await page.getByRole('button',{name:'Read this page',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Photosynthesis',level:1})).toBeVisible();
  await shot('reader');
  await page.getByRole('button',{name:'Reading settings',exact:true}).click(); await shot('settings');
  await page.keyboard.press('Escape');
  await page.getByRole('radio',{name:'Simplified',exact:true}).click();
  await page.getByRole('button',{name:'Open SourceLens'}).click(); await shot('source');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Practice this section'}).click();
  await expect(page.getByLabel('Your explanation')).toBeVisible(); await shot('question');
  await page.getByLabel('Your explanation').fill(initial.attempt.answer);
  await page.getByRole('button',{name:'Check understanding',exact:true}).click();
  await expect(page.getByText('Possible misconception',{exact:true})).toBeVisible(); await shot('feedback');
  await page.getByRole('button',{name:'Try follow-up question'}).click(); await shot('follow-up');
  await page.getByLabel('Your explanation').fill(retry.attempt.answer);
  await page.getByRole('button',{name:'Submit retry answer'}).click();
  await expect(page.getByText('Understanding comparison',{exact:true})).toBeVisible(); await shot('results');
  await page.getByRole('button',{name:'Reading settings',exact:true}).click();
  await page.getByRole('radio',{name:'Dark',exact:true}).click(); await page.keyboard.press('Escape'); await shot('results-dark');
  await page.getByRole('button',{name:'Return to Original reading'}).click(); await shot('reader-dark');
 });
}


test('interactive landing preview, keyboard controls and dark theme',async ({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await mockApi(page); await page.goto('/');
 const preview=page.getByRole('region',{name:'Interactive illustrative reading demonstration'});
 await preview.getByRole('radio',{name:'Original',exact:true}).click();
 await expect(preview.locator('[data-preview-transition][data-mode="original"] .mb-preview-text')).toContainText('Green plants use light energy from sunlight');
 await preview.getByRole('radio',{name:'Original',exact:true}).press('ArrowRight');
 await expect(preview.getByRole('radio',{name:'Simplified',exact:true})).toBeFocused();
 await expect(preview.getByRole('radio',{name:'Simplified',exact:true})).toHaveAttribute('aria-checked','true');
 expect(await preview.locator('.mb-segment-track > span').evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
 await page.getByRole('button',{name:'Hide source',exact:true}).click();
 await expect(page.locator('#preview-evidence')).toBeHidden();
 await page.getByRole('button',{name:'Inspect source',exact:true}).click();
 await expect(page.locator('#preview-evidence')).toBeVisible();
 await page.getByRole('button',{name:'See the follow-up question',exact:true}).click();
 await expect(page.getByText('What does sunlight provide, and what do plants make using it?',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Replay example',exact:true}).click();
 await expect(page.getByRole('button',{name:'See the follow-up question',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Use dark theme'}).click();
 await accessible(page); await noOverflow(page);
 expect(errors).toEqual([]);
});

test('reduced motion, keyboard dialog focus, and expanded evidence',async ({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await mockApi(page); await scan(page);
 await page.getByRole('button',{name:'Reading settings',exact:true}).focus();
 await page.keyboard.press('Enter');
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 expect(await dialog.evaluate(el=>getComputedStyle(el).transitionDuration)).toMatch(/^0s/);
 await page.keyboard.press('Tab');
 expect(await page.evaluate(()=>document.querySelector('[role="dialog"]').contains(document.activeElement))).toBe(true);
 await page.keyboard.press('Escape');
 await expect(page.getByRole('button',{name:'Reading settings',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Practice this section'}).click();
 await page.getByLabel('Your explanation').fill(initial.attempt.answer);
 await page.getByRole('button',{name:'Check understanding',exact:true}).click();
 await expect(page.getByText('Possible misconception',{exact:true})).toBeVisible();
 const source=page.locator('.mb-source-disclosure').filter({has:page.locator('summary',{hasText:'Textbook evidence'})}).first();
 await expect(source).not.toHaveAttribute('open','');
 await source.locator(':scope > summary').click();
 await expect(source).toHaveAttribute('open','');
 await expect(source.locator('blockquote')).toBeVisible();
 await accessible(page);
});

test('polished mobile actions, feedback, session entry and touch targets stay accessible',async ({page})=>{
 await page.setViewportSize({width:390,height:1000});
 await mockApi(page);await page.goto('/');
 await expect(page.locator('.mb-app')).toHaveAttribute('data-reading-theme','cream');
 for(const radio of await page.getByRole('radiogroup',{name:'Preview reading mode'}).getByRole('radio').all()) {
  expect((await radio.boundingBox()).height).toBeGreaterThanOrEqual(44);
 }
 await page.getByRole('button',{name:'Use dark theme'}).click();
 await page.reload();
 await expect(page.locator('.mb-app')).toHaveAttribute('data-reading-theme','dark');
 await page.getByRole('button',{name:'Use light theme'}).click();
 await scan(page);
 const modes=page.getByRole('radiogroup',{name:'Reading level'});
 const original=page.getByRole('article',{name:'Textbook reading passage'});
 expect((await modes.boundingBox()).y).toBeLessThan((await original.boundingBox()).y);
 expect((await page.getByRole('button',{name:'Practice this section'}).boundingBox()).y).toBeLessThan((await original.boundingBox()).y);
 expect(await page.getByRole('radio',{name:'Simplified',exact:true}).count()).toBe(1);
 await page.getByRole('radio',{name:'Simplified',exact:true}).click();
 await expect(page.getByRole('button',{name:'Open SourceLens'})).toBeVisible();
 expect((await page.getByText('View summary source quote',{exact:true}).boundingBox()).height).toBeGreaterThanOrEqual(44);
 await page.getByRole('link',{name:'MindBridge home'}).click();
 const resume=page.getByRole('button',{name:'Return to reader',exact:true});
 expect((await resume.boundingBox()).y).toBeLessThan((await page.getByRole('heading',{level:1}).boundingBox()).y);
 await resume.click();
 await page.getByRole('button',{name:'Practice this section'}).click();
 await page.getByLabel('Your explanation').fill(initial.attempt.answer);
 await page.getByRole('button',{name:'Check understanding',exact:true}).click();
 const followup=page.getByRole('button',{name:'Try follow-up question'});
 await expect(followup).toBeVisible();
 expect((await followup.boundingBox()).y).toBeLessThan((await page.getByRole('heading',{name:'Concept breakdown',exact:true}).boundingBox()).y);
 const evidence=page.locator('.mb-source-disclosure').filter({has:page.locator('summary',{hasText:'Supporting passage'})});
 await expect(evidence).not.toHaveAttribute('open','');
 await evidence.locator(':scope > summary').click();
 await expect(evidence.locator('blockquote')).toBeVisible();
 await noOverflow(page);await accessible(page);
});

for (const width of [320,360,390,768,1024,1440]) {
 test(`creative white canvas and responsive journey at ${width}px`,async ({page})=>{
  await page.setViewportSize({width,height:900});
  await mockApi(page);await page.goto('/');
  const white=async(locator)=>expect(locator).toHaveCSS('background-color','rgb(255, 255, 255)');
  await white(page.locator('.mb-app'));await white(page.locator('.mb-header'));
  await noOverflow(page);
  const journey=page.locator('.mb-journey li');
  await expect(page.getByRole('heading',{name:'From reading to understanding.',exact:true})).toBeVisible();
  await expect(journey.locator('strong')).toHaveText(['Scan','Read','Practice','Repair','Retry']);
  await expect(journey.locator('p')).toHaveText(['Capture a page.','Make it clearer.','Test your understanding.','Fix misunderstandings.','Try a new question.']);
  await expect(page.locator('.mb-journey-node > span')).toHaveCount(0);
  for(let index=0;index<await journey.count();index++) {
   const label=await journey.nth(index).locator('strong').boundingBox();
   const detail=await journey.nth(index).locator('p').boundingBox();
   expect(detail.y).toBeGreaterThanOrEqual(label.y+label.height-1);
  }
  if([390,1440].includes(width)) {
   await page.locator('.mb-journey-five').scrollIntoViewIfNeeded();
   await page.screenshot({path:`test-results/journey-five-${width}.png`,animations:'disabled'});
  }
  await page.goto('/scan');await white(page.locator('.mb-app'));await noOverflow(page);
  await page.locator('#scan-gallery-input').setInputFiles(image);
  await page.getByRole('button',{name:'Read this page',exact:true}).click();
  await white(page.locator('.mb-app'));await white(page.getByRole('article',{name:'Textbook reading passage'}));
  await noOverflow(page);
  await page.getByRole('button',{name:'Reading settings',exact:true}).click();
  await white(page.getByRole('dialog'));
  await page.getByRole('radio',{name:'Dark',exact:true}).click();
  await page.getByLabel('Text size',{exact:true}).fill('32');
  await page.getByLabel('Letter spacing',{exact:true}).fill('0.12');
  await noOverflow(page);await page.keyboard.press('Escape');await noOverflow(page);
  await page.getByRole('button',{name:'Reading settings',exact:true}).click();
  await page.getByRole('radio',{name:'Light',exact:true}).click();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Practice this section'}).click();
  await expect(page.getByLabel('Your explanation')).toBeVisible();
  await white(page.locator('.mb-app'));await noOverflow(page);
 });
}

test('creative demonstrations stay explicit and keyboard motion is immediate',async ({page})=>{
 await mockApi(page);await page.goto('/');
 await page.getByRole('button',{name:'See the follow-up question',exact:true}).click();
 await page.getByRole('button',{name:'Compare illustrative answers',exact:true}).click();
 await expect(page.getByText('Illustrative follow-up answer',{exact:true})).toBeVisible();
 await expect(page.getByText('The energy source and the food are now distinguished in this example.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Replay example',exact:true}).click();
 const context=page.getByRole('region',{name:/A difficult word/});
 await context.getByRole('button',{name:'glucose',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(context.getByRole('heading',{name:'Glucose',exact:true})).toBeVisible();
 expect(await context.locator('.mb-context-definition').evaluate(el=>el.getAnimations().filter(a=>a.playState==='running').length)).toBe(0);
 await context.getByRole('button',{name:'Close illustrative definition'}).click();
 await expect(context.getByRole('heading',{name:'Glucose',exact:true})).toHaveCount(0);
 await expect(context.getByRole('button',{name:'glucose',exact:true})).toBeFocused();
 await accessible(page);
});

test('scan sweep tracks actual pending request and respects reduced motion and cancellation',async ({page})=>{
 await mockApi(page);
 let finish;
 const waiting=new Promise(resolve=>{finish=resolve;});
 await page.route('**/api/read',async route=>{await waiting;try{await route.fulfill({json:read});}catch{ /* user cancelled */ }});
 await page.goto('/scan');await page.locator('#scan-gallery-input').setInputFiles(image);
 await page.getByRole('button',{name:'Read this page',exact:true}).click();
 await expect(page.locator('.mb-scan-sweep')).toBeVisible();
 await expect(page.getByRole('button',{name:'Cancel waiting',exact:true})).toBeVisible();
 const folder=process.env.MB_CAPTURE_DIR || 'test-results/visual';mkdirSync(folder,{recursive:true});
 await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:`${folder}/scan-processing.png`,fullPage:true,animations:'allow'});
 await page.emulateMedia({reducedMotion:'reduce'});
 expect(await page.locator('.mb-scan-sweep > span').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await page.getByRole('button',{name:'Cancel waiting',exact:true}).click();finish();
 await expect(page.locator('.mb-scan-sweep')).toHaveCount(0);
 await expect(page.getByAltText('Selected textbook page preview')).toBeVisible();
});

test('preview movement is transform-only, interruptible and absent for reduced motion',async ({page})=>{
 await mockApi(page);await page.goto('/');
 const preview=page.getByRole('region',{name:'Interactive illustrative reading demonstration'});
 await preview.getByRole('radio',{name:'Original',exact:true}).click();
 const frames=await preview.locator('[data-preview-transition][data-mode="original"]').evaluate(el=>el.getAnimations().flatMap(a=>a.effect.getKeyframes()).map(f=>Object.keys(f).filter(key=>!['offset','computedOffset','easing','composite'].includes(key))));
 expect(frames.length).toBeGreaterThan(0);
 expect(frames.every(keys=>keys.every(key=>key==='transform'))).toBe(true);
 await page.keyboard.press('Tab');
 expect(await preview.locator('[data-preview-transition][data-mode="original"]').evaluate(el=>el.getAnimations().filter(a=>a.playState==='running').length)).toBe(0);
 await page.emulateMedia({reducedMotion:'reduce'});
 await preview.getByRole('radio',{name:'Simplified',exact:true}).click();
 expect(await preview.locator('[data-preview-transition][data-mode="easy"]').evaluate(el=>el.getAnimations().filter(a=>a.playState==='running').length)).toBe(0);
});


test('scroll storytelling reverses, stays still for keyboard and reduced motion, and preserves concise disclosures',async ({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await mockApi(page);await page.setViewportSize({width:1440,height:900});await page.goto('/');
 await expect(page.getByRole('button',{name:'Try a sample',exact:true})).toBeVisible();
 await expect(page.getByText('Illustrative sample · no live AI',{exact:true})).toBeVisible();
 await expect(page.getByText('A page becomes a possibility.',{exact:true})).toHaveCount(0);
 const book=page.locator('[data-scroll-object="textbook"]');
 const transform=()=>book.evaluate(el=>getComputedStyle(el).transform);
 const atStart=await transform();
 const path=page.locator('[data-source-scroll]');
 const sourceStart=await path.getAttribute('stroke-dasharray');
 await page.evaluate(()=>scrollTo(0,260));
 await expect.poll(transform).not.toBe(atStart);
 await expect.poll(()=>path.getAttribute('stroke-dasharray')).not.toBe(sourceStart);
 const captures=process.env.MB_CAPTURE_DIR;
 if(captures) await page.screenshot({path:`${captures}/desktop-scrolled.png`});
 await page.evaluate(()=>scrollTo(0,0));await expect.poll(transform).toBe(atStart);
 await page.keyboard.press('Tab');await expect.poll(transform).toBe('none');
 await expect(page.locator('.mb-scroll-progress')).toHaveCount(0);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.mouse.click(5,400);await page.evaluate(()=>scrollTo(0,260));
 await expect.poll(transform).toBe('none');await expect(page.locator('.mb-scroll-progress')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));
 await page.getByRole('button',{name:'Try a sample',exact:true}).scrollIntoViewIfNeeded();
 await expect(page.getByRole('button',{name:'Try a sample',exact:true})).toBeVisible();
 await noOverflow(page);
 if(captures) await page.screenshot({path:`${captures}/mobile-reduced-motion.png`});
 expect(errors).toEqual([]);
});

test('expressive section reveals, larger parallax and saved reduce-motion preference',async({page})=>{
 await mockApi(page);await page.setViewportSize({width:1440,height:900});await page.goto('/');
 const sheet=page.locator('[data-scroll-object="simplified"]');
 await page.evaluate(()=>scrollTo(0,420));
 await expect.poll(()=>sheet.evaluate(el=>Math.abs(new DOMMatrixReadOnly(getComputedStyle(el).transform).m42))).toBeGreaterThan(40);
 const illustration=page.locator('.mb-context-demo');
 expect(await illustration.evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)).toBeGreaterThan(40);
 await illustration.scrollIntoViewIfNeeded();
 await expect.poll(()=>illustration.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
 await expect.poll(()=>illustration.evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)).toBe(0);
 await page.getByRole('button',{name:'Explore the accessible reader',exact:true}).click();
 await page.getByRole('button',{name:'Reading settings',exact:true}).click();
 await page.getByLabel('Reduce interface motion',{exact:true}).check();await page.keyboard.press('Escape');
 await page.getByRole('link',{name:'MindBridge home',exact:true}).click();await page.reload();
 await expect(page.locator('html')).toHaveAttribute('data-reduced-motion','true');
 await expect(page.locator('.mb-scroll-progress')).toHaveCount(0);
 await page.evaluate(()=>scrollTo(0,300));
 expect(await page.locator('[data-scroll-object="simplified"]').evaluate(el=>getComputedStyle(el).transform)).toBe('none');
 expect(await page.locator('.mb-context-demo').evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
});
