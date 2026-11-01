const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const source=fs.readFileSync("cloud-auth.js","utf8")
 .replace(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];/g,"");

function boot(){
  const ids=[
    "cloudGate","cloudAuthMessage","cloudStatus","cloudAccountBtn",
    "cloudLoginForm","cloudLoginButton","cloudGoogleButton","cloudSwitchAccount"
  ];
  const elements=Object.fromEntries(ids.map(id=>[id,{
    hidden:id!=="cloudGate",
    style:{},textContent:"",disabled:false,
    classList:{toggle(){}},
    listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}
  }]));
  elements.cloudGate.hidden=true;
  const auth={currentUser:null},handlers={},events=[];
  let sendResponse=async()=>({ok:true,status:200,statusText:"OK",json:async()=>({role:"admin"})});
  const scope={
    initializeApp:()=>({}),getAuth:()=>auth,
    onAuthStateChanged(_auth,change,error){handlers.change=change;handlers.error=error;},
    signInWithEmailAndPassword:async()=>({}),
    signInWithPopup:async()=>({}),
    GoogleAuthProvider:class {},
    signOut:async()=>{auth.currentUser=null;},
    setPersistence:async()=>{},browserLocalPersistence:{},
    window:{dispatchEvent:event=>events.push(event.type)},
    document:{getElementById:id=>elements[id]},
    Headers,Event:class{constructor(type){this.type=type}},
    fetch:(...args)=>sendResponse(...args),
    Error,JSON
  };
  vm.runInNewContext(source,scope,{filename:"cloud-auth.js"});
  return {auth,handlers,elements,events,setResponse:fn=>{sendResponse=fn},scope};
}

test("shared site shell initializes the sign-in dialog hidden",()=>{
  const script=fs.readFileSync("site.js","utf8");
  const css=fs.readFileSync("site.css","utf8");
  assert.match(script,/gate\.hidden\s*=\s*true/);
  assert.match(css,/\.cloud-gate\[hidden\]\s*\{display:none!important\}/);
});

test("restored Firebase session does not flash the login screen during backend verification",async()=>{
  const app=boot();
  const firebaseUser={uid:"admin",email:"admin@example.test",getIdToken:async()=>"valid-token"};
  app.auth.currentUser=firebaseUser;
  let complete;
  app.setResponse(()=>new Promise(resolve=>{complete=()=>resolve({
    ok:true,status:200,json:async()=>({role:"admin"})
  })}));
  const verifying=app.handlers.change(firebaseUser);
  assert.equal(app.elements.cloudGate.hidden,true,"Login must stay hidden while verifying");
  assert.equal(app.elements.cloudStatus.textContent,"Checking account…");
  assert.equal(app.elements.cloudAccountBtn.hidden,true);
  complete();
  await verifying;
  assert.equal(app.elements.cloudGate.hidden,true);
  assert.equal(app.elements.cloudAccountBtn.hidden,false);
  assert.equal(app.scope.window.MimoCloud.authorized,true);
  assert.equal(app.scope.window.MimoCloud.user.uid,"admin");
});

test("missing or rejected sign-in reveals login",async()=>{
  const app=boot();
  await app.handlers.change(null);
  assert.equal(app.elements.cloudGate.hidden,false,"Signed-out visitor must see sign-in");
  assert.equal(app.scope.window.MimoCloud.authorized,false);
  const rejected=boot();
  rejected.auth.currentUser={uid:"not-admin",email:"guest@example.test",getIdToken:async()=>"guest-token"};
  rejected.setResponse(async()=>({
    ok:false,status:401,statusText:"Unauthorized",
    json:async()=>({detail:"unauthorized"})
  }));
  await rejected.handlers.change(rejected.auth.currentUser);
  assert.equal(rejected.elements.cloudGate.hidden,false,"Invalid admin token must show sign-in");
  assert.equal(rejected.scope.window.MimoCloud.authorized,false);
});

test("Firebase startup error reveals login instead of leaving a hidden gate",()=>{
  const app=boot();
  app.handlers.error(new Error("Firebase initialization failed"));
  assert.equal(app.elements.cloudGate.hidden,false);
  assert.equal(app.elements.cloudStatus.textContent,"Authentication error");
});
