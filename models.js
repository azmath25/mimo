/* Admin model registry CRUD. Raw provider API keys never enter the browser. */
(function(){
 "use strict";
 const $=id=>document.getElementById(id),esc=()=>MimoSite.safe;
 let models=[],editing=null,busy=false;
 function message(text,isError=false){MimoSite.notice("modelFeedback",text,isError)}
 function setBusy(v){busy=v;$("saveModel").disabled=v;$("reloadModels").disabled=v}
 function showConnectionTest({title,status="Testing",text="",meta="",error=false}){
   const panel=$("modelTestPanel");
   panel.hidden=false;
   $("modelTestTitle").textContent=title||"Model connection test";
   $("modelTestBadge").textContent=status;
   $("modelTestBadge").className="mg-pill "+(error?"bad":status==="Connected"?"good":"warn");
   $("modelTestText").textContent=text||"—";
   $("modelTestMeta").textContent=meta;
   panel.scrollIntoView({behavior:"smooth",block:"nearest"});
 }

 const providerPresets={
   openrouter:{
     id:"openrouter_free",name:"OpenRouter Free",
     provider:"openai_compatible",endpoint:"https://openrouter.ai/api/v1",
     model:"openrouter/free",secret:"openrouter",input:"0",output:"0"
   },
   groq:{
     id:"groq_text",name:"Groq Text",
     provider:"openai_compatible",endpoint:"https://api.groq.com/openai/v1",
     model:"openai/gpt-oss-20b",secret:"groq",input:"",output:""
   }
 };
 function choosePreset(name){
   if(editing)return;
   const p=providerPresets[name];if(!p)return;
   $("modelId").value=p.id;$("modelName").value=p.name;
   $("modelProvider").value=p.provider;$("modelRemote").value=p.model;
   $("modelEndpoint").value=p.endpoint;$("modelSecret").value=p.secret;
   $("modelInputPrice").value=p.input;$("modelOutputPrice").value=p.output;
   $("modelImagePrice").value="";secretEnv();
   message("Fields filled. Attach the "+$("modelSecretEnv").value+" Cloud Run secret before testing.");
 }
  function secretEnv(){
   const ref=$("modelSecret").value.trim();
   $("modelSecretEnv").value=ref?"MIMO_SECRET_"+ref.toUpperCase().replace(/-/g,"_"):"MIMO_SECRET_…";
 }
 function clear(){
   editing=null;$("modelForm").reset();$("modelPreset").disabled=false;$("modelPreset").value="";$("modelId").disabled=false;
   $("modelProvider").disabled=false;$("modelEnabled").checked=true;
   $("saveModel").textContent="Register model";$("modelFormTitle").textContent="Register a model";
   $("cancelEdit").hidden=true;secretEnv();message("");
 }
 function edit(m){
   editing=m.id;$("modelPreset").value="";$("modelPreset").disabled=true;$("modelId").value=m.id;$("modelId").disabled=true;
   $("modelProvider").value=m.provider;$("modelProvider").disabled=true;
   $("modelName").value=m.display_name;$("modelRemote").value=m.remote_model_id;
   $("modelEndpoint").value=m.endpoint;$("modelSecret").value=m.secret_ref;
   $("modelEnabled").checked=m.enabled;
   $("modelInputPrice").value="";$("modelOutputPrice").value="";$("modelImagePrice").value="";
   $("saveModel").textContent="Save model changes";$("modelFormTitle").textContent="Edit "+m.display_name;
   $("cancelEdit").hidden=false;secretEnv();message("");
   $("modelForm").scrollIntoView({behavior:"smooth",block:"center"});
 }
 function rows(){
   const safe=esc(),host=$("modelList");
   host.innerHTML=models.length?models.map(m=>{
     const available=m.enabled&&m.secret_configured;
     return '<article class="mg-row" data-id="'+safe(m.id)+'"><div class="mg-row-body"><strong>'+safe(m.display_name)+
      ' <span class="mg-pill '+(available?'good':m.enabled?'warn':'')+'">'+
      (available?'Ready':m.enabled?'Key not attached':'Disabled')+'</span>'+
      (m.is_default?' <span class="mg-pill">Default</span>':'')+'</strong>'+
      '<small>'+safe(m.id)+' · '+safe(m.remote_model_id)+' · '+safe(m.provider)+'</small>'+
      '<small class="mg-break">'+safe(m.endpoint)+' · secret reference '+safe(m.secret_ref)+'</small></div>'+
      '<div class="mg-row-actions"><button class="mg-btn small" data-action="edit">Edit</button>'+
      '<button class="mg-btn small" data-action="test" '+(!available||m.provider==="image_generation"?'disabled title="Currently available for configured text models only"':'')+'>Test</button>'+
      '<button class="mg-btn small" data-action="default" '+(m.is_default||!m.enabled?'disabled':'')+'>Set default</button>'+
      '<button class="mg-btn small '+(m.enabled?'danger':'')+'" data-action="toggle">'+(m.enabled?'Disable':'Enable')+'</button></div></article>';
   }).join(""):'<div class="mg-empty">No models registered. Use the form below to add your first provider connection.</div>';
 }
 async function refresh(){
   try{
     const data=await MimoSite.api("/v1/models");models=Array.isArray(data)?data:[];rows();
   }catch(error){$("modelList").innerHTML='<div class="mg-empty">Unable to load model registry. Check API permissions and CORS.</div>';message(error.message,true)}
 }
 $("modelPreset").addEventListener("change",e=>choosePreset(e.target.value));
 $("modelSecret").addEventListener("input",secretEnv);
 $("newModel").addEventListener("click",()=>{clear();$("modelForm").scrollIntoView({behavior:"smooth"})});
 $("cancelEdit").addEventListener("click",clear);
 $("reloadModels").addEventListener("click",refresh);
 $("modelList").addEventListener("click",async e=>{
   const btn=e.target.closest("[data-action]");if(!btn||busy)return;
   const row=btn.closest("[data-id]"),m=models.find(x=>x.id===row?.dataset.id);
   if(!m)return;
   if(btn.dataset.action==="edit"){edit(m);return}
   try {
     btn.disabled=true;
     if(btn.dataset.action==="test"){
       if(!confirm("Send a real test request to "+m.display_name+"? It may incur provider charges."))return;
       btn.textContent="Testing…";
       showConnectionTest({
         title:"Testing "+m.display_name,
         status:"Testing",
         text:"Contacting the configured AI provider…",
         meta:"Model: "+m.remote_model_id+" · This is a real, potentially billable call."
       });
       const result=await MimoSite.api("/v1/models/"+encodeURIComponent(m.id)+"/test",{method:"POST"});
       const reply=String(result?.text??"").trim();
       if(!result?.ok||!reply){
         throw Error("Provider test returned no visible text. Check the server response and completion-token allowance.");
       }
       const usage=result.usage||{};
       const cost=Number(result.cost_usd||0);
       showConnectionTest({
         title:m.display_name+" replied",
         status:"Connected",
         text:reply,
         meta:"Model: "+m.remote_model_id+
           " · Tokens: "+(usage.total_tokens??"not reported")+
           " (output "+(usage.output_tokens??"not reported")+")"+
           " · Estimated cost: "+(Number.isFinite(cost)?"$"+cost.toFixed(6):"unavailable")+
           (result.finish_reason?" · Finish: "+result.finish_reason:"")
       });
       message(m.display_name+" replied successfully.");
     }
     if(btn.dataset.action==="default"){
       await MimoSite.api("/v1/models/"+encodeURIComponent(m.id)+"/default",{method:"POST"});
       message(m.display_name+" is now the default model.");await refresh();
     }
     if(btn.dataset.action==="toggle"){
       if(m.enabled&&!confirm("Disable "+m.display_name+"? Existing workflows using it may stop running."))return;
       await MimoSite.api("/v1/models/"+encodeURIComponent(m.id)+(m.enabled?"/disable":""),{method:m.enabled?"POST":"PATCH",...(m.enabled?{}:{body:{enabled:true}})});
       message("Model status updated.");await refresh();
     }
   }catch(error){
     if(btn.dataset.action==="test"){
       showConnectionTest({
         title:m.display_name+" connection failed",status:"Failed",error:true,
         text:error.message,
         meta:"Confirm the Groq key is referenced in Cloud Run as MIMO_SECRET_GROQ and inspect the backend logs if the provider returns an error."
       });
     }
     message(error.message,true);
   }finally{btn.disabled=false;if(btn.dataset.action==="test")btn.textContent="Test";}
 });
 $("modelForm").addEventListener("submit",async e=>{
   e.preventDefault();if(busy)return;
   const url=$("modelEndpoint").value.trim();
   try{if(new URL(url).protocol!=="https:")throw Error("The provider API URL must be HTTPS.");}
   catch(error){message(error.message,true);return}
   const ref=$("modelSecret").value.trim();
   if(!/^[a-zA-Z0-9_-]+$/.test(ref)){message("Use letters, digits, dash or underscore in the secret reference.",true);return}
   const payload={
     display_name:$("modelName").value.trim(),
     remote_model_id:$("modelRemote").value.trim(),
     endpoint:url,secret_ref:ref,enabled:$("modelEnabled").checked
   };
   if(!editing){
     payload.id=$("modelId").value.trim();
     payload.provider=$("modelProvider").value;
     if(payload.provider==="image_generation"){
       payload.capabilities={image_generation:true,text:false};
       payload.default_response={kind:"image",delivery:"complete"};
     }
   }
   const input=$("modelInputPrice").value,output=$("modelOutputPrice").value;
   if(input!==""||output!==""||$("modelImagePrice").value!==""){
     if(input===""||output===""){message("To set pricing, enter both input and output rates.",true);return}
     payload.pricing={input_per_million:Number(input),output_per_million:Number(output),image_per_unit:Number($("modelImagePrice").value||0),currency:"USD",source:"manual"};
   }
   setBusy(true);
   try{
     await MimoSite.api(editing?"/v1/models/"+encodeURIComponent(editing):"/v1/models",
       {method:editing?"PATCH":"POST",body:payload});
     const msg=editing?"Model settings updated.":"Model registered. Attach its Cloud Run secret before testing.";
     clear();await refresh();message(msg);
   }catch(error){message(error.message,true)}finally{setBusy(false)}
 });
 MimoSite.whenReady(refresh);
})();
