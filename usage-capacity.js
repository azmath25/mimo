/* Read-only Usage & Capacity dashboard: server truth, not simulated limits. */
(function() {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = value => MimoSite.safe(value);
  const fmt = value => Number(value || 0).toLocaleString();
  const math = window.MimoCapacityMath;
  let requestId = 0, running = false, interval = null;

  function bar(value, extraClass = "") {
    const width = math.clamp(value);
    return '<div class="uc-track" role="img" aria-label="' +
      (width === null ? 'Percentage unavailable' : esc(width.toFixed(1) + '%')) +
      '"><div class="uc-fill ' + extraClass + '" style="width:' +
      (width === null ? 0 : width.toFixed(2)) + '%"></div></div>';
  }

  function modelCard(model, rpmAvailable) {
    const hasCap = model.rpmCap != null && rpmAvailable;
    const pct = hasCap ? model.rpmPercent : null;
    const caption = !rpmAvailable
      ? 'RPM telemetry is unavailable; capacity cannot be estimated.'
      : !hasCap
        ? 'No configured Mimo RPM policy. Provider-side quota is unknown.'
        : model.cooldown
          ? 'Provider cooldown active. New calls are temporarily blocked.'
          : fmt(model.remaining) + ' admissions remaining in the rolling 60-second window.';
    const status = model.enabled ? 'Enabled' : 'Disabled';
    const capText = !hasCap ? 'Unknown capacity' :
      fmt(model.admitted) + ' / ' + fmt(model.rpmCap) + ' RPM · ' +
      pct.toFixed(1) + '%';
    const warning = hasCap && (pct >= 90 || model.cooldown) ? 'danger' :
      hasCap && pct >= 70 ? 'warning' : '';
    return '<article class="uc-model">' +
      '<div class="uc-model-head"><div><div class="uc-model-name">' + esc(model.label) +
      '</div><div class="uc-model-id">' + esc(model.id) + '</div></div>' +
      '<span class="uc-tag ' + (model.enabled ? 'active' : '') + '">' +
      status + '</span></div>' +
      '<div class="uc-model-meters"><div><div class="uc-meter-head"><span>RPM capacity · last 60s</span>' +
      '<strong>' + capText + '</strong></div>' +
      bar(pct, warning) + '</div>' +
      '<div><div class="uc-meter-head"><span>Share of recorded calls</span><strong>' +
      (model.share == null ? '—' : model.share.toFixed(1) + '%') +
      '</strong></div>' + bar(model.share) + '</div></div>' +
      '<div class="uc-meter-foot">' + esc(caption) +
      (model.shared ? ' Shared RPM connection across model aliases.' : '') +
      '<div>' + fmt(model.calls) + ' lifetime calls · ' +
      fmt(model.inputTokens + model.outputTokens) +
      ' recorded tokens · ' + MimoSite.currency(model.totalUsd) + '</div>' +
      (model.provider429 ? '<div class="uc-alert">' + fmt(model.provider429) +
      ' provider 429 errors in the past hour</div>' : '') + '</div></article>';
  }

  function render(data, states) {
    const summary = math.summarize({
      models: states.models ? data.models : [],
      usage: states.usage ? data.usage : [],
      rpm: states.rpm ? data.rpm : {},
      parallel: states.parallel ? data.parallel : {},
    });
    const work = states.parallel;
    const rpm = states.rpm;
    $('uc-active-nodes').textContent = work ? fmt(summary.running) : '—';
    $('uc-queued-nodes').textContent = work ? fmt(summary.queued) : '—';
    $('uc-active-runs').textContent = work ? fmt(summary.activeRuns) : '—';
    $('uc-rpm-connections').textContent = rpm ? fmt(summary.policiesConfigured) : '—';
    $('uc-rpm-desc').textContent = !rpm ? 'RPM telemetry unavailable' :
      summary.policiesConfigured ? 'Configured connection limits' : 'No configured RPM limits';
    $('uc-ring').style.setProperty('--uc-share', String(math.clamp(summary.processingPercent) || 0));
    $('uc-ring').setAttribute('aria-label', !work ? 'Parallel workload unavailable' :
      summary.outstanding === 0 ? 'No active or queued parallel tasks' :
      summary.running + ' running and ' + summary.queued + ' queued parallel tasks');
    $('uc-ring-percent').textContent = !work || summary.processingPercent == null ?
      '—' : summary.processingPercent.toFixed(0) + '%';
    $('uc-ring-caption').textContent = work && summary.outstanding ?
      'processing' : 'idle / unknown';
    $('uc-running-key').textContent = work ? fmt(summary.running) + ' running' : 'Unavailable';
    $('uc-queued-key').textContent = work ? fmt(summary.queued) + ' queued' : 'Unavailable';
    $('uc-run-caption').textContent = work ?
      'Snapshot of durable parallel-node tasks, not Google Cloud CPU or queue saturation.' :
      'Parallel-run telemetry is unavailable; no utilization is inferred.';
    const historical = (Array.isArray(data.usage) ? data.usage : [])
      .filter(r => Number(r.calls) > 0).sort((a,b) => Number(b.calls)-Number(a.calls));
    $('uc-call-chart').innerHTML = states.usage && historical.length ?
      historical.slice(0, 10).map((r, index) => {
        const share = summary.totalCalls ? 100 * Number(r.calls || 0) / summary.totalCalls : 0;
        const label = (data.models || []).find(m => m.id === r.model_id)?.display_name || r.model_id;
        return '<div class="uc-chart-line"><span class="uc-chart-name" title="' +
          esc(label) + '">' + esc(label) + '</span>' + bar(share) +
          '<strong class="uc-chart-pct">' + share.toFixed(1) + '%</strong></div>';
      }).join('') : '<p class="uc-empty">' +
        (states.usage ? 'No completed AI calls recorded.' : 'Usage data unavailable.') + '</p>';
    $('uc-call-caption').textContent = states.usage ?
      fmt(summary.totalCalls) + ' completed model calls · ' +
      fmt(summary.totalTokens) + ' recorded input/output tokens · lifetime' :
      'The historical usage endpoint could not be reached.';
    $('uc-model-grid').innerHTML = states.models && states.usage && summary.modelRows.length ?
      summary.modelRows.map(row => modelCard(row, rpm)).join('') :
      '<p class="uc-empty">' + (states.models && states.usage ?
      'No registered models.' : 'Model inventory or usage unavailable.') + '</p>';
    const failed = Object.entries(states).filter(([,ok]) => !ok).map(([key]) => key);
    $('uc-state').classList.toggle('error', failed.length > 0);
    $('uc-state').textContent = failed.length ?
      'Partial snapshot: ' + failed.join(', ') +
      ' unavailable. No missing data is treated as zero capacity.' :
      (summary.policiesConfigured === 0 ?
        'No Mimo RPM policies are configured. Capacity percentages remain unavailable until policies are set; external provider quotas are never assumed.' :
        'RPM bars show admitted requests in the last rolling 60 seconds divided by configured per-connection Mimo limits. Providers may enforce stricter limits.');
    $('uc-stamp').textContent = 'Updated ' + new Date().toLocaleTimeString();
  }

  async function refresh() {
    if (running || !MimoSite.requireCloud() || document.visibilityState === 'hidden') return;
    running = true;
    const id = ++requestId;
    const btn = $('uc-refresh');
    btn.disabled = true;
    $('uc-stamp').textContent = 'Refreshing…';
    const paths = {
      models: '/v1/models',
      usage: '/v1/usage/dashboard',
      rpm: '/v1/metrics/model-rpm',
      parallel: '/v1/metrics/parallel',
    };
    try {
      const names = Object.keys(paths);
      const results = await Promise.allSettled(names.map(k => MimoSite.api(paths[k])));
      if (id !== requestId || !MimoSite.requireCloud()) return;
      const states = {}, values = {};
      names.forEach((k,i) => {
        states[k] = results[i].status === 'fulfilled';
        values[k] = states[k] ? results[i].value : null;
      });
      render({
        models: values.models || [],
        usage: values.usage?.by_model || [],
        rpm: values.rpm || {},
        parallel: values.parallel || {},
      }, states);
    } catch(e) {
      if (id === requestId) {
        $('uc-state').classList.add('error');
        $('uc-state').textContent = 'Could not refresh capacity information: ' + String(e.message || e);
      }
    } finally {
      running = false;
      btn.disabled = false;
    }
  }

  $('uc-refresh').addEventListener('click', refresh);
  window.addEventListener('mimo:auth-changed', function() {
    if (!MimoSite.requireCloud()) {
      requestId++;
      $('uc-stamp').textContent = 'Sign in to view live capacity';
      if (interval) { clearInterval(interval); interval = null; }
    } else if (!interval) {
      interval = setInterval(refresh, 30000);
    }
  });
  MimoSite.whenReady(function() {
    if (!interval) interval = setInterval(refresh, 30000);
    return refresh();
  });
})();
