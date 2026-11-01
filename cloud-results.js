/* Normalize actual FastAPI node results for the v3.3 Studio inspector. */
(function(root){
  "use strict";
  function printable(value){
    if(value===null || value===undefined)return "";
    if(typeof value==="string")return value;
    try{return JSON.stringify(value,null,2)}catch{return String(value)}
  }
  function normalize(node,raw,lookup){
    const result=raw?.result||{},content=result.content,kind=result.kind||"text";
    const task="Executed on Mimo Cloud Run"+(raw?.cost?.amount_usd?" · $"+raw.cost.amount_usd:"");
    if(node.type==="output"){
      const bundle=content&&typeof content==="object"&&!Array.isArray(content)?Object.entries(content):[];
      return {
        format:"collection",task,
        data:bundle.map(([id,value])=>({
          id,name:lookup?.[id]?.name||id,branchId:null,
          result:{format:"text",task:"Real cloud result",data:{text:printable(value),actual:true}}
        }))
      };
    }
    return {
      format:kind,task,
      data:{
        text:printable(content),actual:true,
        chosenBranchId:raw?.chosen_port||null,
        backendResult:result,
        usage:raw?.usage||null
      }
    };
  }
  const api={normalize,printable};
  root.MimoCloudResults=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
