const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

test("model registry renders the real provider response near the Test button",()=>{
  const html=fs.readFileSync("models.html","utf8");
  const js=fs.readFileSync("models.js","utf8");
  assert.match(html,/id="modelTestPanel"/);
  assert.match(html,/id="modelTestText"/);
  assert.match(html,/id="modelTestBadge"/);
  assert.match(js,/showConnectionTest\(/);
  assert.match(js,/text:reply/);
  assert.match(js,/usage\.total_tokens/);
  assert.match(js,/error\.message/);
  assert.match(js,/panel\.scrollIntoView\(/);
  assert.doesNotThrow(()=>new vm.Script(js));
});

test("model test failure must be visible in registry and does not store API keys",()=>{
  const js=fs.readFileSync("models.js","utf8");
  assert.match(js,/connection failed/);
  assert.match(js,/status:"Failed"/);
  assert.match(js,/btn\.textContent="Testing…"/);
  assert.match(js,/btn\.textContent="Test"/);
  assert.doesNotMatch(js,/localStorage\.setItem\([^\n]*(api_key|provider_key|secret_value)/);
});
