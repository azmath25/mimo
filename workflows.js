/* Cloud workflow library and immutable version publishing. */
(function(){
  "use strict";
  const $=id=>document.getElementById(id),esc=()=>MimoSite.safe;
  let workflows=[],models=[],capabilities={},busy=false;
  function info(msg,error=false){MimoSite.notice("workflowFeedback",msg,error)}
  async function refresh(){
    if(!MimoSite.requireCloud())return;
    try{
      const [listed,registered,cap]=await Promise.all([MimoSite.api("/v1/workflows"),MimoSite.api("/v1/models"),MimoSite.api("/v1/capabilities").catch(()=>({}))]);capabilities=cap;
      workflows=listed.workflows||[];models=registered||[];
      const textModels=models.filter(m=>m.enabled&&m.capabilities?.text!==false);
      $("mathDemoModel").innerHTML=textModels.length
        ? textModels.map(m=>'<option value="'+MimoSite.safe(m.id)+'">'+MimoSite.safe(m.display_name||m.id)+'</option>').join("")
        : '<option value="">No enabled text model available</option>';
      $("createMathDemo").disabled=!textModels.length;
      // Extraction needs a vision-capable first model and a JSON-capable reviewer.
      const ready=models.filter(m=>m.enabled && m.secret_configured && m.capabilities?.text!==false);
      const vision=ready.filter(m=>m.capabilities?.image_understanding);
      $("quizerVisionModel").innerHTML=vision.length
        ?vision.map(m=>'<option value="'+MimoSite.safe(m.id)+'">'+MimoSite.safe(m.display_name||m.id)+'</option>').join("")
        :'<option value="">No configured vision model</option>';
      $("quizerAuditModel").innerHTML=ready.length
        ?ready.map(m=>'<option value="'+MimoSite.safe(m.id)+'">'+MimoSite.safe(m.display_name||m.id)+'</option>').join("")
        :'<option value="">No configured reviewer</option>';
      $("createQuizerDraft").disabled=!vision.length||!ready.length;

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
      const issues=window.MimoBridge.runIssues(ui,models,capabilities);
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
  function mathExample(modelId){
    const promptExtract="Extract the mathematical statement exactly, preserving every equation and condition. Do not solve or invent missing information. Return plain text, not a Markdown fence.\nProblem:\n{{inputs.1}}";
    const promptVerify="Independently solve the problem below. Verify the answer by substitution into the original problem and flag any ambiguity. Return a checked, LaTeX-friendly mathematical explanation.\nProblem:\n{{inputs.1}}";
    const promptTikz="Create a mathematically correct TikZ diagram illustrating the VERIFIED solution below. Return ONLY complete compilable LaTeX starting with \\documentclass[tikz,border=6pt]{standalone}, including \\begin{document} and \\begin{tikzpicture}, ending with \\end{document}. No Markdown fences, no commentary, no shell escape, no imported files, and no exotic packages.\nVerified solution:\n{{inputs.1}}";
    return {
      workflow_id:"math_extract_verify_tikz",
      title:"Math extraction, independent check and TikZ illustration",
      schema_version:1,
      nodes:[
        {id:"input",type:"input",config:{}},
        {id:"extract",type:"ai",config:{model_id:modelId,max_tokens:600,
          prompt:promptExtract,response:{kind:"text"}}},
        {id:"verify",type:"ai",config:{model_id:modelId,max_tokens:900,
          prompt:promptVerify,response:{kind:"text"}}},
        {id:"tikz",type:"ai",config:{model_id:modelId,max_tokens:1300,
          prompt:promptTikz,response:{kind:"text"}}},
        {id:"compile_png",type:"compiler",config:{source:"{{inputs.1}}",target:"png"}},
        {id:"output",type:"output",config:{collect:["verify","compile_png"]}}
      ],
      edges:[
        {source:"input",target:"extract"},
        {source:"extract",target:"verify"},
        {source:"verify",target:"tikz"},
        {source:"tikz",target:"compile_png"},
        {source:"verify",target:"output"},
        {source:"compile_png",target:"output"}
      ]
    };
  }
  $("createMathDemo").addEventListener("click",async()=>{
    if(busy||!MimoSite.requireCloud())return;
    const modelId=$("mathDemoModel").value;
    const model=models.find(m=>m.id===modelId&&m.enabled&&m.capabilities?.text!==false);
    if(!model)return info("Select an enabled text model before creating the demo.",true);
    const example=mathExample(modelId);
    if(workflows.some(w=>w.id===example.workflow_id)){
      return info("The math demo already exists. Open the existing draft or publish its version.",true);
    }
    busy=true;$("createMathDemo").disabled=true;
    try{
      await MimoSite.api("/v1/workflows/validate",{method:"POST",body:example});
      await MimoSite.api("/v1/workflows",{method:"POST",body:example});
      info("Math demo draft created using "+(model.display_name||model.id)+
        ". Publish it from the workflow list, then grant an API project permission.");
      await refresh();
    }catch(error){info(error.message,true)}
    finally{busy=false;$("createMathDemo").disabled=false}
  });
  function quizerExample(visionId, reviewerId) {
    // A single image (or selected PDF vision page) enters this template per run.
    // Multi-page orchestration belongs to the trusted caller, not the browser.
    const extractPrompt = [
      "Transcribe ALL mathematical questions visible on this ONE page exactly.",
      "Preserve expressions and option order. Return only a JSON object with:",
      '{"schema":"quizer.problems.v1","title":"Page questions","questions":[',
      '{"question_type":"multiple_choice|short_answer|written","statement_latex":"...",',
      '"options":[{"label":"A","latex":"..."},{"label":"B","latex":"..."}],',
      '"answer":"A" or null,"points":1,"review_required":true or false}]}',
      "For short answers, answer is a string or null and options is [].",
      "For written responses, answer must be null.",
      "Never invent missing text, figures, solutions or answer keys.",
      "If a multiple-choice answer cannot be verified from the problem, set answer=null",
      "and review_required=true. Return 1–100 questions per run.",
      "If a diagram matters, explain it in statement_latex and require teacher review.",
      "Do not wrap JSON in Markdown fences. INPUT: {{inputs.1}}"
    ].join("\n");
    const auditPrompt = [
      "You are a strict independent math OCR and answer-key reviewer.",
      "Input is the extractor JSON below. Fix mathematical transcription errors",
      "only where they are unambiguous. Independently verify any answer key.",
      "Keep exactly the quizer.problems.v1 shape, option letters A,B,... and",
      "all questions. Change uncertain answers to null and review_required=true.",
      "Never claim to have seen a source diagram if not described in the input.",
      "Output only valid JSON (no code fence): {{inputs.1}}"
    ].join("\n");
    const ui={
      kind:"mimo/workflow",version:4,name:"Quizer · page extraction + audit",
      workflowGoal:"One image/PDF page into a strictly validated, teacher-reviewable Quizer problem batch",
      initialInput:{format:"text",text:"",fileName:""},
      outputContract:"quizer.problems.v1",outputSource:"audit",
      nodes:[
        {id:"input",type:"input",name:"Page input",x:60,y:130,
         accept:["text","document","image"],output:"text"},
        {id:"extract",type:"spark",execution:"ai",name:"Faithful extraction",
         x:380,y:130,model:visionId,output:"json",maxTokens:8192,prompt:extractPrompt},
        {id:"audit",type:"spark",execution:"ai",name:"Math and grammar audit",
         x:700,y:130,model:reviewerId,output:"json",maxTokens:8192,prompt:auditPrompt},
        {id:"output",type:"output",name:"Quizer checked output",x:1020,y:130}
      ],
      edges:[{from:"input",to:"extract"},{from:"extract",to:"audit"},
             {from:"audit",to:"output"}],customBlocks:{}
    };
    return window.MimoBridge.toBackend(ui,"quizer_page_extract_v1",models);
  }
  $("createQuizerDraft").addEventListener("click",async()=>{
    if(busy||!MimoSite.requireCloud())return;
    const visionId=$("quizerVisionModel").value,reviewerId=$("quizerAuditModel").value;
    const vision=models.find(m=>m.id===visionId&&m.enabled&&m.secret_configured&&m.capabilities?.image_understanding);
    const reviewer=models.find(m=>m.id===reviewerId&&m.enabled&&m.secret_configured&&m.capabilities?.text!==false);
    if(!vision||!reviewer)return info("Choose configured vision and reviewer models first.",true);
    const definition=quizerExample(visionId,reviewerId);
    if(workflows.some(w=>w.id===definition.workflow_id))
      return info("Quizer draft already exists. Open it in Studio to review prompts.",true);
    busy=true;$("createQuizerDraft").disabled=true;
    try {
      await MimoSite.api("/v1/workflows/validate",{method:"POST",body:definition});
      await MimoSite.api("/v1/workflows",{method:"POST",body:definition});
      info("Quizer draft created. Inspect and test with a single image in Studio. Publishing and API grants remain separate.");
      await refresh();
    }catch(error){info(error.message,true)}
    finally{busy=false;$("createQuizerDraft").disabled=false}
  });
  $("refreshWorkflows").addEventListener("click",refresh);
  MimoSite.whenReady(refresh);
})();
