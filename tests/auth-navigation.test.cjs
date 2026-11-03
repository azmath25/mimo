const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const source=fs.readFileSync("cloud-auth.js","utf8")
 .replace(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];/g,"");

function boot({environment="production",stagingOrigin=""}={}){
  // Existing auth-navigation tests exercise an explicitly reviewed production
  // target; the feature branch itself defaults to fail-closed staging.
  const script=source
    .replace('const ACTIVE_API_ENVIRONMENT = "staging";',
             'const ACTIVE_API_ENVIRONMENT = '+JSON.stringify(environment)+';')
    .replace('const APPROVED_STAGING_STUDIO_ORIGIN = "";',
             'const APPROVED_STAGING_STUDIO_ORIGIN = '+JSON.stringify(stagingOrigin)+';');
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
  const auth={currentUser:null},handlers={},events=[],requests=[];
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
    fetch:(...args)=>{requests.push(args);return sendResponse(...args)},
    Error,JSON,URL
  };
  vm.runInNewContext(script,scope,{filename:"cloud-auth.js"});
  return {auth,handlers,elements,events,requests,setResponse:fn=>{sendResponse=fn},scope};
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
  // Firebase getIdToken() is asynchronous; the fetch stub is assigned after
  // the token microtask completes. Verify that the intermediate gate stays hidden.
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof complete,"function","Backend verification request was started");
  assert.equal(app.elements.cloudGate.hidden,true);
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


test("feature branch defaults to UNCONFIGURED staging: no Firebase token or API request",async()=>{
  const app=boot({environment:"staging"});
  let tokenRequests=0;
  const user={uid:"admin",email:"a@test.invalid",getIdToken:async()=>{tokenRequests++;return "should-not-send"}};
  app.auth.currentUser=user;
  await app.handlers.change(user);
  assert.equal(app.scope.window.MimoCloud.apiOrigin,null);
  assert.equal(app.scope.window.MimoCloud.authorized,false);
  assert.equal(app.requests.length,0);
  assert.equal(tokenRequests,0,"An unapproved endpoint must not even request an ID token");
  assert.equal(app.elements.cloudGate.hidden,false);
  assert.match(app.elements.cloudAuthMessage.textContent,/staging Studio API is not yet approved/i);
});

test("code-reviewed exact staging Cloud Run origin is the only token destination",async()=>{
  const origin="https://mimo-studio-staging-abcd.a.run.app";
  const app=boot({environment:"staging",stagingOrigin:origin});
  const user={uid:"admin",email:"admin@test.invalid",getIdToken:async()=>"fake-staging-token"};
  app.auth.currentUser=user;
  await app.handlers.change(user);
  assert.equal(app.scope.window.MimoCloud.authorized,true);
  assert.equal(app.scope.window.MimoCloud.apiOrigin,origin);
  assert.equal(app.requests.length,1);
  assert.equal(app.requests[0][0],origin+"/v1/me");
  assert.equal(new Headers(app.requests[0][1].headers).get("Authorization"),"Bearer fake-staging-token");
});

test("arbitrary query, storage, and window targets cannot redirect bearer-token requests",async()=>{
  const stagingOrigin="https://mimo-studio-approved-abc.a.run.app";
  const app=boot({environment:"staging",stagingOrigin});
  app.scope.window.location={search:"?api=https://attacker.invalid",hash:"#api=https://attacker.invalid"};
  app.scope.window.localStorage={getItem:()=>"https://attacker.invalid"};
  app.scope.window.MimoCloud.apiOrigin="https://attacker.invalid";
  assert.equal(app.scope.window.MimoCloud.apiOrigin,stagingOrigin,"origin is readonly");
  const user={uid:"admin",email:"admin@test.invalid",getIdToken:async()=>"fake"};
  app.auth.currentUser=user;
  await app.handlers.change(user);
  assert.equal(app.requests.length,1);
  assert.equal(app.requests[0][0],stagingOrigin+"/v1/me");
});

for(const malicious of [
  "https://attacker.example.invalid",
  "http://mimo-staging-abc.a.run.app",
  "https://user:pass@mimo-staging-abc.a.run.app",
  "https://mimo-staging-abc.a.run.app:443",
  "https://mimo-staging-abc.a.run.app/v1/me",
  "https://mimo-staging-abc.a.run.app?token=1",
  "https://mimo-staging-abc.a.run.app#frag",
  "https://mimo-backend-git-993130348924.europe-west1.run.app",
]){
  test("staging target fails closed on unreviewable URL: "+malicious,()=>{
    assert.throws(()=>boot({environment:"staging",stagingOrigin:malicious}),
      /Unapproved Mimo Studio API origin|Staging must use a different/i);
  });
}

test("unknown environment is rejected without falling back to production",()=>{
  assert.throws(()=>boot({environment:"preview"}),/Unknown Mimo API environment/);
});

test("late success after user sign-out never restores the previous administrator",async()=>{
  const app=boot();
  let complete;
  const user={uid:"admin-A",email:"a@test.invalid",getIdToken:async()=>"token-a"};
  app.auth.currentUser=user;
  app.setResponse(()=>new Promise(resolve=>{complete=()=>resolve({
    ok:true,status:200,json:async()=>({role:"admin"})
  })}));
  const pending=app.handlers.change(user);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof complete,"function");
  const signOut=app.elements.cloudAccountBtn.listeners.click();
  assert.equal(app.scope.window.MimoCloud.authorized,false);
  await signOut;
  await app.handlers.change(null);
  complete();
  await pending;
  assert.equal(app.scope.window.MimoCloud.authorized,false);
  assert.equal(app.scope.window.MimoCloud.user,null);
  assert.equal(app.elements.cloudGate.hidden,false);
  assert.equal(app.elements.cloudAccountBtn.hidden,true);
});

test("switched user wins; prior successful /v1/me response cannot authorize old UID",async()=>{
  const app=boot();
  const a={uid:"admin-A",email:"a@test.invalid",getIdToken:async()=>"token-a"};
  const b={uid:"admin-B",email:"b@test.invalid",getIdToken:async()=>"token-b"};
  let completeA,completeB;
  app.setResponse((url,options)=>new Promise(resolve=>{
    const bearer=new Headers(options.headers).get("Authorization");
    if(bearer==="Bearer token-a")completeA=()=>resolve({ok:true,json:async()=>({role:"admin"})});
    else completeB=()=>resolve({ok:true,json:async()=>({role:"admin"})});
  }));
  app.auth.currentUser=a;
  const pendingA=app.handlers.change(a);
  await new Promise(resolve=>setImmediate(resolve));
  app.auth.currentUser=b;
  const pendingB=app.handlers.change(b);
  await new Promise(resolve=>setImmediate(resolve));
  completeA();
  await pendingA;
  assert.equal(app.scope.window.MimoCloud.authorized,false);
  completeB();
  await pendingB;
  assert.equal(app.scope.window.MimoCloud.authorized,true);
  assert.equal(app.scope.window.MimoCloud.user.uid,"admin-B");
  assert.match(app.elements.cloudAccountBtn.textContent,/b@test.invalid/);
});

test("stale backend rejection after newer verified user does not reopen sign-in dialog",async()=>{
  const app=boot();
  const a={uid:"admin-A",getIdToken:async()=>"token-a"};
  const b={uid:"admin-B",getIdToken:async()=>"token-b"};
  let completeOld;
  app.setResponse((_url,options)=>{
    if(new Headers(options.headers).get("Authorization")==="Bearer token-a")
      return new Promise(resolve=>{completeOld=()=>resolve({
        ok:false,status:403,statusText:"Forbidden",json:async()=>({detail:"denied"})
      })});
    return Promise.resolve({ok:true,status:200,json:async()=>({role:"admin"})});
  });
  app.auth.currentUser=a;
  const older=app.handlers.change(a);
  await new Promise(resolve=>setImmediate(resolve));
  app.auth.currentUser=b;
  await app.handlers.change(b);
  completeOld();
  await older;
  assert.equal(app.scope.window.MimoCloud.authorized,true);
  assert.equal(app.scope.window.MimoCloud.user.uid,"admin-B");
  assert.equal(app.elements.cloudGate.hidden,true); // stays hidden
});

test("Firebase account change during getIdToken never sends old token",async()=>{
  const app=boot();
  let finishToken;
  const a={uid:"admin-A",getIdToken:()=>new Promise(resolve=>{finishToken=resolve})};
  const b={uid:"admin-B",getIdToken:async()=>"token-b"};
  app.auth.currentUser=a;
  const pending=app.handlers.change(a);
  await new Promise(resolve=>setImmediate(resolve));
  app.auth.currentUser=b;
  finishToken("old-token");
  await pending;
  assert.equal(app.requests.length,0);
  assert.equal(app.scope.window.MimoCloud.authorized,false);
});


test("malformed paths cannot transform approved origin into bearer-token exfiltration",async()=>{
  const origin="https://mimo-approved-abc.a.run.app";
  const app=boot({environment:"staging",stagingOrigin:origin});
  let tokenCalls=0;
  const user={uid:"admin",getIdToken:async()=>{tokenCalls++;return "fake-token"}};
  app.auth.currentUser=user;
  for(const path of [
    "@attacker.example.invalid/v1/me",
    "//attacker.example.invalid/v1/me",
    "/\\attacker.example.invalid/v1/me",
    "/%5cattacker.example.invalid/v1/me",
    "https://attacker.example.invalid/v1/me",
    "/other/path",
    "/v1/ok\nInjected: yes",
    "",
    {},
  ]){
    await assert.rejects(app.scope.window.MimoCloud.request(path),/Invalid authenticated Mimo API path/);
    await assert.rejects(app.scope.window.MimoCloud.requestBlob(path),/Invalid authenticated Mimo API path/);
  }
  assert.equal(app.requests.length,0,"No unapproved URL was fetched");
  assert.equal(tokenCalls,0,"No Firebase ID token should be fetched for invalid paths");
});

test("only approved /v1 routes can make authenticated requests and binary downloads",async()=>{
  const origin="https://mimo-approved-abc.a.run.app";
  const app=boot({environment:"staging",stagingOrigin:origin});
  const user={uid:"admin",getIdToken:async()=>"fake-token"};
  app.auth.currentUser=user;
  await app.scope.window.MimoCloud.request("/v1/me?detail=1");
  app.setResponse(async()=>({ok:true,status:200,blob:async()=>({size:4})}));
  await app.scope.window.MimoCloud.requestBlob("/v1/runs/123/artifacts/img");
  assert.equal(app.requests.length,2);
  assert.equal(app.requests[0][0],origin+"/v1/me?detail=1");
  assert.equal(app.requests[1][0],origin+"/v1/runs/123/artifacts/img");
  assert.equal(new Headers(app.requests[0][1].headers).get("Authorization"),"Bearer fake-token");
  assert.equal(new Headers(app.requests[1][1].headers).get("Authorization"),"Bearer fake-token");
});
