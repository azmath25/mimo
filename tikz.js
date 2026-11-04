/* TikZ preview: authenticated PDF/PNG bytes only, never secret credentials. */
(function(){
 "use strict";
 const $=id=>document.getElementById(id);
 const initial=$("tikzSource").value;
 let lastUrl=null, active=false, lastFormat="pdf", compiling=false;
 const outputChoices=[
   {id:"Pdf",format:"pdf",dpi:null},
   ...[160,240,300,450,600].map(dpi=>({id:"Png"+dpi,format:"png",dpi}))
 ];
 function syncFormatLabels(){
   const format=$("tikzFormat").value.toUpperCase();
   $("compileTikz").textContent="Compile "+format;
   $("downloadTikz").textContent="Download "+format;
   $("tikzPreviewTitle").textContent=format+" preview";
   for(const choice of outputChoices){
     const button=$("tikzChoice"+choice.id);
     const selected=choice.format===$("tikzFormat").value &&
       (choice.format==="pdf" || String(choice.dpi)===$("tikzDpi").value);
     button.setAttribute("aria-pressed",selected?"true":"false");
     button.classList.toggle("active",selected);
   }
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
 for(const choice of outputChoices){
   $("tikzChoice"+choice.id).addEventListener("click",()=>{
     if(compiling)return;
     $("tikzFormat").value=choice.format;
     if(choice.dpi)$("tikzDpi").value=String(choice.dpi);
     freeUrl();
     syncFormatLabels();
     const selected=choice.format==="png"?"PNG "+choice.dpi+" DPI":"PDF";
     note(active?"Ready to compile "+selected+".":"Selected "+selected+". Sign in to compile.",!active);
   });
 }
 $("compileTikz").addEventListener("click",async()=>{
   if(!active||!window.MimoCloud?.authorized)return;
   const source=$("tikzSource").value;
   const format=$("tikzFormat").value;
   const dpi=format==="png"?Number($("tikzDpi").value):null;
   if(format==="png"&&(!Number.isInteger(dpi)||dpi<72||dpi>600))return note("Choose a PNG DPI between 72 and 600.",true);
   if(!source.trim())return note("Write some TikZ/LaTeX source first.",true);
   $("compileTikz").disabled=true;
   compiling=true;
   for(const choice of outputChoices)$("tikzChoice"+choice.id).disabled=true;
   freeUrl();note("Compiling via isolated TeX Live worker…");
   try{
     const blob=await MimoCloud.requestBlob("/v1/compiler/"+format,{method:"POST",body:format==="png"?{source,dpi}:{source}});
     if(blob.type!==(format==="pdf"?"application/pdf":"image/png"))throw Error("Compiler returned an unexpected output type.");
     if(format==="png" && !window.MimoPngResolution)throw Error("PNG resolution verifier is unavailable. Refresh TikZ Lab.");
     const pngMeta=format==="png"?await window.MimoPngResolution.verify(blob,dpi):null;
     lastUrl=URL.createObjectURL(blob);lastFormat=format;
     $("tikzPreview").hidden=format!=="pdf";
     $("tikzImagePreview").hidden=format!=="png";
     if(format==="png")$("tikzImagePreview").src=lastUrl;
     else $("tikzPreview").src=lastUrl;
     $("downloadTikz").disabled=false;
     note("Compilation complete. "+format.toUpperCase()+(format==="png"?" at verified "+dpi+" DPI ("+pngMeta.width+" × "+pngMeta.height+" px)":"")+" is ready to preview or download.");
   }catch(e){note("Compilation failed: "+e.message,true)}
   finally{compiling=false;for(const choice of outputChoices)$("tikzChoice"+choice.id).disabled=false;$("compileTikz").disabled=!active}
 });
 $("downloadTikz").addEventListener("click",()=>{
   if(!lastUrl)return;
   const a=document.createElement("a");a.href=lastUrl;a.download="mimo-tikz."+lastFormat;
   document.body.append(a);a.click();a.remove();
 });
 $("resetTikz").addEventListener("click",()=>{
   $("tikzSource").value=initial;$("tikzFormat").value="pdf";$("tikzDpi").value="300";
   freeUrl();syncFormatLabels();note("Example restored.");
 });
 window.addEventListener("beforeunload",freeUrl);
 syncFormatLabels();
 MimoSite.whenReady(readiness);
})();
