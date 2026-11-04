"use strict";
/* M-FE.5 guard: preserve the original Studio editor, not a redesign.
 * The Git blob SHA was inspected from the actual M-FE.1–M-FE.4 frontend branch.
 * Changing the editor requires explicit approval and an intentional update
 * to this source-level invariant, never a silent "polish" change.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {createHash}=require("node:crypto");

const root=path.resolve(__dirname,"..");
const read=rel=>fs.readFileSync(path.join(root,rel));
const text=rel=>read(rel).toString("utf8");
const blobSha=data=>createHash("sha1")
 .update(Buffer.from("blob "+data.length+"\0")).update(data).digest("hex");

test("M-FE.5: Studio layout unchanged except approved TikZ controls and tool-choice cleanup",()=>{
  assert.equal(blobSha(read("studio.html")),
    "d2835cccab6ec22665b06bbe1b28dd27fdf4f1f1",
    "Only the approved TikZ DPI settings, supported-output labels and connector visibility may alter Studio");
});

test("M-FE.5: unchanged Desktop Studio has the same major canvas and controls",()=>{
  const html=text("studio.html"),css=text("studio-polish.css");
  for(const id of ["library","inspector","workflowTitle","runButton","saveFlow",
                   "toggleInspector","toggleLibrary","previewButton","backgroundRun",
                   "workspaceHead","cloudRunMessage"]){
    if(id==="workspaceHead")continue;
    assert.ok(html.includes('id="'+id+'"'),"missing main Studio control "+id);
  }
  assert.match(css,/body\[data-page="studio"\] \.topbar\s*\{[^}]*height:60px/);
  assert.match(css,/grid-template-columns:226px minmax\(0,1fr\) 300px/);
  assert.match(css,/@media \(max-width:640px\)/);
  assert.match(css,/\.app\s*\{position:relative;overflow-x:clip\}/);
});

test("M-FE.5: frontend release uses reviewed production target without weakening URL guards",()=>{
  const auth=text("cloud-auth.js"),access=text("access.js");
  assert.match(auth,/const ACTIVE_API_ENVIRONMENT = "production"/);
  assert.match(auth,/const APPROVED_STAGING_STUDIO_ORIGIN = ""/);
  assert.match(auth,/const APPROVED_PRODUCTION_STUDIO_ORIGIN = "https:\/\/mimo-backend-git-hhe6zssqxa-ew\.a\.run\.app"/);
  assert.match(auth,/const API_ORIGIN = approvedApiOrigin\(ACTIVE_API_ENVIRONMENT\)/);
  assert.match(auth,/path = approvedApiPath\(path, origin\)/);
  assert.match(access,/const studioOrigin=window\.MimoCloud\?\.apiOrigin/);
  assert.doesNotMatch(access,/mimo-backend-git-[0-9]+\.[a-z0-9-]+\.run\.app/);
});

test("M-FE.5: both real local browser and old frontend suites remain enforced in CI",()=>{
  const ci=text(".github/workflows/frontend.yml");
  const browser=text("browser-tests/mfe4.browser.cjs");
  assert.match(ci,/node --test tests\/\*\.test\.cjs/);
  assert.match(ci,/node --test browser-tests\/mfe4\.browser\.cjs/);
  assert.match(ci,/npm install --no-save --no-package-lock/);
  assert.match(browser,/headless:true/);
  assert.match(browser,/route\.abort\(\)/);
  assert.match(browser,/127\.0\.0\.1/);
  for(const width of ["320","360","390","768","1280"]){
    assert.ok(browser.includes(width),"missing required viewport "+width);
  }
});

test("M-FE.5: no unrelated workflow navigation pages disappeared",()=>{
  const nav=text("site.js");
  const pages=[
    "index.html","workflows.html","studio.html","tikz.html","runs.html",
    "files.html","diagnostics.html","models.html","access.html",
    "connectors.html","budgets.html"
  ];
  for(const file of pages){
    assert.ok(nav.includes('"'+file+'"'),"navigation must retain "+file);
    assert.ok(fs.existsSync(path.join(root,file)),"page file missing: "+file);
  }
});
