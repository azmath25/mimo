const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("studio.html", "utf8");
const inline = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1] || "";
const start = inline.indexOf("function showCloudRunStatus(");
const stop = inline.indexOf("$('#runButton').addEventListener('click',runCloud);", start);
assert.ok(start > 0 && stop > start, "runCloud and status helper must be defined");

function harness(options = {}) {
  const nodes = new Map([
    ["runButton", {disabled: false}],
    ["runButton .run-text", {textContent: "Run in cloud"}],
    ["cloudRunMessage", {
      hidden: true, textContent: "",
      classList: { toggle() {} }
    }],
    ["costPreviewBtn", {addEventListener() {}}],
    ["confirmCostRun", {disabled:true, listeners:{}, addEventListener(type,fn){this.listeners[type]=fn}}],
    ["costQuoteStatus", {textContent:""}],
    ["costQuoteItems", {children:[], replaceChildren(){this.children=[]}, appendChild(node){this.children.push(node)}}],
    ["runCostLimit", {value:""}],
    ["runCostMode", {value:"hard"}],
  ]);
  const state = {
    running: false, initialFile: options.file || null,
    initial: {text:"Find x when 2x+3=7",fileName:options.fileName || "",format:"text"},
    flowId:null,nodes:[],runStatus:{},results:{},lastRun:null,tab:"edit"
  };
  const received = [];
  const dialogs = [];
  const uploads = [];
  const costRequests = [];
  let costFn = async (path, opts) => {
    costRequests.push([path,opts]);
    return {pricing_complete:true,estimated_usd:"0.001000",known_subtotal_usd:"0.001000",
      blocks:[{node_id:"ai",model_id:"m",max_calls:1,max_output_tokens_per_call:32,
      price_status:"manual",estimated_usd:"0.001000"}]};
  };
  let uploadFn = async file => {
    uploads.push(file);
    return {id:"artifact-xyz"};
  };
  let requestFn = async (path, opts) => {
    received.push([path,opts]);
    return {id:"00000000-0000-4000-8000-000000000001",status:"completed",output:{nodes:{},skipped:[]}};
  };
  const ctx = {
    state,
    isPdfInputFile: file => !!file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')),
    $:selector => {
      const key=selector.replace(/^#/, "");
      if (!nodes.has(key)) throw Error("Unknown DOM selector " + selector);
      return nodes.get(key);
    },
    window: {
      MimoCloud: {
        authorized: options.authorized !== false,
        request: (...args)=>requestFn(...args),
        uploadArtifact: (...args)=>uploadFn(...args)
      },
      MimoBridge: {toBackend: () => options.graph || ({nodes:[],edges:[]})},
      MimoCloudResults: {normalize: () => ({})},
    },
    MimoSite:{api:(...args)=>costFn(...args)},
    document:{createElement:()=>({append(){}})},
    closeDialog:()=>{},
    renderCloudReadiness: () => options.issues || [],
    workflowJSON: () => ({initialInput:{text:"Find x when 2x+3=7"}}),
    cloudModels:[],
    renderAll: () => {},
    renderNodes: () => {},
    renderEdges: () => {},
    renderInspector: () => {},
    openDialog: name => {dialogs.push(name)},
    setTabs: () => {},
    toast: () => {},
    console: {error:()=>{}},
    Date,
  };
  vm.createContext(ctx);
  vm.runInContext(inline.slice(start,stop) + "\nthis.testRunCloud = runCloud;",ctx);
  return {
    state,ctx,received,uploads,dialogs,nodes,costRequests,
    setCostRequest:fn=>{costFn=fn},
    get status(){return nodes.get("cloudRunMessage").textContent},
    get button(){return nodes.get("runButton")},
    get label(){return nodes.get("runButton .run-text").textContent},
    run:()=>ctx.testRunCloud(),
    setRequest:fn=>{requestFn=fn},
    setUpload:fn=>{uploadFn=fn},
  };
}

test("a selected image gets uploaded and reaches cloud execution as an artifact", async()=>{
  const h=harness({file:{name:"blurry.png",type:"image/png",size:440}});
  await h.run();
  assert.equal(h.uploads.length,1);
  assert.equal(h.received.length,1);
  const payload=h.received[0][1].body.input;
  assert.equal(payload.kind,"mimo_image_artifact");
  assert.equal(payload.artifact_id,"artifact-xyz");
  assert.equal(payload.text,"Find x when 2x+3=7");
  assert.match(h.status,/completed/);
  assert.equal(h.button.disabled,false);
  assert.equal(h.state.running,false);
});

test("a saved file name without image bytes gives an actionable error",async()=>{
  const h=harness({fileName:"old-image.png"});
  await h.run();
  assert.match(h.status,/Clear selected file/);
  assert.equal(h.button.disabled,false);
  assert.equal(h.received.length,0);
});

test("validation errors are always visible and no request is made",async()=>{
  const h=harness({issues:["Missing connection to output"]});
  await h.run();
  assert.match(h.status,/Missing connection/);
  assert.deepEqual(h.dialogs,["checkDialog"]);
  assert.equal(h.received.length,0);
  assert.equal(h.button.disabled,false);
});

test("plain text workflow still makes one real cloud request and recovers button",async()=>{
  const h=harness();
  await h.run();
  assert.equal(h.received.length,1);
  assert.equal(h.received[0][0],"/v1/runs/drafts");
  assert.equal(h.received[0][1].body.input,"Find x when 2x+3=7");
  assert.match(h.status,/completed/);
  assert.equal(h.state.lastRunKind,"cloud");
  assert.equal(h.state.running,false);
  assert.equal(h.button.disabled,false);
  assert.equal(h.label,"Run in cloud");
});

test("a synchronous rendering exception no longer leaves Run permanently disabled",async()=>{
  const h=harness();
  h.ctx.renderAll=()=>{throw Error("render broke")};
  await h.run();
  assert.match(h.status,/render broke/);
  assert.equal(h.button.disabled,false);
  assert.equal(h.state.running,false);
  h.ctx.renderAll=()=>{};
  await h.run();
  assert.equal(h.received.length,1);
  assert.match(h.status,/completed/);
});

test("a failed network call shows the error and lets user retry",async()=>{
  const h=harness();
  h.setRequest(async()=>{throw Error("HTTP 503: backend down")});
  await h.run();
  assert.match(h.status,/HTTP 503/);
  assert.equal(h.button.disabled,false);
  assert.equal(h.state.running,false);
  h.setRequest(async (path,opts)=>{h.received.push([path,opts]);return {id:"00000000-0000-4000-8000-000000000001",status:"completed",output:{nodes:{},skipped:[]}}});
  await h.run();
  assert.equal(h.received.length,1);
  assert.match(h.status,/completed/);
});

test("failed image upload restores the button and shows the error",async()=>{
  const h=harness({file:{name:"blurry.png",type:"image/png",size:440}});
  h.setUpload(async()=>{throw Error("HTTP 413: image exceeds upload limit")});
  await h.run();
  assert.equal(h.received.length,0);
  assert.match(h.status,/HTTP 413/);
  assert.equal(h.button.disabled,false);
  assert.equal(h.state.running,false);
});

test("the result panel remains actionable if backend returns no output",async()=>{
  const h=harness();
  h.setRequest(async()=>null);
  await h.run();
  assert.match(h.status,/persistent run ID/);
  assert.equal(h.button.disabled,false);
});

test("button remains clickable when user is not authenticated",async()=>{
  const h=harness({authorized:false});
  await h.run();
  assert.match(h.status,/Sign in/);
  assert.equal(h.button.disabled,false);
});

test("Studio gives explicit user controls to clear previous input file",()=>{
  assert.match(html,/id="clearInitialFile"/);
  assert.match(html,/state\.initialFile=null/);
  assert.match(html,/state\.initial=\{format:'text',text,fileName:''\}/);
  assert.match(html,/role="status" aria-live="polite" hidden/);
  assert.match(html,/window\.MimoCloud\.uploadArtifact\(state\.initialFile\)/);
  assert.match(html,/kind:'mimo_image_artifact'/);
});

test("a full PDF uploads securely and enters the text-extraction workflow", async()=>{
  const h=harness({file:{name:"exam.pdf",type:"application/pdf",size:2200}});
  h.state.initial.pdfMode="text";
  h.state.initial.pdfPage=1;
  await h.run();
  assert.equal(h.uploads.length,1);
  const payload=h.received[0][1].body.input;
  assert.equal(payload.kind,"mimo_pdf_artifact");
  assert.equal(payload.artifact_id,"artifact-xyz");
  assert.equal(payload.mode,"text");
  assert.equal(payload.page_number,1);
  assert.equal(payload.text,"Find x when 2x+3=7");
  assert.match(h.status,/completed/);
});

test("a PDF vision run preserves the user's chosen page and avoids uploading raw PDF in JSON",async()=>{
  const h=harness({file:{name:"scanned.pdf",type:"application/pdf",size:3200}});
  h.state.initial.pdfMode="vision_page";
  h.state.initial.pdfPage=3;
  await h.run();
  const payload=h.received[0][1].body.input;
  assert.equal(payload.kind,"mimo_pdf_artifact");
  assert.equal(payload.mode,"vision_page");
  assert.equal(payload.page_number,3);
  assert.equal(payload.artifact_id,"artifact-xyz");
  assert.doesNotMatch(JSON.stringify(payload),/%PDF|base64/);
});

test("a PDF already stored in Files can be run without uploading it again",async()=>{
  const h=harness();
  h.state.initialCloudArtifact="00000000-0000-4000-8000-000000000056";
  h.state.initialCloudMediaType="application/pdf";
  h.state.initial.pdfMode="vision_page";
  h.state.initial.pdfPage=2;
  await h.run();
  assert.equal(h.uploads.length,0);
  assert.equal(h.received.length,1);
  const payload=h.received[0][1].body.input;
  assert.equal(payload.kind,"mimo_pdf_artifact");
  assert.equal(payload.artifact_id,h.state.initialCloudArtifact);
  assert.equal(payload.mode,"vision_page");
  assert.equal(payload.page_number,2);
  assert.match(h.status,/completed/);
});

test("AI runs require explicit cost consent before making a billable request",async()=>{
  const h=harness({graph:{nodes:[{id:"ai",type:"ai",config:{model_id:"m"}}],edges:[]}});
  await h.run();
  assert.deepEqual(h.dialogs,["costDialog"]);
  assert.equal(h.received.length,0,"No workflow execution before user confirms");
  assert.equal(h.costRequests.length,1,"Only the read-only cost estimate is requested");
  assert.equal(h.costRequests[0][0],"/v1/cost/estimate");
  assert.equal(h.nodes.get("confirmCostRun").disabled,false);
  h.nodes.get("runCostMode").value="hard";
  h.nodes.get("runCostLimit").value="0.05";
  h.nodes.get("confirmCostRun").listeners.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.received.length,1);
  assert.equal(h.received[0][1].body.cost_limit_usd,0.05);
  assert.equal(h.received[0][1].body.cost_mode,"hard");
});

test("an unavailable cost quote prevents submitting an AI workflow",async()=>{
  const h=harness({graph:{nodes:[{id:"ai",type:"ai",config:{model_id:"m"}}],edges:[]}});
  h.setCostRequest(async()=>{throw Error("HTTP 503: price service unavailable")});
  await h.run();
  assert.equal(h.received.length,0);
  assert.equal(h.nodes.get("confirmCostRun").disabled,true);
  assert.match(h.nodes.get("costQuoteStatus").textContent,/unavailable/);
});
