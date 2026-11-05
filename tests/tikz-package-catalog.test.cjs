"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

function fixture(){
  const elements=new Map(), calls=[];
  let ready;
  function element(id){
    if(!elements.has(id)){
      const node={
        id, value:id==="tikzFormat"?"pdf":id==="tikzDpi"?"300":"",
        textContent:"",hidden:true,disabled:false,open:false,children:[],
        listeners:{}, attributes:{},
        classList:{toggle(){},add(){},remove(){}},
        addEventListener(event,fn){this.listeners[event]=fn},
        setAttribute(k,v){this.attributes[k]=v},
        removeAttribute(k){delete this.attributes[k]},
        replaceChildren(...items){this.children=[...items]},
        append(...items){this.children.push(...items)},
      };
      elements.set(id,node);
    }
    return elements.get(id);
  }
  const document={
    getElementById:element,
    createElement(tag){return element("dynamic_"+elements.size+"_"+tag)},
  };
  const MimoSite={
    whenReady(fn){ready=fn},
    async api(url){
      calls.push(url);
      if(url==="/v1/capabilities")return {compiler:{enabled:true}};
      if(url==="/v1/compiler/packages")return {
        engine:"pdflatex",
        packages:[{name:"AMS mathematics",file:"amsmath.sty",installed:true},
                  {name:"Not available",file:"missing.sty",installed:false}],
      };
      if(url==="/v1/compiler/packages?name=standalone.cls")return {
        engine:"pdflatex",packages:[{name:"standalone.cls",file:"standalone.cls",installed:true}],
      };
      throw Error("Unexpected API URL "+url);
    },
  };
  const window={MimoCloud:{authorized:true},addEventListener(){}};
  vm.runInNewContext(fs.readFileSync("tikz.js","utf8"),{
    document,window,MimoSite,URL:{revokeObjectURL(){}},
  },{filename:"tikz.js"});
  return {element,calls,ready};
}

const tick=()=>new Promise(resolve=>setImmediate(resolve));

test("package panel lives inside existing TikZ/PDF page",()=>{
  const html=fs.readFileSync("tikz.html","utf8");
  for(const id of ["tikzPackagesPanel","tikzPackagesList","tikzPackageForm",
    "tikzPackageName","tikzPackageLookupResult","tikzChoicePdf","tikzPreview"])
    assert.ok(html.includes('id="'+id+'"'),"Missing control "+id);
  assert.match(html,/TeX Live packages &amp; compatibility/);
  assert.match(html,/pdfLaTeX/);
  assert.doesNotMatch(html,/npm install|tlmgr install|auto-install/i);
});

test("package catalog is lazy and does not interfere with PDF compilation",async()=>{
  const f=fixture();
  await f.ready();
  assert.deepEqual(f.calls,["/v1/capabilities"]);
  const panel=f.element("tikzPackagesPanel");
  panel.open=true;panel.listeners.toggle();
  await tick();
  assert.deepEqual(f.calls,["/v1/capabilities","/v1/compiler/packages"]);
  assert.equal(f.element("tikzPackagesList").children.length,2);
  panel.listeners.toggle();await tick();
  assert.equal(f.calls.length,2,"Opening loaded catalog should not trigger a second lookup");
  assert.equal(f.element("compileTikz").disabled,false);
});

test("individual package lookup encodes validated filename without page navigation",async()=>{
  const f=fixture();
  await f.ready();
  f.element("tikzPackageName").value="../private";
  f.element("tikzPackageForm").listeners.submit({preventDefault(){}});
  await tick();
  assert.equal(f.calls.length,1,"Unsafe file names must be rejected before API calls");
  f.element("tikzPackageName").value="standalone.cls";
  f.element("tikzPackageForm").listeners.submit({preventDefault(){}});
  await tick();
  assert.deepEqual(f.calls,[
    "/v1/capabilities","/v1/compiler/packages?name=standalone.cls",
  ]);
  assert.match(f.element("tikzPackageLookupResult").textContent,/installed/);
});
