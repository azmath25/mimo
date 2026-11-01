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
  ]);
  const state = {
    running: false, initialFile: options.file || null,
    initial: {text:"Find x when 2x+3=7",fileName:options.fileName || "",format:"text"},
    flowId:null,nodes:[],runStatus:{},results:{},lastRun:null,tab:"edit"
  };
  const received = [];
  const dialogs = [];
  let requestFn = async (path, opts) => {
    received.push([path,opts]);
    return {nodes:{},skipped:[]};
  };
  const ctx = {
    state,
    $:selector => {
      if (!nodes.has(selector)) throw Error("Unknown DOM selector " + selector);
      return nodes.get(selector);
    },
    window: {
      MimoCloud: {authorized: options.authorized !== false, request: (...args)=>requestFn(...args)},
      MimoBridge: {toBackend: () => ({nodes:[],edges:[]})},
      MimoCloudResults: {normalize: () => ({})},
    },
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
    state,ctx,received,dialogs,nodes,
    get status(){return nodes.get("cloudRunMessage").textContent},
    get button(){return nodes.get("runButton")},
    get label(){return nodes.get("runButton .run-text").textContent},
    run:()=>ctx.testRunCloud(),
    setRequest:fn=>{requestFn=fn},
  };
}

test("a lingering image is explained before any cloud API call", async()=>{
  const h=harness({file:{name:"blurry.png"}});
  await h.run();
  assert.equal(h.received.length,0);
  assert.deepEqual(h.dialogs,["inputDialog"]);
  assert.match(h.status,/Clear selected file/);
  assert.equal(h.button.disabled,false);
  assert.equal(h.state.running,false);
});

test("a saved file name also blocks text instead of silently failing",async()=>{
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
  assert.equal(h.received[0][0],"/v1/workflows/execute");
  assert.equal(h.received[0][1].body.input,"Find x when 2x+3=7");
  assert.match(h.status,/Cloud execution complete/);
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
  assert.match(h.status,/Cloud execution complete/);
});

test("a failed network call shows the error and lets user retry",async()=>{
  const h=harness();
  h.setRequest(async()=>{throw Error("HTTP 503: backend down")});
  await h.run();
  assert.match(h.status,/HTTP 503/);
  assert.equal(h.button.disabled,false);
  assert.equal(h.state.running,false);
  h.setRequest(async (path,opts)=>{h.received.push([path,opts]);return {nodes:{},skipped:[]}});
  await h.run();
  assert.equal(h.received.length,1);
  assert.match(h.status,/Cloud execution complete/);
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
});
