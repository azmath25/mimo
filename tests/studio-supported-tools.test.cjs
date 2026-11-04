"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const bridge=require("../cloud-bridge.js");
const studio=fs.readFileSync("studio.html","utf8");

test("Studio offers only supported TikZ PDF and PNG targets",()=>{
  assert.match(studio,/options\(\['pdf','png'\]/);
  assert.doesNotMatch(studio,/options\(\['pdf','svg','png'\]/);
  assert.match(studio,/SVG unavailable — choose PDF or PNG/);
  assert.match(studio,/Compiler adapter · PDF \/ SVG|Private TeX Live compiler · PDF \/ PNG/);
  assert.match(studio,/Private TeX Live compiler · PDF \/ PNG/);
  assert.doesNotMatch(studio,/Future compiler endpoint<\/label>/);
  assert.doesNotMatch(studio,/Endpoint is saved to JSON but never contacted by this frontend prototype/);
  assert.match(studio,/Only|pdfLaTeX/);
});

test("GitHub Issue connector is not advertised among ordinary tool options",()=>{
  assert.match(studio,/Object\.entries\(TOOLS\)\.filter\(\(\[key\]\)=>key!=='github-issue'\|\|n\.toolKind==='github-issue'\)/);
  assert.match(studio,/if\(n\.toolKind==='github-issue'\)/);
  assert.match(studio,/External connector actions are NOT performed in local Preview/);
  // The permission-controlled backend integration and existing saved nodes are not removed.
  const graph={kind:"mimo/workflow",version:4,name:"Legacy connector",nodes:[
    {id:"input",type:"input"},
    {id:"github",type:"connector",execution:"tool",toolKind:"github-issue",
     connectorInstallation:"github_research",connectorOperation:"read_issue",
     connectorNumber:"12"},
    {id:"out",type:"output"}
  ],edges:[{from:"input",to:"github"},{from:"github",to:"out"}]};
  const compiled=bridge.toBackend(graph,"test",[]);
  const restored=bridge.fromBackend({...compiled,inputs:{}});
  assert.equal(restored.nodes.find(n=>n.id==="github").toolKind,"github-issue");
});

test("Cloud workflows with obsolete SVG remain rejected rather than silently converted",()=>{
  const flow={kind:"mimo/workflow",version:4,name:"old SVG",nodes:[
    {id:"start",type:"input"},
    {id:"diagram",type:"tikz",execution:"tool",toolKind:"tikz",compilerTarget:"svg"},
    {id:"output",type:"output"},
  ],edges:[{from:"start",to:"diagram"},{from:"diagram",to:"output"}]};
  const issues=bridge.runIssues(flow,[],{compiler:{enabled:true}});
  assert.ok(issues.some(x=>/PDF or PNG/.test(x)));
});
