const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const bridge=require("../cloud-bridge.js");

function flow(operation="create_issue"){
  return {
    kind:"mimo/workflow",version:4,name:"App-neutral connector pipeline",
    nodes:[
      {id:"start",type:"input",name:"Text"},
      {id:"connector",type:"connector",name:"Approved GitHub Issues",
       execution:"tool",toolKind:"github-issue",output:"json",
       connectorInstallation:"github_research",connectorOperation:operation,
       connectorTitle:"Verified task",connectorBody:"{{inputs.1}}",
       connectorNumber:"{{inputs.1}}"},
      {id:"out",type:"output",name:"Collect"},
    ],
    edges:[{from:"start",to:"connector"},{from:"connector",to:"out"}],
    initialInput:{format:"text",text:""},apiExports:[],
  };
}

test("trusted external connector blocks compile to typed, grant-checked backend nodes",()=>{
  const f=flow();
  assert.deepEqual(bridge.runIssues(f,[]),[]);
  const graph=bridge.toBackend(f,"generic_connector",[]);
  const node=graph.nodes.find(n=>n.id==="connector");
  assert.equal(node.type,"connector");
  assert.deepEqual(node.config.args,{title:"Verified task",body:"{{inputs.1}}"});
  assert.equal(node.config.installation_id,"github_research");
  assert.equal(node.config.operation,"create_issue");
  assert.equal(graph.outputs.execution_mode,undefined);
  assert.equal(bridge.fromBackend(graph).nodes[1].connectorInstallation,"github_research");
  const imported=bridge.fromBackend({...graph,inputs:{}});
  assert.equal(imported.nodes[1].toolKind,"github-issue");
  assert.equal(imported.nodes[1].connectorOperation,"create_issue");
  assert.equal(bridge.toBackend(imported,"generic_connector",[]).nodes[1].type,"connector");
});

test("read-only connector uses bounded integer-or-template input",()=>{
  const f=flow("read_issue");
  const node=bridge.toBackend(f,"generic_connector",[]).nodes[1];
  assert.deepEqual(node.config.args,{issue_number:"{{inputs.1}}"});
  const missing=flow();
  missing.nodes[1].connectorInstallation="";
  assert.ok(bridge.runIssues(missing,[]).some(x=>x.includes("installed adapter ID")));
});

test("Studio shows side-effect warnings and never claims browser preview wrote issues",()=>{
  const s=fs.readFileSync("studio.html","utf8");
  assert.match(s,/External connector actions are NOT performed in local Preview/);
  assert.match(s,/nodeConnectorInstallation/);
  assert.match(s,/nodeConnectorOperation/);
  assert.match(s,/creating an issue ALWAYS requires exact human approval/);
  assert.match(s,/connectorInstallation:n\.connectorInstallation/);
});
