const test=require("node:test");
const assert=require("node:assert/strict");
const bridge=require("../cloud-bridge.js");
const models=[{id:"model_x",enabled:true,remote_model_id:"model-x"}];
function flow(){
 return {
  kind:"mimo/workflow",version:4,name:"Any app",
  apiExports:[{name:"report",source:"agent",schema:{type:"object",required:["ok"],properties:{ok:{type:"boolean"}}}}],
  nodes:[
   {id:"input",type:"input",name:"Source"},
   {id:"agent",type:"spark",execution:"ai",name:"Automated worker",
    model:"model_x",output:"json",maxTokens:1024,
    agentEnabled:true,agentMaxSteps:4,agentTools:["trim","json_field"],
    prompt:"Transform {{inputs.1}}"},
   {id:"output",type:"output",name:"Deliver"}
  ],
  edges:[{from:"input",to:"agent"},{from:"agent",to:"output"}],
  initialInput:{format:"text",text:"",fileName:""},customBlocks:{}
 };
}
test("Published graph contains reusable JSON Schema exports without app-specific fields",()=>{
 const d=bridge.toBackend(flow(),"generic_workflow",models);
 assert.deepEqual(d.outputs,{"exports":flow().apiExports});
 assert.deepEqual(d.nodes[1].config.agent,{enabled:true,max_steps:4,tools:["trim","json_field"]});
 assert.equal(d.nodes[1].config.response.kind,"json");
 assert.deepEqual(bridge.runIssues(flow(),models),[]);
});
test("Generic export and agent settings survive roundtrip through backend",()=>{
 const d=bridge.toBackend(flow(),"generic_workflow",models);
 const restored=bridge.fromBackend(d);
 assert.deepEqual(restored.apiExports,flow().apiExports);
 assert.deepEqual(bridge.toBackend(restored,"generic_workflow",models).outputs,d.outputs);
});
test("UI rejects broken export mappings and unsafe agent options",()=>{
 const f=flow();f.apiExports.push({name:"report",source:"invalid"});
 assert.ok(bridge.runIssues(f,models).some(e=>e.includes("unique")));
 f.apiExports.pop();f.nodes[1].agentTools=["shell"];
 assert.ok(bridge.runIssues(f,models).some(e=>e.includes("unsupported")));
});
