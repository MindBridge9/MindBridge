import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, mkdirSync } from 'node:fs';
const fixture=name=>JSON.parse(readFileSync(new URL(`../../src/test-data/${name}.json`,import.meta.url)));
const image=new URL('../assets/synthetic-page.png',import.meta.url).pathname;
test.use({launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}});
async function setup(page){
 await page.route('**/api/**',route=>route.fulfill({json:route.request().url().endsWith('/health')?{...fixture('health.initial'),capabilities:{...fixture('health.initial').capabilities,read:true}}:fixture('read.success')}));
 await page.addInitScript(()=>{
  window.cameraStreams=[];window.cameraRequests=[];
  const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async constraints=>{window.cameraRequests.push(constraints);const stream=await original(constraints);window.cameraStreams.push(stream);return stream;};
 });
}
const ended=page=>page.evaluate(()=>cameraStreams.length>0&&cameraStreams.every(stream=>stream.getTracks().every(track=>track.readyState==='ended')));
const button=(page,name)=>page.getByRole('button',{name,exact:true});
for(const width of [390,1440])test(`simulated camera capture, retake and upload at ${width}px`,async({page})=>{
 await setup(page);await page.setViewportSize({width,height:1000});await page.goto('/scan');
 expect(await page.evaluate(()=>cameraRequests.length)).toBe(0);
 await button(page,'Take photo').click();await expect(button(page,'Capture photo')).toBeEnabled();
 const stageBounds=await page.locator('.mb-camera-stage').boundingBox();expect(Math.abs(stageBounds.x+stageBounds.width/2-width/2)).toBeLessThan(2);
 const captureBounds=await button(page,'Capture photo').boundingBox();expect(captureBounds.y+captureBounds.height).toBeLessThanOrEqual(1000);
 expect(await page.evaluate(()=>cameraRequests[0].video.facingMode.ideal)).toBe('environment');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(width===390){const accessibility=await new AxeBuilder({page}).include('[role=dialog]').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(accessibility.violations).toEqual([]);}
 const folder=process.env.MB_CAPTURE_DIR;if(folder){mkdirSync(folder,{recursive:true});await page.screenshot({path:`${folder}/camera-live-${width}.png`});}
 await button(page,'Capture photo').click();await expect(page.getByAltText('Captured textbook page')).toBeVisible();await expect.poll(()=>ended(page)).toBe(true);
 await button(page,'Retake photo').click();await expect(button(page,'Capture photo')).toBeEnabled();expect(await page.evaluate(()=>cameraRequests.length)).toBe(2);
 await button(page,'Capture photo').click();await expect(page.getByAltText('Captured textbook page')).toBeVisible();if(folder)await page.screenshot({path:`${folder}/camera-captured-${width}.png`});
 await button(page,'Use this photo').click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByAltText('Selected textbook page preview')).toBeVisible();await expect.poll(()=>ended(page)).toBe(true);
 const request=page.waitForRequest('**/api/read');await button(page,'Read this page').click();expect((await request).postDataBuffer().includes(Buffer.from('image/jpeg'))).toBe(true);await expect(page.getByRole('heading',{name:'Photosynthesis',level:1})).toBeVisible();
});
test('camera permission, missing camera, insecure and unsupported errors retain gallery recovery',async({page})=>{
 await setup(page);await page.goto('/scan');
 for(const [name,message]of [['NotAllowedError','Camera access was blocked'],['NotFoundError','No camera was found'],['NotReadableError','camera is busy']]){
  await page.evaluate(name=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Synthetic error',name);};},name);
  await button(page,'Take photo').click();await expect(page.getByRole('alert')).toContainText(message);await page.keyboard.press('Escape');await expect(button(page,'Take photo')).toBeFocused();
 }
 await button(page,'Take photo').click();const chooser=page.waitForEvent('filechooser');await button(page,'Upload a photo instead').click();await(await chooser).setFiles(image);await expect(page.getByAltText('Selected textbook page preview')).toBeVisible();
 await page.evaluate(()=>Object.defineProperty(navigator,'mediaDevices',{value:undefined,configurable:true}));await button(page,'Take photo').click();await expect(page.getByRole('alert')).toContainText('not supported');await page.keyboard.press('Escape');
 await page.evaluate(()=>Object.defineProperty(window,'isSecureContext',{value:false,configurable:true}));await button(page,'Take photo').click();await expect(page.getByRole('alert')).toContainText('HTTPS or localhost');
});
test('camera switching releases prior streams and closing releases all tracks',async({page})=>{
 await setup(page);await page.goto('/scan');
 // Device enumeration is controlled; streams come from Chromium synthetic media.
 await page.evaluate(()=>{
  const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.enumerateDevices=async()=>[{kind:'videoinput',deviceId:'rear'},{kind:'videoinput',deviceId:'front'}];
  navigator.mediaDevices.getUserMedia=async constraints=>{const id=constraints.video.deviceId?.exact||'rear';const stream=await original({audio:false,video:true});stream.getVideoTracks().forEach(track=>{track.getSettings=()=>({deviceId:id});});return stream;};
 });
 await button(page,'Take photo').click();await expect(button(page,'Switch camera')).toBeVisible();await button(page,'Switch camera').click();await expect.poll(()=>page.evaluate(()=>cameraStreams.length)).toBe(2);
 expect(await page.evaluate(()=>cameraStreams[0].getTracks().every(track=>track.readyState==='ended'))).toBe(true);await expect(button(page,'Capture photo')).toBeEnabled();await button(page,'Close Capture a textbook page').click();await expect.poll(()=>ended(page)).toBe(true);
});
test('camera late permission and route changes release tracks',async({page})=>{
 await setup(page);await page.goto('/scan');await page.evaluate(()=>{const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=constraints=>new Promise(resolve=>{window.finishCamera=async()=>resolve(await original(constraints));});});
 await button(page,'Take photo').click();await expect(page.getByText('Opening camera… Allow access if your browser asks.',{exact:true})).toBeVisible();await page.keyboard.press('Escape');await page.evaluate(()=>window.finishCamera());await expect.poll(()=>ended(page)).toBe(true);
 await button(page,'Take photo').click();await page.evaluate(()=>window.finishCamera());await expect(button(page,'Capture photo')).toBeEnabled();await page.evaluate(()=>{history.pushState({},'', '/');dispatchEvent(new PopStateEvent('popstate'));});await expect(page.getByRole('heading',{level:1})).toContainText('Every page understood');await expect.poll(()=>ended(page)).toBe(true);
});
