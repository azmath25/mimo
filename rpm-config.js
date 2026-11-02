/* M-RPM.1: admin-only RPM policy configuration. No client-side throttling. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const safe = value => MimoSite.safe(value);
  let models = [], policies = [], selectedModel = "", busy = false, sequence = 0;
  const api = (url, opts) => MimoSite.api(url, opts);

  function notify(text, isError = false) {
    MimoSite.notice("rpmPolicyFeedback", text, isError);
  }
  function setBusy(value) {
    busy = value;
    for (const id of ["rpmPolicySave", "rpmPolicyRemove", "rpmPolicyRefresh"]) {
      $(id).disabled = value;
    }
  }
  function renderPolicies() {
    $("rpmPolicyList").innerHTML = policies.length
      ? policies.map(p => {
          const aliases = p.model_ids || [];
          const status = aliases.length
            ? "Models: " + aliases.map(safe).join(", ")
            : "Orphaned identity — model endpoint or credential reference changed";
          return '<article class="mg-row"><div class="mg-row-body"><strong>' +
            safe(p.remote_model_id) + ' · ' + safe(p.max_requests_per_minute) +
            ' RPM <span class="mg-pill warn">Not enforced</span></strong>' +
            '<small class="mg-break">' + safe(p.provider) + ' · ' +
            safe(p.endpoint) + ' · credential reference ' + safe(p.secret_ref) +
            '</small><small>' + status + '</small></div>' +
            (aliases.length ? '' :
              '<div class="mg-row-actions"><button type="button" class="mg-btn danger small" ' +
              'data-delete-orphan="' + safe(p.identity_key) +
              '">Delete obsolete policy</button></div>') +
            '</article>';
        }).join("")
      : '<div class="mg-empty">No saved RPM policies. All model connections currently have no configured RPM limit.</div>';
  }
  async function showSelected() {
    const modelId = $("rpmModelSelect").value;
    selectedModel = modelId;
    const version = ++sequence;
    if (!modelId) {
      $("rpmPolicyIdentity").textContent = "Register a model before configuring RPM.";
      $("rpmPolicyValue").value = "";
      return;
    }
    $("rpmPolicyIdentity").textContent = "Inspecting saved configuration…";
    try {
      const policy = await api("/v1/models/" + encodeURIComponent(modelId) + "/rate-limit");
      if (version !== sequence) return;
      $("rpmPolicyValue").value = policy.configured
        ? String(policy.max_requests_per_minute) : "";
      $("rpmPolicyIdentity").textContent =
        (policy.configured ? "Configured: " + policy.max_requests_per_minute +
          " RPM (NOT enforced yet)." : "No RPM policy configured.") +
        " Shared aliases: " + (policy.model_ids || []).join(", ") +
        ". Credential reference: " + policy.secret_ref + ".";
    } catch (error) {
      if (version !== sequence) return;
      notify(error.message, true);
      $("rpmPolicyIdentity").textContent = "Could not retrieve saved policy.";
    }
  }
  async function refresh() {
    if (!MimoSite.requireCloud()) return;
    try {
      const [registry, config] = await Promise.all([
        api("/v1/models"), api("/v1/models/rate-limits"),
      ]);
      models = Array.isArray(registry) ? registry : [];
      policies = config.policies || [];
      const current = $("rpmModelSelect").value || selectedModel;
      $("rpmModelSelect").innerHTML = models.map(m =>
        '<option value="' + safe(m.id) + '">' +
        safe(m.display_name) + ' · ' + safe(m.id) + '</option>'
      ).join("") || '<option value="">No registered models</option>';
      $("rpmModelSelect").value =
        models.some(m => m.id === current) ? current : (models[0]?.id || "");
      renderPolicies();
      await showSelected();
    } catch (error) {
      notify(error.message, true);
      $("rpmPolicyList").innerHTML = '<div class="mg-empty">Could not load RPM configuration. Check Studio API permissions.</div>';
    }
  }
  $("rpmModelSelect").addEventListener("change", showSelected);
  $("rpmPolicyRefresh").addEventListener("click", refresh);
  $("rpmPolicyForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const id = $("rpmModelSelect").value;
    const value = $("rpmPolicyValue").value.trim();
    if (!id || !/^[1-9][0-9]*$/.test(value) || Number(value) > 100000) {
      notify("Select a model and enter a whole-number RPM from 1 to 100000.", true);
      return;
    }
    setBusy(true);
    try {
      const result = await api("/v1/models/" + encodeURIComponent(id) +
        "/rate-limit", {method: "PUT", body: {max_requests_per_minute: Number(value)}});
      notify("Saved " + result.max_requests_per_minute +
        " RPM for the shared provider/model/key reference. This setting is NOT enforced yet.");
      await refresh();
    } catch (error) { notify(error.message, true); }
    finally { setBusy(false); }
  });
  $("rpmPolicyRemove").addEventListener("click", async () => {
    if (busy) return;
    const id = $("rpmModelSelect").value;
    if (!id || !confirm("Remove the shared RPM configuration for " + id +
      "? Every model alias using the same connection will lose this policy.")) return;
    setBusy(true);
    try {
      await api("/v1/models/" + encodeURIComponent(id) +
        "/rate-limit", {method: "DELETE"});
      await refresh();
      notify("Shared RPM configuration removed. No provider throttling was changed.");
    } catch (error) { notify(error.message, true); }
    finally { setBusy(false); }
  });
  $("rpmPolicyList").addEventListener("click", async event => {
    const button = event.target.closest("[data-delete-orphan]");
    if (!button || busy) return;
    const identity = button.dataset.deleteOrphan;
    if (!/^[a-f0-9]{64}$/.test(identity)) return;
    if (!confirm("Delete this obsolete connection RPM policy? This does not delete any provider API key.")) return;
    setBusy(true);
    try {
      await api("/v1/models/rate-limits/" + encodeURIComponent(identity),
        {method: "DELETE"});
      await refresh();
      notify("Orphaned RPM configuration deleted.");
    } catch (error) { notify(error.message, true); }
    finally { setBusy(false); }
  });
  MimoSite.whenReady(refresh);
})();