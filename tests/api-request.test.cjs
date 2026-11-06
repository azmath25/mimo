"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const rest=require("../api-request.js"),bridge=require("../cloud-bridge.js");
function flow(){return {kind:"mimo/workflow",name:"API flow",nodes:[
 {id:"input",type:"input"},
 {id:"lookup",type:"api",execution:"tool",toolKind:"api-request",name:"Lookup",output:"json",apiInstallation:"catalog",apiOperation:"lookup",apiArgs:'{"item_id":"{{workflow.input.item_id}}","count":3}'},
 {id:"out",type:"output"}],edges:[{from:"input",to:"lookup"},{from:"lookup",to:"out"}]}}
test("API Request reuses connector config and preserves cost-enabled graph settings",()=>{
 const canvas=flow();canvas.parallelExecution=true;
 const graph=bridge.toBackend(canvas,"api_flow",[]),node=graph.nodes[1];
 assert.equal(node.type,"connector");assert.equal(node.config.adapter,"http_rest");
 assert.equal(node.config.args.count,3);assert.equal(node.config.installation_id,"catalog");
 assert.equal(graph.outputs.execution_mode,"parallel");
 delete graph.inputs.mimo_ui;
 const restored=bridge.fromBackend(graph).nodes[1];
 assert.equal(restored.toolKind,"api-request");assert.equal(restored.apiOperation,"lookup");
 assert.equal(JSON.parse(restored.apiArgs).count,3);
});
test("REST execution fails closed on old or disabled backend capability",()=>{
 assert.ok(bridge.runIssues(flow(),[],{}).some(x=>x.includes("not enabled")));
 assert.equal(bridge.runIssues(flow(),[],{connectors:{http_rest:true}}).length,0);
});
test("arguments reject arrays, nested data and nonfinite numbers instead of inventing values",()=>{
 for(const value of ['[]','null','{"x":{}}','{"x":1e999}','{"bad key":1}'])assert.throws(()=>rest.args(value));
 const n={apiArgs:"{}"};rest.setArgument(n,"count","integer","3");assert.equal(JSON.parse(n.apiArgs).count,3);
 rest.setArgument(n,"count","integer","{{workflow.input.count}}");assert.equal(JSON.parse(n.apiArgs).count,"{{workflow.input.count}}");
});
test("GitHub roundtrip remains GitHub; REST data never becomes issue creation",()=>{
 const graph={nodes:[{id:"x",type:"connector",config:{installation_id:"github",operation:"create_issue",args:{title:"hello",body:"text"}}}],edges:[]};
 assert.equal(bridge.fromBackend(graph).nodes[0].toolKind,"github-issue");
 const canvas=flow();canvas.nodes[1].apiArgs="invalid";assert.throws(()=>bridge.toBackend(canvas,"api_flow",[]));
});
test("editor escapes saved bindings and never auto-loads remote APIs",()=>{
 const n=flow().nodes[1];n.apiArgs='{"x":"</textarea><script>bad()</script>"}';
 const safe=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const html=rest.inspector(n,"node",safe);assert.ok(!html.includes('<script>'));assert.ok(html.includes('data-api-load'));
 assert.ok(html.includes("External prices are unknown"));
});
