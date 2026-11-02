const test=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const {join}=require("node:path");
const read=(file)=>readFileSync(join(__dirname,"..",file),"utf8");

test("Studio exposes read-only task-plan preview",()=>{
 const html=read("studio.html");
 assert.match(html,/id="planFlowBtn"/);
 assert.match(html,/id="planDialog"/);
 assert.match(html,/\/v1\/workflows\/plan/);
 assert.match(html,/maximum_ai_calls/);
 assert.match(html,/Opt-in parallel mode schedules up to four/);
 assert.match(html,/parallelExecutionEnabled/);
});
test("Studio budgets include external-project thresholds and cost attribution",()=>{
 const html=read("budgets.html"),code=read("budgets.js");
 assert.match(html,/value="project"/);
 assert.match(html,/id="usageByProject"/);
 assert.match(code,/\/v1\/usage\/dashboard/);
 assert.match(code,/projectUsage=u\.by_project/);
 assert.match(code,/scope==="project"/);
});
