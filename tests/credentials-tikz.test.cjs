const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
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

test("TikZ Lab labels and previews follow PDF/PNG selection",async()=>{
  const elements=new Map();
  let readyCallback;
  let downloadedFile="";
  let revoked=0;
  function element(id){
    if(!elements.has(id)){
      elements.set(id,{
        value:id==="tikzFormat"?"pdf":id==="tikzSource"?"\\\\documentclass{standalone}":"", 
        textContent:"",
        disabled:id==="compileTikz"||id==="downloadTikz",
        hidden:false,
        handlers:{},
        classList:{toggle(){}},
        removeAttribute(name){delete this[name]},
        addEventListener(name,fn){this.handlers[name]=fn}
      });
    }
    return elements.get(id);
  }
  const document={
    getElementById:element,
    body:{append(){}},
    createElement(){return {
      download:"",
      click(){downloadedFile=this.download},
      remove(){}
    }}
  };
  const cloud={
    authorized:true,
    async requestBlob(path){
      return {type:path.endsWith("/png")?"image/png":"application/pdf"};
    }
  };
  const MimoSite={
    whenReady(fn){readyCallback=fn},
    async api(){return {compiler:{enabled:true}}}
  };
  const URL={
    createObjectURL:()=> "blob:test-diagram",
    revokeObjectURL:()=>{revoked++}
  };
  vm.runInNewContext(fs.readFileSync("tikz.js","utf8"),{
    document,window:{MimoCloud:cloud,addEventListener(){}},
    MimoCloud:cloud,MimoSite,URL
  });

  assert.equal(element("compileTikz").textContent,"Compile PDF");
  assert.equal(element("downloadTikz").textContent,"Download PDF");
  assert.equal(element("tikzPreviewTitle").textContent,"PDF preview");
  await readyCallback();
  assert.equal(element("compileTikz").disabled,false);

  element("tikzFormat").value="png";
  element("tikzFormat").handlers.change();
  assert.equal(element("compileTikz").textContent,"Compile PNG");
  assert.equal(element("downloadTikz").textContent,"Download PNG");
  assert.equal(element("tikzPreviewTitle").textContent,"PNG preview");
  assert.equal(element("downloadTikz").disabled,true);
  await element("compileTikz").handlers.click();
  assert.equal(element("downloadTikz").disabled,false);
  assert.equal(element("tikzPreview").hidden,true);
  assert.equal(element("tikzImagePreview").hidden,false);
  element("downloadTikz").handlers.click();
  assert.equal(downloadedFile,"mimo-tikz.png");

  element("tikzFormat").value="pdf";
  element("tikzFormat").handlers.change();
  assert.equal(element("compileTikz").textContent,"Compile PDF");
  assert.equal(element("downloadTikz").textContent,"Download PDF");
  assert.equal(element("tikzPreviewTitle").textContent,"PDF preview");
  assert.equal(element("downloadTikz").disabled,true);
  assert.ok(revoked>0);
  await element("compileTikz").handlers.click();
  element("downloadTikz").handlers.click();
  assert.equal(downloadedFile,"mimo-tikz.pdf");
  assert.equal(element("tikzPreview").hidden,false);
  assert.equal(element("tikzImagePreview").hidden,true);

  element("resetTikz").handlers.click();
  assert.equal(element("tikzFormat").value,"pdf");
  assert.equal(element("compileTikz").textContent,"Compile PDF");
  assert.equal(element("downloadTikz").disabled,true);
});
