const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function environment() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, value: "", textContent: "", innerHTML: "", disabled: false,
      listeners: {},
      addEventListener(name, fn) { this.listeners[name] = fn; },
    });
    return elements.get(id);
  };
  const records = [];
  let ready;
  const models = [
    {id: "alias_a", display_name: "Alias A"},
    {id: "alias_b", display_name: "Alias B"},
  ];
  let policies = [];
  const api = async (url, opts) => {
    records.push({url, opts});
    if (url === "/v1/models") return models;
    if (url === "/v1/models/rate-limits") return {policies, enforced: true};
    if (url.endsWith("/rate-limit") && opts?.method === "PUT") {
      const rpm = opts.body.max_requests_per_minute;
      policies = [{
        identity_key: "a".repeat(64), provider: "openai_compatible",
        remote_model_id: "qwen-remote", endpoint: "https://api.example/v1",
        secret_ref: "provider_ref", model_ids: ["alias_a", "alias_b"],
        max_requests_per_minute: rpm, enforced: true,
      }];
      return {max_requests_per_minute: rpm, model_ids: ["alias_a", "alias_b"], enforced: true};
    }
    if (url.endsWith("/rate-limit") && opts?.method === "DELETE") {
      policies = [];
      return {deleted: true, enforced: true};
    }
    if (url.includes("/rate-limit") && !opts) {
      return {
        model_ids: ["alias_a", "alias_b"], secret_ref: "provider_ref",
        configured: policies.length > 0,
        max_requests_per_minute: policies[0]?.max_requests_per_minute ?? null,
        enforced: true,
      };
    }
    if (url.includes("/rate-limits/") && opts?.method === "DELETE") {
      policies = [];
      return {deleted: true};
    }
    throw Error("Unexpected API call " + url);
  };
  const notices = [];
  vm.runInNewContext(fs.readFileSync("rpm-config.js", "utf8"), {
    document: {getElementById: element},
    confirm: () => true,
    MimoSite: {
      safe: value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"),
      api, requireCloud: () => true,
      notice: (...args) => notices.push(args),
      whenReady: fn => { ready = fn; },
    },
  }, {filename: "rpm-config.js"});
  return {element, records, notices, ready: () => ready()};
}

test("Models page explains backend RPM enforcement and uncapped risk", () => {
  const html = fs.readFileSync("models.html", "utf8");
  assert.match(html, /rpmPolicyForm/);
  assert.match(html, /rpm-config\.js/);
  assert.match(html, /Production RPM protection \(M-RPM\.2–4\)/);
  assert.match(html, /No policy means no per-model RPM cap/);
});

test("policy controller saves shared RPM and refreshes effective identity", async () => {
  const env = environment();
  await env.ready();
  assert.match(env.element("rpmModelSelect").innerHTML, /alias_a/);
  assert.match(env.element("rpmPolicyIdentity").textContent, /not yet configured|No RPM policy configured/);
  env.element("rpmPolicyValue").value = "42";
  await env.element("rpmPolicyForm").listeners.submit({preventDefault() {}});
  assert.ok(env.records.some(x => x.url === "/v1/models/alias_a/rate-limit"
    && x.opts?.method === "PUT" && x.opts?.body?.max_requests_per_minute === 42));
  assert.match(env.element("rpmPolicyList").innerHTML, /42 RPM/);
  assert.match(env.element("rpmPolicyList").innerHTML, /alias_a, alias_b/);
  assert.match(env.element("rpmPolicyList").innerHTML, /Enforced/);
  assert.doesNotMatch(env.element("rpmPolicyList").innerHTML, /Not enforced/);
});

test("controller rejects invalid RPM before making policy write", async () => {
  const env = environment();
  await env.ready();
  env.element("rpmPolicyValue").value = "0";
  await env.element("rpmPolicyForm").listeners.submit({preventDefault() {}});
  env.element("rpmPolicyValue").value = "30.5";
  await env.element("rpmPolicyForm").listeners.submit({preventDefault() {}});
  assert.equal(env.records.filter(x => x.opts?.method === "PUT").length, 0);
  assert.ok(env.notices.some(x => String(x[1]).includes("whole-number RPM")));
});
