import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
const fixture=name=>JSON.parse(readFileSync(new URL(`../../src/test-data/${name}.json`,import.meta.url)));
const read=fixture('read.success'), image=new URL('../assets/synthetic-page.png',import.meta.url).pathname;
const voices=[{voiceURI:'in',name:'Indian sample',lang:'en-IN',localService:true},{voiceURI:'gb',name:'British sample',lang:'en-GB',localService:true},{voiceURI:'us',name:'American sample',lang:'en-US',localService:true},{voiceURI:'remote',name:'Remote sample',lang:'en-IN',localService:false,default:true}];
const button=(page,name)=>page.getByRole('button',{name,exact:true});
async function setup(page){
 await page.route('**/api/**',route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1);
  if(name==='health'){const h=fixture('health.initial');return route.fulfill({json:{...h,capabilities:{...h.capabilities,read:true,simplify:true},reading_levels:['original','easy']}});}
  if(name==='read')return route.fulfill({json:read});
  if(name==='simplify'){const s=fixture('simplify.no-terms');s.items[0].terminology_check_status='checked';s.items[0].preserved_terms=read.page.key_terms.map(t=>t.term);return route.fulfill({json:s});}
  throw new Error('Unexpected synthetic speech endpoint');
 });
 await page.addInitScript(()=>{
  const events=new EventTarget(), control={voices:[],utterances:[],cancels:0};window.testSpeech=control;
  window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  const synth={paused:false,getVoices:()=>control.voices,speak:u=>{control.utterances.push(u);u.onstart?.();},cancel:()=>{control.cancels++;},pause:()=>{synth.paused=true;},resume:()=>{synth.paused=false;},addEventListener:(...a)=>events.addEventListener(...a),removeEventListener:(...a)=>events.removeEventListener(...a)};
  Object.defineProperty(window,'speechSynthesis',{value:synth,configurable:true});control.load=voices=>{control.voices=voices;events.dispatchEvent(new Event('voiceschanged'));};
 });
 await page.goto('/scan');await page.locator('#scan-gallery-input').setInputFiles(image);await button(page,'Read this page').click();await expect(page.getByRole('heading',{level:1,name:'Photosynthesis'})).toBeVisible();
}
test('asynchronous local voices, fixed preview, privacy consent and saved selection',async({page})=>{
 await setup(page);await button(page,'Reading settings').click();await page.evaluate(voices=>testSpeech.load(voices),voices);
 await expect(page.getByLabel('Read-aloud voice',{exact:true})).toContainText('Device-local');await expect(page.getByLabel('Read-aloud voice',{exact:true})).toContainText('Remote');
 await page.getByLabel('Preferred English accent',{exact:true}).selectOption('en-GB');await button(page,'Preview voice').click();
 expect(await page.evaluate(()=>testSpeech.utterances.at(-1).voice.voiceURI)).toBe('gb');expect(await page.evaluate(()=>testSpeech.utterances.at(-1).text)).toBe('Read at a comfortable pace. The sample contains 20 millilitres of water at 25 degrees Celsius.');expect(await page.evaluate(()=>testSpeech.utterances.at(-1).rate)).toBe(.9);
 await button(page,'Stop voice preview').click();await page.getByLabel('Read-aloud voice',{exact:true}).selectOption('us');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mindbridge:reading-preferences:v1')).voice_uri)).toBe('us');
 const count=await page.evaluate(()=>testSpeech.utterances.length);await page.getByLabel('Read-aloud voice',{exact:true}).selectOption('remote');await button(page,'Preview voice').click();await expect(page.getByRole('dialog')).toContainText('may send text to a remote speech service');expect(await page.evaluate(()=>testSpeech.utterances.length)).toBe(count);
 await page.getByLabel(/Allow remote speech for a voice I select/).check();await button(page,'Preview voice').click();expect(await page.evaluate(()=>testSpeech.utterances.at(-1).voice.voiceURI)).toBe('remote');await page.keyboard.press('Escape');await expect(button(page,'Read aloud')).toBeVisible();
});
test('original and simplified speech, pause resume, boundary highlighting and route cancellation',async({page})=>{
 await setup(page);await page.evaluate(voices=>testSpeech.load(voices),voices);await button(page,'Read aloud').click();expect(await page.evaluate(()=>testSpeech.utterances.at(-1).voice.voiceURI)).toBe('in');
 const initial=await page.evaluate(()=>testSpeech.utterances.length);await button(page,'Pause').click();await button(page,'Resume').click();expect(await page.evaluate(()=>testSpeech.utterances.length)).toBe(initial);
 await button(page,'Next sentence').click();expect(await page.evaluate(()=>testSpeech.utterances.at(-1).text)).toContain('Green plants');await button(page,'Previous sentence').click();expect(await page.evaluate(()=>testSpeech.utterances.at(-1).text)).toContain('Photosynthesis');
 const old=await page.evaluate(()=>testSpeech.utterances.length-1);await page.getByRole('radio',{name:'Simplified',exact:true}).click();await expect(button(page,'Read aloud')).toBeVisible();await page.evaluate(i=>{testSpeech.utterances[i].onend?.();testSpeech.utterances[i].onboundary?.({charIndex:0});},old);expect(await page.evaluate(()=>testSpeech.utterances.length)).toBe(old+1);
 await button(page,'Read aloud').click();await page.evaluate(()=>{const u=testSpeech.utterances.at(-1);u.onboundary({charIndex:0});u.onend();});expect(await page.evaluate(()=>testSpeech.utterances.at(-1).text)).toContain('Plants use light energy from sunlight. They make glucose');
 expect(await page.evaluate(()=>testSpeech.utterances.at(-1).text)).toContain('They make glucose');await page.evaluate(()=>{const u=testSpeech.utterances.at(-1);u.onboundary({charIndex:u.text.indexOf('This process')});});
 await expect(page.locator('[data-sentence-id].mb-sentence-active')).toContainText('This process');await button(page,'Stop reading aloud').click();await expect(page.locator('.mb-sentence-active')).toHaveCount(0);
 await button(page,'Read aloud').click();const cancels=await page.evaluate(()=>testSpeech.cancels);await page.getByRole('link',{name:'MindBridge home',exact:true}).click();await expect.poll(()=>page.evaluate(()=>testSpeech.cancels)).toBeGreaterThan(cancels);const length=await page.evaluate(()=>testSpeech.utterances.length);await page.evaluate(()=>testSpeech.utterances.at(-1).onend?.());expect(await page.evaluate(()=>testSpeech.utterances.length)).toBe(length);
});
test('sentence fallback, speech error recovery and mobile voice settings',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page);await page.evaluate(voices=>testSpeech.load(voices),voices);await button(page,'Read aloud').click();await page.evaluate(()=>testSpeech.utterances.at(-1).onend());await expect(page.getByText('Timing events unavailable · sentence playback.',{exact:true})).toBeVisible();
 await page.evaluate(()=>testSpeech.utterances.at(-1).onerror({error:'network'}));await expect(page.getByRole('status').filter({hasText:'Speech stopped unexpectedly'})).toBeVisible();await button(page,'Read aloud').click();await expect(button(page,'Pause')).toBeVisible();await button(page,'Stop reading aloud').click();
 await button(page,'Settings').click();await page.getByLabel('Speech continuity',{exact:true}).selectOption('sentence');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const folder=process.env.MB_CAPTURE_DIR;if(folder){await page.getByLabel('Read-aloud voice',{exact:true}).scrollIntoViewIfNeeded();mkdirSync(folder,{recursive:true});await page.screenshot({path:`${folder}/speech-settings-mobile.png`});}await page.keyboard.press('Escape');await expect(button(page,'Settings')).toBeFocused();
});
