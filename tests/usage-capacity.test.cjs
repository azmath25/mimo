const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const {summarize, clamp} = require('../usage-capacity-math.js');
const root = path.resolve(__dirname, '..');

test('reports configured per-connection RPM and live queue without inventing global capacity', () => {
  const model = {id:'groq_text',display_name:'Groq Text',enabled:true};
  const alias = {id:'groq_copy',display_name:'Groq Alias',enabled:false};
  const result = summarize({
    models:[model,alias],
    usage:[{model_id:'groq_text', calls:3, input_tokens:40, output_tokens:20, total_usd:'0.0002'},
      {model_id:'groq_copy',calls:1,input_tokens:10,output_tokens:10,total_usd:'0'}],
    rpm:{policies:[{rpm_limit:10, admitted_last_60s:6, effective_remaining_now:4,
      model_ids:['groq_text','groq_copy'],provider_429_last_hour:1}]},
    parallel:{parallel_runs:{running:2},node_tasks:{running:3,queued:5}},
  });
  assert.equal(result.totalCalls,4);
  assert.equal(result.totalTokens,80);
  assert.equal(result.activeRuns,2);
  assert.equal(result.outstanding,8);
  assert.equal(result.processingPercent,37.5); // workload share, not service utilization
  assert.equal(result.policiesConfigured,1);
  assert.equal(result.modelRows[0].rpmCap,10);
  assert.equal(result.modelRows[0].rpmPercent,60);
  assert.equal(result.modelRows[0].remaining,4);
  assert.equal(result.modelRows[0].share,75);
  assert.equal(result.modelRows[0].shared,true);
  assert.equal(result.modelRows[1].shared,true);
  assert.equal(result.modelRows[1].enabled,false);
});

test('missing RPM policies or zero task load never implies unlimited or zero provider capacity', () => {
  const result = summarize({
    models:[{id:'a',enabled:true}],
    usage:[{model_id:'a',calls:0}],
    parallel:{node_tasks:{running:0,queued:0}},
  });
  assert.equal(result.modelRows[0].rpmCap,null);
  assert.equal(result.modelRows[0].rpmPercent,null);
  assert.equal(result.modelRows[0].share,null);
  assert.equal(result.processingPercent,null);
  assert.equal(clamp(null),null);
  assert.equal(clamp(120),100);
});

test('capacity dashboard is isolated, read-only, and wired into existing usage page', () => {
  const page = fs.readFileSync(path.join(root,'budgets.html'),'utf8');
  const script = fs.readFileSync(path.join(root,'usage-capacity.js'),'utf8');
  const checks = ['usage-capacity.css','usage-capacity-math.js','usage-capacity.js','id="uc-active-nodes"',
    'id="uc-model-grid"','id="uc-call-chart"'];
  for(const name of checks) assert.ok(page.includes(name),name);
  for(const url of ['/v1/models','/v1/usage/dashboard','/v1/metrics/model-rpm','/v1/metrics/parallel']){
    assert.ok(script.includes(url),url);
  }
  assert.ok(!/method:\s*['"](POST|PUT|PATCH|DELETE)/.test(script));
  assert.ok(script.includes("document.visibilityState === 'hidden'"));
  assert.ok(script.includes("Promise.allSettled"));
  assert.ok(!/0.*%.*capacity/i.test(script));
  for(const file of ['usage-capacity.js','usage-capacity-math.js']){
    cp.execFileSync(process.execPath,['--check',path.join(root,file)],{stdio:'pipe'});
  }
});
