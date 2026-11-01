const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

test("AI model presets target verified OpenAI-compatible provider base URLs",()=>{
  const js=fs.readFileSync("models.js","utf8");
  const html=fs.readFileSync("models.html","utf8");
  assert.match(html,/id="modelPreset"/);
  assert.match(js,/https:\/\/openrouter\.ai\/api\/v1/);
  assert.match(js,/https:\/\/api\.groq\.com\/openai\/v1/);
  assert.match(js,/openrouter\/free/);
  assert.match(js,/MIMO_SECRET_/);
  assert.match(html,/Secret Manager/);
  assert.doesNotMatch(js,/API_KEY\s*=\s*["'][a-zA-Z0-9_-]{20,}/);
});
test("Studio has live multi-agent starter and registered model dropdown",()=>{
  const html=fs.readFileSync("studio.html","utf8");
  assert.match(html,/id="quickAIWorkflow"/);
  assert.match(html,/function quickAIWorkflow\(/);
  assert.match(html,/m\.secret_configured/);
  assert.match(html,/nodeCloudModel/);
  assert.match(html,/Proofread the mathematical statement/);
  assert.match(html,/cloudModels\.filter/);
  const inline=html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  assert.ok(inline);
  assert.doesNotThrow(()=>new vm.Script(inline));
});
test("API verification checks deployed execution role and health without sending secrets",()=>{
  const html=fs.readFileSync("access.html","utf8");
  const js=fs.readFileSync("access.js","utf8");
  assert.match(html,/id="verifyExecution"/);
  assert.match(js,/\/health\/service/);
  assert.match(js,/\/health\/ready/);
  assert.match(js,/detail\.role!=="execution"/);
  assert.match(js,/health\.db!==true\|\|health\.storage!==true/);
  assert.match(js,/credentials:"omit"/);
  assert.match(js,/verifiedOrigin/);
  assert.match(js,/copyEndpoint"\)\.disabled=!\(ready&&verified\)/);
  assert.doesNotMatch(js,/fetch\([^\n]+Authorization:\s*["']Bearer/);
});
