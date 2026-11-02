const test = require("node:test");
const assert = require("node:assert/strict");
const bridge = require("../cloud-bridge.js");

const models = [
  {id:"vision", enabled:true, remote_model_id:"vision"},
  {id:"audit", enabled:true, remote_model_id:"audit"},
];
function workflow() {
  return {
    kind:"mimo/workflow",version:4,name:"Quizer test",
    outputContract:"quizer.problems.v1",outputSource:"audit",
    nodes:[
      {id:"input",type:"input",name:"Input"},
      {id:"extract",type:"spark",execution:"ai",name:"Read",model:"vision",
       output:"json",prompt:"Transcribe {{inputs.1}}"},
      {id:"audit",type:"spark",execution:"ai",name:"Audit",model:"audit",
       output:"json",prompt:"Validate {{inputs.1}}"},
      {id:"output",type:"output",name:"Output"},
    ],
    edges:[{from:"input",to:"extract"},{from:"extract",to:"audit"},
           {from:"audit",to:"output"}],
    initialInput:{format:"text",text:"",fileName:""},customBlocks:{}
  };
}
test("Studio serializes a named Quizer output contract",()=>{
  const def=bridge.toBackend(workflow(),"quizer_page_extract_v1",models);
  assert.deepEqual(def.outputs,{contract:"quizer.problems.v1",source_node:"audit"});
  assert.equal(def.nodes.find(n=>n.id==="audit").config.response.kind,"json");
  assert.deepEqual(def.nodes.find(n=>n.id==="output").config.collect,["audit"]);
  assert.deepEqual(bridge.runIssues(workflow(),models),[]);
});
test("Opening saved Quizer workflows preserves output contract and JSON model",()=>{
  const def=bridge.toBackend(workflow(),"quizer_page_extract_v1",models);
  const reopened=bridge.fromBackend(def);
  assert.equal(reopened.outputContract,"quizer.problems.v1");
  assert.equal(reopened.outputSource,"audit");
  const saved=bridge.toBackend(reopened,"quizer_page_extract_v1",models);
  assert.deepEqual(saved.outputs,def.outputs);
  assert.equal(saved.nodes.find(n=>n.id==="audit").config.response.kind,"json");
});
test("Quizer validation rejects unsupported output nodes",()=>{
  const flow=workflow();
  flow.nodes.find(n=>n.id==="audit").output="text";
  assert.ok(bridge.runIssues(flow,models).some(x=>x.includes("JSON")));
  flow.outputSource="nonexistent";
  assert.ok(bridge.runIssues(flow,models).some(x=>x.includes("Quizer")));
});
