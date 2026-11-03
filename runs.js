/* Persistent execution inspector. TextContent/sanitized HTML only. */
(function(){
"use strict";
const $=id=>document.getElementById(id),safe=v=>MimoSite.safe(v),api=(p,o)=>MimoSite.api(p,o);
let runs=[],selected=null,offset=0,loading=false,busy=false;
let listEpoch=0,selectionEpoch=0;
const note=(text,error=false)=>MimoSite.notice("runsFeedback",text,error);
function serialize(x){try{return JSON.stringify(x,null,2)}catch{return String(x)}}
function details(row){return safe(row.workflow_id)+" · v"+safe(row.version)+" · "+safe(MimoSite.date(row.created_at))}
function rowHtml(r){return '<article class="mg-row" data-run="'+safe(r.id)+'"><div class="mg-row-body"><strong>'+safe(r.workflow_id)+
 ' <span class="mg-pill">'+safe(r.status)+'</span></strong><small>'+details(r)+'</small><small>'+safe(r.id)+'</small></div><div class="mg-row-actions"><button class="mg-btn small" data-action="open">Inspect</button></div></article>'}
async function list(reset=true){
 // A new filter/refresh supersedes an older in-flight list request. Paging
 // still refuses concurrent duplicate loads.
 if(loading&&!reset)return;
 if(reset){++listEpoch;runs=[];offset=0;}
 const epoch=listEpoch;
 loading=true;
 $("loadMoreRuns").disabled=true;
 try{
  const q=new URLSearchParams({limit:"30",offset:String(offset)});
  if($("runWorkflowFilter").value.trim())q.set("workflow_id",$("runWorkflowFilter").value.trim());
  if($("runStatusFilter").value)q.set("status",$("runStatusFilter").value);
  const response=await api("/v1/runs?"+q);
  if(epoch!==listEpoch)return;
  const batch=response.runs||[];runs.push(...batch);offset+=batch.length;
  $("runsList").innerHTML=runs.length?runs.map(rowHtml).join(""):'<div class="mg-empty">No runs found. Execute a workflow in Studio to create a persistent run.</div>';
  $("loadMoreRuns").disabled=batch.length<30;
 }catch(e){if(epoch===listEpoch)note("Cannot list runs: "+e.message,true)}
 finally{if(epoch===listEpoch)loading=false}
}
async function choose(id){
 if(!id)return;
 selected=id;
 const epoch=++selectionEpoch;
 // Never leave buttons for the previous run actionable while a new run loads.
 $("runRefresh").disabled=true;
 $("runResume").disabled=true;
 $("runCancel").disabled=true;
 note("Loading selected run…");
 try{
  const data=await api("/v1/runs/"+encodeURIComponent(id)+"/timeline");
  if(epoch!==selectionEpoch||selected!==id)return;
  const r=data.run;
  $("runBadge").textContent=r.status;
  $("runMeta").textContent=r.id+" · "+details(r);
  $("runRefresh").disabled=false;
  $("runResume").disabled=!["interrupted","failed","dispatch_failed"].includes(r.status);
  $("runCancel").disabled=!["started","running","queued","waiting_for_review"].includes(r.status);
  const tasks=data.node_tasks||[];
  $("nodeTaskList").innerHTML=tasks.length?tasks.map(t=>
    '<article class="mg-row" data-task-node="'+safe(t.node_id)+'">'+
    '<div class="mg-row-body"><strong>'+safe(t.node_id)+
    ' · '+safe(t.status)+'</strong><small>Claims '+safe(t.claim_count)+
    (t.lease_expires_at?' · lease '+safe(MimoSite.date(t.lease_expires_at)):'')+
    '</small></div><div class="mg-row-actions">'+
    (t.status==="waiting_for_review"&&r.status==="waiting_for_review"?
      '<button type="button" class="mg-btn danger small" data-manual-recover>Manual recovery</button>':'')+
    '</div></article>'
  ).join(""):'<div class="mg-empty">This run does not have separate parallel node tasks.</div>';
  const items=data.checkpoints||[];
  $("checkpointList").innerHTML=items.length?items.map(c=>'<article class="mg-row" data-node="'+safe(c.node_id)+'"><div class="mg-row-body"><strong>'+safe(c.node_id)+' · '+safe(c.status)+'</strong><small>Attempt '+safe(c.attempt)+(c.chosen_port?' · branch '+safe(c.chosen_port):'')+'</small><details><summary>Inspect actual output</summary><pre class="mg-pre">'+safe(serialize(c.result))+'</pre></details></div><div class="mg-row-actions">'+
    (["failed","completed","interrupted"].includes(r.status)?'<button class="mg-btn small" data-action="retry">Retry from here</button>':'')+
    ((c.result?.content?.object_key||c.result?.images?.length)?'<button class="mg-btn small" data-action="artifact">Download artifact</button>':'')+
    '</div></article>').join(""):'<div class="mg-empty">No checkpoints yet.</div>';
  const events=data.events||[];
  $("eventList").innerHTML=events.length?events.map(e=>'<article class="mg-row"><div class="mg-row-body"><strong>#'+safe(e.seq)+' · '+safe(e.type)+'</strong><small>'+safe(MimoSite.date(e.created_at))+'</small><details><summary>Event metadata</summary><pre class="mg-pre">'+safe(serialize(e.payload))+'</pre></details></div></article>').join(""):'<div class="mg-empty">No events yet.</div>';
  history.replaceState(null,"","?run="+encodeURIComponent(id));
  note("Run loaded from persistent backend history.");
 }catch(e){if(epoch===selectionEpoch&&selected===id)note("Cannot inspect run: "+e.message,true)}
}
async function action(command){
 if(!selected||busy)return;
 if(command==="cancel"&&!confirm("Cancel this run?"))return;
 busy=true;
 try{await api("/v1/runs/"+encodeURIComponent(selected)+"/"+command,{method:"POST"});await choose(selected);await list()}
 catch(e){note(e.message,true)}finally{busy=false}
}
async function download(id,node){
 try{
  const blob=await MimoCloud.requestBlob("/v1/runs/"+encodeURIComponent(id)+"/artifacts/"+encodeURIComponent(node));
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="mimo-"+node+(blob.type==="image/png"?".png":".pdf");
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }catch(e){note("Artifact unavailable: "+e.message,true)}
}
async function reviews(){
 try{
  const data=await api("/v1/reviews");const pending=(data.reviews||[]).filter(x=>x.status==="pending");
  $("reviewsList").innerHTML=pending.length?pending.map(x=>'<article class="mg-card" data-review="'+safe(x.id)+'"><strong>Run '+safe(x.run_id)+' · node '+safe(x.node_id)+'</strong><details><summary>Review proposed content</summary><pre class="mg-pre">'+safe(serialize(x.proposed))+'</pre></details><div class="mg-field"><label>Correction (optional)</label><textarea rows="3" data-correction placeholder="Leave empty to approve unchanged"></textarea></div><div class="mg-actions"><button class="mg-btn primary small" data-decision="approve">Approve / correct</button><button class="mg-btn danger small" data-decision="reject">Reject</button><button class="mg-btn small" data-review-run>Inspect run</button></div></article>').join(""):'<div class="mg-empty">No pending reviews.</div>';
 }catch(e){note("Cannot load reviews: "+e.message,true)}
}
$("nodeTaskList").addEventListener("click",async e=>{
  const button=e.target.closest("[data-manual-recover]");
  if(!button||!selected||busy)return;
  const node=button.closest("[data-task-node]")?.dataset.taskNode;
  if(!node)return;
  const explanation=window.prompt("Explain how you investigated the failed node, verified provider billing and confirmed whether retrying is safe. Minimum 30 characters:");
  if(!explanation)return;
  if(explanation.trim().length<30){note("A detailed investigation reason of at least 30 characters is required.",true);return}
  if(!window.confirm("This may repeat a billable AI request or external side effect. The backend will deny recovery while unverified spending holds or pending action approvals remain. Authorize ONE explicit retry of node "+node+"?"))return;
  busy=true;button.disabled=true;
  try{
    await api("/v1/runs/"+encodeURIComponent(selected)+"/recover-node",{
      method:"POST",body:{node_id:node,reason:explanation.trim(),
        acknowledge_possible_duplicate_charges:true}});
    await choose(selected);await list();
    note("Recovery authorized and recorded in run history.");
  }catch(error){note(error.message,true)}
  finally{busy=false;button.disabled=false}
});
$("runsList").addEventListener("click",e=>{const r=e.target.closest("[data-run]");if(r)choose(r.dataset.run)});
$("checkpointList").addEventListener("click",async e=>{
 const btn=e.target.closest("[data-action]");if(!btn||!selected)return;
 const node=btn.closest("[data-node]")?.dataset.node;if(!node)return;
 if(btn.dataset.action==="artifact"){await download(selected,node);return}
 if(btn.dataset.action==="retry"){
  if(!confirm("Discard this checkpoint and dependent checkpoints, then rerun? Provider charges may apply."))return;
  try{await api("/v1/runs/"+encodeURIComponent(selected)+"/retry-block",{method:"POST",body:{node_id:node}});await choose(selected);await list()}catch(err){note(err.message,true)}
 }
});
$("reviewsList").addEventListener("click",async e=>{
 const block=e.target.closest("[data-review]");if(!block)return;
 if(e.target.closest("[data-review-run]"))return choose(block.querySelector("strong").textContent.split(" · ")[0].slice(4));
 const button=e.target.closest("[data-decision]");if(!button)return;
 const action=button.dataset.decision;const correction=block.querySelector("[data-correction]").value;
 if(!confirm(action==="reject"?"Reject this AI output?":"Submit approval to resume the workflow?"))return;
 button.disabled=true;
 try{await api("/v1/reviews/"+encodeURIComponent(block.dataset.review)+"/decision",{method:"POST",body:{action,correction:correction||null}});await reviews();if(selected)await choose(selected);}
 catch(err){note(err.message,true)}finally{button.disabled=false}
});
$("runRefresh").addEventListener("click",()=>choose(selected));
$("runResume").addEventListener("click",()=>action("resume"));
$("runCancel").addEventListener("click",()=>action("cancel"));
$("reloadRuns").addEventListener("click",()=>list());
$("loadMoreRuns").addEventListener("click",()=>list(false));
$("reloadReviews").addEventListener("click",reviews);
$("runWorkflowFilter").addEventListener("change",()=>list());
$("runStatusFilter").addEventListener("change",()=>list());
MimoSite.whenReady(async()=>{await list();await reviews();const id=new URL(location.href).searchParams.get("run");if(id&&/^[0-9a-f-]{36}$/i.test(id))await choose(id)});
})();