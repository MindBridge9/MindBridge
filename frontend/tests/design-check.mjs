// Read-only browser connectivity diagnostic. Never calls an AI endpoint.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const output=new URL('../design-review/',import.meta.url);
mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const health=[];
 page.on('response',r=>{if(r.url().endsWith('/api/health'))health.push({url:r.url(),status:r.status(),cors:r.headers()['access-control-allow-origin']});});
 page.on('requestfailed',r=>{if(r.url().includes('/api/health'))health.push({url:r.url(),failure:r.failure()});});
 await page.goto('http://127.0.0.1:5173/');
 await page.waitForFunction(()=>/Server connected|Server unreachable/.test(document.body.innerText));
 const theme=await page.locator('body').evaluate(el=>({filter:getComputedStyle(el).filter,colorScheme:getComputedStyle(el).colorScheme,theme:document.querySelector('[data-reading-theme]')?.dataset.readingTheme}));
 writeFileSync(new URL('connectivity.json',output),JSON.stringify({health,theme},null,2)+'\n');
 await page.screenshot({path:new URL('connectivity.png',output).pathname,fullPage:true,animations:'disabled'});
 console.log(JSON.stringify({health,theme},null,2));
} finally { await browser.close(); }
