const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const bridge=require("../cloud-bridge.js");

const workflow={
  kind:"mimo/workflow",version:4,name:"AI Math Publisher",
  workflowGoal:"Produce verified LaTeX problems",
  nodes:[
    {id:"b1",type:"input",name:"Math input"},
    {id:"b2",type:"spark",name:"Extract",execution:"ai",model:"txt",
     prompt:"Read {{input}}",maxTokens:4096,
     source:"manual",manualInput:"Find x",
     combine:"first",includeWorkflowGuide:true,output:"json"},
    {id:"b3",type:"tool",name:"JSON property",execution:"tool",
     toolKind:"json-field",toolField:"solution.value",source:"connected"},
    {id:"b4",type:"output",name:"Done"}
  ],
  edges:[{from:"b1",to:"b2"},{from:"b2",to:"b3"},{from:"b3",to:"b4"}],
  initialInput:{format:"text",text:"",fileName:""},customBlocks:{}
};
const models=[{id:"txt",provider:"openai_compatible",remote_model_id:"t",
  display_name:"Text model",enabled:true,secret_configured:true}];

test("v2 adapter preserves multi-agent source, prompt and structured output",()=>{
  assert.deepEqual(bridge.runIssues(workflow,models),[]);
  const compiled=bridge.toBackend(workflow,"quiz_wf",models);
  assert.equal(compiled.nodes[1].config.input_source,"manual");
  assert.equal(compiled.nodes[1].config.manual_input,"Find x");
  assert.equal(compiled.nodes[1].config.input_combine,"first");
  assert.equal(compiled.nodes[1].config.max_tokens,4096);
  assert.equal(compiled.nodes[1].config.response.kind,"json");
  assert.match(compiled.nodes[1].config.prompt,/AI Math Publisher/);
  assert.match(compiled.nodes[1].config.prompt,/ASSIGNED TASK/);
  assert.match(compiled.nodes[1].config.prompt,/Read \{\{input\}\}/);
  assert.equal(compiled.nodes[2].config.tool,"json_field");
  assert.equal(compiled.nodes[2].config.field,"solution.value");
});

test("v2 cloud compiler and image-generation options are real graph settings",()=>{
  const altered=structuredClone(workflow);
  altered.nodes[1]={...altered.nodes[1],model:"image",output:"image",imageSize:"512x512",
    imageCount:2,includeWorkflowGuide:false,source:"connected"};
  const all=[...models,{id:"image",provider:"image_generation",remote_model_id:"x",
     display_name:"Image",enabled:true,secret_configured:true}];
  const graph=bridge.toBackend(altered,"diagram",all);
  assert.equal(graph.nodes[1].config.response.kind,"image");
  assert.equal(graph.nodes[1].config.response.size,"512x512");
  assert.equal(graph.nodes[1].config.response.n,2);
  assert.equal(graph.nodes[1].config.input_source,"connected");
});

test("complete operational frontend has authenticated pages, not placeholder routes",()=>{
  for(const name of ["runs","files","diagnostics","tikz","models","access","workflows"]){
    const html=fs.readFileSync(name+".html","utf8");
    assert.match(html,/cloud-auth\.js/);
    assert.match(html,/site\.js/);
    assert.match(html,/role=|main class=/);
  }
  for(const name of ["runs","files","diagnostics"]){
    const script=fs.readFileSync(name+".js","utf8");
    assert.ok(script.length>500);
    assert.doesNotThrow(()=>new vm.Script(script));
  }
  const studio=fs.readFileSync("studio.html","utf8");
  assert.match(studio,/\/v1\/runs\/drafts/);
  assert.match(studio,/image_artifact/);
  const auth=fs.readFileSync("cloud-auth.js","utf8");
  assert.match(auth,/uploadFile/);
  assert.match(auth,/getIdToken/);
  const access=fs.readFileSync("access.js","utf8");
  assert.match(access,/rotate-key/);
  assert.match(access,/\/permissions/);
  const run=fs.readFileSync("runs.js","utf8");
  assert.match(run,/\/timeline/);
  assert.match(run,/\/retry-block/);
  assert.match(run,/\/decision/);
  const file=fs.readFileSync("files.js","utf8");
  assert.match(file,/\/pages\//);
  assert.match(file,/\/ingest/);
});
