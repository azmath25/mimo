const test=require("node:test");
const assert=require("node:assert/strict");
const cloud=require("../cloud-results.js");

test("real output collector becomes an inspectable bundle",()=>{
  const out=cloud.normalize({type:"output"},{result:{kind:"bundle",content:{b2:"HELLO",b3:{latex:"x^2"}}}},{b2:{name:"Uppercase"},b3:{name:"LaTeX"}});
  assert.equal(out.format,"collection");
  assert.equal(out.data.length,2);
  assert.equal(out.data[0].name,"Uppercase");
  assert.equal(out.data[0].result.data.text,"HELLO");
  assert.match(out.data[1].result.data.text,/latex/);
});
test("real cloud node preserves usage and selected condition port",()=>{
  const out=cloud.normalize({type:"condition"},{result:{kind:"text",content:"proof"},chosen_port:"r2",usage:{total_tokens:25},cost:{amount_usd:"0.002"}},{});
  assert.equal(out.data.chosenBranchId,"r2");
  assert.equal(out.data.usage.total_tokens,25);
  assert.equal(out.data.text,"proof");
  assert.match(out.task,/0\.002/);
});
test("empty cloud output collector renders without throwing",()=>{
  const out=cloud.normalize({type:"output"},{result:{kind:"bundle",content:null}},null);
  assert.deepEqual(out.data,[]);
});
