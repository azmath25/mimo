const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const runsSource = fs.readFileSync("runs.js", "utf8");
const siteSource = fs.readFileSync("site.js", "utf8");
const siteCSS = fs.readFileSync("site.css", "utf8");
const studioCSS = fs.readFileSync("studio-polish.css", "utf8");

function runsHarness() {
  const ids = new Map();
  const sent = [];
  const history = [];
  const notices = [];
  const $ = id => {
    if (!ids.has(id)) ids.set(id, {
      value:"", disabled:false, innerHTML:"", textContent:"",
    });
    return ids.get(id);
  };
  const context = {
    $, safe:v=>String(v??""), Date, JSON, URLSearchParams, encodeURIComponent,
    MimoSite:{
      date:x=>x||"—",
      notice:(id,text,error=false)=>{notices.push({id,text,error});$(id).textContent=text}
    },
    history:{replaceState:(a,b,c)=>history.push(c)},
    api:(path,options)=>new Promise((resolve,reject)=>sent.push({path,options,resolve,reject})),
  };
  const from = runsSource.indexOf("let runs=[]");
  const to = runsSource.indexOf("async function action(command)",from);
  assert.ok(from > 0 && to > from, "Run inspector selection functions still exist");
  vm.runInNewContext(
    runsSource.slice(from,to)+
      "\nthis.subject = {choose,list,get selected(){return selected}};",
    context,{filename:"runs.js"}
  );
  return {subject:context.subject,$,sent,history,notices};
}
const record = (id,status="completed")=>({
  id,workflow_id:"mimo_math",version:1,status,created_at:"2026-11-03T12:00:00Z",
});

test("M-FE.3 run selection ignores slower earlier completion", async()=>{
  const h=runsHarness();
  const first=h.subject.choose("run-a");
  assert.equal(h.$("runCancel").disabled,true);
  assert.equal(h.$("runResume").disabled,true);
  const second=h.subject.choose("run-b");
  h.sent[1].resolve({run:record("run-b","running"),node_tasks:[],checkpoints:[],events:[]});
  await second;
  assert.match(h.$("runMeta").textContent,/run-b/);
  assert.equal(h.$("runCancel").disabled,false);
  const count=h.history.length;
  h.sent[0].resolve({run:record("run-a","completed"),node_tasks:[],checkpoints:[],events:[]});
  await first;
  assert.match(h.$("runMeta").textContent,/run-b/);
  assert.equal(h.subject.selected,"run-b");
  assert.equal(h.history.length,count,"outdated results must not change the URL");
  assert.doesNotMatch(h.$("runMeta").textContent,/run-a/);
});

test("M-FE.3 a stale run error never hides a newer selected run", async()=>{
  const h=runsHarness();
  const old=h.subject.choose("a");
  const newer=h.subject.choose("b");
  h.sent[1].resolve({run:record("b"),node_tasks:[],checkpoints:[],events:[]});
  await newer;
  h.sent[0].reject(new Error("stale 503"));
  await old;
  assert.match(h.$("runMeta").textContent,/b/);
  assert.doesNotMatch(h.$("runsFeedback").textContent,/stale 503/);
  assert.equal(h.subject.selected,"b");
});

test("M-FE.3 refreshing filters discards outdated list responses", async()=>{
  const h=runsHarness();
  h.$("runWorkflowFilter").value="old";
  const older=h.subject.list();
  assert.match(h.sent[0].path,/workflow_id=old/);
  h.$("runWorkflowFilter").value="new";
  const newer=h.subject.list();
  assert.match(h.sent[1].path,/workflow_id=new/);
  h.sent[1].resolve({runs:[record("new-run")]});
  await newer;
  assert.match(h.$("runsList").innerHTML,/new-run/);
  h.sent[0].resolve({runs:[record("old-run")]});
  await older;
  assert.match(h.$("runsList").innerHTML,/new-run/);
  assert.doesNotMatch(h.$("runsList").innerHTML,/old-run/);
  assert.equal(h.$("loadMoreRuns").disabled,true);
});

test("M-FE.3 stale rejected list requests cannot overwrite a refreshed list",async()=>{
  const h=runsHarness();
  const older=h.subject.list();
  const latest=h.subject.list();
  h.sent[1].resolve({runs:[record("new-run")]});
  await latest;
  h.sent[0].reject(new Error("unrelated stale outage"));
  await older;
  assert.match(h.$("runsList").innerHTML,/new-run/);
  assert.doesNotMatch(h.$("runsFeedback").textContent,/stale outage/);
});

test("M-FE.3 pagination does not overlap a pending request", async()=>{
  const h=runsHarness();
  const first=h.subject.list();
  await h.subject.list(false);
  assert.equal(h.sent.length,1);
  h.sent[0].resolve({runs:[record("only-one")]});
  await first;
  assert.equal(h.$("loadMoreRuns").disabled,true);
});

function element(tag) {
  return {
    tag,children:[],attributes:{},innerHTML:"",id:"",
    setAttribute(name,value){this.attributes[name]=value},
    append(...values){this.children.push(...values)}
  };
}
test("M-FE.3 shared site shell adds a keyboard skip-to-main link",()=>{
  const main=element("main");
  const body={children:[],prepend(node){this.children.unshift(node)}};
  const document={
    body,
    createElement:tag=>element(tag),
    querySelector:selector=>selector==="main"?main:null,
    getElementById:id=>id==="cloudGate"?{}:null
  };
  const window={};
  vm.runInNewContext(siteSource,{document,window},{filename:"site.js"});
  assert.equal(main.id,"mimo-main");
  assert.equal(main.attributes.tabindex,"-1");
  assert.equal(body.children[0].tag,"a");
  assert.equal(body.children[0].className,"mimo-skip-link");
  assert.equal(body.children[0].href,"#mimo-main");
  assert.match(body.children[0].textContent,/Skip to main content/);
  const nav=body.children[1];
  assert.equal(nav.tag,"nav");
  assert.equal(nav.attributes["aria-label"],"Main navigation");
});

test("M-FE.3 small screen controls and dialog remain accessible in source CSS",()=>{
  assert.match(siteCSS,/\.mimo-skip-link:focus-visible\s*\{[^}]*transform:none/);
  assert.match(siteCSS,/\.cloud-gate\s*\{overflow-y:auto;align-items:safe center\}/);
  assert.match(siteCSS,/\.cloud-card\s*\{max-height:calc\(100dvh - 36px\);overflow-y:auto/);
  assert.match(siteCSS,/@media\(max-width:480px\)/);
  assert.match(siteCSS,/\.mg-row-actions \.mg-btn,\.mg-actions \.mg-btn\s*\{min-height:44px\}/);
  assert.match(siteCSS,/\.cloud-card input\s*\{[^}]*font-size:16px/s);
  assert.match(studioCSS,/@media \(max-width:640px\)\s*\{[^]*?height:112px;min-height:112px/);
  assert.match(studioCSS,/#runButton\s*\{order:-2;min-height:40px\}/);
  assert.match(studioCSS,/#saveFlow\s*\{order:-1;min-height:40px\}/);
  assert.match(studioCSS,/height:calc\(100dvh - 165px\)/);
  assert.match(studioCSS,/overflow-x:auto;overflow-y:hidden/);
});
