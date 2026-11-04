/* Cumulative usage and backend pre-call spending policies. */
(function(){
 "use strict";
 const $=id=>document.getElementById(id),safe=()=>MimoSite.safe;
 let policies=[],usage=[],models=[],projects=[],projectUsage=[],activeHolds=[];
 function info(text,error=false){MimoSite.notice("budgetFeedback",text,error)}
 function selectModels(){
   $("budgetModel").innerHTML=models.map(m=>'<option value="'+safe()(m.id)+'">'+safe()(m.display_name)+' · '+safe()(m.id)+'</option>').join("");
 }
 function selectProjects(){
   $("budgetProject").innerHTML=projects.map(p=>'<option value="'+safe()(p.id)+'">'+safe()(p.name||p.id)+'</option>').join("");
 }
 function renderPolicies(){
   const html=policies.map(p=>{
     const period=p.period||"lifetime",mode=p.mode||"hard";
     const canUseLifetime=period==="lifetime"&&["global","model","project"].includes(p.scope);
     const amount=p.scope==="model"?usage.find(m=>m.model_id===p.scope_id)?.total_usd||0:
       p.scope==="project"?projectUsage.find(m=>m.project_id===p.scope_id)?.total_usd||0:
       usage.reduce((a,m)=>a+Number(m.total_usd||0),0);
     const fraction=canUseLifetime&&p.hard_usd>0?
       Math.min(100,Math.max(0,100*amount/p.hard_usd)):null;
     const info=canUseLifetime?
       MimoSite.currency(amount)+" recorded of "+MimoSite.currency(p.hard_usd):
       "Window usage is in the on-demand cost report";
     return '<article class="mg-row"><div class="mg-row-body"><strong>'+
       escPolicyTitle(p)+' · '+safe()(period)+" · "+safe()(mode)+
       '</strong><small>'+info+' · threshold '+MimoSite.currency(p.hard_usd)+
       ' · soft '+MimoSite.currency(p.soft_usd)+'</small>'+
       (fraction===null?'':'<div class="mg-progress"><span style="width:'+fraction+'%"></span></div>')+
       '</div></article>';
   }).join("");
   $("policyList").innerHTML=html||'<div class="mg-empty">No spending limits configured.</div>';
   $("totalPolicies").textContent=policies.length;
 }
 function escPolicyTitle(p){
   return p.scope==="global"?"Global":safe()(p.scope)+": "+safe()(p.scope_id);
 }
 function renderUsage(){
   const total=usage.reduce((sum,m)=>sum+Number(m.total_usd||0),0);
   $("usageByProject").innerHTML=projectUsage.length?projectUsage.map(p=>
      '<div class="mg-card"><span class="mg-stat">'+safe()(p.project_id)+'</span>'+
      '<div class="mg-metric">'+MimoSite.currency(p.total_usd)+'</div>'+
      '<div class="mg-metric-label">'+Number(p.calls||0)+' calls · '+Number(p.input_tokens||0).toLocaleString()+' input tokens</div></div>'
   ).join(""):'<div class="mg-empty">No attributed calls yet. Historical requests may appear as unattributed.</div>';
   $("totalSpend").textContent=MimoSite.currency(total);
   $("totalCalls").textContent=String(usage.reduce((sum,m)=>sum+Number(m.calls||0),0));
   $("usageByModel").innerHTML=usage.length?usage.map(m=>
     '<div class="mg-card"><span class="mg-stat">'+safe()(m.model_id)+'</span>'+
     '<div class="mg-metric">'+MimoSite.currency(m.total_usd)+'</div>'+
     '<div class="mg-metric-label">'+Number(m.calls||0)+' calls · '+Number(m.input_tokens||0).toLocaleString()+' input tokens · '+Number(m.output_tokens||0).toLocaleString()+' output tokens</div></div>'
   ).join(""):'<div class="mg-empty">No provider usage recorded yet.</div>';
 }
 function renderReconciliations(data){
   const rows=data.reconciliations||[];
   $("reconciliationAudit").innerHTML=data.unavailable?
     '<div class="mg-empty">'+safe()(data.unavailable)+'</div>':
     rows.length?rows.map(r=>
       '<article class="mg-row"><div class="mg-row-body"><strong>'+
       safe()(r.decision)+' · '+safe()(r.actual_usd)+' USD</strong>'+
       '<small>Evidence: '+safe()(r.evidence_ref)+
       ' · verified by '+safe()(r.verified_by)+
       ' · '+safe()(MimoSite.date(r.decided_at))+'</small></div></article>'
     ).join(""):'<div class="mg-empty">No reconciliations recorded.</div>';
 }
 function selectReservations(){
   $("reservationId").innerHTML=activeHolds.map(r=>
     '<option value="'+safe()(r.id)+'">'+safe()(r.model_id)+
     ' · '+safe()(r.project_id||"admin")+
     ' · '+safe()(r.status)+'</option>'
   ).join("")||'<option value="">No unresolved reservations</option>';
 }
 function renderReservations(data){
   const box=$("budgetReservations"),summary=$("reservationSummary");
   if(data.unavailable){
     summary.textContent="Backend endpoint unavailable";
     box.innerHTML='<div class="mg-empty">Reservation visibility requires the Alternative B backend. '+safe()(data.unavailable)+'</div>';
     return;
   }
   activeHolds=data.items||[];
   selectReservations();
   const count=Number(data.reservation_count||0),amount=Number(data.total_reserved_usd||0);
   summary.textContent=count+" pending/uncertain holds · "+MimoSite.currency(amount)+" estimated";
   box.innerHTML=(data.items||[]).length?(data.items||[]).map(r=>
     '<article class="mg-row"><div class="mg-row-body"><strong>'+
     safe()(r.model_id)+' · '+safe()(r.project_id||"admin")+
     ' <span class="mg-pill '+(r.status==="uncertain"?"warn":"")+'">'+safe()(r.status)+'</span></strong>'+
     '<small>'+MimoSite.currency(r.amount_usd)+' reserved · '+safe()(r.node_id||"model test")+
     ' · '+safe()(MimoSite.date(r.created_at))+'</small></div></article>'
   ).join(""):'<div class="mg-empty">No outstanding reservations.</div>';
 }
 async function refresh(){
   if(!MimoSite.requireCloud())return;
   try{
     const [p,u,m,raw,pr,holds,audit]=await Promise.all([
       MimoSite.api("/v1/budgets"),MimoSite.api("/v1/usage/dashboard"),
       MimoSite.api("/v1/models"),MimoSite.api("/v1/usage"),MimoSite.api("/v1/projects"),
       MimoSite.api("/v1/budgets/reservations").catch(error=>({unavailable:error.message})),
       MimoSite.api("/v1/budgets/reconciliations").catch(error=>({unavailable:error.message}))
     ]);
     policies=p.policies||[];usage=u.by_model||[];projectUsage=u.by_project||[];models=m||[];projects=(pr.projects||[]).filter(p=>!p.revoked);
     renderUsage();renderPolicies();selectModels();selectProjects();renderReservations(holds);renderReconciliations(audit);
     $("usageCalls").innerHTML=(raw.calls||[]).slice(0,30).map(c=>
       '<tr><td>'+safe()(c.model_id)+'</td><td>'+Number(c.input_tokens||0).toLocaleString()+'</td>'+
       '<td>'+Number(c.output_tokens||0).toLocaleString()+'</td><td>'+MimoSite.currency(c.cost_usd)+'</td></tr>'
     ).join("")||'<tr><td colspan="4">No model calls recorded yet.</td></tr>';
   }catch(error){info(error.message,true)}
 }
 $("budgetScope").addEventListener("change",()=>{
   $("budgetModelWrap").hidden=$("budgetScope").value!=="model";
   $("budgetProjectWrap").hidden=$("budgetScope").value!=="project";
   $("budgetCustomWrap").hidden=!["workflow","run"].includes($("budgetScope").value);
 });
 $("budgetForm").addEventListener("submit",async e=>{
   e.preventDefault();
   const scope=$("budgetScope").value,
     scopeId=scope==="model"?$("budgetModel").value:
       scope==="project"?$("budgetProject").value:
       ["workflow","run"].includes(scope)?$("budgetCustom").value.trim():"";
   const period=$("budgetPeriod").value,mode=$("budgetMode").value;
   const hard=Number($("budgetHard").value),soft=Number($("budgetSoft").value);
   if(!Number.isFinite(hard)||hard<0||!Number.isFinite(soft)||soft<0||soft>hard){
     info("Enter a nonnegative hard limit (zero pauses calls) and a soft limit no higher than it.",true);return;
   }
   if(scope==="model"&&!scopeId){info("Select a registered model.",true);return}
   if(scope==="project"&&!scopeId){info("Select an external API project.",true);return}
   if(["workflow","run"].includes(scope)&&!scopeId){info("Enter an exact workflow or run ID.",true);return}
   $("saveBudget").disabled=true;
   try{
     await MimoSite.api("/v1/budgets",{method:"POST",body:{scope,scope_id:scopeId,hard_usd:hard,soft_usd:soft,period,mode}});
     await refresh();info("Spending policy saved.");
   }catch(error){info(error.message,true)}finally{$("saveBudget").disabled=false}
 });
 $("reconcileBudgetForm").addEventListener("submit",async e=>{
   e.preventDefault();
   const id=$("reservationId").value;
   const hold=activeHolds.find(r=>r.id===id);
   if(!hold){MimoSite.notice("budgetReconcileFeedback","Select an unresolved reservation.",true);return}
   const decision=$("reconcileDecision").value;
   const evidence_ref=$("reconcileEvidence").value.trim();
   const reason=$("reconcileReason").value.trim();
   const provider_request_id=$("reconcileProviderRequest").value.trim();
   const actual_usd=$("reconcileActualUsd").value.trim();
   if(evidence_ref.length<8||reason.length<20){
     MimoSite.notice("budgetReconcileFeedback","Provider evidence and a detailed explanation are required.",true);return;
   }
   if(decision==="billed"&&(!provider_request_id||!(Number(actual_usd)>0))){
     MimoSite.notice("budgetReconcileFeedback","Billed reconciliation requires a provider request ID and a positive charge.",true);return;
   }
   const details=decision==="billed"?
     "Record a provider charge of "+MimoSite.currency(actual_usd)+"?":
     "Release the estimated hold as not billed?";
   if(!window.confirm("Confirm provider evidence "+evidence_ref+". "+details+" This action is audited and cannot be undone."))return;
   const body={decision,evidence_ref,reason,
     ...(decision==="billed"?{provider_request_id,actual_usd}:{})};
   $("submitBudgetReconciliation").disabled=true;
   try{
     await MimoSite.api("/v1/budgets/reservations/"+encodeURIComponent(id)+"/reconcile",
       {method:"POST",body});
     MimoSite.notice("budgetReconcileFeedback","Verification recorded in immutable audit history.");
     await refresh();
   }catch(error){MimoSite.notice("budgetReconcileFeedback",error.message,true)}
   finally{$("submitBudgetReconciliation").disabled=false}
 });
 $("refreshBudgets").addEventListener("click",refresh);
 MimoSite.whenReady(refresh);
})();
