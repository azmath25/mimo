/* Dashboard uses only authenticated Studio routes. */
(function(){
  "use strict";
  const byId=id=>document.getElementById(id);
  const api=(path)=>MimoSite.api(path);
  const esc=MimoSite.safe;
  let sequence=0;
  async function refresh(){
    if(!MimoSite.requireCloud())return;
    const seq=++sequence;
    const paths=["/health/ready","/v1/workflows","/v1/models","/v1/usage/dashboard"];
    const results=await Promise.allSettled(paths.map(api));
    if(seq!==sequence)return;
    const [health,flows,models,usage]=results;
    if(health.status==="fulfilled"){
      byId("healthMetric").textContent=health.value.status==="ok"?"Healthy":"Degraded";
      byId("healthDetail").textContent="Database "+(health.value.db?"✓":"!")+" · Storage "+(health.value.storage?"✓":"!");
    }else{
      byId("healthMetric").textContent="Unavailable";
      byId("healthDetail").textContent="Cloud Run health check failed";
    }
    byId("flowMetric").textContent=flows.status==="fulfilled"?String((flows.value.workflows||[]).length):"—";
    byId("spendMetric").textContent=usage.status==="fulfilled"?MimoSite.currency(usage.value.total_usd):"—";
    byId("modelSummary").textContent=models.status==="fulfilled"?
      (models.value.length+" model(s) registered · "+models.value.filter(m=>m.enabled&&m.secret_configured).length+" enabled with credentials"):
      "Model registry unavailable. Check your backend configuration.";
    if(flows.status==="fulfilled"){
      const list=byId("overviewWorkflows"),items=(flows.value.workflows||[]).slice(0,5);
      list.innerHTML=items.length?items.map(w=>
        '<div class="mg-row"><div class="mg-row-body"><strong>'+esc(w.name)+'</strong><small>'+esc(w.id)+' · '+esc(MimoSite.date(w.created_at))+'</small></div><a class="mg-btn small" href="./studio.html?workflow='+encodeURIComponent(w.id)+'">Edit ↗</a></div>'
      ).join(""):'<div class="mg-empty">No cloud workflows yet. Open Studio and save your first draft.</div>';
    }else{
      byId("overviewWorkflows").innerHTML='<div class="mg-empty">Workflow listing is unavailable. Ensure the Studio drafts backend update is deployed.</div>';
    }
    if(results.some(x=>x.status==="rejected")){
      const errors=byId("overviewAlert");
      errors.hidden=false;errors.textContent="Some dashboard sections could not load. Verify the backend Studio-drafts revision and your configured frontend CORS origin.";
    }else byId("overviewAlert").hidden=true;
  }
  MimoSite.whenReady(refresh);
})();
