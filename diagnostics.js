/* Read-only production diagnostics. Never triggers providers, queues or recovery. */
(function(){
"use strict";
const $=id=>document.getElementById(id),safe=v=>MimoSite.safe(v);
let busy=false;
function display(rows){
 $("serviceSummary").innerHTML=rows.map(x=>
  '<article class="mg-row"><div class="mg-row-body"><strong>'+safe(x.name)+
  '</strong><small>'+safe(x.value)+'</small></div></article>').join("");
}
function displayOps(rows){
 $("operationsSummary").innerHTML=rows.map(x=>
  '<article class="mg-row"><div class="mg-row-body"><strong>'+safe(x.name)+
  '</strong><small>'+safe(x.value)+'</small></div>'+
  (x.warning?'<span class="mg-pill warn">Review</span>':'')+'</article>').join("");
}
async function check(){
 if(busy||!MimoSite.requireCloud())return;
 busy=true;
 $("refreshDiagnostics").disabled=true;
 try{
  const origin=MimoCloud.apiOrigin,api=p=>MimoSite.api(p);
  const [health,service,capabilities,models,runs]=await Promise.all([
   api("/health/ready"),api("/health/service"),api("/v1/capabilities"),
   api("/v1/models"),api("/v1/runs?limit=1")
  ]);
  if(!MimoSite.requireCloud())return; // sign-out while awaiting backend
  display([
   {name:"API origin",value:origin||"Not configured"},
   {name:"Service role",value:service.role||"unknown"},
   {name:"Database",value:health.db===true?"Connected":"Not ready"},
   {name:"Object storage",value:health.storage===true?"Connected":"Not ready"},
   {name:"Run history API",value:Array.isArray(runs.runs)?"Available":"Unavailable"},
   {name:"Publishing API access",value:service.published_runs_enabled
     ?"Available on this origin":"Requires separate execution role"}
  ]);
  $("capabilitySummary").textContent=JSON.stringify(capabilities,null,2);
  $("providerSummary").innerHTML=Array.isArray(models)&&models.length?models.map(m=>
   '<article class="mg-row"><div class="mg-row-body"><strong>'+safe(m.display_name)+
   '</strong><small>'+(m.enabled?"Enabled":"Disabled")+" · "+
   (m.secret_configured?"Credential configured":"Credential missing")+
   " · "+safe(m.id)+"</small></div></article>").join(""):
   '<div class="mg-empty">No AI models registered.</div>';
  // Fail each optional operational probe independently. A missing metrics
  // endpoint never blocks basic health diagnostics or browser authentication.
  const names=["dispatch","rpm","parallel","connectors","budgets","installations","projects"];
  const endpoints=[
   "/v1/metrics/dispatch","/v1/metrics/model-rpm","/v1/metrics/parallel",
   "/v1/metrics/connectors","/v1/budgets","/v1/connectors/installations",
   "/v1/projects"
  ];
  const probes=await Promise.allSettled(endpoints.map(api));
  if(!MimoSite.requireCloud())return;
  const optional={capabilities};
  probes.forEach((result,index)=>{if(result.status==="fulfilled")optional[names[index]]=result.value});
  displayOps(window.MimoOps.summarize(optional));
  const missing=probes.filter(x=>x.status!=="fulfilled").length;
  MimoSite.notice("diagnosticsFeedback",
    "Read-only checks completed"+(missing?" · "+missing+" optional metrics unavailable":"")+
    ". No provider calls, queue tasks or recovery actions were run.",missing>0);
 }catch(e){
  if(MimoSite.requireCloud())MimoSite.notice("diagnosticsFeedback",
   "Core readiness check failed: "+e.message,true);
 }finally{busy=false;$("refreshDiagnostics").disabled=false}
}
$("refreshDiagnostics").addEventListener("click",check);
MimoSite.whenReady(check);
})();
