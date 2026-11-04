"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("runs.js","utf8");
function boot(){
 const el=new Map(),requests=[],timers=new Map();let timerCount=0;
 function $(id){
  if(!el.has(id))el.set(id,{
   value:"",textContent:"",innerHTML:"",disabled:false,checked:false,
   handlers:{},addEventListener(name,fn){this.handlers[name]=fn}
  });
  return el.get(id);
 }
 const context={
  $,Date,Set,Number,String,JSON,encodeURIComponent,URLSearchParams,
  safe:x=>String(x??"").replaceAll("<","&lt;").replaceAll(">","&gt;"),
  setInterval(fn,ms){assert.equal(ms,15000);const id=++timerCount;timers.set(id,fn);return id},
  clearInterval(id){timers.delete(id)},
  MimoSite:{safe:x=>String(x??"").replaceAll("<","&lt;").replaceAll(">","&gt;"),
   date:x=>String(x||""),requireCloud:()=>true,notice:()=>{}},
  document:{hidden:false},
  window:{addEventListener:()=>{}},
  history:{replaceState:()=>{}},
  api:(path)=>new Promise((resolve,reject)=>requests.push({path,resolve,reject})),
  confirm:()=>true
 };
 const from=source.indexOf("let runs=[]");
 const to=source.indexOf("async function download(",from);
 assert.ok(from>0&&to>from);
 vm.runInNewContext(source.slice(from,to)+"\nthis.subject={choose,loadMoreEvents,startFollow,stopFollow};",
  context,{filename:"runs.js"});
 const fixture=(id,events,status="running")=>({run:{id,workflow_id:"demo",version:1,status},
  events,checkpoints:[],node_tasks:[]});
 return {$,requests,timers,context,fixture,...context.subject};
}
test("200-event timeline is paginated and next event page uses strict cursor",async()=>{
 const h=boot();
 const selection=h.choose("run-1");
 const events=Array.from({length:200},(_,i)=>({seq:i+1,type:"node.output.delta",created_at:"2026-11-04"}));
 h.requests[0].resolve(h.fixture("run-1",events));await selection;
 assert.equal(h.$("loadMoreEvents").disabled,false);
 assert.equal(h.$("eventCount").textContent,"200 events loaded · more may be available");
 const next=h.loadMoreEvents();
 assert.match(h.requests[1].path,/timeline\?after=200&limit=200$/);
 h.requests[1].resolve(h.fixture("run-1",[{seq:201,type:"run.completed",created_at:"2026-11-04"}],"completed"));
 await next;
 assert.match(h.$("eventCount").textContent,/201 events loaded/);
 assert.equal(h.$("loadMoreEvents").disabled,true);
 assert.match(h.$("eventList").innerHTML,/#201/);
});
test("old event page response cannot modify newly selected run",async()=>{
 const h=boot();
 const first=h.choose("a");
 h.requests[0].resolve(h.fixture("a",Array.from({length:200},(_,i)=>({seq:i+1,type:"x"}))));
 await first;
 const more=h.loadMoreEvents();
 const change=h.choose("b");
 h.requests[2].resolve(h.fixture("b",[{seq:1,type:"b-only"}]));
 await change;
 h.requests[1].resolve(h.fixture("a",[{seq:201,type:"bad-old-response"}]));
 await more;
 assert.match(h.$("eventList").innerHTML,/b-only/);
 assert.doesNotMatch(h.$("eventList").innerHTML,/bad-old-response/);
});
test("following does only GET status polling and stops at terminal without provider calls",async()=>{
 const h=boot();
 const first=h.choose("a");
 h.requests[0].resolve(h.fixture("a",[{seq:1,type:"started"}]));
 await first;
 h.$("followRun").checked=true;h.startFollow();
 assert.equal(h.timers.size,1);
 const tick=[...h.timers.values()][0];
 const process=tick();
 assert.equal(h.requests[1].path,"/v1/runs/a");
 h.requests[1].resolve({id:"a",status:"completed"});
 await Promise.resolve();await Promise.resolve();
 if(h.requests[2]){
  h.requests[2].resolve(h.fixture("a",[{seq:1,type:"run.completed"}],"completed"));
 }
 await process;
 assert.equal(h.$("followRun").checked,false);
 assert.equal(h.timers.size,0);
 assert.equal(h.requests.every(x=>!/(\/execute|\/process|\/recover-node|\/models\/.*\/test)/.test(x.path)),true);
});
test("hidden tabs do not poll and following is explicitly opt in",async()=>{
 const h=boot();
 const first=h.choose("a");h.requests[0].resolve(h.fixture("a",[{seq:1,type:"started"}]));await first;
 assert.equal(h.timers.size,0);
 h.$("followRun").checked=true;h.startFollow();h.context.document.hidden=true;
 await [...h.timers.values()][0]();
 assert.equal(h.requests.length,1);
 h.stopFollow();
 assert.equal(h.timers.size,0);
});
