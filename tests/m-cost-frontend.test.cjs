"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const studio=fs.readFileSync("studio.html","utf8");
const budgets=fs.readFileSync("budgets.html","utf8");
const budgetJs=fs.readFileSync("budgets.js","utf8");
const costJs=fs.readFileSync("cost-controls.js","utf8");
const bridge=fs.readFileSync("cloud-bridge.js","utf8");

test("M-COST frontend cost panels compile and make no silent provider requests",()=>{
  assert.doesNotThrow(()=>new vm.Script(costJs));
  assert.doesNotThrow(()=>new vm.Script(budgetJs));
  assert.ok(budgets.includes('id="loadCostReport"'));
  assert.ok(budgets.includes('id="loadCostPrices"'));
  assert.ok(budgets.includes('id="loadCostAlerts"'));
  assert.ok(budgets.includes('id="costApproveForm"'));
  assert.ok(budgets.includes('id="costProjectCapForm"'));
  assert.ok(costJs.includes('addEventListener("click"'));
  assert.ok(costJs.includes('request("/v1/cost/report?period="'));
});

test("Studio explicitly previews costs before running an AI workflow",()=>{
  const extracted=[...studio.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(m=>m[1]).filter(x=>x.trim());
  for(const js of extracted)assert.doesNotThrow(()=>new vm.Script(js));
  assert.match(studio,/id="costDialog"/);
  assert.match(studio,/id="costPreviewBtn"/);
  assert.match(studio,/id="confirmCostRun"/);
  assert.match(studio,/\/v1\/cost\/estimate/);
  assert.match(studio,/graph\.nodes\.some\(n=>n\.type==='ai'\)/);
  assert.match(studio,/body:\{workflow:graph,input:cloudInput,background,\.\.\.runCost\}/);
});

test("Fallback models require explicit IDs and never silently retry a failed provider",()=>{
  assert.match(studio,/id="nodeFallbackModels"/);
  assert.match(studio,/fallbackModels:string\(r\.fallbackModels,400\)/);
  assert.match(bridge,/config\.fallback_model_ids/);
  assert.match(bridge,/fallbackModels: asArray\(n\.config\?\.fallback_model_ids\)/);
});

test("Budget scopes and periods remain selectable",()=>{
  for(const scope of ["global","model","project","workflow","run"])
    assert.ok(budgets.includes('value="'+scope+'"'));
  for(const period of ["lifetime","daily","monthly"])
    assert.ok(budgets.includes('value="'+period+'"'));
  for(const mode of ["monitor","warn","hard","approval"])
    assert.ok(budgets.includes('value="'+mode+'"'));
  assert.match(budgetJs,/period,mode/);
  assert.match(budgetJs,/Window usage is in the on-demand cost report/);
});
