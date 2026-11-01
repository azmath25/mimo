const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const bridge=require("../cloud-bridge.js");

const html=fs.readFileSync("models.html","utf8");
const src=fs.readFileSync("models.js","utf8");

function harness(){
 const elems=new Map();
 const get=id=>{
   if(!elems.has(id)){
     elems.set(id,{
       id,value:"",checked:false,disabled:false,hidden:false,innerHTML:"",
       textContent:"",className:"",dataset:{},
       listeners:{},classList:{toggle(){}},
       addEventListener(name,fn){this.listeners[name]=fn},
       scrollIntoView(){},reset(){for(const key of ["modelInputPrice","modelOutputPrice","modelImagePrice","modelRemote","modelId","modelName","modelEndpoint","modelSecret"])get(key).value=""}
     });
   }
   return elems.get(id);
 };
 const calls=[],feedback=[];
 const models=[];
 const site={
   safe:x=>String(x??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"),
   notice:(id,text,isError)=>feedback.push({id,text,isError}),
   api:async(path,options)=>{
     calls.push({path,options});
     if(path==="/v1/models" && !options)return models;
     if(path==="/v1/models" && options?.method==="POST"){
       const rec={...options.body,secret_configured:options.body.secret_ref==="groq"};
       models.push(rec);return rec;
     }
     if(path.startsWith("/v1/models/")&&options?.method==="PATCH")return options.body;
     return {};
   },
   whenReady:()=>{},
   currency:x=>"$"+Number(x).toFixed(4)
 };
 const ctx={
   document:{getElementById:get},
   MimoSite:site,
   URL,Number,Array,String,console,
   confirm:()=>true,
   encodeURIComponent
 };
 vm.createContext(ctx);vm.runInContext(src,ctx);
 return {get,calls,feedback,models,change:(id,value)=>{
   get(id).value=value;
   get(id).listeners.change({target:get(id)});
 },submit:async()=>{
   await get("modelForm").listeners.submit({preventDefault(){}});
 }};
}

test("builder supports several existing-key Groq models plus arbitrary compatible providers",()=>{
 assert.match(html,/id="modelSuggestion"/);
 assert.match(html,/id="capText"/);
 assert.match(html,/id="capVision"/);
 assert.match(html,/id="capGenerate"/);
 for(const term of ["groq_120b","groq_vision","openrouter","gemini","deepseek","cerebras","openai"])
   assert.match(html,new RegExp('value="'+term+'"'));
 assert.match(src,/openai\/gpt-oss-120b/);
 assert.match(src,/https:\/\/api\.groq\.com\/openai\/v1/);
 assert.match(src,/https:\/\/generativelanguage\.googleapis\.com\/v1beta\/openai/);
 assert.match(src,/https:\/\/api\.deepseek\.com/);
 assert.match(src,/Duplicate/);
 assert.doesNotMatch(src,/sk-[a-zA-Z0-9]{20,}/);
 assert.doesNotThrow(()=>new vm.Script(src));
});

test("selecting Groq 120B and saving only submits model metadata, no backend update",async()=>{
 const h=harness();
 h.get("modelEnabled").checked=true;
 h.change("modelPreset","groq_120b");
 assert.equal(h.get("modelRemote").value,"openai/gpt-oss-120b");
 assert.equal(h.get("modelSecret").value,"groq");
 assert.equal(h.get("modelSecretEnv").value,"MIMO_SECRET_GROQ");
 assert.equal(h.get("capVision").checked,false);
 await h.submit();
 const post=h.calls.find(c=>c.options?.method==="POST");
 assert.ok(post);
 assert.equal(post.path,"/v1/models");
 assert.equal(post.options.body.remote_model_id,"openai/gpt-oss-120b");
 assert.equal(post.options.body.secret_ref,"groq");
 assert.equal(post.options.body.capabilities.text,true);
 assert.equal(post.options.body.capabilities.image_understanding,false);
 assert.equal("api_key" in post.options.body,false);
});

test("switching suggestion to Qwen vision sets persisted image-reading capability",async()=>{
 const h=harness();
 h.get("modelEnabled").checked=true;
 h.change("modelPreset","groq");
 h.change("modelSuggestion","groq_vision");
 assert.equal(h.get("modelRemote").value,"qwen/qwen3.8-27b");
 assert.equal(h.get("capVision").checked,true);
 await h.submit();
 const post=h.calls.find(c=>c.options?.method==="POST");
 assert.equal(post.options.body.capabilities.image_understanding,true);
 assert.equal(post.options.body.secret_ref,"groq");
});

test("custom compatible endpoint and model ID need no new frontend deployment",async()=>{
 const h=harness();
 Object.assign(h.get("modelId"),{value:"my_model_1"});
 Object.assign(h.get("modelName"),{value:"My chosen math model"});
 Object.assign(h.get("modelRemote"),{value:"model-v8-custom"});
 Object.assign(h.get("modelEndpoint"),{value:"https://provider.example/v1"});
 Object.assign(h.get("modelSecret"),{value:"custom_provider"});
 h.get("modelProvider").value="openai_compatible";
 h.get("modelEnabled").checked=true;
 h.get("capText").checked=true;
 h.get("capVision").checked=false;
 await h.submit();
 const post=h.calls.find(c=>c.options?.method==="POST");
 assert.equal(post.options.body.endpoint,"https://provider.example/v1");
 assert.equal(post.options.body.remote_model_id,"model-v8-custom");
 assert.equal(post.options.body.secret_ref,"custom_provider");
 assert.equal(post.options.body.capabilities.text,true);
});

test("different AI nodes keep independent max output-token budgets",()=>{
 const flow={
   kind:"mimo/workflow",version:4,name:"Extract then solve",
   nodes:[
     {id:"i",type:"input",name:"Input"},
     {id:"e",type:"spark",execution:"ai",name:"Extract",model:"groq_text",prompt:"{{input}}",maxTokens:1024},
     {id:"s",type:"spark",execution:"ai",name:"Solve",model:"groq_120b",prompt:"Solve: {{input}}",maxTokens:8192},
     {id:"o",type:"output",name:"Output"},
   ],
   edges:[{from:"i",to:"e"},{from:"e",to:"s"},{from:"s",to:"o"}]
 };
 const models=[
   {id:"groq_text",enabled:true,provider:"openai_compatible",remote_model_id:"openai/gpt-oss-20b",display_name:"Groq 20B"},
   {id:"groq_120b",enabled:true,provider:"openai_compatible",remote_model_id:"openai/gpt-oss-120b",display_name:"Groq 120B"}
 ];
 assert.deepEqual(bridge.runIssues(flow,models),[]);
 const graph=bridge.toBackend(flow,"a1",models);
 assert.equal(graph.nodes[1].config.max_tokens,1024);
 assert.equal(graph.nodes[2].config.max_tokens,8192);
 assert.equal(graph.nodes[1].config.model_id,"groq_text");
 assert.equal(graph.nodes[2].config.model_id,"groq_120b");
 const out=bridge.fromBackend(graph);
 assert.equal(out.nodes[2].maxTokens,8192);
 assert.ok(bridge.runIssues({...flow,nodes:flow.nodes.map(n=>n.id==="s"?{...n,maxTokens:999999}:n)},models).some(x=>x.includes("Output-token budget")));
});

test("Studio renders and saves editable per-agent output-token budgets",()=>{
 const studio=fs.readFileSync("studio.html","utf8");
 assert.match(studio,/id="nodeMaxTokens"/);
 assert.match(studio,/n\.maxTokens=raw/);
 assert.match(studio,/maxTokens:t\.maxTokens\|\|1024/);
 assert.match(studio,/maxTokens:n\.maxTokens/);
 assert.match(studio,/function runUsageHTML\(/);
 assert.match(studio,/The response may have been cut off/);
 assert.match(studio,/output tokens \(including reasoning\)/);
 assert.doesNotThrow(()=>new vm.Script(studio.match(/<script>\s*([\s\S]*?)<\/script>/)[1]));
});
