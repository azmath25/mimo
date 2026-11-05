/* Approved API metadata only; third-party requests execute on the backend. */
(function(root){
 "use strict";
 const name=/^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
 let installations=[];
 function args(text){
   if(typeof text!=="string"||text.length>16384)throw Error("API arguments exceed 16 KiB.");
   const value=JSON.parse(text||"{}");
   if(!value||Array.isArray(value)||typeof value!=="object")throw Error("API arguments must be an object.");
   for(const [key,item] of Object.entries(value))if(!name.test(key)||!["string","number","boolean"].includes(typeof item)||(typeof item==="number"&&!Number.isFinite(item)))throw Error("Use named string, number or boolean API arguments.");
   return value;
 }
 function config(node){
   if(!name.test(node.apiInstallation||"")||!name.test(node.apiOperation||""))throw Error("Select an approved API connection and operation.");
   return {installation_id:node.apiInstallation,operation:node.apiOperation,args:args(node.apiArgs||"{}")};
 }
 async function load(){
   if(!root.MimoSite?.requireCloud())throw Error("Sign in to load approved API connections.");
   const result=await root.MimoSite.api("/v1/connectors/installations");
   installations=(result.installations||[]).filter(x=>x.adapter==="http_rest"&&x.enabled);
 }
 function inspector(node,scope,safe){
   const connection=installations.find(x=>x.id===node.apiInstallation);
   const operations=connection?.definition?.operations||[];
   const operation=operations.find(x=>x.id===node.apiOperation);
   const options=(items,selected,label)=>items.map(x=>'<option value="'+safe(x.id)+'" '+(x.id===selected?'selected':'')+'>'+safe(label(x))+'</option>').join('');
   let values={};try{values=args(node.apiArgs||"{}")}catch{}
   return '<div class="field"><button class="btn" type="button" data-api-load>Load approved APIs</button><p class="field-hint" data-api-feedback role="status"></p></div>'+
     '<div class="field"><label for="'+scope+'ApiInstallation" class="field-label">Connection</label><select class="selectbox" id="'+scope+'ApiInstallation"><option value="">Select connection</option>'+
     (!connection&&node.apiInstallation?'<option selected value="'+safe(node.apiInstallation)+'">'+safe(node.apiInstallation)+' — load to inspect</option>':'')+
     options(installations,node.apiInstallation,x=>x.id)+'</select></div>'+
     '<div class="field"><label for="'+scope+'ApiOperation" class="field-label">Operation</label><select class="selectbox" id="'+scope+'ApiOperation"><option value="">Select operation</option>'+
     (!operation&&node.apiOperation?'<option selected value="'+safe(node.apiOperation)+'">'+safe(node.apiOperation)+'</option>':'')+
     options(operations,node.apiOperation,x=>x.id+' · '+x.method+' · '+x.effect)+'</select></div>'+
     (operation?Object.entries(operation.arguments||{}).map(([key,spec])=>'<div class="field"><label class="field-label" for="'+scope+'ApiArg_'+safe(key)+'">'+safe(key)+' · '+safe(spec.type)+'</label><input class="textbox" id="'+scope+'ApiArg_'+safe(key)+'" data-api-arg="'+safe(key)+'" data-api-type="'+safe(spec.type)+'" value="'+safe(values[key]??'')+'" placeholder="{{workflow.input.'+safe(key)+'}}"></div>').join(''):'')+
     '<details class="field"><summary>Argument bindings (JSON)</summary><label class="field-label" for="'+scope+'ApiArgs">Names and values only</label><textarea class="areabox" id="'+scope+'ApiArgs" rows="5" maxlength="16384">'+safe(node.apiArgs||'{}')+'</textarea></details>'+
     '<p class="field-hint">Use {{workflow.input.field}} or {{inputs.node_id.field}}. External prices are unknown and excluded from AI cost limits. Writes require human approval. Preview makes no API call.</p><p class="field-hint"><a href="./rest-connections.html">Manage REST connections</a></p>';
 }
 function setArgument(node,key,type,text){
   let value=text;
   if(!/^\{\{.*\}\}$/.test(text.trim())){
     if(type==="boolean"&&["true","false"].includes(text))value=text==="true";
     if(["integer","number"].includes(type)&&text.trim()&&Number.isFinite(Number(text)))value=Number(text);
   }
   let current={};try{current=args(node.apiArgs||"{}")}catch{}
   current[key]=value;node.apiArgs=JSON.stringify(current,null,2);
 }
 const api={args,config,load,inspector,setArgument};root.MimoREST=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
