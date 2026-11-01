/* Page shell and Firebase login form. Native links; each page is independent. */
(function(){
  "use strict";
  const pages=[
    ["index.html","Overview","overview"],
    ["workflows.html","Workflows","workflows"],
    ["studio.html","Studio","studio"],
    ["tikz.html","TikZ Lab","tikz"],
    ["runs.html","Runs & reviews","runs"],
    ["files.html","Files","files"],
    ["diagnostics.html","Diagnostics","diagnostics"],
    ["models.html","AI models","models"],
    ["access.html","API access","access"],
    ["budgets.html","Budgets & usage","budgets"]
  ];
  const current=document.body.dataset.page||"overview";
  const nav=document.createElement("nav");nav.className="mimo-global-nav";
  nav.setAttribute("aria-label","Main navigation");
  const brand=document.createElement("a");brand.className="mimo-brand";brand.href="./index.html";
  brand.innerHTML="mimo<span>.</span>";
  const links=document.createElement("div");links.className="mimo-links";
  pages.forEach(([file,title,key])=>{
    const a=document.createElement("a");a.href="./"+file;a.textContent=title;
    if(key===current)a.setAttribute("aria-current","page");links.append(a);
  });
  const user=document.createElement("div");user.className="mimo-account";
  const status=document.createElement("span");status.id="cloudStatus";status.textContent="Connecting…";
  const signout=document.createElement("button");signout.id="cloudAccountBtn";signout.type="button";signout.hidden=true;signout.textContent="Sign out";
  user.append(status,signout);nav.append(brand,links,user);
  document.body.prepend(nav);
  if(!document.getElementById("cloudGate")){
    const gate=document.createElement("div");gate.className="cloud-gate";gate.id="cloudGate";
    // Firebase restores its persisted user asynchronously. Keep the login hidden
    // until authentication actually determines that sign-in is required.
    gate.hidden=true;
    gate.setAttribute("role","dialog");gate.setAttribute("aria-modal","true");gate.setAttribute("aria-label","Mimo administrator sign in");
    gate.innerHTML=`<div class="cloud-card">
      <div class="cloud-logo">mimo<span style="color:#bbb">.</span> ✳</div>
      <h1>Welcome back.</h1>
      <p>Your private workflow dashboard. Sign in using the administrator account registered with the Mimo backend.</p>
      <form id="cloudLoginForm">
      <label for="cloudEmail">Email</label><input id="cloudEmail" type="email" autocomplete="username" required placeholder="you@example.com">
      <label for="cloudPassword">Password</label><input id="cloudPassword" type="password" autocomplete="current-password" required placeholder="Password">
      <button id="cloudLoginButton" type="submit">Sign in</button></form>
      <button id="cloudGoogleButton" type="button">Continue with Google</button>
      <button id="cloudSwitchAccount" type="button" hidden>Use another account</button>
      <p id="cloudAuthMessage" role="status" aria-live="polite">Connecting…</p>
    </div>`;
    document.body.append(gate);
  }
  // Keep authentication selectors identical for the separate SPA-free pages.
  window.MimoSite={
    pages,
    safe(value){return String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;") },
    notice(id,message,isError=false){
      const el=document.getElementById(id);if(!el)return;
      el.textContent=String(message||"");el.classList.toggle("error",isError);
    },
    async api(path,opts){return window.MimoCloud.request(path,opts)},
    requireCloud(){return window.MimoCloud?.authorized===true},
    whenReady(callback){
      const fn=()=>{if(window.MimoCloud?.authorized)Promise.resolve(callback()).catch(err=>console.error(err))};
      window.addEventListener("mimo:auth-changed",fn);
      if(window.MimoCloud?.authorized)fn();
    },
    currency(amount){const n=Number(amount||0);return Number.isFinite(n)?"$"+n.toFixed(4):"—"},
    date(text){try{return text?new Date(text).toLocaleString():"—"}catch{return "—"}},
  };
})();
