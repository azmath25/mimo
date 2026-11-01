/* Cloud workflow library and immutable version publishing. */
(function(){
  "use strict";
  const $=id=>document.getElementById(id),esc=()=>MimoSite.safe;
  let workflows=[],models=[],busy=false;
  function info(msg,error=false){MimoSite.notice("workflowFeedback",msg,error)}
  async function refresh(){
    if(!MimoSite.requireCloud())return;
    try{
      const [listed,registered]=await Promise.all([MimoSite.api("/v1/workflows"),MimoSite.api("/v1/models")]);
      workflows=listed.workflows||[];models=registered||[];
      $("workflowCount").textContent=String(workflows.length);
      const safe=esc();
      $("workflowList").innerHTML=workflows.length?workflows.map(w=>
        '<article class="mg-row" data-workflow="'+safe(w.id)+'"><div class="mg-row-body"><strong>'+safe(w.name)+'</strong>'+
        '<small>'+safe(w.id)+' · created '+safe(MimoSite.date(w.created_at))+'</small>'+
        '<div class="mg-hint" id="versions-'+safe(w.id)+'" style="margin-top:7px"></div></div>'+
        '<div class="mg-row-actions"><a class="mg-btn small" href="./studio.html?workflow='+encodeURIComponent(w.id)+'">Edit ↗</a>'+
        '<button class="mg-btn small" data-action="versions">Versions</button>'+
        '<button class="mg-btn primary small" data-action="publish">Publish</button>'+
        '<button class="mg-btn danger small" data-action="delete">Delete</button></div></article>'
      ).join(""):'<div class="mg-empty">No cloud workflows yet. Create and save your first one in Studio.</div>';
    }catch(error){$("workflowList").innerHTML='<div class="mg-empty">Could not load your workflows. Confirm the Studio-drafts backend is deployed.</div>';info(error.message,true)}
  }
  async function versions(id){
    const data=await MimoSite.api("/v1/workflows/"+encodeURIComponent(id)+"/versions");
    const host=document.getElementById("versions-"+id);
    if(!host)return;
    const safe=esc();
    host.innerHTML=data.versions?.length?
      'Published: '+data.versions.map(v=>
      '<a href="./access.html?workflow='+encodeURIComponent(id)+'&version='+encodeURIComponent(v.version)+'">v'+safe(v.version)+'</a>'
      ).join(" · "):'Draft only — no published versions';
  }
  async function publish(id){
    const def=await MimoSite.api("/v1/workflows/"+encodeURIComponent(id)+"/export");
    const ui=def?.inputs?.mimo_ui;
    if(ui){
      const issues=window.MimoBridge.runIssues(ui,models);
      if(issues.length)throw Error("Cannot publish yet: "+issues.join(" · "));
    }
    await MimoSite.api("/v1/workflows/validate",{method:"POST",body:def});
    if(!confirm("Publish a new immutable version of '"+(def.title||id)+"'?"))return;
    const out=await MimoSite.api("/v1/workflows/"+encodeURIComponent(id)+"/publish",{method:"POST"});
    info("Published version "+out.version+". Next: grant an API project permission to use it.");
    await versions(id);
  }
  $("workflowList").addEventListener("click",async event=>{
    const button=event.target.closest("button[data-action]");
    if(!button||busy)return;
    const row=button.closest("[data-workflow]");
    if(!row)return;
    const id=row.dataset.workflow,action=button.dataset.action;
    busy=true;button.disabled=true;
    try{
      if(action==="versions")await versions(id);
      else if(action==="publish")await publish(id);
      else if(action==="delete"){
        // Published releases are live API contracts: the explicit opt-in also
        // removes all workflow/version grants. Past runs retain their snapshots.
        const result=await MimoSite.api("/v1/workflows/"+encodeURIComponent(id)+"/versions");
        const count=(result.versions||[]).length;
        const name=workflows.find(w=>w.id===id)?.name||id;
        const warning=count
          ? "Permanently delete published workflow '"+name+"' ("+id+") with "+count+
            " published version(s)?\\n\\nAll its API grants will be revoked and its execution endpoints will stop working. Existing run history is kept. This cannot be undone."
          : "Delete unpublished workflow '"+name+"' ("+id+") permanently?";
        if(!confirm(warning))return;
        const path="/v1/workflows/"+encodeURIComponent(id)+(count?"?include_published=true":"");
        const removed=await MimoSite.api(path,{method:"DELETE"});
        info("Workflow deleted. "+(removed.removed_versions||0)+" version(s) and "+
          (removed.removed_grants||0)+" API grant(s) removed; run history retained.");
        await refresh();
      }
    }catch(error){info(error.message,true)}
    finally{button.disabled=false;busy=false}
  });
  $("refreshWorkflows").addEventListener("click",refresh);
  MimoSite.whenReady(refresh);
})();
