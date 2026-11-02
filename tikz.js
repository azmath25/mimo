/* TikZ preview: authenticated PDF/PNG bytes only, never secret credentials. */
(function(){
 "use strict";
 const $=id=>document.getElementById(id);
 const initial=$("tikzSource").value;
 let lastUrl=null, active=false, lastFormat="pdf";
 function syncFormatLabels(){
   const format=$("tikzFormat").value.toUpperCase();
   $("compileTikz").textContent="Compile "+format;
   $("downloadTikz").textContent="Download "+format;
   $("tikzPreviewTitle").textContent=format+" preview";
 }
 function note(message,bad=false){
   const target=$("tikzStatus");target.textContent=message;
   target.classList.toggle("error",bad);
 }
 function freeUrl(){
   if(lastUrl){URL.revokeObjectURL(lastUrl);lastUrl=null}
   $("tikzPreview").removeAttribute("src");
   $("tikzImagePreview").removeAttribute("src");
   $("tikzPreview").hidden=false;
   $("tikzImagePreview").hidden=true;
   $("downloadTikz").disabled=true;
 }
 async function readiness(){
   if(!window.MimoCloud?.authorized)return;
   try{
     const caps=await MimoSite.api("/v1/capabilities");
     active=caps.compiler?.enabled===true;
     $("compileTikz").disabled=!active;
     $("tikzServiceNotice").textContent=active?
       "Isolated TeX Live compiler is configured. You can compile mathematical diagrams.":
       "The real compiler is not yet deployed/configured. Set COMPILER_URL on the backend; previews are not simulated.";
     note(active?"Ready to compile.":"Compiler service unavailable.",!active);
   }catch(e){active=false;$("compileTikz").disabled=true;note(e.message,true)}
 }
 $("tikzFormat").addEventListener("change",()=>{
   freeUrl();
   syncFormatLabels();
   note(active?"Ready to compile "+$("tikzFormat").value.toUpperCase()+".":
     "Sign in and enable the compiler to begin.",!active);
 });
 $("compileTikz").addEventListener("click",async()=>{
   if(!active||!window.MimoCloud?.authorized)return;
   const source=$("tikzSource").value;
   const format=$("tikzFormat").value;
   if(!source.trim())return note("Write some TikZ/LaTeX source first.",true);
   $("compileTikz").disabled=true;
   $("tikzFormat").disabled=true;
   freeUrl();note("Compiling via isolated TeX Live worker…");
   try{
     const blob=await MimoCloud.requestBlob("/v1/compiler/"+format,{method:"POST",body:{source}});
     if(blob.type!==(format==="pdf"?"application/pdf":"image/png"))throw Error("Compiler returned an unexpected output type.");
     lastUrl=URL.createObjectURL(blob);lastFormat=format;
     $("tikzPreview").hidden=format!=="pdf";
     $("tikzImagePreview").hidden=format!=="png";
     if(format==="png")$("tikzImagePreview").src=lastUrl;
     else $("tikzPreview").src=lastUrl;
     $("downloadTikz").disabled=false;
     note("Compilation complete. "+format.toUpperCase()+" is ready to preview or download.");
   }catch(e){note("Compilation failed: "+e.message,true)}
   finally{$("tikzFormat").disabled=false;$("compileTikz").disabled=!active}
 });
 $("downloadTikz").addEventListener("click",()=>{
   if(!lastUrl)return;
   const a=document.createElement("a");a.href=lastUrl;a.download="mimo-tikz."+lastFormat;
   document.body.append(a);a.click();a.remove();
 });
 $("resetTikz").addEventListener("click",()=>{
   $("tikzSource").value=initial;$("tikzFormat").value="pdf";
   freeUrl();syncFormatLabels();note("Example restored.");
 });
 window.addEventListener("beforeunload",freeUrl);
 syncFormatLabels();
 MimoSite.whenReady(readiness);
})();
