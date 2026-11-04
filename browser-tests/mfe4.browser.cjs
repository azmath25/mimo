/* M-FE.4: REAL headless Chromium against a LOCAL static fixture only.
 * No Firebase login, external APIs, provider requests, or live cloud.
 * This exercises the actual unchanged Studio HTML/CSS and shared page shell.
 */
"use strict";
const {test,before,after} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {execFileSync} = require("node:child_process");
const {chromium} = require("playwright-core");

const root = path.resolve(__dirname,"..");
const output = path.join(root,"test-artifacts","mfe4");
let server,browser,origin;
const MIME = {".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",".json":"application/json"};

function chromeBinary() {
  if (process.env.MIMO_TEST_CHROME)
    return process.env.MIMO_TEST_CHROME;
  for (const name of ["google-chrome","google-chrome-stable","chromium","chromium-browser"]) {
    try {return execFileSync("which",[name],{encoding:"utf8"}).trim()} catch{}
  }
  throw new Error("M-FE.4 browser tests REQUIRE an installed Chromium/Chrome binary");
}
before(async()=>{
  fs.mkdirSync(output,{recursive:true});
  server = http.createServer((req,res)=>{
    let file;
    try {
      const url = new URL(req.url,"http://localhost");
      const pathname = decodeURIComponent(url.pathname);
      file = path.resolve(root,"."+pathname);
      if (file !== root && !file.startsWith(root+path.sep)) throw Error("outside fixture");
      if (pathname.endsWith("/")) file=path.join(file,"index.html");
      const data=fs.readFileSync(file);
      res.writeHead(200,{"Content-Type":MIME[path.extname(file)]||"application/octet-stream",
        "Cache-Control":"no-store"});
      res.end(data);
    } catch {
      res.writeHead(404,{"Content-Type":"text/plain"});res.end("not found");
    }
  });
  await new Promise((resolve,reject)=>server.once("error",reject)
    .listen(0,"127.0.0.1",resolve));
  origin="http://127.0.0.1:"+server.address().port;
  browser=await chromium.launch({executablePath:chromeBinary(),headless:true,
    args:["--no-sandbox","--disable-dev-shm-usage"]});
});
after(async()=>{
  await browser?.close();
  if(server) await new Promise(resolve=>server.close(resolve));
});

async function fixture(file,width=390,height=800){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,
    reducedMotion:"reduce",serviceWorkers:"block"});
  const blocked=[];
  await context.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(url.hostname==="127.0.0.1" && url.port===String(server.address().port))
      return route.continue();
    blocked.push(url.origin);
    return route.abort();
  });
  const page=await context.newPage();
  const response=await page.goto(origin+"/"+file,{waitUntil:"domcontentloaded"});
  assert.equal(response?.status(),200,file+" must be served locally");
  await page.locator(".mimo-global-nav").waitFor();
  return {page,context,blocked};
}
async function close(ctx){await ctx.context.close()}
function bounds(el){return el.boundingBox()}
function horizontalViewportOk(v,width,name){
  assert.ok(v.scrollWidth<=width+2,
    name+" causes document-level horizontal overflow: "+v.scrollWidth+" > "+width);
}

for(const width of [320,360,390,768]){
  test("local Chromium "+width+"px: management pages remain reachable",async()=>{
    for(const file of ["index.html","runs.html","access.html"]){
      const app=await fixture(file,width);
      try {
        assert.equal(await app.page.locator("main").count(),1);
        const shape=await app.page.evaluate(()=>({
          scrollWidth:document.documentElement.scrollWidth,
          skip:document.querySelector(".mimo-skip-link")?.getAttribute("href"),
          navOverflow:document.querySelector(".mimo-links")?.scrollWidth||0,
          navViewport:document.querySelector(".mimo-links")?.clientWidth||0,
          mainWidth:document.querySelector("main")?.getBoundingClientRect().width
        }));
        horizontalViewportOk(shape,width,file+" / "+width);
        assert.equal(shape.skip,"#mimo-main");
        assert.ok(shape.mainWidth>=width*.8);
        assert.equal(app.blocked.some(x=>x.endsWith(".run.app")),false,
          "Local UI must never contact a production/staging Cloud Run host");
        if(width===390){
          await app.page.screenshot({path:path.join(output,file.replace(".html","")+"-390.png")});
        }
      } finally {await close(app)}
    }
  });
}
test("local Chromium: skip link appears on Tab, Enter reaches main landmark",async()=>{
  const app=await fixture("index.html",390);
  try {
    await app.page.keyboard.press("Tab");
    const skip=app.page.locator(".mimo-skip-link");
    assert.equal(await skip.evaluate(el=>document.activeElement===el),true);
    const b=await bounds(skip);
    assert.ok(b && b.y>=0 && b.y<50,"skip link should be visible when focused");
    await app.page.keyboard.press("Enter");
    assert.equal(await app.page.evaluate(()=>document.activeElement.id),"mimo-main");
    assert.equal(await app.page.locator('nav[aria-label="Main navigation"]').count(),1);
  } finally {await close(app)}
});
for(const width of [320,360,390,1280]){
  test("local Chromium "+width+"px: Studio keeps block canvas and reachable Run/Save",async()=>{
    const app=await fixture("studio.html",width,800);
    try {
      const p=app.page;
      for(const id of ["library","inspector","runButton","saveFlow","toggleInspector",
        "toggleLibrary","workflowTitle","backgroundRun"]){
        assert.equal(await p.locator("#"+id).count(),1,
          "Studio control "+id+" must not be removed/duplicated");
      }
      const shape=await p.evaluate(()=>({
        scrollWidth:document.documentElement.scrollWidth,
        topbarHeight:document.querySelector(".topbar").getBoundingClientRect().height,
        run:(()=>{const r=document.querySelector("#runButton").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})(),
        save:(()=>{const r=document.querySelector("#saveFlow").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})(),
        canvasHeight:document.querySelector(".app").getBoundingClientRect().height,
        viewport:innerWidth,
        workspaceVisible:!!document.querySelector(".workspace")
      }));
      horizontalViewportOk(shape,width,"Studio "+width);
      assert.ok(shape.workspaceVisible&&shape.canvasHeight>180,
        "Canvas must retain meaningful space");
      assert.ok(shape.run.width>30&&shape.save.width>30);
      if(width<=390){
        assert.equal(Math.round(shape.topbarHeight),112);
        for (const [label,button] of [["Run",shape.run],["Save",shape.save]]){
          assert.ok(button.x>=0 && button.x+button.width<=width+1,
            label+" must be accessible without horizontal scrolling");
          assert.ok(button.y>=0&&button.y+button.height<=180,
            label+" must be in the visible toolbar");
        }
      } else if(width===1280) {
        assert.equal(Math.round(shape.topbarHeight),60,
          "Desktop Studio must preserve its original 60px toolbar");
      }
      assert.equal(app.blocked.some(x=>x.endsWith(".run.app")),false);
      await p.screenshot({path:path.join(output,"studio-"+width+".png")});
    } finally {await close(app)}
  });
}
test("local Chromium: mobile Studio inspector still opens and closes inside viewport",async()=>{
  const app=await fixture("studio.html",390,800);
  try{
    const p=app.page;
    const inspector=p.locator("#inspector");
    const toggle=p.locator("#toggleInspector");
    assert.equal(await toggle.getAttribute("aria-expanded"),"false");
    await toggle.click();
    await p.waitForFunction(()=>document.querySelector("#inspector").classList.contains("open"));
    const b=await inspector.boundingBox();
    assert.ok(b&&b.x>=0&&b.x+b.width<=391,
      "Open inspector must fit viewport without horizontal page scroll");
    assert.equal(await toggle.getAttribute("aria-expanded"),"true");
    assert.ok((await p.locator("#inspector .inspector-tabs").count())>0);
    await p.screenshot({path:path.join(output,"studio-mobile-inspector-open.png")});
    await toggle.click();
    await p.waitForFunction(()=>!document.querySelector("#inspector").classList.contains("open"));
    assert.equal(await toggle.getAttribute("aria-expanded"),"false");
    const scroll=await p.evaluate(()=>document.documentElement.scrollWidth);
    assert.ok(scroll<=391, "Closed inspector must not extend document");
    assert.equal(app.blocked.some(x=>x.endsWith(".run.app")),false);
  }finally{await close(app)}
});
test("local Chromium: Runs errors remain visible to assistive technology",async()=>{
  const app=await fixture("runs.html",390);
  try {
    await app.page.evaluate(()=>{
      window.MimoCloud={
        authorized:true,
        request:async()=>{throw Error("Local simulated backend failure — no network sent")}
      };
      window.dispatchEvent(new Event("mimo:auth-changed"));
    });
    await app.page.waitForFunction(()=>
      document.querySelector("#runsFeedback")?.textContent.includes("Local simulated backend failure"));
    assert.equal(await app.page.locator('#runsFeedback[role="status"][aria-live="polite"]').count(),1);
    assert.equal(await app.page.locator("#runCancel").isDisabled(),true);
    assert.equal(app.blocked.some(x=>x.endsWith(".run.app")),false);
  } finally {await close(app)}
});

for (const width of [1280]) {
  test("local desktop Chromium " + width + "px: Run options visible and fail closed",async()=>{
    const app=await fixture("studio.html",width,800);
    try {
      const p=app.page;
      const toggle=p.locator("#mimoRunOptions > summary");
      await toggle.waitFor();
      assert.equal(await toggle.isVisible(),true);
      await toggle.click();
      const panel=p.locator(".mimo-run-options-panel");
      assert.equal(await panel.isVisible(),true);
      const box=await panel.boundingBox();
      assert.ok(box&&box.x>=0&&box.x+box.width<=width+2,
        "Run options panel must remain within the viewport at width "+width);
      assert.equal(await p.locator('input[name="mimoExecutionMode"][value="standard"]').isChecked(),true);
      assert.equal(await p.locator('input[name="mimoExecutionMode"][value="background"]').isDisabled(),true);
      assert.equal(await p.locator('input[name="mimoExecutionMode"][value="parallel"]').isDisabled(),true);
      assert.equal(await p.locator("#exportsDialog").isHidden(),true,
        "Opening Run options must not leave API exports modal visible");
      await p.screenshot({path:path.join(output,"studio-run-options-"+width+".png")});
      assert.equal(app.blocked.some(x=>x.endsWith(".run.app")),false);
    } finally {await close(app)}
  });
}
test("local Chromium: selecting background and parallel uses the original workflow state",async()=>{
  const app=await fixture("studio.html",1280,800);
  try {
    const p=app.page;
    await p.locator("#mimoRunOptions > summary").waitFor();
    await p.evaluate(()=>{
      window.MimoCloud={
        authorized:true,user:{uid:"local-fixture"},
        request:async path=>path==="/v1/capabilities" ?
          {run_api:{background_configured:true,parallel_nodes:true}} :
          path==="/v1/models" ? [] : {workflows:[]}
      };
      window.dispatchEvent(new Event("mimo:auth-changed"));
    });
    await p.locator("#mimoRunOptions > summary").click();
    await p.waitForFunction(()=>!document.querySelector('input[name="mimoExecutionMode"][value="parallel"]').disabled);
    await p.locator('input[name="mimoExecutionMode"][value="parallel"]').check();
    assert.equal(await p.locator("#parallelExecutionEnabled").isChecked(),true);
    assert.equal(await p.locator("#backgroundRun").isChecked(),true);
    assert.equal(await p.locator("#exportsDialog").isHidden(),true);
    assert.equal(await p.locator(".mimo-run-mode-label").textContent(),"Parallel");
    await p.locator('input[name="mimoExecutionMode"][value="background"]').check();
    assert.equal(await p.locator("#parallelExecutionEnabled").isChecked(),false);
    assert.equal(await p.locator("#backgroundRun").isChecked(),true);
    await p.locator('input[name="mimoExecutionMode"][value="standard"]').check();
    assert.equal(await p.locator("#parallelExecutionEnabled").isChecked(),false);
    assert.equal(await p.locator("#backgroundRun").isChecked(),false);
    assert.equal(await p.locator("#exportsDialog").isHidden(),true);
    assert.equal(app.blocked.some(x=>x.endsWith(".run.app")),false);
  } finally {await close(app)}
});
