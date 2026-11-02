const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("math demo installer creates an explicit six-node backend workflow",()=>{
  const page = fs.readFileSync("workflows.html","utf8");
  const script = fs.readFileSync("workflows.js","utf8");
  assert.match(page,/id="mathDemoModel"/);
  assert.match(page,/id="createMathDemo"/);
  assert.match(script,/const textModels=models\.filter/);
  assert.match(script,/function mathExample\(modelId\)/);
  assert.match(script,/workflow_id:"math_extract_verify_tikz"/);
  for (const node of ["input","extract","verify","tikz","compile_png","output"]){
    assert.ok(script.includes('id:"'+node+'"'),node+" missing");
  }
  assert.match(script,/target:"png"/);
  assert.match(script,/collect:\["verify","compile_png"\]/);
  assert.match(script,/\/v1\/workflows\/validate/);
  assert.match(script,/MimoSite\.api\("\/v1\/workflows",\{method:"POST"/);
  assert.doesNotMatch(script,/api_key|MIMO_SECRET_|MIMO_ADMIN_TOKEN/);
});
