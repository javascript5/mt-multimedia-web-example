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
 return {film:scene?top(scene)+(scene.offsetHeight-stage.offsetHeight)/2:null,about:top(document.querySelector('#about')),partners:top(document.querySelector('#partners'))-48,services:top(document.querySelector('#services'))};
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
  await page.waitForFunction(()=>[...document.querySelectorAll(".statement-line-content")].every(n=>Number(getComputedStyle(n).opacity)>.99),null,{timeout:4000});
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
 for(let i=0;i<15;i++){await page.waitForTimeout(35);await page.mouse.wheel(0,20);}
 await page.waitForTimeout(150);
 assert.ok(Math.abs(await page.evaluate(()=>scrollY)-t.film)<2);
 await page.waitForTimeout(300);await wheel(page,50);
 assert.ok(Math.abs(await page.evaluate(()=>scrollY)-t.about)<2);await page.close();
});
test('services retain consecutive native wheel events and keyboard can interrupt',async()=>{
 const {page}=await open();const t=await targets(page);
 await page.evaluate(y=>scrollTo({top:y+10,behavior:'instant'}),t.services);
 const start=await page.evaluate(()=>scrollY);
 await page.mouse.wheel(0,60);await page.waitForTimeout(60);await page.mouse.wheel(0,60);await page.waitForTimeout(300);
 assert.ok(Math.abs(await page.evaluate(()=>scrollY)-start-120)<2);
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

test('small swipes respond and a second swipe can continue before the first finishes',async()=>{
 const {page}=await open();const t=await targets(page);
 await page.mouse.wheel(0,1);await page.waitForTimeout(100);
 assert.ok(await page.evaluate(()=>scrollY)>10,'a light swipe starts moving immediately');
 await page.waitForTimeout(30);await page.mouse.wheel(0,2);await page.waitForTimeout(1000);
 assert.ok(Math.abs(await page.evaluate(()=>scrollY)-t.about)<2,'a second swipe is not swallowed');
 await page.close();
});
test('repeated wheel notches and renewed trackpad input are not locked by old momentum',async()=>{
 const {page}=await open();const t=await targets(page);
 await page.mouse.wheel(0,100);
 for(let i=0;i<8;i++){await page.waitForTimeout(45);await page.mouse.wheel(0,100);}
 await page.waitForTimeout(1100);
 assert.ok(await page.evaluate(()=>scrollY)>=t.about-2,'held wheel input continues after reaching video');
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(150);
 await page.mouse.wheel(0,15);
 for(let i=0;i<10;i++){await page.waitForTimeout(35);await page.mouse.wheel(0,1);}
 await page.mouse.wheel(0,20);await page.waitForTimeout(1000);
 assert.ok(Math.abs(await page.evaluate(()=>scrollY)-t.about)<2,'a renewed push during the tail advances');
 await page.close();
});

test('visual travel stays slow while the next gesture is accepted before arrival',async()=>{
 const {page}=await open();const t=await targets(page);
 await page.mouse.wheel(0,100);await page.waitForTimeout(250);
 const middle=await page.evaluate(()=>scrollY);
 assert.ok(middle>t.film*.1&&middle<t.film*.7,'the slower journey is still underway');
 await page.waitForTimeout(250);await page.mouse.wheel(0,100);
 await page.waitForFunction(y=>Math.abs(scrollY-y)<2,t.about,{timeout:2500});
 await page.close();
});

test('video slightly overlaps the hero without covering its CTA across viewports',async()=>{
 const {page,errors}=await open();
 for(const reducedMotion of ['no-preference','reduce']){
  await page.emulateMedia({reducedMotion});
  for(const viewport of [{width:1920,height:1440},{width:1440,height:1000},{width:1024,height:768},{width:701,height:600},{width:390,height:844},{width:320,height:640}]){
   await page.setViewportSize(viewport);await page.goto(process.env.MT_TEST_URL||'http://127.0.0.1:4173/');
   await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(2100);
   const button=await page.locator('.hero-content>.button').boundingBox();
   const film=await page.locator('.film').boundingBox();
   const hero=await page.locator('.hero').boundingBox();
   const overlap=hero.y+hero.height-film.y;
   assert.ok(overlap>=31&&overlap<=65,`slight overlap: ${overlap}`);
   assert.ok(film.y>=button.y+button.height+32,JSON.stringify({viewport,reducedMotion,button,film}));
   const clickable=await page.locator('.hero-content>.button').evaluate(n=>{
    const r=n.getBoundingClientRect();return r.top<innerHeight && n.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));
   });
   if(button.y+button.height<viewport.height)assert.ok(clickable,'video does not cover the CTA hit area');
  }
 }
 assert.deepEqual(errors,[]);await page.close();
});

for(const width of [1440,390]){
 test(`who we are reveals lines gradually after a section jump (${width})`,async()=>{
  const {page,errors}=await open({viewport:{width,height:1000}});const t=await targets(page);
  await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),t.about);
  await page.waitForTimeout(500);
  const opacity=await page.locator('.statement-line-content').evaluateAll(ns=>ns.map(n=>Number(getComputedStyle(n).opacity)));
  assert.ok(opacity[0]>.4&&opacity.at(-1)<.1,'the first line appears before the final line');
  await page.waitForFunction(()=>[...document.querySelectorAll('.statement-line-content')].every(n=>Number(getComputedStyle(n).opacity)>.99),null,{timeout:4000});
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(400);
  assert.ok((await page.locator('.statement-line-content').evaluateAll(ns=>ns.map(n=>Number(getComputedStyle(n).opacity)))).every(n=>n<.01),'lines reset when scrolling above the section');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>!document.querySelector('.statement-line'));
  assert.ok((await page.locator('.statement').textContent()).includes('infrastructure funds.'));
  assert.deepEqual(errors,[]);await page.close();
 });
}
