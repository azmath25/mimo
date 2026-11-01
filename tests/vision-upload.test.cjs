const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

test("Studio uploads image artifact before cloud execution without saving image bytes in workflow JSON",()=>{
 const html=fs.readFileSync("studio.html","utf8");
 const script=html.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(script,"Studio inline JS exists");
 assert.doesNotThrow(()=>new vm.Script(script[1]));
 assert.match(script[1],/window\.MimoCloud\.uploadArtifact\(state\.initialFile\)/);
 assert.match(script[1],/kind:'mimo_image_artifact'/);
 assert.match(script[1],/artifact_id:artifact\.id/);
 assert.match(script[1],/image_understanding/);
 assert.match(script[1],/image\/png/);
 assert.match(script[1],/image\/jpeg/);
 assert.doesNotMatch(script[1],/Binary file inputs need the artifact upload integration/);
 assert.match(script[1],/Binary files are not embedded/);
});

test("Authenticated multipart upload retains Firebase auth and never leaks raw credentials",()=>{
 const source=fs.readFileSync("cloud-auth.js","utf8");
 assert.match(source,/body instanceof FormData/);
 assert.match(source,/form\.append\("file", file, file\.name\)/);
 assert.match(source,/request\("\/v1\/artifacts", \{method: "POST", body: form\}\)/);
 assert.match(source,/headers\.set\("Authorization", "Bearer " \+ token\)/);
 assert.match(source,/!multipart/);
 assert.match(source,/10 \* 1024 \* 1024/);
 assert.doesNotMatch(source,/MIMO_SECRET_GROQ/);
});

test("Vision preset selects Groq Qwen and advertises image understanding explicitly",()=>{
 const html=fs.readFileSync("models.html","utf8");
 const script=fs.readFileSync("models.js","utf8");
 assert.match(html,/value="groq_vision"/);
 assert.match(script,/model:"qwen\/qwen3\.8-27b"/);
 assert.match(script,/image_understanding:!generating&&\$\("capVision"\)\.checked/);
 assert.match(script,/secret:"groq"/);
});
