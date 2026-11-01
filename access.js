/* API management: publish refs + one-time project key handling + endpoint templates. */
(function(){
  "use strict";
  const $=id=>document.getElementById(id),safe=()=>MimoSite.safe;
  const studioOrigin="https://mimo-backend-git-993130348924.europe-west1.run.app";
  let projects=[],workflows=[],versions=new Map(),newKey=null,requestExample="",endpoint="",loaded=false;
  const msg=(id,text,error=false)=>MimoSite.notice(id,text,error);
  function metadataKey(){const uid=window.MimoCloud?.user?.uid;return uid?"mimo.projects.v1."+uid:null}
  function restoreProjects(){
    const key=metadataKey();if(!key)return;
    try{const stored=JSON.parse(localStorage.getItem(key)||"[]");projects=Array.isArray(stored)?stored.filter(x=>x&&/^[a-zA-Z0-9_-]{1,64}$/.test(x.id)).slice(0,70):[]}
    catch{projects=[]}
    updateProjectDropdowns();
  }
  function persistProjects(){
    const key=metadataKey();if(!key)return;
    try{localStorage.setItem(key,JSON.stringify(projects.map(({id,name})=>({id,name}))))}catch{}
  }
  function updateProjectDropdowns(){
    const html=projects.length?projects.map(p=>'<option value="'+safe()(p.id)+'">'+safe()(p.name)+' · '+safe()(p.id)+'</option>').join(""):'<option value="">Create an API project first</option>';
    for(const id of ["grantProject","revokeProject"])$(id).innerHTML=html;
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
    endpoint=ready?origin.url+"/v1/workflows/"+encodeURIComponent(id)+"/runs":"";
    const status=$("endpointStatus");
    status.textContent=!origin.url?origin.reason:!id?"Select a workflow":!version?"Publish a workflow version":origin.reason;
    status.className="mg-pill warn";
    $("copyEndpoint").disabled=!ready;$("copyRequest").disabled=!ready;
    $("endpointPreview").textContent=endpoint||"Configure a separate execution service, then select a published workflow version.";
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
  $("executionOrigin").addEventListener("input",updateEndpoint);
  $("copyEndpoint").addEventListener("click",()=>{if(endpoint)copy(endpoint,"Endpoint")});
  $("copyRequest").addEventListener("click",()=>{if(endpoint)copy(requestExample,"Request example")});
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
  MimoSite.whenReady(async()=>{
    if(loaded)return;loaded=true;restoreProjects();await loadWorkflows();
  });
})();
