"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {summarize}=require("../ops-diagnostics.js");

const find=(rows,name)=>rows.find(x=>x.name===name);

test("diagnostics do not misreport missing RPM policy as protection",()=>{
 const rows=summarize({capabilities:{compiler:{enabled:false},run_api:{background_configured:true}},
  dispatch:{status:"ok",counts:{exhausted:0},ready_to_dispatch:0},
  rpm:{status:"ok",policy_count:0,totals:{provider_429_last_hour:0},alert_delivery_configured:false},
  parallel:{status:"ok",expired_running_leases:0},
  connectors:{status:"ok",uncertain_outcomes:0},
  budgets:{policies:[{scope:"global"}]},installations:{installations:[]},projects:{projects:[{id:"safe"}]}
 });
 assert.match(find(rows,"Model RPM limits").value,/uncapped by RPM/);
 assert.equal(find(rows,"Model RPM limits").warning,true);
 assert.equal(find(rows,"Spending policies").value,"1 configured");
 assert.equal(find(rows,"Connector installations").warning,true);
 assert.equal(find(rows,"TikZ compiler").warning,true);
 assert.match(find(rows,"Live provider call").value,/Not tested/);
});

test("unavailable optional metrics never become a green check",()=>{
 const rows=summarize({});
 for(const name of ["Dispatch outbox","Model RPM limits","Parallel orchestration",
  "Connector outcomes","Spending policies","API projects"]){
  const row=find(rows,name);
  assert.equal(row.warning,true,name);
  assert.match(row.value,/Unavailable/);
 }
});

test("backend operational warnings are not hidden by a healthy core service",()=>{
 const rows=summarize({dispatch:{status:"critical",counts:{exhausted:2},ready_to_dispatch:4},
  rpm:{status:"warning",policy_count:3,totals:{provider_429_last_hour:7},
    alert_delivery_configured:false},
  parallel:{status:"critical",expired_running_leases:1},
  connectors:{status:"critical",uncertain_outcomes:2},
  budgets:{policies:[{scope:"global"}]},
  installations:{installations:[{id:"fixed"}]},
  projects:{projects:[{id:"one"}]},
  capabilities:{compiler:{enabled:true},run_api:{background_configured:true}}
 });
 assert.match(find(rows,"Dispatch outbox").value,/2 exhausted/);
 assert.equal(find(rows,"Dispatch outbox").warning,true);
 assert.match(find(rows,"Provider 429s (last hour)").value,/7/);
 assert.equal(find(rows,"Parallel orchestration").warning,true);
 assert.equal(find(rows,"Connector outcomes").warning,true);
 assert.equal(find(rows,"TikZ compiler").warning,false);
 assert.match(find(rows,"Background dispatch on this API").value,/still require verification/);
});

test("diagnostics page probes only read-only APIs; not an LLM or recovery operation",()=>{
 const script=fs.readFileSync("diagnostics.js","utf8");
 const html=fs.readFileSync("diagnostics.html","utf8");
 for(const url of ["/v1/metrics/dispatch","/v1/metrics/model-rpm",
  "/v1/metrics/parallel","/v1/metrics/connectors","/v1/budgets",
  "/v1/connectors/installations","/v1/projects"]){
  assert.ok(script.includes(url),url);
 }
 assert.doesNotMatch(script,/method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
 assert.doesNotMatch(script,/\/v1\/models\/[^"'\s]+\/test/);
 assert.match(html,/ops-diagnostics\.js/);
 assert.match(html,/operationsSummary/);
});
