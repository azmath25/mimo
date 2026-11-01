const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const pages={
 "index.html":"overview",
 "workflows.html":"workflows",
 "studio.html":"studio",
 "models.html":"models",
 "access.html":"access",
 "budgets.html":"budgets"
};

test("every management page links the shared shell and Firebase login",()=>{
  for(const [file,page] of Object.entries(pages)){
    const html=fs.readFileSync(file,"utf8");
    assert.match(html,new RegExp('data-page="'+page+'"'));
    assert.match(html,/site\.css/);
    assert.match(html,/site\.js/);
    assert.match(html,/cloud-auth\.js/);
    assert.doesNotMatch(html,/private_key|BEGIN PRIVATE KEY|sk-proj-/);
  }
});
test("each page controller passes JavaScript syntax parsing",()=>{
  for(const file of ["overview.js","workflows.js","models.js","access.js","budgets.js","site.js"]){
    assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(file,"utf8"),{filename:file}),file);
  }
});
test("the workflow Studio starts minimally, without the previous TikZ/AI demonstration",()=>{
  const html=fs.readFileSync("studio.html","utf8");
  assert.doesNotMatch(html,/Demo: a numeric router/);
  assert.doesNotMatch(html,/Ask AI to repair/);
  assert.match(html,/state\.edges\.push\(\{from:input\.id,to:collect\.id\}\)/);
  assert.match(html,/studio-actions-menu/);
  assert.match(html,/quickStartWorkflow/);
});
test("API projects never keep raw keys in local storage",()=>{
  const js=fs.readFileSync("access.js","utf8");
  assert.match(js,/project metadata|project metadata|project identifiers|projects\.map/gi);
  assert.match(js,/api_key/);
  assert.doesNotMatch(js,/localStorage\.setItem\([^\n]*api_key/);
  assert.match(js,/MIMO_API_ROLE=execution|execution service/i);
});
