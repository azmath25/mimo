/* Cumulative usage and backend pre-call spending policies. */
(function(){
 "use strict";
 const $=id=>document.getElementById(id),safe=()=>MimoSite.safe;
 let policies=[],usage=[],models=[];
 function info(text,error=false){MimoSite.notice("budgetFeedback",text,error)}
 function selectModels(){
   $("budgetModel").innerHTML=models.map(m=>'<option value="'+safe()(m.id)+'">'+safe()(m.display_name)+' · '+safe()(m.id)+'</option>').join("");
 }
 function renderPolicies(){
   const html=policies.map(p=>{
     const amount=p.scope==="model"?usage.find(m=>m.model_id===p.scope_id)?.total_usd||0:usage.reduce((a,m)=>a+Number(m.total_usd||0),0);
     const fraction=p.hard_usd>0?Math.min(100,Math.max(0,100*amount/p.hard_usd)):100;
     return '<article class="mg-row"><div class="mg-row-body"><strong>'+
       (p.scope==="global"?"Global spending limit":"Model: "+safe()(p.scope_id))+
       ' <span class="mg-pill '+(fraction>=100?'bad':fraction>=80?'warn':'good')+'">'+Math.round(fraction)+'% used</span></strong>'+
       '<small>'+MimoSite.currency(amount)+' of '+MimoSite.currency(p.hard_usd)+' hard limit'+(Number(p.soft_usd)>0?' · '+MimoSite.currency(p.soft_usd)+' soft warning':'')+'</small>'+
       '<div class="mg-progress"><span style="width:'+fraction+'%"></span></div></div></article>';
   }).join("");
   $("policyList").innerHTML=html||'<div class="mg-empty">No policies yet. Configure a global limit before enabling expensive providers.</div>';
   $("totalPolicies").textContent=policies.length;
 }
 function renderUsage(){
   const total=usage.reduce((sum,m)=>sum+Number(m.total_usd||0),0);
   $("totalSpend").textContent=MimoSite.currency(total);
   $("totalCalls").textContent=String(usage.reduce((sum,m)=>sum+Number(m.calls||0),0));
   $("usageByModel").innerHTML=usage.length?usage.map(m=>
     '<div class="mg-card"><span class="mg-stat">'+safe()(m.model_id)+'</span>'+
     '<div class="mg-metric">'+MimoSite.currency(m.total_usd)+'</div>'+
     '<div class="mg-metric-label">'+Number(m.calls||0)+' calls · '+Number(m.input_tokens||0).toLocaleString()+' input tokens · '+Number(m.output_tokens||0).toLocaleString()+' output tokens</div></div>'
   ).join(""):'<div class="mg-empty">No provider usage recorded yet.</div>';
 }
 async function refresh(){
   if(!MimoSite.requireCloud())return;
   try{
     const [p,u,m,raw]=await Promise.all([
       MimoSite.api("/v1/budgets"),MimoSite.api("/v1/usage/dashboard"),
       MimoSite.api("/v1/models"),MimoSite.api("/v1/usage")
     ]);
     policies=p.policies||[];usage=u.by_model||[];models=m||[];
     renderUsage();renderPolicies();selectModels();
     $("usageCalls").innerHTML=(raw.calls||[]).slice(0,30).map(c=>
       '<tr><td>'+safe()(c.model_id)+'</td><td>'+Number(c.input_tokens||0).toLocaleString()+'</td>'+
       '<td>'+Number(c.output_tokens||0).toLocaleString()+'</td><td>'+MimoSite.currency(c.cost_usd)+'</td></tr>'
     ).join("")||'<tr><td colspan="4">No model calls recorded yet.</td></tr>';
   }catch(error){info(error.message,true)}
 }
 $("budgetScope").addEventListener("change",()=>{
   $("budgetModelWrap").hidden=$("budgetScope").value!=="model";
 });
 $("budgetForm").addEventListener("submit",async e=>{
   e.preventDefault();
   const scope=$("budgetScope").value,scopeId=scope==="model"?$("budgetModel").value:"";
   const hard=Number($("budgetHard").value),soft=Number($("budgetSoft").value);
   if(!Number.isFinite(hard)||hard<=0||!Number.isFinite(soft)||soft<0||soft>hard){
     info("Enter a positive hard limit and a soft limit between zero and the hard limit.",true);return;
   }
   if(scope==="model"&&!scopeId){info("Select a registered model.",true);return}
   $("saveBudget").disabled=true;
   try{
     await MimoSite.api("/v1/budgets",{method:"POST",body:{scope,scope_id:scopeId,hard_usd:hard,soft_usd:soft}});
     await refresh();info("Spending policy saved.");
   }catch(error){info(error.message,true)}finally{$("saveBudget").disabled=false}
 });
 $("refreshBudgets").addEventListener("click",refresh);
 MimoSite.whenReady(refresh);
})();
