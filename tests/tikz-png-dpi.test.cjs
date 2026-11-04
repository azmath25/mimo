const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const bridge = require("../cloud-bridge.js");

function workflow(dpi) {
  return {
    kind:"mimo/workflow",version:4,name:"PNG DPI control",
    nodes:[{id:"in",type:"input"},
      {id:"drawing",type:"tikz",execution:"tool",toolKind:"tikz",
       toolEngine:"pdflatex",compilerTarget:"png",
       ...(dpi===undefined?{}:{compilerDpi:dpi})},
      {id:"out",type:"output"}],
    edges:[{from:"in",to:"drawing"},{from:"drawing",to:"out"}],
  };
}

test("PNG DPI is carried from Studio to the backend compiler graph",()=>{
  for(const dpi of [160,240,300,450,600]){
    const graph=bridge.toBackend(workflow(dpi),"dpi-graph",[]);
    assert.equal(graph.nodes.find(n=>n.id==="drawing").config.dpi,dpi);
    const round=bridge.fromBackend({...graph,inputs:{}});
    assert.equal(round.nodes.find(n=>n.id==="drawing").compilerDpi,dpi);
  }
});

test("Imported older workflow without DPI preserves legacy 160 setting",()=>{
  const graph=bridge.toBackend(workflow(),"legacy",[]);
  assert.equal(graph.nodes.find(n=>n.id==="drawing").config.dpi,160);
});

test("DPI outside 72–600 blocked by bridge readiness validation",()=>{
  const good=bridge.runIssues(workflow(300),[],{compiler:{enabled:true}});
  assert.equal(good.some(x=>/DPI/.test(x)),false);
  for(const bad of [71,601,300.5,-1]){
    assert.ok(bridge.runIssues(workflow(bad),[],{compiler:{enabled:true}})
      .some(x=>/DPI/.test(x)));
  }
});

test("PDF workflow does not add irrelevant DPI to backend contract",()=>{
  const flow=workflow(600);
  flow.nodes[1].compilerTarget="pdf";
  const node=bridge.toBackend(flow,"pdf-graph",[]).nodes.find(n=>n.id==="drawing");
  assert.equal(node.config.dpi,undefined);
});

test("TikZ Lab and Studio expose explicit DPI choices without changing other pages",()=>{
  const lab=fs.readFileSync("tikz.html","utf8");
  const js=fs.readFileSync("tikz.js","utf8");
  const studio=fs.readFileSync("studio.html","utf8");
  for(const choice of ["160","240","300","450","600"]){
    assert.ok(lab.includes('value="'+choice+'"'),"Missing DPI preset "+choice);
  }
  assert.match(lab,/id="tikzDpi"/);
  for(const choice of ["Pdf","Png160","Png240","Png300","Png450","Png600"]){
    assert.ok(lab.includes('id="tikzChoice'+choice+'"'),"Visible button missing: "+choice);
  }
  assert.doesNotMatch(lab,/id="tikzDpiRow"/);
  assert.match(js,/body:format==="png"\?\{source,dpi\}:\{source\}/);
  assert.match(studio,/CompilerDpi/);
  assert.match(studio,/scheduleDraftRecovery\(\)/);
});
