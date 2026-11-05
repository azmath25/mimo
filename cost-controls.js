/* M-COST controls. All additional API reads require explicit user action. */
(function(){
 "use strict";
 const $=id=>document.getElementById(id);
 const esc=value=>MimoSite.safe(String(value==null?"":value));
 const money=value=>MimoSite.currency(Number(value||0));
 const ready=()=>MimoSite.requireCloud();
 const request=(path,opts)=>MimoSite.api(path,opts);
 const status=(id,message,error=false)=>MimoSite.notice(id,message,error);
 const loading=(id,message)=>{$(id).textContent=message};
 const row=(headline,details)=>'<article class="mg-row"><div class="mg-row-body"><strong>'+
     esc(headline)+'</strong><small>'+esc(details)+'</small></div></article>';
 let projectsFetched=false;

 $("loadCostPrices").addEventListener("click",async()=>{
   if(!ready())return;
   const target="costPrices";loading(target,"Checking price records…");
   try{
     const response=await request("/v1/cost/model-prices"),models=response.models||[];
     const unknown=models.filter(x=>x.pricing_status==="unknown");
     $(target).innerHTML=row("Price audit",unknown.length+" of "+models.length+
       " models have missing or unverified zero-dollar pricing.")+
       models.map(m=>row(
         m.display_name+" · "+m.pricing_status,
         m.model_id+" · "+m.remote_model_id+
         " · input $"+(m.input_per_million??"?")+"/M · output $"+
         (m.output_per_million??"?")+"/M · source "+(m.price_source||"missing")
       )).join("");
   }catch(error){loading(target,error.message)}
 });

 $("loadCostReport").addEventListener("click",async()=>{
   if(!ready())return;
   const target="costReport",period=$("costPeriod").value;loading(target,"Loading provider cost ledger…");
   try{
     const report=await request("/v1/cost/report?period="+encodeURIComponent(period));
     const groups=[
       ["Models",report.by_model],
       ["API projects",report.by_project],
       ["Workflows",report.by_workflow],
       ["Runs",report.by_run],
       ["Blocks",report.by_node]
     ];
     let html=row(
       "Recorded cost: "+money(report.known_total_usd),
       period+" · UTC ledger-ingestion period (not provider invoice date) · "+report.outstanding_holds+" unresolved holds ("+
       money(report.outstanding_estimated_holds_usd)+" reserved). Provider invoices can differ."
     );
     for(const [name,items] of groups){
       html+='<h3 class="mg-section" style="font-size:14px;margin:15px 0 8px">'+esc(name)+'</h3>';
       html+=(items||[]).slice(0,30).map(item=>row(
         item.id+" · "+money(item.usd),
         item.calls+" recorded charge"+(item.calls===1?"":"s")
       )).join("")||'<p class="mg-hint">No attributed charges</p>';
     }
     $(target).innerHTML=html;
   }catch(error){loading(target,error.message)}
 });

 $("loadCostAlerts").addEventListener("click",async()=>{
   if(!ready())return;loading("costAlerts","Loading threshold alerts…");
   try{
     const response=await request("/v1/cost/alerts");
     $("costAlerts").innerHTML=(response.alerts||[]).map(a=>row(
       "Threshold crossed · "+money(a.projected_usd),
       "Run: "+(a.run_id||"unattributed")+" · Policy: "+a.policy_id+
       " · "+MimoSite.date(a.created_at)
     )).join("")||'<p class="mg-hint">No soft threshold alerts recorded.</p>';
   }catch(error){loading("costAlerts",error.message)}
 });

 $("costApproveForm").addEventListener("submit",async e=>{
   e.preventDefault();if(!ready())return;
   const run=$("costApproveRun").value.trim(),policy_id=$("costApprovePolicy").value.trim();
   const extra_usd=Number($("costApproveExtra").value);
   const expires_hours=Number($("costApproveExpiry").value);
   const reason=$("costApproveReason").value.trim();
   if(!/^[a-f\d-]{36}$/i.test(run)||!/^[a-f\d-]{36}$/i.test(policy_id)){
     status("costApproveStatus","Enter valid UUIDs for the run and policy.",true);return;
   }
   if(!(extra_usd>0)||extra_usd>100000||!Number.isInteger(expires_hours)||expires_hours<1||expires_hours>168||reason.length<12){
     status("costApproveStatus","Check the extra amount, expiry and audited reason.",true);return;
   }
   if(!window.confirm(
     "Authorize an ADDITIONAL "+money(extra_usd)+" for this run and policy for "+
     expires_hours+" hours? This does not override other hard limits. No provider call will run until explicit resume."
   ))return;
   const button=e.currentTarget.querySelector("button[type=submit]");button.disabled=true;
   try{
     const result=await request("/v1/cost/runs/"+encodeURIComponent(run)+"/approve",{
       method:"POST",body:{policy_id,extra_usd,expires_hours,reason}
     });
     status("costApproveStatus","Approved until "+MimoSite.date(result.expires_at)+
       ". Return to Runs & reviews and explicitly resume the run.");
   }catch(error){status("costApproveStatus",error.message,true)}
   finally{button.disabled=false}
 });

 async function loadProjects(){
   if(projectsFetched||!ready())return;
   const response=await request("/v1/projects");
   const projects=(response.projects||[]).filter(x=>!x.revoked);
   $("costProjectCapId").innerHTML=projects.map(x=>
     '<option value="'+esc(x.id)+'">'+esc(x.name||x.id)+'</option>'
   ).join("");
   projectsFetched=true;
 }
 $("costProjectCapForm").closest("details").addEventListener("toggle",e=>{
   if(e.currentTarget.open)loadProjects().catch(error=>status("costProjectCapStatus",error.message,true));
 });
 $("costProjectCapForm").addEventListener("submit",async e=>{
   e.preventDefault();if(!ready())return;
   const id=$("costProjectCapId").value,cap=Number($("costProjectCap").value);
   if(!id||!Number.isInteger(cap)||cap<1||cap>100){
     status("costProjectCapStatus","Select a project and an integer cap from 1 to 100.",true);return;
   }
   const button=e.currentTarget.querySelector("button[type=submit]");button.disabled=true;
   try{
     await request("/v1/cost/projects/"+encodeURIComponent(id)+"/concurrency",{
       method:"PUT",body:{max_concurrent_runs:cap}
     });
     status("costProjectCapStatus","Saved: "+id+" has at most "+cap+" active runs.");
   }catch(error){status("costProjectCapStatus",error.message,true)}
   finally{button.disabled=false}
 });
 $("loadCostProjectCaps").addEventListener("click",async()=>{
   if(!ready())return;loading("costProjectCaps","Loading project caps…");
   try{
     const d=await request("/v1/cost/projects/concurrency");
     $("costProjectCaps").innerHTML=(d.projects||[]).map(x=>row(
       x.project_id,x.max_concurrent_runs+" active runs maximum"
     )).join("")||'<p class="mg-hint">No project concurrency caps yet.</p>';
   }catch(error){loading("costProjectCaps",error.message)}
 });
})();
