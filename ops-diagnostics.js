/* Mimo operational readiness: pure, read-only summarizer. No provider requests. */
(function(root){
"use strict";
const count=v=>Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):null;
const metric=(name,value,warning=false)=>({name,value,warning});
function summarize(report){
  const results=[];
  const {capabilities,dispatch,rpm,parallel,connectors,budgets,installations,projects}=report||{};
  const none="Unavailable — not confirmed";
  const ready=(obj)=>obj&&typeof obj==="object";
  if(ready(dispatch)){
    const urgent=count(dispatch.counts?.exhausted)||0;
    const pending=count(dispatch.ready_to_dispatch);
    results.push(metric("Dispatch outbox",dispatch.status+" · "+(pending??"?")+" ready · "+urgent+" exhausted",dispatch.status!=="ok"||urgent>0));
    results.push(metric("Recovery", "Database view only; scheduled recovery not verified"));
  }else results.push(metric("Dispatch outbox",none,true));
  if(ready(rpm)){
    const num=count(rpm.policy_count);
    results.push(metric("Model RPM limits", num===0?"No configured policies — provider calls uncapped by RPM":num===null?none:num+" enforced policies",num===0||num===null));
    results.push(metric("Provider 429s (last hour)",String(count(rpm.totals?.provider_429_last_hour)??"?"),
      rpm.status!=="ok"));
    results.push(metric("RPM alert delivery",rpm.alert_delivery_configured===true?"Reported configured":"Not configured by Mimo",rpm.alert_delivery_configured!==true));
  }else results.push(metric("Model RPM limits",none,true));
  if(ready(parallel)){
    results.push(metric("Parallel orchestration",String(parallel.status||"unknown")+" · "+
      String(count(parallel.expired_running_leases)??"?")+" expired leases",parallel.status!=="ok"));
  }else results.push(metric("Parallel orchestration",none,true));
  if(ready(connectors)){
    results.push(metric("Connector outcomes",String(connectors.status||"unknown")+" · "+
      String(count(connectors.uncertain_outcomes)??"?")+" uncertain",connectors.status!=="ok"));
  }else results.push(metric("Connector outcomes",none,true));
  results.push(ready(installations)&&Array.isArray(installations.installations)
    ?metric("Connector installations",String(installations.installations.length),installations.installations.length===0)
    :metric("Connector installations",none,true));
  results.push(ready(budgets)&&Array.isArray(budgets.policies)
    ?metric("Spending policies",String(budgets.policies.length)+" configured",budgets.policies.length===0)
    :metric("Spending policies",none,true));
  results.push(ready(projects)&&Array.isArray(projects.projects)
    ?metric("API projects",String(projects.projects.length)+" registered")
    :metric("API projects",none,true));
  results.push(metric("TikZ compiler",capabilities?.compiler?.enabled===true
    ?"Configured; real compilation has not been verified":"Unavailable or not configured",
    capabilities?.compiler?.enabled!==true));
  results.push(metric("Background dispatch on this API",capabilities?.run_api?.background_configured===true
    ?"Advertised configured; live queue and worker still require verification":"Not advertised as configured on this API",
    capabilities?.run_api?.background_configured!==true));
  results.push(metric("Live provider call","Not tested — this dashboard never makes billable AI requests"));
  return results;
}
const API={summarize};
root.MimoOps=API;
if(typeof module!=="undefined"&&module.exports)module.exports=API;
})(typeof window!=="undefined"?window:globalThis);
