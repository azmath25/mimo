const test = require("node:test");
const assert = require("node:assert/strict");
const bridge = require("../cloud-bridge.js");

function makeFlow(node) {
  return {
    kind:"mimo/workflow",version:4,name:"Contract",
    nodes:[{id:"b1",type:"input"},node,{id:"b3",type:"output"}],
    edges:[{from:"b1",to:"b2"},{from:"b2",to:"b3"}],
    initialInput:{format:"text",text:"",fileName:""}
  };
}

test("JSON property extractor is a real cloud tool",()=>{
  const flow=makeFlow({id:"b2",type:"tool",execution:"tool",toolKind:"json-field",toolField:"answer.latex",name:"Extract"});
  assert.deepEqual(bridge.runIssues(flow,[]),[]);
  const config=bridge.toBackend(flow,"wf_math",[]).nodes[1].config;
  assert.equal(config.tool,"json_field");
  assert.equal(config.field,"answer.latex");
});

test("Replace and trim tools forward options",()=>{
  const flow=makeFlow({id:"b2",type:"tool",execution:"tool",toolKind:"replace",toolFind:"\\alpha",toolReplacement:"a",name:"Replace"});
  assert.deepEqual(bridge.runIssues(flow,[]),[]);
  const config=bridge.toBackend(flow,"wf_math",[]).nodes[1].config;
  assert.equal(config.tool,"replace");
  assert.equal(config.find,"\\alpha");
  assert.equal(config.replacement,"a");
  flow.nodes[1].toolKind="trim";
  assert.equal(bridge.toBackend(flow,"wf_math",[]).nodes[1].config.tool,"trim");
});

test("Numeric router config preserves comparison and JSON field",()=>{
  const flow=makeFlow({id:"b2",type:"condition",execution:"condition",conditionMode:"rule",
    conditionField:"evaluation.score",name:"Threshold",
    branches:[{id:"yes",label:"Pass",op:">=",value:"0.8"},
              {id:"no",label:"Fail",op:"else"}]});
  flow.edges=[{from:"b1",to:"b2"},{from:"b2",to:"b3",branchId:"yes"},
              {from:"b2",to:"b3",branchId:"no"}];
  assert.deepEqual(bridge.runIssues(flow,[]),[]);
  const config=bridge.toBackend(flow,"wf_math",[]).nodes[1].config;
  assert.equal(config.mode,"numeric");
  assert.equal(config.field,"evaluation.score");
  assert.deepEqual(config.rules,[{op:">=",threshold:"0.8",port:"yes"}]);
});

test("Input source, combination and manual input are preserved",()=>{
  const flow=makeFlow({id:"b2",type:"tool",execution:"tool",toolKind:"trim",name:"Trim",source:"workflow"});
  assert.deepEqual(bridge.runIssues(flow,[]),[]);
  assert.equal(bridge.toBackend(flow,"wf_math",[]).nodes[1].config.input_source,"workflow");
  flow.nodes[1].source="connected";
  flow.nodes[1].combine="latest";
  assert.deepEqual(bridge.runIssues(flow,[]),[]);
  assert.equal(bridge.toBackend(flow,"wf_math",[]).nodes[1].config.input_combine,"latest");
  flow.nodes[1].source="manual";
  assert.ok(bridge.runIssues(flow,[]).some(x=>x.includes("Manual input is empty")));
  flow.nodes[1].manualInput="2x+3=7";
  assert.deepEqual(bridge.runIssues(flow,[]),[]);
});
