// Opt-in, bounded: at most one read and one simplify POST. No automatic retry.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
if (process.env.MINDBRIDGE_LIVE_TEST !== '1') throw new Error('Set MINDBRIDGE_LIVE_TEST=1 for synthetic live provider verification.');
const browser = await chromium.launch();
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const evidence = { synthetic_only:true, calls:[], browser_errors:[], checks:{} };
page.on('pageerror',e=>evidence.browser_errors.push(e.name));
page.on('response',async response=>{
  const path = new URL(response.url()).pathname;
  if (!path.startsWith('/api/')) return;
  const row = { endpoint:path, status:response.status() };
  evidence.calls.push(row);
  if (response.status() >= 400) {
    try { row.error_code = (await response.json()).error?.code; } catch {}
  }
});
try {
  await page.goto('http://127.0.0.1:5173/scan');
  await page.locator('#scan-gallery-input').setInputFiles(new URL('./assets/synthetic-page.png',import.meta.url).pathname);
  await page.getByRole('button',{name:'Read this page',exact:true}).click();
  await Promise.race([page.waitForURL(/\/read\//,{timeout:95000}),page.getByRole('alert').waitFor().then(()=>{throw new Error('ReadRejected');})]);
  evidence.checks.live_read_in_browser = true;
  await page.getByRole('button',{name:'Simplify selected section',exact:true}).click();
  await page.getByRole('button',{name:'Open SourceLens',exact:true}).waitFor({timeout:50000});
  await page.getByRole('button',{name:'Open SourceLens',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  evidence.checks.live_simplification_and_sourcelens = true;
  evidence.checks.no_horizontal_overflow = await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
  mkdirSync('test-results',{recursive:true});
  await page.screenshot({path:'test-results/live-sourcelens.png',fullPage:false,animations:'disabled'});
} catch(e) {
  evidence.failure = e.message === 'ReadRejected' ? 'ReadRejected' : e.name;
  evidence.checks.recoverable_error_visible = await page.getByRole('alert').count() > 0;
  process.exitCode=1;
} finally {
  mkdirSync('test-results',{recursive:true});
  writeFileSync('test-results/live-read-evidence.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
  await browser.close();
}
