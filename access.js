/* API management: publish refs + one-time project key handling + endpoint templates. */
(function(){
  "use strict";
  const $=id=>document.getElementById(id),safe=()=>MimoSite.safe;
  // Read the same code-reviewed Studio origin used for authenticated Firebase requests.
  // Never maintain a second, potentially divergent production/staging URL here.
  let projects=[],workflows=[],versions=new Map(),newKey=null,requestExample="",endpoint="",loadedUid=null;
  let verifiedOrigin=null,verifyDetail="";
  const msg=(id,text,error=false)=>MimoSite.notice(id,text,error);
  function executionOriginKey(){
    const uid=window.MimoCloud?.user?.uid;
    return uid?"mimo.execution-origin.v1."+uid:null;
  }
  function restoreExecutionOrigin(){
    const key=executionOriginKey();if(!key)return;
    try{$("executionOrigin").value=localStorage.getItem(key)||""}catch{}
    verifiedOrigin=null;verifyDetail="";updateEndpoint();
  }
  function metadataKey(){const uid=window.MimoCloud?.user?.uid;return uid?"mimo.projects.v1."+uid:null}
  function restoreProjects(){
    const key=metadataKey();if(!key)return;
    try{const stored=JSON.parse(localStorage.getItem(key)||"[]");projects=Array.isArray(stored)?stored.filter(x=>x&&/^[a-zA-Z0-9_-]{1,64}$/.test(x.id)).slice(0,70):[]}
    catch{projects=[]}
    updateProjectDropdowns();
  }
  async function loadProjects(){
    try{
      const response=await MimoSite.api("/v1/projects");
      projects=(response.projects||[]).filter(p=>!p.revoked);
      persistProjects();
      updateProjectDropdowns();
    }catch(error){msg("projectFeedback","Could not fetch API projects: "+error.message,true)}
  }
  function persistProjects(){
    const key=metadataKey();if(!key)return;
    try{localStorage.setItem(key,JSON.stringify(projects.map(({id,name})=>({id,name}))))}catch{}
  }
  function updateProjectDropdowns(){
    const html=projects.length?projects.map(p=>'<option value="'+safe()(p.id)+'">'+safe()(p.name)+' · '+safe()(p.id)+'</option>').join(""):'<option value="">Create an API project first</option>';
    for(const id of ["grantProject","revokeProject","manageProject"])$(id).innerHTML=html;
    $("grantPermission").disabled=!projects.length;
    $("revokeProjectBtn").disabled=!projects.length;
  }
  function setKey(key){
    newKey=key||null;$("apiKeyValue").textContent=newKey||"";
    $("apiKeyReveal").hidden=!newKey;
  }
  async function copy(text,label){
    try{await navigator.clipboard.writeText(text);msg("endpointFeedback",label+" copied.")}
    catch{msg("endpointFeedback","Clipboard access denied; select and copy the displayed text.",true)}
  }
  async function loadWorkflows(){
    try{
      const data=await MimoSite.api("/v1/workflows");workflows=data.workflows||[];
      const options=workflows.map(w=>'<option value="'+safe()(w.id)+'">'+safe()(w.name)+' · '+safe()(w.id)+'</option>').join("");
      $("grantWorkflow").innerHTML='<option value="">Choose workflow</option>'+options;
      $("endpointWorkflow").innerHTML='<option value="">Choose workflow</option>'+options;
      const url=new URL(location.href),id=url.searchParams.get("workflow");
      if(id&&workflows.some(w=>w.id===id)){$("endpointWorkflow").value=id;$("grantWorkflow").value=id}
      await loadVersions("grantWorkflow","grantVersion");
      await loadVersions("endpointWorkflow","endpointVersion");
      const ver=url.searchParams.get("version");
      if(ver&&Array.from($("endpointVersion").options).some(x=>x.value===ver))$("endpointVersion").value=ver;
      if(ver&&Array.from($("grantVersion").options).some(x=>x.value===ver))$("grantVersion").value=ver;
      updateEndpoint();
    }catch(error){msg("endpointFeedback","Failed to load saved workflows: "+error.message,true)}
  }
  async function loadVersions(source,target){
    const id=$(source).value;const dest=$(target);
    if(!id){dest.innerHTML='<option value="">Choose workflow first</option>';updateEndpoint();return}
    try{
      let data=versions.get(id);
      if(!data){data=await MimoSite.api("/v1/workflows/"+encodeURIComponent(id)+"/versions");versions.set(id,data)}
      dest.innerHTML=data.versions?.length?data.versions.map(v=>'<option value="'+safe()(v.version)+'">Version '+safe()(v.version)+'</option>').join(""):'<option value="">Not published yet</option>';
    }catch(error){dest.innerHTML='<option value="">Unable to load versions</option>';msg("endpointFeedback",error.message,true)}
    updateEndpoint();
  }
  function getOrigin(){
    const studioOrigin=window.MimoCloud?.apiOrigin;
    if(!studioOrigin) return {url:null,reason:"Staging Studio API has not been approved yet."};
    const value=$("executionOrigin").value.trim().replace(/\/+$/,"");
    if(!value)return {url:null,reason:"Execution service not configured"};
    try{
      const url=new URL(value);
      if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.pathname!=="/")
        return {url:null,reason:"Enter only the HTTPS origin (no path, credentials or query)."};
      if(url.origin===studioOrigin)return {url:null,reason:"This is the Studio service, not an execution service."};
      return {url:url.origin,reason:"Address assembled · execution service not verified"};
    }catch{return {url:null,reason:"Not a valid HTTPS service address"}}
  }
  function updateEndpoint(){
    const origin=getOrigin(),id=$("endpointWorkflow").value,version=$("endpointVersion").value;
    const ready=Boolean(origin.url&&id&&version);
    const verified=Boolean(origin.url&&origin.url===verifiedOrigin);
    endpoint=ready?origin.url+"/v1/workflows/"+encodeURIComponent(id)+"/runs":"";
    const status=$("endpointStatus");
    status.textContent=!origin.url?origin.reason:!id?"Select a workflow":!version?"Publish a workflow version":
      verified?"✓ Execution service healthy":verifyDetail||origin.reason;
    status.className=verified?"mg-pill good":"mg-pill warn";
    $("copyEndpoint").disabled=!(ready&&verified);$("copyRequest").disabled=!(ready&&verified);
    $("endpointPreview").textContent=endpoint||"Configure a separate execution service, then select a published workflow version.";
    $("streamPreview").textContent=ready?origin.url+"/v1/workflows/"+encodeURIComponent(id)+"/stream":"—";
    $("statusPreview").textContent=ready?origin.url+"/v1/runs/{run_id}":"—";
    requestExample=ready?
      "curl -X POST '"+endpoint+"' \\\n"+
      "  -H 'Authorization: Bearer YOUR_PROJECT_API_KEY' \\\n"+
      "  -H 'Content-Type: application/json' \\\n"+
      "  -d '"+JSON.stringify({input:"Your mathematical problem or text",version:Number(version),background:false})+"'":"A complete POST example will appear after selecting an execution service and published version.";
    $("requestPreview").textContent=requestExample;
  }
  $("projectForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const id=$("projectId").value.trim(),name=$("projectName").value.trim();
    if(!/^[a-zA-Z0-9_-]{1,64}$/.test(id)){msg("projectFeedback","Use 1–64 letters, numbers, underscores or hyphens.",true);return}
    $("createProject").disabled=true;setKey(null);
    try{
      const result=await MimoSite.api("/v1/projects",{method:"POST",body:{id,name}});
      projects=projects.filter(p=>p.id!==result.id);projects.unshift({id:result.id,name:result.name});
      persistProjects();updateProjectDropdowns();
      setKey(result.api_key);
      $("grantProject").value=result.id;msg("projectFeedback","Project created. Copy its key now—it will not be shown again.");
      $("apiKeyReveal").scrollIntoView({behavior:"smooth",block:"center"});
    }catch(error){msg("projectFeedback",error.message,true)}finally{$("createProject").disabled=false}
  });
  $("copyApiKey").addEventListener("click",async()=>{
    if(!newKey)return;
    try{await navigator.clipboard.writeText(newKey);msg("projectFeedback","Key copied. Store it in your other application's server-side secrets.")}
    catch{msg("projectFeedback","Clipboard unavailable. Select the one-time key above and copy it.",true)}
  });
  $("hideApiKey").addEventListener("click",()=>setKey(null));
  $("grantForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const id=$("grantProject").value,workflow=$("grantWorkflow").value,version=Number($("grantVersion").value);
    if(!id||!workflow||!Number.isInteger(version)||version<1){msg("grantFeedback","Select a project and a published workflow version.",true);return}
    $("grantPermission").disabled=true;
    try{
      const out=await MimoSite.api("/v1/projects/"+encodeURIComponent(id)+"/permissions",
        {method:"POST",body:{workflow_id:workflow,version,scope:"run"}});
      msg("grantFeedback","Granted run permission to "+id+" for "+workflow+" version "+out.version+".");
      $("endpointWorkflow").value=workflow;await loadVersions("endpointWorkflow","endpointVersion");
      $("endpointVersion").value=String(version);updateEndpoint();
    }catch(error){msg("grantFeedback",error.message,true)}finally{$("grantPermission").disabled=false}
  });
  $("grantWorkflow").addEventListener("change",()=>loadVersions("grantWorkflow","grantVersion"));
  $("endpointWorkflow").addEventListener("change",()=>loadVersions("endpointWorkflow","endpointVersion"));
  $("endpointVersion").addEventListener("change",updateEndpoint);
  $("executionOrigin").addEventListener("input",()=>{
    verifiedOrigin=null;verifyDetail="";
    updateEndpoint();
  });
  $("verifyExecution").addEventListener("click",async()=>{
    const origin=getOrigin();
    if(!origin.url){msg("endpointFeedback",origin.reason,true);return}
    const button=$("verifyExecution");
    verifiedOrigin=null;verifyDetail="Checking execution service…";updateEndpoint();
    button.disabled=true;button.textContent="Verifying…";
    try{
      // A public metadata probe, no Firebase tokens or API project keys.
      // CORS on the execution service must permit the GitHub Pages origin.
      const response=await fetch(origin.url+"/health/service",{
        method:"GET",mode:"cors",credentials:"omit",cache:"no-store"
      });
      if(!response.ok)throw Error("Role check returned HTTP "+response.status);
      const detail=await response.json();
      if(detail.service!=="mimo"||detail.role!=="execution"||detail.published_runs_enabled!==true){
        throw Error("This URL does not serve the Mimo execution role.");
      }
      const ready=await fetch(origin.url+"/health/ready",{
        method:"GET",mode:"cors",credentials:"omit",cache:"no-store"
      });
      if(!ready.ok)throw Error("Backend readiness returned HTTP "+ready.status);
      const health=await ready.json();
      if(health.status!=="ok"||health.db!==true||health.storage!==true){
        throw Error("Neon or object storage is not ready.");
      }
      if(getOrigin().url!==origin.url)return;
      verifiedOrigin=origin.url;
      const key=executionOriginKey();if(key)try{localStorage.setItem(key,origin.url)}catch{}
      verifyDetail="";msg("endpointFeedback","Execution service role, database and storage verified. Make a published run from your trusted server to verify the project key and AI provider.");
    }catch(error){
      verifiedOrigin=null;
      verifyDetail="Cannot verify service (check address, permissions and CORS)";
      msg("endpointFeedback","Execution service verification failed: "+error.message+
        ". Confirm MIMO_API_ROLE=execution, public health endpoints, and MIMO_CORS_ORIGINS=https://azmath25.github.io.",true);
    }finally{button.disabled=false;button.textContent="Verify service";updateEndpoint()}
  });
  $("copyEndpoint").addEventListener("click",()=>{if(endpoint)copy(endpoint,"Endpoint")});
  $("copyRequest").addEventListener("click",()=>{if(endpoint)copy(requestExample,"Request example")});

  async function loadGrants(){
    const projectId=$("manageProject").value;
    if(!projectId)return;
    try{
      const response=await MimoSite.api("/v1/projects/"+encodeURIComponent(projectId)+"/permissions");
      const permissions=response.permissions||[];
      $("projectGrants").innerHTML=permissions.length?permissions.map(p=>
        '<article class="mg-row" data-permission="'+safe()(p.id)+'"><div class="mg-row-body"><strong>'+safe()(p.workflow_id)+'</strong><small>Version '+safe()(p.version||"latest")+' · '+safe()(p.scope)+'</small></div><button class="mg-btn danger small" type="button" data-action="revoke">Revoke grant</button></article>'
      ).join(""):'<div class="mg-empty">No active permissions.</div>';
    }catch(e){msg("manageFeedback",e.message,true)}
  }
  $("loadGrants").addEventListener("click",loadGrants);
  $("manageProject").addEventListener("change",loadGrants);
  $("projectGrants").addEventListener("click",async event=>{
    const row=event.target.closest("[data-permission]");
    if(!row||!event.target.closest("[data-action='revoke']"))return;
    const projectId=$("manageProject").value;
    if(!confirm("Revoke permission "+row.dataset.permission+" from "+projectId+"?"))return;
    try{
      await MimoSite.api("/v1/projects/"+encodeURIComponent(projectId)+"/permissions/"+encodeURIComponent(row.dataset.permission),{method:"DELETE"});
      await loadGrants();msg("manageFeedback","Permission revoked.");
    }catch(e){msg("manageFeedback",e.message,true)}
  });
  $("rotateApiKey").addEventListener("click",async()=>{
    const id=$("manageProject").value;if(!id)return;
    if(!confirm("Invalidate the current API key for "+id+"? External projects will fail until updated."))return;
    try{
      const res=await MimoSite.api("/v1/projects/"+encodeURIComponent(id)+"/rotate-key",{method:"POST"});
      setKey(res.api_key);
      $("apiKeyReveal").scrollIntoView({behavior:"smooth",block:"center"});
      msg("manageFeedback","Key rotated. Store the new key on the external project's server.");
    }catch(e){msg("manageFeedback",e.message,true)}
  });
  $("revokeProjectBtn").addEventListener("click",async()=>{
    const id=$("revokeProject").value;if(!id)return;
    if(!confirm("Revoke project "+id+"? Its API key will stop working."))return;
    $("revokeProjectBtn").disabled=true;
    try{
      await MimoSite.api("/v1/projects/"+encodeURIComponent(id)+"/revoke",{method:"POST"});
      projects=projects.filter(x=>x.id!==id);persistProjects();updateProjectDropdowns();
      msg("revokeFeedback","Project "+id+" revoked.");
    }catch(error){msg("revokeFeedback",error.message,true)}
    finally{$("revokeProjectBtn").disabled=false}
  });
  window.addEventListener("mimo:auth-changed",()=>{
    if(!MimoSite.requireCloud()){setKey(null);projects=[];loadedUid=null;verifiedOrigin=null;verifyDetail="";}
  });
  MimoSite.whenReady(async()=>{
    const uid=window.MimoCloud.user.uid;
    if(loadedUid===uid)return;
    loadedUid=uid;setKey(null);projects=[];versions.clear();
    restoreProjects();restoreExecutionOrigin();await loadProjects();await loadWorkflows();
  });
})();
