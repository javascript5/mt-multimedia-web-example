const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.MT_PLAYWRIGHT_PATH||'playwright');
let browser;
before(async()=>browser=await chromium.launch({headless:true,channel:'chrome'}));
after(async()=>browser?.close());
async function open(options={}){
 const page=await browser.newPage({viewport:{width:1440,height:1000},...options});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.MT_TEST_URL||'http://127.0.0.1:4173/');
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForTimeout(200);
 await page.mouse.move(5,300);
 return {page,errors};
}
async function wheel(page,delta){await page.mouse.wheel(0,delta);await page.waitForTimeout(1200);}
async function targets(page){return page.evaluate(()=>{
 const scene=document.querySelector('.film-scroll'),stage=document.querySelector('.film-stage');
 const top=n=>scrollY+n.getBoundingClientRect().top;
 return {film:scene?top(scene)+(scene.offsetHeight-stage.offsetHeight)/2:null,about:top(document.querySelector('.standards-content'))-48,partners:top(document.querySelector('#partners'))-48,services:top(document.querySelector('#services'))-48};
});}
for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 test(`one gesture each: hero, full-screen video, who we are, reverse (${viewport.width})`,async()=>{
  const {page,errors}=await open({viewport});const t=await targets(page);
  await wheel(page,100);
  assert.ok(Math.abs(await page.evaluate(()=>scrollY)-t.film)<2);
  const film=await page.locator('.film').boundingBox();
  assert.ok(Math.abs(film.width-viewport.width)<2&&Math.abs(film.height-viewport.height)<2);
  await wheel(page,100);
  assert.ok(Math.abs(await page.evaluate(()=>scrollY)-t.about)<2);
  assert.equal(await page.locator('#standards-title').isVisible(),true);
  assert.ok((await page.locator('.statement-line-content').evaluateAll(ns=>ns.map(n=>Number(getComputedStyle(n).opacity)))).every(n=>n>.99));
  await wheel(page,100);assert.ok(Math.abs(await page.evaluate(()=>scrollY)-t.partners)<2);
  await wheel(page,100);assert.ok(Math.abs(await page.evaluate(()=>scrollY)-t.services)<2);
  await wheel(page,-100);assert.ok(Math.abs(await page.evaluate(()=>scrollY)-t.partners)<2);
  await wheel(page,-100);assert.ok(Math.abs(await page.evaluate(()=>scrollY)-t.about)<2);
  await wheel(page,-100);assert.ok(Math.abs(await page.evaluate(()=>scrollY)-t.film)<2);
  await wheel(page,-100);assert.equal(await page.evaluate(()=>scrollY),0);
  assert.deepEqual(errors,[]);await page.close();
 });
}
test('trackpad momentum cannot advance two sections, even after arrival',async()=>{
 const {page}=await open();const t=await targets(page);
 await page.mouse.wheel(0,40);
 for(let i=0;i<15;i++){await page.waitForTimeout(80);await page.mouse.wheel(0,20);}
 await page.waitForTimeout(150);
 assert.ok(Math.abs(await page.evaluate(()=>scrollY)-t.film)<2);
 await page.waitForTimeout(300);await wheel(page,50);
 assert.ok(Math.abs(await page.evaluate(()=>scrollY)-t.about)<2);await page.close();
});
test('services retain consecutive native wheel events and keyboard can interrupt',async()=>{
 const {page}=await open();const t=await targets(page);
 await page.evaluate(y=>scrollTo({top:y+100,behavior:'instant'}),t.services);
 const start=await page.evaluate(()=>scrollY);
 await page.mouse.wheel(0,100);await page.waitForTimeout(60);await page.mouse.wheel(0,100);await page.waitForTimeout(300);
 assert.ok(Math.abs(await page.evaluate(()=>scrollY)-start-200)<2);
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(300);
 await page.mouse.wheel(0,100);await page.waitForTimeout(140);await page.keyboard.press('Escape');await page.waitForTimeout(40);
 const stopped=await page.evaluate(()=>scrollY);await page.waitForTimeout(1000);
 assert.equal(await page.evaluate(()=>scrollY),stopped);await page.close();
});
test('reduced motion changes sections immediately, zoom and horizontal wheels remain native',async()=>{
 const {page,errors}=await open({reducedMotion:'reduce'});
 await page.evaluate(()=>{
  for(const options of [{deltaY:200,ctrlKey:true},{deltaY:20,deltaX:100}]){
   const event=new WheelEvent('wheel',{...options,bubbles:true,cancelable:true});
   document.body.dispatchEvent(event);if(event.defaultPrevented)throw Error('Native gesture intercepted');
  }
 });
 await wheel(page,100);
 assert.ok(await page.evaluate(()=>scrollY)>100);
 assert.deepEqual(errors,[]);await page.close();
});
