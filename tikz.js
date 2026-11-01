/* TikZ preview: authenticated PDF bytes only, never secret credentials. */
(function(){
 "use strict";
 const $=id=>document.getElementById(id);
 const initial=$("tikzSource").value;
 let lastUrl=null, active=false;
 function note(message,bad=false){
   const target=$("tikzStatus");target.textContent=message;
   target.classList.toggle("error",bad);
 }
 function freeUrl(){
   if(lastUrl){URL.revokeObjectURL(lastUrl);lastUrl=null}
   $("tikzPreview").removeAttribute("src");
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
 $("compileTikz").addEventListener("click",async()=>{
   if(!active||!window.MimoCloud?.authorized)return;
   const source=$("tikzSource").value;
   if(!source.trim())return note("Write some TikZ/LaTeX source first.",true);
   $("compileTikz").disabled=true;freeUrl();note("Compiling via isolated TeX Live worker…");
   try{
     const blob=await MimoCloud.requestBlob("/v1/compiler/pdf",{method:"POST",body:{source}});
     if(blob.type!=="application/pdf")throw Error("Compiler returned an unexpected output type.");
     lastUrl=URL.createObjectURL(blob);
     $("tikzPreview").src=lastUrl;
     $("downloadTikz").disabled=false;
     note("Compilation complete. PDF is ready to preview or download.");
   }catch(e){note("Compilation failed: "+e.message,true)}
   finally{$("compileTikz").disabled=!active}
 });
 $("downloadTikz").addEventListener("click",()=>{
   if(!lastUrl)return;
   const a=document.createElement("a");a.href=lastUrl;a.download="mimo-tikz.pdf";
   document.body.append(a);a.click();a.remove();
 });
 $("resetTikz").addEventListener("click",()=>{
   $("tikzSource").value=initial;freeUrl();note("Example restored.");
 });
 window.addEventListener("beforeunload",freeUrl);
 MimoSite.whenReady(readiness);
})();
