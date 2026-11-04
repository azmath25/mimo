/* Pure calculations for the read-only usage and capacity dashboard. */
(function(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MimoCapacityMath = api;
})(typeof window !== "undefined" ? window : null, function() {
  "use strict";
  const count = value => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const percent = (part, whole) => whole > 0 ? 100 * part / whole : null;
  const clamp = value => value == null ? null : Math.max(0, Math.min(100, value));

  function summarize({models = [], usage = [], rpm = {}, parallel = {}} = {}) {
    const registry = Array.isArray(models) ? models : [];
    const byModel = Array.isArray(usage) ? usage : [];
    const rpmPolicies = Array.isArray(rpm.policies) ? rpm.policies : [];
    const totalCalls = byModel.reduce((n, u) => n + count(u.calls), 0);
    const totalTokens = byModel.reduce((n, u) => n + count(u.input_tokens) + count(u.output_tokens), 0);
    const node = parallel.node_tasks || {};
    const run = parallel.parallel_runs || {};
    const running = count(node.running), queued = count(node.queued);
    const modelRows = registry.map(m => {
      const item = byModel.find(u => u.model_id === m.id) || {};
      // RPM policies are per provider endpoint, remote model and credential,
      // not necessarily per UI registry entry. Shared aliases share capacity.
      const policy = rpmPolicies.find(p => Array.isArray(p.model_ids) && p.model_ids.includes(m.id));
      const cap = policy && Number.isFinite(Number(policy.rpm_limit)) && Number(policy.rpm_limit) > 0
        ? Number(policy.rpm_limit) : null;
      const admitted = policy ? count(policy.admitted_last_60s) : null;
      return {
        id: m.id, label: m.display_name || m.id, enabled: m.enabled === true,
        provider: m.provider || "Model connection",
        calls: count(item.calls),
        inputTokens: count(item.input_tokens), outputTokens: count(item.output_tokens),
        totalUsd: count(item.total_usd), share: percent(count(item.calls), totalCalls),
        rpmCap: cap, admitted,
        rpmPercent: cap == null ? null : percent(admitted, cap),
        remaining: cap == null ? null : count(policy.effective_remaining_now),
        cooldown: Boolean(policy && policy.cooldown_until),
        shared: Boolean(policy && Array.isArray(policy.model_ids) && policy.model_ids.length > 1),
        provider429: policy ? count(policy.provider_429_last_hour) : null,
      };
    }).sort((a,b) => b.calls - a.calls || a.id.localeCompare(b.id));
    return {
      totalCalls, totalTokens,
      modelRows,
      activeRuns: count(run.running),
      running, queued, outstanding: running + queued,
      processingPercent: percent(running, running + queued),
      policiesConfigured: rpmPolicies.length,
      warnings: Array.isArray(rpm.alerts) ? rpm.alerts.length : 0,
      modelRecords: registry.length,
    };
  }

  return {summarize, clamp};
});
