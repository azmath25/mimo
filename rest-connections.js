/* Administrative REST configuration. Only explicit tests dispatch external IO. */
(function(){
 "use strict";
 const $=id=>document.getElementById(id),safe=value=>MimoSite.safe(String(value));
 let installations=[],testKey=null,testFingerprint=null;
 const sample=[{id:"lookup_item",effect:"read",method:"GET",path_template:"/v1/items/{item_id}",
   arguments:{item_id:{type:"string",max_length:60}},query:{},json_body:{},outputs:{price:"/item/price"},
   limits:{total_seconds:15,max_response_bytes:65536,requests_per_minute:30,concurrency:1,calls_per_run:10}}];
 $("restOperations").value=JSON.stringify(sample,null,2);
 const message=(text,error=false)=>MimoSite.notice("restStatus",text,error);
 function authFields(){
   $("restSecretField").hidden=$("restAuth").value==="none";
   $("restHeaderField").hidden=$("restAuth").value!=="api_key_header";
   $("restSecret").required=$("restAuth").value!=="none";
 }
 $("restAuth").addEventListener("change",authFields);
 function testOperations(){
   const found=installations.find(x=>x.id===$("restTestConnection").value);
   $("restTestOperation").innerHTML=(found?.definition?.operations||[]).filter(x=>x.effect==="read")
     .map(x=>'<option value="'+safe(x.id)+'">'+safe(x.id)+'</option>').join("");
 }
 async function refresh(){
   if(!MimoSite.requireCloud())return;
   const result=await MimoSite.api("/v1/connectors/installations");
   installations=(result.installations||[]).filter(x=>x.adapter==="http_rest");
   $("restList").innerHTML=installations.map(x=>'<article class="mg-row"><div class="mg-row-body"><strong>'+safe(x.id)+'</strong><small>'+safe(x.resource)+' · '+(x.enabled?'Enabled':'Disabled')+'</small><small>'+safe(x.definition.operations.map(o=>o.id+' ('+o.effect+')').join(', '))+'</small></div><button class="mg-btn small" type="button" data-rest-toggle="'+safe(x.id)+'">'+(x.enabled?'Disable':'Enable')+'</button></article>').join('')||'<p class="mg-hint">No REST connections installed.</p>';
   $("restTestConnection").innerHTML=installations.filter(x=>x.enabled).map(x=>'<option value="'+safe(x.id)+'">'+safe(x.id)+'</option>').join('');
   testOperations();
 }
 $("restTestConnection").addEventListener("change",testOperations);
 $("restRefresh").addEventListener("click",()=>refresh().catch(e=>message(e.message,true)));
 MimoSite.whenReady(()=>refresh().catch(e=>message(e.message,true)));
 $("restForm").addEventListener("submit",async event=>{
   event.preventDefault();if(!MimoSite.requireCloud())return;
   $("restSave").disabled=true;
   try{
     if(!$("restCostConsent").checked)throw Error("Acknowledge unknown external costs first.");
     const operations=JSON.parse($("restOperations").value);
     if(!Array.isArray(operations)||!operations.length)throw Error("Add at least one operation.");
     const auth={mode:$("restAuth").value};
     if(auth.mode!=="none")auth.secret_ref=$("restSecret").value.trim();
     if(auth.mode==="api_key_header")auth.header=$("restHeader").value.trim();
     await MimoSite.api("/v1/connectors/installations",{method:"POST",body:{id:$("restId").value.trim(),adapter:"http_rest",enabled:true,
       definition:{base_origin:$("restOrigin").value.trim(),auth,operations:operations.map(x=>({...x,acknowledge_unknown_cost:true}))}}});
     message("Connection saved. Grant its operations to a project before using it.");await refresh();
   }catch(error){message(error.message,true)}finally{$("restSave").disabled=false}
 });
 $("restList").addEventListener("click",async event=>{
   const button=event.target.closest("[data-rest-toggle]");if(!button||!MimoSite.requireCloud())return;
   const row=installations.find(x=>x.id===button.dataset.restToggle);if(!row)return;
   button.disabled=true;
   try{await MimoSite.api("/v1/connectors/installations",{method:"POST",body:{id:row.id,adapter:"http_rest",definition:row.definition,enabled:!row.enabled}});message(row.enabled?"Connection disabled for new dispatches.":"Connection enabled; existing project grants still apply.");await refresh()}
   catch(error){message(error.message,true)}finally{button.disabled=false}
 });
 $("restTestForm").addEventListener("submit",async event=>{
   event.preventDefault();if(!MimoSite.requireCloud())return;
   $("restTestButton").disabled=true;
   try{
     const id=$("restTestConnection").value,operation=$("restTestOperation").value;
     if(!id||!operation)throw Error("Select an enabled connection and read operation.");
     const body={project_id:$("restTestProject").value.trim(),operation,args:JSON.parse($("restTestArgs").value)};
     const fingerprint=JSON.stringify([id,body]);
     // Retain identity after transport failure to avoid an accidental duplicate charge.
     if(testFingerprint!==fingerprint){testKey=crypto.randomUUID();testFingerprint=fingerprint}
     if(!window.confirm("Send one request to "+id+" using "+operation+"? The external provider may charge for this read."))return;
     const result=await MimoSite.api("/v1/connectors/installations/"+encodeURIComponent(id)+"/test",{method:"POST",body:{...body,idempotency_key:testKey}});
     $("restTestResult").textContent=JSON.stringify(result,null,2);
     // A deliberate future test may create a fresh request only after a known result.
     if(result.status==="completed"||result.status==="failed"){testKey=null;testFingerprint=null}
   }catch(error){$("restTestResult").textContent=error.message}finally{$("restTestButton").disabled=false}
 });
})();
