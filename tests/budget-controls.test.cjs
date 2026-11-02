const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

test("budgets dashboard loads scoped policies and outstanding holds", async () => {
  const calls = [];
  const controls = new Map();
  function element(id){
    if(!controls.has(id))controls.set(id,{
      id, innerHTML:"", textContent:"", value:"", hidden:false, disabled:false,
      listeners:{}, addEventListener(type,fn){this.listeners[type]=fn},
    });
    return controls.get(id);
  }
  const payloads = {
    "/v1/budgets": {policies:[{scope:"project",scope_id:"client",hard_usd:2,soft_usd:1}]},
    "/v1/usage/dashboard": {by_model:[{model_id:"test",total_usd:"0.250",calls:1}],
      by_project:[{project_id:"client",total_usd:"0.250",calls:1}]},
    "/v1/models": [{id:"test",display_name:"Test model"}],
    "/v1/usage": {calls:[]},
    "/v1/projects": {projects:[{id:"client",name:"Client app"}]},
    "/v1/budgets/reservations": {reservation_count:1,total_reserved_usd:"0.005",
      items:[{id:"hold",model_id:"test",project_id:"client",node_id:"ai",
        status:"uncertain",amount_usd:"0.005",created_at:"2026-11-02T09:00:00Z"}]},
  };
  const MimoSite = {
    requireCloud:()=>true,
    api:async(path,opts)=>{calls.push([path,opts]);return payloads[path]||{ok:true}},
    currency:x=>"$"+Number(x).toFixed(4),
    date:x=>String(x),
    safe:x=>String(x).replaceAll("<","&lt;"),
    notice:(id,msg)=>element(id).textContent=msg,
    whenReady:()=>{},
  };
  const context = {MimoSite, document:{getElementById:element},
    window:{},Number,Promise};
  vm.runInNewContext(fs.readFileSync("budgets.js","utf8"),context);
  await element("refreshBudgets").listeners.click();
  assert.ok(calls.some(([path])=>path==="/v1/budgets/reservations"));
  assert.match(element("reservationSummary").textContent,/1 pending\/uncertain/);
  assert.match(element("budgetReservations").innerHTML,/uncertain/);
  assert.match(element("budgetReservations").innerHTML,/client/);
  assert.match(element("policyList").innerHTML,/Project: client/);
  element("budgetScope").value="project";
  element("budgetProject").value="client";
  element("budgetHard").value="0";
  element("budgetSoft").value="0";
  await element("budgetForm").listeners.submit({preventDefault(){}});
  const saved=calls.find(([path,opts])=>path==="/v1/budgets"&&opts?.method==="POST");
  assert.ok(saved);
  assert.equal(saved[1].body.scope,"project");
  assert.equal(saved[1].body.scope_id,"client");
  assert.equal(saved[1].body.hard_usd,0);
});

test("budgets page discloses estimate limitations and provides hold status",()=>{
  const html=fs.readFileSync("budgets.html","utf8");
  assert.match(html,/budgetReservations/);
  assert.match(html,/provider bills may exceed estimates/i);
  assert.match(html,/budgetProject/);
  assert.match(html,/min="0" step="0.01"/);
});
