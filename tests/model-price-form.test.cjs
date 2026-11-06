"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const src=fs.readFileSync(path.join(__dirname,"../models.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"../models.html"),"utf8");

function fixture(initial={input_per_million:2,cached_input_per_million:0,output_per_million:2,image_per_unit:0}){
  const els=new Map();
  class Element{
    constructor(id){this.id=id;this.value="";this.hidden=false;this.disabled=false;this.checked=true;
      this.textContent="";this.innerHTML="";this.dataset={};this.listeners={};this.style={};
      this.classList={add(){},remove(){},toggle(){}};}
    addEventListener(event,fn){this.listeners[event]=fn;}
    scrollIntoView(){}
    reset(){for(const id of ["modelInputPrice","modelCachedInputPrice","modelOutputPrice","modelImagePrice"])el(id).value="";}
  }
  function el(id){if(!els.has(id))els.set(id,new Element(id));return els.get(id);}
  const model={id:"groq_text",display_name:"Groq Text",remote_model_id:"openai/gpt-oss-20b",
    provider:"openai_compatible",endpoint:"https://api.groq.com/openai/v1",
    enabled:true,secret_configured:true,secret_ref:"groq",capabilities:{text:true,chat:true}};
  let price={...initial},saveCount=0,submitted=null,lastNotice="",ready;
  const site={
    safe:val=>String(val),
    notice:(_id,message)=>{lastNotice=message;},
    whenReady:callback=>{ready=callback;},
    async api(p,opts){
      if(p==="/v1/models")return [model];
      if(p==="/v1/models/groq_text/pricing")return {...price};
      if(p==="/v1/models/groq_text/pricing/suggestion")return {
        available:true,suggestion:{verified_on:"2026-11-06",pricing:{
          input_per_million:0.075,cached_input_per_million:0.0375,
          output_per_million:0.3,image_per_unit:0,source:"catalog_groq_20261106"
        }}
      };
      if(p==="/v1/models/groq_text/pricing/apply"&&opts?.method==="POST"){
        price={...price,input_per_million:0.075,cached_input_per_million:0.0375,output_per_million:0.3,
               image_per_unit:0,source:"catalog_groq_20261106"};
        return {applied:true,price:{...price}};
      }
      if(p==="/v1/models/groq_text"&&opts?.method==="PATCH"){
        ++saveCount;submitted=opts.body;price={...price,...opts.body.pricing};return model;
      }
      throw Error("Unexpected endpoint: "+p);
    }
  };
  vm.runInNewContext(src,{document:{getElementById:el},MimoSite:site,URL,confirm:()=>true});
  return {
    el,ready,notice:()=>lastNotice,submitted:()=>submitted,saves:()=>saveCount,price:()=>price,
    async edit(){
      await ready();
      const btn={dataset:{action:"edit"},disabled:false,closest:()=>({dataset:{id:"groq_text"}})};
      await el("modelList").listeners.click({target:{closest:()=>btn}});
      await Promise.resolve();await Promise.resolve();await Promise.resolve();
    },
    async save(){return el("modelForm").listeners.submit({preventDefault(){}});}
  };
}

test("pricing inputs accept fractional text (not locale-sensitive number spin buttons)",()=>{
  for(const id of ["modelInputPrice","modelCachedInputPrice","modelOutputPrice","modelImagePrice"]){
    assert.match(html,new RegExp('id="'+id+'" type="text" inputmode="decimal"'));
  }
});

test("edit preloads current prices; comma decimals are verified and fields stay filled",async()=>{
  const f=fixture();
  await f.edit();
  assert.equal(f.el("modelInputPrice").value,"2");
  assert.equal(f.el("modelOutputPrice").value,"2");
  f.el("modelInputPrice").value="0,075";
  f.el("modelCachedInputPrice").value="0,037";
  f.el("modelOutputPrice").value="0.30";
  await f.save();
  assert.equal(f.saves(),1);
  assert.deepEqual(JSON.parse(JSON.stringify(f.submitted().pricing)),{
    input_per_million:0.075,cached_input_per_million:0.037,
    output_per_million:0.3,image_per_unit:0,currency:"USD",source:"manual"
  });
  assert.equal(f.el("modelInputPrice").value,"0.075");
  assert.equal(f.el("modelOutputPrice").value,"0.3");
  assert.match(f.notice(),/Verified input \$0.075 and output \$0.3/);
});

test("malformed or negative prices are rejected without sending a request",async()=>{
  for(const invalid of ["-0.1","x","1.2.3","NaN","2e8"]){
    const f=fixture();
    await f.edit();
    f.el("modelInputPrice").value=invalid;
    f.el("modelOutputPrice").value="0.30";
    await f.save();
    assert.equal(f.saves(),0,invalid);
    assert.match(f.notice(),/non-negative decimal/);
  }
});

test("incomplete price updates fail closed; no silent zero coercion",async()=>{
  const f=fixture();
  await f.edit();
  f.el("modelInputPrice").value="";
  f.el("modelOutputPrice").value="0.30";
  await f.save();
  assert.equal(f.saves(),0);
  assert.match(f.notice(),/both input and output/);
});

test("one-click catalog price adoption reads back exact prices and does not overwrite on normal Save",async()=>{
  const f=fixture();
  await f.edit();
  assert.match(html,/id="modelApplyCatalogPrice"/);
  await f.el("modelApplyCatalogPrice").listeners.click();
  assert.equal(f.el("modelInputPrice").value,"0.075");
  assert.equal(f.el("modelCachedInputPrice").value,"0.0375");
  assert.equal(f.el("modelOutputPrice").value,"0.3");
  assert.match(f.notice(),/Catalog price saved and verified/);
  await f.save();
  assert.equal(f.saves(),1);
  assert.equal(f.submitted().pricing,undefined,
    "Unchanged catalog pricing must not be silently re-saved as manual");
});
