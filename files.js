/* Owned-artifact management and safe PDF page to vision conversion. */
(function(){
"use strict";const $=id=>document.getElementById(id),safe=v=>MimoSite.safe(v),api=(p,o)=>MimoSite.api(p,o);
let files=[],selected=null,previewUrl=null;
const notice=(t,e=false)=>MimoSite.notice("filesFeedback",t,e);
function resetPreview(){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;$("pagePreview").hidden=true;$("pagePreview").removeAttribute("src")}
async function refresh(){
 try{
 const resp=await api("/v1/artifacts?limit=100");files=resp.artifacts||[];
 $("fileList").innerHTML=files.length?files.map(f=>
   '<article class="mg-row" data-file="'+safe(f.id)+'"><div class="mg-row-body"><strong>'+safe(f.original_filename)+'</strong><small>'+safe(f.media_type)+' · '+(f.file_size/1024).toFixed(1)+' KiB · '+safe(MimoSite.date(f.created_at))+'</small></div><button type="button" class="mg-btn small" data-action="open">Inspect</button></article>'
 ).join(""):'<div class="mg-empty">No uploads yet.</div>';
 }catch(e){notice(e.message,true)}
}
function choose(id){
 selected=files.find(f=>f.id===id)||null;resetPreview();
 if(!selected)return;
 $("fileMeta").textContent=selected.original_filename+" · "+selected.media_type+" · SHA-256 "+selected.checksum_sha256;
 $("downloadFile").disabled=false;$("ingestFile").disabled=false;$("deleteFile").disabled=false;
 $("pdfOnly").hidden=selected.media_type!=="application/pdf";
 $("pageCount").value="Unknown until extraction";$("pageNo").value="1";$("pageNo").removeAttribute("max");
 $("extractedText").textContent="Click Read document to extract embedded text and detect PDF pages.";
}
async function ingest(){
 if(!selected)return;const button=$("ingestFile");button.disabled=true;
 try{
  const out=await api("/v1/artifacts/"+encodeURIComponent(selected.id)+"/ingest",{method:"POST"});
  $("extractedText").textContent=out.text||JSON.stringify(out,null,2);
  if(out.kind==="document"){
    $("pageCount").value=String(out.page_count);$("pageNo").max=String(out.page_count);
    const scanned=(out.scanned_pages||[]).length;
    notice("PDF parsed: "+out.page_count+" page(s). "+(scanned?scanned+" page(s) lack embedded text: use page images with a vision model.":"Use page images for mathematical notation and diagrams."));
  }else notice("File metadata inspected.");
 }catch(e){notice("Extraction failed: "+e.message,true)}finally{button.disabled=false}
}
async function pageImage(){
 if(!selected||selected.media_type!=="application/pdf")return;
 const page=Number($("pageNo").value);
 if(!Number.isInteger(page)||page<1||page>100)return notice("Enter a valid page number (1–100).",true);
 try{
  const blob=await MimoCloud.requestBlob("/v1/artifacts/"+encodeURIComponent(selected.id)+"/pages/"+page+"/png");
  resetPreview();previewUrl=URL.createObjectURL(blob);$("pagePreview").src=previewUrl;$("pagePreview").hidden=false;
  notice("Rendered page "+page+". This image can be used by a vision-capable AI block.");
 }catch(e){notice("Cannot render page: "+e.message,true)}
}
async function pageToStudio(){
 if(!selected||selected.media_type!=="application/pdf")return;
 const page=Number($("pageNo").value);
 if(!Number.isInteger(page)||page<1||page>100)return notice("Select a valid page number.",true);
 const button=$("toStudio");button.disabled=true;
 try{
  const artifact=await api("/v1/artifacts/"+encodeURIComponent(selected.id)+"/pages/"+page+"/artifact",{method:"POST"});
  location.href="./studio.html?image_artifact="+encodeURIComponent(artifact.id);
 }catch(e){notice("Cannot create vision page: "+e.message,true)}finally{button.disabled=false}
}
$("fileUploadForm").addEventListener("submit",async e=>{
 e.preventDefault();const f=$("filePicker").files?.[0];if(!f)return;
 const b=$("uploadFileBtn");b.disabled=true;
 try{const result=await window.MimoCloud.uploadFile(f);notice("Stored "+result.original_filename+".");
 await refresh();choose(result.id);$("filePicker").value="";}
 catch(err){notice(err.message,true)}finally{b.disabled=false}
});
$("fileList").addEventListener("click",e=>{const row=e.target.closest("[data-file]");if(row)choose(row.dataset.file)});
$("ingestFile").addEventListener("click",ingest);
$("renderPage").addEventListener("click",pageImage);
$("toStudio").addEventListener("click",pageToStudio);
$("deleteFile").addEventListener("click",async()=>{
 if(!selected)return;
 if(!confirm("Permanently delete "+selected.original_filename+"? Workflows and past runs referencing the file may no longer be resumable."))return;
 $("deleteFile").disabled=true;
 try{
  await api("/v1/artifacts/"+encodeURIComponent(selected.id),{method:"DELETE"});
  selected=null;resetPreview();
  $("downloadFile").disabled=true;$("ingestFile").disabled=true;
  $("pdfOnly").hidden=true;
  $("fileMeta").textContent="Choose a file from the library.";
  $("extractedText").textContent="No file selected.";
  await refresh();
  notice("File deleted from object storage and library.");
 }catch(e){notice("Deletion failed: "+e.message,true)}
 finally{$("deleteFile").disabled=!selected}
});
$("downloadFile").addEventListener("click",async()=>{
 if(!selected)return;try{
  const blob=await MimoCloud.requestBlob("/v1/artifacts/"+encodeURIComponent(selected.id)+"/content");
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=selected.original_filename;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 }catch(e){notice(e.message,true)}
});
$("refreshFiles").addEventListener("click",refresh);
window.addEventListener("beforeunload",resetPreview);
MimoSite.whenReady(refresh);
})();