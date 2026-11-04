"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const modes = require("../studio-run-options.js");

test("Run mode has three unambiguous states without workflow JSON edits", () => {
  assert.equal(modes.modeOf(false, false), "standard");
  assert.equal(modes.modeOf(false, true), "background");
  assert.equal(modes.modeOf(true, false), "parallel");
  assert.equal(modes.modeOf(true, true), "parallel");
});

test("No assumed availability: Studio capabilities must explicitly enable modes", () => {
  assert.deepEqual(modes.availability({}), {background:false,parallel:false});
  assert.deepEqual(modes.availability({run_api:{background_configured:false,parallel_nodes:true}}),
    {background:false,parallel:false});
  assert.deepEqual(modes.availability({run_api:{background_configured:true,parallel_nodes:false}}),
    {background:true,parallel:false});
  assert.deepEqual(modes.availability({run_api:{background_configured:true,parallel_nodes:true}}),
    {background:true,parallel:true});
});

test("External run options loaded only in Studio; frozen HTML remains unchanged", () => {
  const shell = fs.readFileSync("site.js","utf8");
  const html = fs.readFileSync("studio.html","utf8");
  const run = fs.readFileSync("studio-run-options.js","utf8");
  assert.match(shell,/if\(current==="studio"\)/);
  assert.match(shell,/controls\.src="\.\/studio-run-options\.js"/);
  assert.doesNotMatch(html, /studio-run-options\.js/);
  assert.match(run,/underlyingParallel\.checked = next/);
  assert.match(run,/exportApply\.click\(\)/);
  assert.match(run,/underlyingBackground\.checked = mode !== "standard"/);
  assert.match(run,/win\.MimoCloud\.request\("\/v1\/capabilities"\)/);
  assert.doesNotMatch(run,/\bfetch\s*\(/);
  assert.doesNotMatch(run,/\blocalStorage\b/);
});

test("Existing API exports are used without fabricating or replacing export JSON", () => {
  const run = fs.readFileSync("studio-run-options.js","utf8");
  assert.match(run,/exportOpen\.click\(\); \/\/ Loads the actual exports/);
  assert.doesNotMatch(run, /apiExportsJson[^\n]*\.value\s*=/);
  assert.match(run,/imported|existing editor/i);
});
