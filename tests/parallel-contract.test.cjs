const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const bridge=require("../cloud-bridge.js");

function graph(){
  return {kind:"mimo/workflow",version:4,name:"Parallel generic",
    nodes:[{id:"start",type:"input"},{id:"a",type:"tool",toolKind:"trim"},
      {id:"out",type:"output"}],
    edges:[{from:"start",to:"a"},{from:"a",to:"out"}],
    apiExports:[],initialInput:{format:"text",text:""},customBlocks:{}};
}
test("parallel mode is opt-in, preserving existing main workflow contracts",()=>{
  const before=bridge.toBackend(graph(),"generic",[]);
  assert.equal(before.outputs.execution_mode,undefined);
  const workflow={...graph(),parallelExecution:true};
  const compiled=bridge.toBackend(workflow,"generic",[]);
  assert.equal(compiled.outputs.execution_mode,"parallel");
  const restored=bridge.fromBackend({...compiled,inputs:{}});
  assert.equal(restored.parallelExecution,true);
  assert.equal(bridge.toBackend(restored,"generic",[]).outputs.execution_mode,"parallel");
});
test("Studio exposes and persists parallel mode without forcing old workflows",()=>{
  const studio=fs.readFileSync("studio.html","utf8");
  assert.match(studio,/parallelExecutionEnabled/);
  assert.match(studio,/parallelExecution:state\.parallelExecution/);
  assert.match(studio,/state\.parallelExecution=r\.parallelExecution===true/);
  assert.match(studio,/state\.parallelExecution===true\|\|/);
});
