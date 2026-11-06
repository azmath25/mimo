/* Admin model registry CRUD. Raw provider API keys never enter the browser. */
(function(){
 "use strict";
 const $=id=>document.getElementById(id),esc=()=>MimoSite.safe;
 let models=[],editing=null,busy=false;
 function message(text,isError=false){MimoSite.notice("modelFeedback",text,isError)}
 function setBusy(v){busy=v;$("saveModel").disabled=v;$("reloadModels").disabled=v}
 const priceFields=["modelInputPrice","modelCachedInputPrice","modelOutputPrice","modelImagePrice"];
 // Number controls in Safari and non-English locales can discard fractional input.
 // Accept either decimal comma or decimal dot; reject malformed values rather
 // than silently coercing them to zero.
 function parsePrice(id,label){
   const raw=$(id).value.trim().replace(",",".");
   if(raw==="")return null;
   if(!/^\d+(?:\.\d+)?$/.test(raw)||!Number.isFinite(Number(raw))||Number(raw)>1000000){
     throw Error(label+" must be a non-negative decimal (for example 0.075 or 0,075).");
   }
   return Number(raw);
 }
 function displayPrice(id,value){
   $(id).value=Number.isFinite(Number(value))?String(value):"";
 }
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
     id:"groq_text",name:"Groq GPT-OSS 20B",
     provider:"openai_compatible",endpoint:"https://api.groq.com/openai/v1",
     model:"openai/gpt-oss-20b",secret:"groq",input:"",output:""
   },
   groq_120b:{
     id:"groq_120b",name:"Groq GPT-OSS 120B",
     provider:"openai_compatible",endpoint:"https://api.groq.com/openai/v1",
     model:"openai/gpt-oss-120b",secret:"groq",input:"",output:""
   },
   groq_vision:{
     id:"groq_vision",name:"Groq Vision (Qwen 3.8 27B)",
     provider:"openai_compatible",endpoint:"https://api.groq.com/openai/v1",
     model:"qwen/qwen3.8-27b",secret:"groq",input:"",output:"",vision:true
   },
   gemini:{
     id:"gemini_flash",name:"Gemini Flash",
     provider:"openai_compatible",endpoint:"https://generativelanguage.googleapis.com/v1beta/openai",
     model:"gemini-3.8-flash",secret:"gemini",input:"",output:"",vision:true
   },
   deepseek:{
     id:"deepseek_flash",name:"DeepSeek Flash",
     provider:"openai_compatible",endpoint:"https://api.deepseek.com",
     model:"deepseek-flash",secret:"deepseek",input:"",output:""
   },
   cerebras:{
     id:"cerebras_custom",name:"Cerebras — choose model ID",
     provider:"openai_compatible",endpoint:"https://api.cerebras.ai/v1",
     model:"",secret:"cerebras",input:"",output:""
   },
   openai:{
     id:"openai_custom",name:"OpenAI — choose model ID",
     provider:"openai_compatible",endpoint:"https://api.openai.com/v1",
     model:"",secret:"openai",input:"",output:""
   }
 };
 // These are suggestions, not an exhaustive or live model catalog.
 // The exact remote ID can always be typed manually.
 const providerSuggestions={
   groq:["groq","groq_120b","groq_vision"],
   groq_120b:["groq_120b","groq","groq_vision"],
   groq_vision:["groq_vision","groq","groq_120b"],
   openrouter:["openrouter"],
   gemini:["gemini"],
   deepseek:["deepseek"],
   cerebras:[],
   openai:[]
 };
 function setCapabilities(p){
   const generate=p.provider==="image_generation";
   $("capText").checked=!generate;
   $("capVision").checked=!!p.vision;
   $("capGenerate").checked=generate;
 }
 function fillSuggestionList(name,selected){
   const ids=providerSuggestions[name]||[];
   $("modelSuggestion").innerHTML=ids.map(id=>{
     const p=providerPresets[id];
     return '<option value="'+id+'">'+MimoSite.safe(p.name)+' · '+MimoSite.safe(p.model)+'</option>';
   }).join("")+'<option value="custom">Use my own model ID</option>';
   $("modelSuggestion").value=ids.includes(selected)?selected:"custom";
   $("modelSuggestionsWrap").hidden=ids.length===0;
 }
 function applySuggested(name,keepProvider=false){
   const p=providerPresets[name];if(!p||editing)return;
   $("modelId").value=p.id;$("modelName").value=p.name;
   $("modelRemote").value=p.model;
   if(!keepProvider){
     $("modelProvider").value=p.provider;
     $("modelEndpoint").value=p.endpoint;
     $("modelSecret").value=p.secret;
     $("modelInputPrice").value=p.input;$("modelOutputPrice").value=p.output;
     $("modelImagePrice").value="";
   }
   setCapabilities(p);secretEnv();
   message("Configuration filled. "+($("modelSecretHint").textContent||"")+
     (p.model?"":" Enter a supported model ID from your provider before registering."));
 }
 function choosePreset(name){
   if(editing)return;
   if(!providerPresets[name]){
     fillSuggestionList("","custom");
     message("Enter any OpenAI-compatible API endpoint, the exact model ID and a secret reference. No backend code changes are needed.");
     return;
   }
   fillSuggestionList(name,name);
   applySuggested(name);
 }
 function secretEnv(){
   const ref=$("modelSecret").value.trim();
   const key=ref?"MIMO_SECRET_"+ref.toUpperCase().replace(/-/g,"_"):"MIMO_SECRET_…";
   $("modelSecretEnv").value=key;
   const reuse=models.some(m=>m.secret_ref===ref&&m.secret_configured);
   $("modelSecretHint").textContent=!ref?"Choose a reference, then configure its API key in the secure form.":
      reuse?"A registered model already uses this configured key reference.":
      "After registering, use Manage key to securely store the provider key.";
 }
 function clear(){
   editing=null;$("modelForm").reset();$("modelPreset").disabled=false;$("modelPreset").value="";$("modelId").disabled=false;
   $("modelProvider").disabled=false;$("modelEnabled").checked=true;
   $("saveModel").textContent="Register model";$("modelFormTitle").textContent="Register a model";
   $("cancelEdit").hidden=true;fillSuggestionList("","custom");
   $("capText").checked=true;$("capVision").checked=false;$("capGenerate").checked=false;
   secretEnv();message("");
 }
 function edit(m){
   editing=m.id;$("modelPreset").value="";$("modelPreset").disabled=true;$("modelId").value=m.id;$("modelId").disabled=true;
   $("modelProvider").value=m.provider;$("modelProvider").disabled=true;
   fillSuggestionList("","custom");
   $("modelName").value=m.display_name;$("modelRemote").value=m.remote_model_id;
   $("modelEndpoint").value=m.endpoint;$("modelSecret").value=m.secret_ref;
   $("modelEnabled").checked=m.enabled;
   $("capText").checked=!!(m.capabilities?.text||m.capabilities?.chat);
   $("capVision").checked=!!m.capabilities?.image_understanding;
   $("capGenerate").checked=!!m.capabilities?.image_generation;
   priceFields.forEach(id=>{$(id).value="";$(id).disabled=true});
   $("saveModel").textContent="Save model changes";$("modelFormTitle").textContent="Edit "+m.display_name;
   $("cancelEdit").hidden=false;secretEnv();message("");
   $("modelForm").scrollIntoView({behavior:"smooth",block:"center"});
   // The model list does not include prices; fetch the latest price revision
   // instead of showing empty fields and allowing accidental zero submissions.
   $("saveModel").disabled=true;
   MimoSite.api("/v1/models/"+encodeURIComponent(m.id)+"/pricing")
     .then(price=>{
       if(editing!==m.id)return;
       displayPrice("modelInputPrice",price.input_per_million);
       displayPrice("modelCachedInputPrice",price.cached_input_per_million);
       displayPrice("modelOutputPrice",price.output_per_million);
       displayPrice("modelImagePrice",price.image_per_unit);
       message("Current pricing loaded. Enter USD per million tokens; decimals may use a dot or comma.");
     })
     .catch(error=>{
       if(editing===m.id)message("Could not load current pricing; enter both input and output prices to update them. "+error.message,true);
     })
     .finally(()=>{
       if(editing===m.id){priceFields.forEach(id=>$(id).disabled=false);$("saveModel").disabled=busy}
     });
 }
 function clone(m){
   clear();
   const suffix="_copy";
   const base=m.id.slice(0,64-suffix.length);
   let candidate=(base+suffix).slice(0,64),count=2;
   while(models.some(other=>other.id===candidate)){
     candidate=(base.slice(0,62-String(count).length)+"_"+count++).slice(0,64);
   }
   $("modelId").value=candidate;
   $("modelName").value=m.display_name+" (copy)";
   $("modelProvider").value=m.provider;
   $("modelRemote").value=m.remote_model_id;
   $("modelEndpoint").value=m.endpoint;
   $("modelSecret").value=m.secret_ref;
   $("modelEnabled").checked=m.enabled;
   $("capText").checked=!!(m.capabilities?.text||m.capabilities?.chat);
   $("capVision").checked=!!m.capabilities?.image_understanding;
   $("capGenerate").checked=!!m.capabilities?.image_generation;
   secretEnv();
   message("Copied the public configuration; edit the model ID or endpoint, then register. The existing secret reference is reused.");
   $("modelForm").scrollIntoView({behavior:"smooth",block:"start"});
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
      '<small class="mg-break">'+safe(m.endpoint)+' · secret reference '+safe(m.secret_ref)+
       (m.capabilities?.image_understanding?' · vision':'')+
       (m.capabilities?.image_generation?' · images':'')+'</small></div>'+
      '<div class="mg-row-actions"><button class="mg-btn small" data-action="edit">Edit</button>'+
      '<button class="mg-btn small" data-action="clone" title="Copy configuration and reuse the attached provider key">Duplicate</button><button class="mg-btn small" data-action="key">Manage key</button>'+
      '<button class="mg-btn small" data-action="test" '+(m.provider==="image_generation"?'disabled title="Image-model test is not yet supported"':'')+'>Test</button>'+
      '<button class="mg-btn small" data-action="default" '+(m.is_default||!m.enabled?'disabled':'')+'>Set default</button>'+
      '<button class="mg-btn small '+(m.enabled?'danger':'')+'" data-action="toggle">'+(m.enabled?'Disable':'Enable')+'</button></div></article>';
   }).join(""):'<div class="mg-empty">No models registered. Use the form below to add your first provider connection.</div>';
 }
 async function refresh(){
   try{
     const data=await MimoSite.api("/v1/models");models=Array.isArray(data)?data:[];rows();secretEnv();
   }catch(error){$("modelList").innerHTML='<div class="mg-empty">Unable to load model registry. Check API permissions and CORS.</div>';message(error.message,true)}
 }
 $("modelPreset").addEventListener("change",e=>choosePreset(e.target.value));
 $("modelSuggestion").addEventListener("change",e=>{
   if(editing||e.target.value==="custom")return;
   applySuggested(e.target.value,true);
 });
 $("modelProvider").addEventListener("change",e=>{
   if(e.target.value==="image_generation"){
     $("capGenerate").checked=true;$("capText").checked=false;$("capVision").checked=false;
   }else{
     $("capGenerate").checked=false;$("capText").checked=true;
   }
 });
 $("modelSecret").addEventListener("input",secretEnv);
 $("newModel").addEventListener("click",()=>{clear();$("modelForm").scrollIntoView({behavior:"smooth"})});
 $("cancelEdit").addEventListener("click",clear);
 $("reloadModels").addEventListener("click",refresh);
 $("modelList").addEventListener("click",async e=>{
   const btn=e.target.closest("[data-action]");if(!btn||busy)return;
   const row=btn.closest("[data-id]"),m=models.find(x=>x.id===row?.dataset.id);
   if(!m)return;
   if(btn.dataset.action==="edit"){edit(m);return}
   if(btn.dataset.action==="clone"){clone(m);return}
   if(btn.dataset.action==="key"){
     $("providerKeyRef").value=m.secret_ref;
     $("providerKeyValue").value="";
     $("providerKeyValue").focus();
     $("providerKeyForm").scrollIntoView({behavior:"smooth",block:"center"});
     return;
   }
   try {
     btn.disabled=true;
     if(btn.dataset.action==="test"){
       if(!m.enabled||!m.secret_configured){
         const secretEnv=m.secret_ref;
         showConnectionTest({
           title:m.display_name+" is not ready",
           status:"Not configured",
           error:true,
           text:!m.enabled
             ?"This model is disabled. Enable it before testing."
             :"No provider key is configured for reference "+secretEnv+".",
           meta:"Use Manage key to configure the provider in Secret Manager, then refresh this page."
         });
         return;
       }
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
         meta:"Check the model ID, endpoint, provider limits and provider key under Manage key."
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
   if(!$("modelRemote").value.trim()){
     message("Enter the exact model ID supported by this provider.",true);return;
   }
   const generating=$("modelProvider").value==="image_generation";
   if(generating!==$("capGenerate").checked){
     message("Image generation requires the Image generation backend adapter and must be unchecked for text/chat models.",true);return;
   }
   if(!generating&&!$("capText").checked){
     message("Enable Text / chat for an OpenAI-compatible model.",true);return;
   }
   const payload={
     display_name:$("modelName").value.trim(),
     remote_model_id:$("modelRemote").value.trim(),
     endpoint:url,secret_ref:ref,enabled:$("modelEnabled").checked,
     capabilities:{
       text:!generating&&$("capText").checked,
       chat:!generating&&$("capText").checked,
       image_understanding:!generating&&$("capVision").checked,
       image_generation:generating
     }
   };
   if(!editing){
     payload.id=$("modelId").value.trim();
     payload.provider=$("modelProvider").value;
     if(generating){
       payload.default_response={kind:"image",delivery:"complete"};
     }
   }
   try{
     const input=parsePrice("modelInputPrice","Input price");
     const cached=parsePrice("modelCachedInputPrice","Cached input price");
     const output=parsePrice("modelOutputPrice","Output price");
     const image=parsePrice("modelImagePrice","Image price");
     if([input,cached,output,image].some(v=>v!==null)){
       if(input===null||output===null){
         message("Enter both input and output rates to update pricing.",true);return;
       }
       payload.pricing={
         input_per_million:input,
         cached_input_per_million:cached??input,
         output_per_million:output,
         image_per_unit:image??0,
         currency:"USD",source:"manual"
       };
     }
   }catch(error){message(error.message,true);return;}
   setBusy(true);
   try{
     await MimoSite.api(editing?"/v1/models/"+encodeURIComponent(editing):"/v1/models",
       {method:editing?"PATCH":"POST",body:payload});
     const savedId=editing||payload.id;
     // Do not clear a successful edit; disappearing decimals caused confusion.
     // Read back the persisted prices and show what Mimo actually saved.
     let status=editing?"Model settings saved.":"Model registered.";
     if(payload.pricing){
       try{
         const p=await MimoSite.api("/v1/models/"+encodeURIComponent(savedId)+"/pricing");
         const matches=[
           ["input_per_million","input_per_million"],
           ["cached_input_per_million","cached_input_per_million"],
           ["output_per_million","output_per_million"],
           ["image_per_unit","image_per_unit"]
         ].every(([key,field])=>Math.abs(Number(p[key])-Number(payload.pricing[field]))<0.00000001);
         if(!matches)throw Error("read-back did not match the submitted rates");
         status+=" Verified input $"+p.input_per_million+" and output $"+p.output_per_million+" per 1M tokens.";
         displayPrice("modelInputPrice",p.input_per_million);
         displayPrice("modelCachedInputPrice",p.cached_input_per_million);
         displayPrice("modelOutputPrice",p.output_per_million);
         displayPrice("modelImagePrice",p.image_per_unit);
       }catch(error){
         status+=" Pricing could not be verified ("+error.message+"). Recheck before running a workflow.";
       }
     }
     if(!editing)clear();
     await refresh();
     message(status);
   }catch(error){message(error.message,true)}finally{setBusy(false)}
 });

 $("providerKeyForm").addEventListener("submit", async event=>{
   event.preventDefault();
   if(busy)return;
   const ref=$("providerKeyRef").value.trim();
   const secret=$("providerKeyValue").value;
   if(!/^[A-Za-z0-9_-]{1,128}$/.test(ref)||secret.length<8){
     MimoSite.notice("providerKeyFeedback","Enter a valid reference and API key.",true);return;
   }
   if(!confirm("Securely save or rotate the provider key for "+ref+"? Every model using this reference will use the new key."))return;
   const button=$("saveProviderKey");button.disabled=true;
   try{
     await MimoSite.api("/v1/models/provider-keys/"+encodeURIComponent(ref),{
       method:"PUT",body:{api_key:secret}
     });
     MimoSite.notice("providerKeyFeedback","Provider key securely saved. The value cannot be read back.");
     await refresh();
   }catch(error){
     MimoSite.notice("providerKeyFeedback",error.message,true);
   }finally{
     $("providerKeyValue").value="";
     button.disabled=false;
   }
 });
 $("clearProviderKey").addEventListener("click",()=>{
   $("providerKeyRef").value="";$("providerKeyValue").value="";
 });
 MimoSite.whenReady(refresh);
})();
