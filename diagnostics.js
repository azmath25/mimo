/* Read-only, fail-closed diagnostics. No secret material is displayed. */
(function(){
"use strict";
const $=id=>document.getElementById(id),safe=v=>MimoSite.safe(v);
function display(rows){$("serviceSummary").innerHTML=rows.map(x=>'<article class="mg-row"><div class="mg-row-body"><strong>'+safe(x.name)+'</strong><small>'+safe(x.value)+'</small></div></article>').join("")}
async function check(){
 if(!MimoSite.requireCloud())return;
 $("refreshDiagnostics").disabled=true;
 try{
  const origin=MimoCloud.apiOrigin, api=(p)=>MimoSite.api(p);
  const [health,service,capabilities,models,runs]=await Promise.all([
   api("/health/ready"),api("/health/service"),api("/v1/capabilities"),
   api("/v1/models"),api("/v1/runs?limit=1")
  ]);
  display([
   {name:"API origin",value:origin},
   {name:"Service role",value:service.role||"unknown"},
   {name:"Database",value:health.db===true?"Connected":"Not ready"},
   {name:"Object storage",value:health.storage===true?"Connected":"Not ready"},
   {name:"Run history API",value:Array.isArray(runs.runs)?"Available":"Unavailable"},
   {name:"Publishing API access",value:service.published_runs_enabled?"Available on this origin":"Requires separate execution role"}
  ]);
  $("capabilitySummary").textContent=JSON.stringify(capabilities,null,2);
  $("providerSummary").innerHTML=models.length?models.map(m=>
    '<article class="mg-row"><div class="mg-row-body"><strong>'+safe(m.display_name)+'</strong><small>'+
    (m.enabled?"Enabled":"Disabled")+" · "+(m.secret_configured?"Credential configured":"Credential missing")+
    ' · '+safe(m.id)+'</small></div></article>').join(""):'<div class="mg-empty">No AI models registered.</div>';
  MimoSite.notice("diagnosticsFeedback","Configuration and connectivity checks completed. Provider calls and compiler execution still require live testing.");
 }catch(e){MimoSite.notice("diagnosticsFeedback","Readiness check failed: "+e.message,true)}
 finally{$("refreshDiagnostics").disabled=false}
}
$("refreshDiagnostics").addEventListener("click",check);
MimoSite.whenReady(check);
})();