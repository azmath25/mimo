const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("studio.html", "utf8");
const css = fs.readFileSync("studio-polish.css", "utf8");

function harness(width=1500) {
  const source = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1] || "";
  const from = source.indexOf("const studioApp=$('.app');");
  const until = source.indexOf("function renderNodes(){", from);
  assert.ok(from > 0 && until > from, "Studio pane helpers must exist");
  function element() {
    const classes = new Set();
    return {
      classList: {
        contains:name => classes.has(name),
        add:name => classes.add(name),
        remove:name => classes.delete(name),
        toggle(name,forced) {
          const next=forced===undefined?!classes.has(name):Boolean(forced);
          if(next)classes.add(name);else classes.delete(name);
          return next;
        }
      },
      attrs:{},textContent:"",
      setAttribute(name,val){this.attrs[name]=val},
    };
  }
  const selectors = Object.fromEntries([
    ".app","#library","#inspector","#toggleLibrary","#toggleInspector",
    "#toggleInspector .toggle-label","#focusCanvas",
  ].map(key=>[key,element()]));
  const state = {selected:null,selectedEdge:null,tab:"edit"};
  let refits=0, renders=0;
  const env = {
    state,
    $:key=>{assert.ok(selectors[key],"Unexpected element "+key);return selectors[key]},
    $$:key=>key===".inspector-tab"?[]:[],
    matchMedia:query=>({matches:width<=Number(query.match(/(\d+)px/)?.[1]||0)}),
    requestAnimationFrame:()=>{refits++},
    fitView:()=>{},
    renderSelection:()=>{renders++},
    renderInspector:()=>{},
  };
  vm.createContext(env);
  vm.runInContext(source.slice(from,until)+"\nthis.api={syncPaneLayout,toggleCanvasFocus,toggleLibraryPane,toggleInspectorPane,selectNode,selectEdge,studioPanes};",env);
  return {api:env.api,selectors,state,get refits(){return refits},get renders(){return renders}};
}

test("Studio uses the global Mimo brand once and keeps key workflow controls",()=>{
  assert.match(html,/site\.js/);
  assert.doesNotMatch(html,/<div class="brand">/);
  for(const id of ["workflowTitle","quickStartWorkflow","quickAIWorkflow",
      "toggleLibrary","toggleInspector","focusCanvas","runButton","previewButton",
      "backgroundRun","cloudRunMessage","dismissCloudRunMessage","inspectorContent"]) {
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(html,/class="starter-details"/);
  assert.match(html,/class="studio-actions-popover"/);
  assert.match(html,/href="\.\/studio-polish\.css"/);
  assert.match(html,/aria-controls="inspector"/);
});

test("sidebar and inspector are independently collapsible",()=>{
  const h=harness();h.api.syncPaneLayout(false);
  assert.equal(h.selectors[".app"].classList.contains("inspector-hidden"),true);
  assert.equal(h.selectors[".app"].classList.contains("library-hidden"),false);
  assert.equal(h.selectors["#toggleInspector"].attrs["aria-expanded"],"false");
  h.api.toggleInspectorPane();
  assert.equal(h.selectors[".app"].classList.contains("inspector-hidden"),false);
  assert.equal(h.selectors["#toggleInspector"].attrs["aria-expanded"],"true");
  h.api.toggleLibraryPane();
  assert.equal(h.selectors[".app"].classList.contains("library-hidden"),true);
  assert.equal(h.selectors["#toggleLibrary"].attrs["aria-expanded"],"false");
  assert.equal(h.refits,2);
});

test("focus mode expands canvas and restores previous pane visibility",()=>{
  const h=harness();h.api.syncPaneLayout(false);
  h.api.toggleCanvasFocus();
  assert.equal(h.selectors[".app"].classList.contains("library-hidden"),true);
  assert.equal(h.selectors[".app"].classList.contains("inspector-hidden"),true);
  assert.equal(h.selectors["#focusCanvas"].attrs["aria-pressed"],"true");
  // Drag selection must not force Details back open in focus mode.
  h.api.selectNode("b1");
  assert.equal(h.state.selected,"b1");
  assert.equal(h.selectors[".app"].classList.contains("inspector-hidden"),true);
  h.api.toggleCanvasFocus();
  assert.equal(h.selectors[".app"].classList.contains("library-hidden"),false);
  assert.equal(h.selectors[".app"].classList.contains("inspector-hidden"),true);
  assert.equal(h.selectors["#focusCanvas"].attrs["aria-pressed"],"false");
  assert.equal(h.refits,2);
});

test("selecting a block opens Details when not focused",()=>{
  const h=harness();h.api.syncPaneLayout(false);
  h.api.selectNode("math-audit");
  assert.equal(h.selectors[".app"].classList.contains("inspector-hidden"),false);
  assert.equal(h.state.tab,"edit");
  assert.equal(h.selectors["#toggleInspector"].attrs["aria-expanded"],"true");
});

test("status can be dismissed and the workspace keeps responsive/focus CSS",()=>{
  assert.match(html,/id="cloudRunMessageText"/);
  assert.match(html,/dismissCloudRunMessage.*?addEventListener\('click'/s);
  assert.match(css,/app\.library-hidden\.inspector-hidden/);
  assert.match(css,/app\.inspector-hidden/);
  assert.match(css,/app\.library-hidden/);
  assert.match(css,/@media \(max-width:640px\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});
