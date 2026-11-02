const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const bridge = require("../cloud-bridge.js");

const workflow = {
  kind:"mimo/workflow", version:4, name:"Compile diagram",
  nodes:[
    {id:"b1", type:"input", name:"Input"},
    {id:"b2", type:"tool", execution:"tool", toolKind:"tikz",
     toolEngine:"pdflatex", compilerTarget:"png", name:"Compile"},
    {id:"b3", type:"output", name:"Output"}
  ],
  edges:[{from:"b1",to:"b2"},{from:"b2",to:"b3"}],
  initialInput:{format:"text", text:"", fileName:""}, customBlocks:{}
};

test("Cloud readiness requires real compiler capability",()=>{
  const missing = bridge.runIssues(workflow,[]);
  assert.ok(missing.some(issue=>issue.includes("TikZ compiler service")));
  const valid = bridge.runIssues(workflow,[],{compiler:{enabled:true}});
  assert.deepEqual(valid,[]);
});

test("TikZ PNG output survives canvas-to-backend conversion",()=>{
  const graph = bridge.toBackend(workflow,"math_diagrams",[]);
  const compiler = graph.nodes.find(n=>n.id==="b2");
  assert.equal(compiler.type,"compiler");
  assert.equal(compiler.config.target,"png");
  assert.equal(compiler.config.source,"{{inputs.1}}");
});

test("Unsupported SVG compilation is refused rather than simulated",()=>{
  const svg = structuredClone(workflow);
  svg.nodes[1].compilerTarget="svg";
  assert.ok(bridge.runIssues(svg,[],{compiler:{enabled:true}})
    .some(issue=>issue.includes("PDF or PNG")));
});

test("Key management and real image/PDF previews are present",()=>{
  const html = fs.readFileSync("models.html","utf8");
  const script = fs.readFileSync("models.js","utf8");
  const auth = fs.readFileSync("cloud-auth.js","utf8");
  const lab = fs.readFileSync("tikz.html","utf8");
  const labJs = fs.readFileSync("tikz.js","utf8");
  assert.match(html,/id="providerKeyValue"/);
  assert.match(html,/type="password"/);
  assert.match(script,/provider-keys/);
  assert.match(script,/providerKeyValue"\)\.value=""/);
  assert.match(auth,/requestBlob/);
  assert.match(lab,/id="tikzImagePreview"/);
  assert.match(lab,/id="tikzPreview"/);
  assert.match(labJs,/v1\/compiler/);
});
