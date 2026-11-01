const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const bridge = require("../cloud-bridge.js");

const flow = {
  kind: "mimo/workflow", version: 4, name: "Math pipeline",
  nodes: [
    {id:"b1",type:"input",name:"Input"},
    {id:"b2",type:"tool",execution:"tool",toolKind:"uppercase",name:"Upper"},
    {id:"b3",type:"output",name:"Result"}
  ],
  edges: [{from:"b1",to:"b2"},{from:"b2",to:"b3"}],
  initialInput:{format:"text",text:"hello",fileName:""}, workflowGoal:"Convert text",
  customBlocks:{}
};

test("round-trip preserves full studio v4 canvas", () => {
  const def = bridge.toBackend(flow,"wf_math",[]);
  assert.equal(def.workflow_id,"wf_math");
  assert.deepEqual(def.nodes.map(x=>x.type),["input","tool","output"]);
  assert.equal(def.nodes[1].config.tool,"upper");
  assert.deepEqual(def.nodes[2].config.collect,["b2"]);
  assert.deepEqual(bridge.fromBackend(JSON.parse(JSON.stringify(def))),flow);
  assert.deepEqual(bridge.runIssues(flow,[]),[]);
});
test("unfinished canvases can be saved but not executed",()=>{
  const partial={...flow,nodes:[flow.nodes[0]],edges:[]};
  const data=bridge.toBackend(partial,"wf_partial",[]);
  assert.equal(data.nodes.length,1);
  assert.ok(bridge.runIssues(partial,[]).length>0);
});
test("unavailable models and unsupported preview-only tools block cloud runs",()=>{
  const ai={...flow.nodes[1],type:"spark",execution:"ai",name:"Math AI",model:"gpt-6",prompt:"{{input}}"};
  const a={...flow,nodes:[flow.nodes[0],ai,flow.nodes[2]]};
  assert.ok(bridge.runIssues(a,[]).some(x=>x.includes("enabled backend model")));
  const models=[{id:"m1",remote_model_id:"gpt-6",provider:"OpenAI",display_name:"OpenAI gpt-6",enabled:true}];
  assert.deepEqual(bridge.runIssues(a,models),[]);
  assert.equal(bridge.toBackend(a,"wf_ai",models).nodes[1].config.model_id,"m1");
  const b={...flow,nodes:[flow.nodes[0],{...flow.nodes[1],toolKind:"json-field"},flow.nodes[2]]};
  assert.ok(bridge.runIssues(b,[]).some(x=>x.includes("preview-only")));
});
test("disconnected nodes are reported as cloud execution issues",()=>{
  const isolated={id:"b4",type:"tool",execution:"tool",toolKind:"uppercase",name:"Isolated"};
  const broken={...flow,nodes:[...flow.nodes,isolated]};
  assert.ok(bridge.runIssues(broken,[]).some(issue=>issue.includes("Connect an upstream block")));
});

test("static studio scripts parse, auth is required, and v3.3 canvas is retained",()=>{
  const html=fs.readFileSync("index.html","utf8");
  assert.match(html,/id="cloudGate"/);
  assert.match(html,/cloud-auth\.js/);
  assert.match(html,/cloud-bridge\.js/);
  assert.match(html,/MimoCloud\.request/);
  assert.match(html,/id="canvas"/);
  assert.match(html,/id="builderPage"/);
  assert.match(html,/id="previewButton"/);
  assert.match(html,/id="checkFlowBtn"/);
  assert.match(html,/id="quickStartWorkflow"/);
  assert.match(html,/id="draftRecovery"/);
  assert.match(html,/cloud-results\.js/);
  assert.match(html,/mimo\.recovery\.v1/);
  const code=html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  assert.ok(code && code.length>50000);
  assert.doesNotThrow(()=>new vm.Script(code));
  const auth=fs.readFileSync("cloud-auth.js","utf8");
  assert.match(auth,/getIdToken\(\)/);
  assert.match(auth,/\/v1\/me/);
  assert.doesNotMatch(auth,/serviceAccount.*private_key/);
});
