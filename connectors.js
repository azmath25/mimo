/* Mimo connector administration. No credential values are stored in JS. */
(function(){
 "use strict";
 const $=id=>document.getElementById(id);
 const escape=value=>MimoSite.safe(value);
 let installations=[],grants=[],projects=[],approvals=[];
 function say(id,message,error=false){MimoSite.notice(id,message,error)}
 function options(items,name){
   return items.map(x=>'<option value="'+escape(x.id)+'">'+escape(name(x))+'</option>').join("");
 }
 function render(){
   $("connectorInstallation").innerHTML=options(installations,x=>x.id+" · "+x.resource);
   $("connectorProject").innerHTML=options(projects,x=>x.name+" · "+x.id);
   renderOperations();
   $("installationList").innerHTML=installations.length?installations.map(x=>
     '<article class="mg-row"><div class="mg-row-body"><strong>'+escape(x.id)+
     '</strong><small>'+escape(x.adapter)+' · '+escape(x.resource)+
     ' · secret ref: '+escape(x.secret_ref)+
     (x.enabled?'':' · disabled')+'</small></div></article>'
   ).join(""):'<div class="mg-empty">No installed adapters.</div>';
   $("connectorGrantList").innerHTML=grants.length?grants.map(x=>
     '<article class="mg-row"><div class="mg-row-body"><strong>'+escape(x.project_id)+
     ' · '+escape(x.operation)+'</strong><small>'+escape(x.installation_id)+
     ' · '+(x.enabled?'granted':'revoked')+'</small></div></article>'
   ).join(""):'<div class="mg-empty">No project grants.</div>';
   $("approvalList").innerHTML=approvals.length?approvals.map(x=>
     '<article class="mg-row"><div class="mg-row-body"><strong>'+escape(x.installation_id)+
     ' · '+escape(x.operation)+' <span class="mg-pill warn">Awaiting approval</span></strong>'+
     '<small>Project: '+escape(x.project_id)+' · Request hash: '+escape(x.request_sha256)+'</small>'+
     '<pre class="mg-pre">'+escape(JSON.stringify(x.args||{},null,2))+'</pre>'+
     '</div><div class="mg-row-actions">'+
     '<button type="button" class="mg-btn primary small" data-decision="approve" data-id="'+escape(x.id)+'">Approve exact action</button>'+
     '<button type="button" class="mg-btn danger small" data-decision="reject" data-id="'+escape(x.id)+'">Reject</button>'+
     '</div></article>'
   ).join(""):'<div class="mg-empty">No actions awaiting approval.</div>';
 }
 function renderOperations(){
   const installation=installations.find(x=>x.id===$("connectorInstallation").value);
   const operations=installation?.adapter==="http_rest"?installation.definition.operations:
     [{id:"read_issue",effect:"read"},{id:"create_issue",effect:"write"}];
   $("connectorOperation").innerHTML=options(operations,x=>x.id+(x.effect==="write"?' — human approval':''));
 }
 $("connectorInstallation").addEventListener("change",renderOperations);
 async function refresh(){
   if(!MimoSite.requireCloud())return;
   try{
     const [i,g,p,a]=await Promise.all([
       MimoSite.api("/v1/connectors/installations"),
       MimoSite.api("/v1/connectors/grants"),
       MimoSite.api("/v1/projects"),
       MimoSite.api("/v1/connectors/approvals"),
     ]);
     installations=i.installations||[];
     grants=g.grants||[];
     projects=(p.projects||[]).filter(x=>!x.revoked);
     approvals=a.approvals||[];
     render();
   }catch(error){say("installFeedback",error.message,true)}
 }
 $("installForm").addEventListener("submit",async event=>{
   event.preventDefault();
   const body={id:$("installId").value.trim(),adapter:$("installAdapter").value,
     resource:$("installResource").value.trim(),secret_ref:$("installSecret").value.trim()};
   $("saveInstallation").disabled=true;
   try{
     await MimoSite.api("/v1/connectors/installations",{method:"POST",body});
     say("installFeedback","Installation saved.");await refresh();
   }catch(error){say("installFeedback",error.message,true)}
   finally{$("saveInstallation").disabled=false}
 });
 $("grantConnectorForm").addEventListener("submit",async event=>{
   event.preventDefault();
   const body={project_id:$("connectorProject").value,
     installation_id:$("connectorInstallation").value,
     operation:$("connectorOperation").value,
     enabled:$("connectorEnabled").value==="true"};
   if(!body.project_id||!body.installation_id){say("grantFeedback","Select a project and installation.",true);return}
   $("saveConnectorGrant").disabled=true;
   try{
     await MimoSite.api("/v1/connectors/grants",{method:"POST",body});
     say("grantFeedback",body.enabled?"Grant saved.":"Grant revoked.");await refresh();
   }catch(error){say("grantFeedback",error.message,true)}
   finally{$("saveConnectorGrant").disabled=false}
 });
 $("approvalList").addEventListener("click",async event=>{
   const button=event.target.closest("button[data-decision]");
   if(!button)return;
   const found=approvals.find(x=>x.id===button.dataset.id);
   if(!found)return;
   const approve=button.dataset.decision==="approve";
   if(!window.confirm((approve?"APPROVE":"REJECT")+" "+found.operation+" for "+found.project_id+
      " on "+found.installation_id+"? Review the exact request arguments first."))return;
   button.disabled=true;
   try{
     await MimoSite.api("/v1/connectors/approvals/"+encodeURIComponent(found.id)+"/decision",{
       method:"POST",body:{approve}});
     say("grantFeedback",approve?"Exact action approved.":"Action rejected.");
     await refresh();
   }catch(error){say("grantFeedback",error.message,true)}
   finally{button.disabled=false}
 });
 $("refreshConnectors").addEventListener("click",refresh);
 MimoSite.whenReady(refresh);
})();
