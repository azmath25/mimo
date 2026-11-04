/* Accessible execution mode selector for the frozen Studio editor.
 * Loads only on Studio via site.js. Uses the existing workflow state handlers:
 * never creates a second serializer, bypasses readiness checks or writes JSON.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) api.install(root.document, root);
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const descriptions = {
    standard: "Standard",
    background: "Background",
    parallel: "Parallel",
  };

  function availability(capabilities) {
    const run = capabilities && capabilities.run_api;
    return {
      background: run?.background_configured === true,
      parallel: run?.background_configured === true &&
                run?.parallel_nodes === true,
    };
  }

  function modeOf(parallel, background) {
    return parallel ? "parallel" : background ? "background" : "standard";
  }

  function install(document, win) {
    if (document.body?.dataset?.page !== "studio") return null;
    if (document.getElementById("mimoRunOptions")) return null;
    const top = document.querySelector(".top-actions");
    const run = document.getElementById("runButton");
    const exportOpen = document.getElementById("workflowExportsBtn");
    const exportApply = document.getElementById("applyApiExports");
    const exportCancel = document.querySelector('#exportsDialog [data-close="exportsDialog"]');
    const exportFeedback = document.getElementById("apiExportsFeedback");
    const underlyingParallel = document.getElementById("parallelExecutionEnabled");
    const underlyingBackground = document.getElementById("backgroundRun");
    if (![top, run, exportOpen, exportApply, exportCancel, exportFeedback,
          underlyingParallel, underlyingBackground].every(Boolean)) return null;

    const menu = document.createElement("details");
    menu.id = "mimoRunOptions";
    menu.className = "mimo-run-options-menu";
    menu.innerHTML = `
      <summary class="btn compact" aria-label="Choose how the workflow runs">
        <span class="mimo-run-options-symbol" aria-hidden="true">⚙</span>
        Run options <span class="mimo-run-mode-label">Standard</span>
      </summary>
      <div class="mimo-run-options-panel" role="group" aria-label="Execution mode">
        <div class="mimo-run-options-heading">How should this workflow run?</div>
        <fieldset class="mimo-run-options-choices">
          <legend class="mimo-run-sr-only">Execution mode</legend>
          <label class="mimo-run-choice">
            <input type="radio" name="mimoExecutionMode" value="standard">
            <span><strong>Standard</strong><small>One step at a time, with results returned in Studio</small></span>
          </label>
          <label class="mimo-run-choice">
            <input type="radio" name="mimoExecutionMode" value="background">
            <span><strong>Background</strong><small>Sequential, durable Cloud Tasks job; continue in Runs</small></span>
          </label>
          <label class="mimo-run-choice">
            <input type="radio" name="mimoExecutionMode" value="parallel">
            <span><strong>Parallel</strong><small>Up to four independent blocks at once, then collect results</small></span>
          </label>
        </fieldset>
        <p class="mimo-run-options-status" id="mimoRunOptionsStatus" role="status" aria-live="polite"></p>
        <div class="mimo-run-options-actions">
          <button type="button" class="btn compact" id="mimoRunRecheck">Recheck cloud</button>
          <button type="button" class="btn compact" id="mimoRunCheck">Check workflow</button>
          <button type="button" class="btn dark compact" id="mimoRunSave">Save workflow</button>
        </div>
      </div>`;
    top.insertBefore(menu, run);

    const options = [...menu.querySelectorAll('input[name="mimoExecutionMode"]')];
    const status = menu.querySelector("#mimoRunOptionsStatus");
    const label = menu.querySelector(".mimo-run-mode-label");
    const recheck = menu.querySelector("#mimoRunRecheck");
    const check = menu.querySelector("#mimoRunCheck");
    const save = menu.querySelector("#mimoRunSave");
    let supported = {background: false, parallel: false};
    let checkedCloud = false;
    let activeRefresh = 0;

    // Use the frozen Studio editor's public UI, not a shadow workflow state.
    // Open+close occur synchronously, without painting the existing API dialog.
    function readParallel() {
      exportOpen.click();
      const current = underlyingParallel.checked === true;
      exportCancel.click();
      return current;
    }

    function writeParallel(next) {
      exportOpen.click(); // Loads the actual exports; never replaces them with [].
      underlyingParallel.checked = next;
      exportApply.click(); // Existing handler updates draft and saves its recovery state.
      const issue = exportFeedback.textContent.trim();
      if (issue) {
        exportCancel.click();
        throw new Error(issue);
      }
      // The original handler closes the dialog on success.
    }

    function currentMode() {
      return modeOf(readParallel(), underlyingBackground.checked === true);
    }

    function show(message, kind) {
      status.textContent = message;
      status.dataset.kind = kind || "info";
    }

    function sync() {
      const current = currentMode();
      for (const choice of options) {
        choice.checked = choice.value === current;
        choice.disabled = choice.value === "parallel" ? !supported.parallel :
                          choice.value === "background" ? !supported.background : false;
      }
      label.textContent = descriptions[current];
      if (!checkedCloud && !win.MimoCloud?.authorized)
        show("Sign in to check background/parallel availability.", "info");
      else if (!checkedCloud)
        show("Checking Studio Cloud Tasks capabilities…", "info");
      else if (!supported.background)
        show("Background and parallel runs require Cloud Tasks on the Studio service. Standard mode remains available.", "warning");
      else if (current === "parallel" && !supported.parallel)
        show("This Studio revision cannot schedule parallel nodes. Choose Standard or Background.", "warning");
      else
        show("Cloud Tasks ready. Mode is saved in your draft; select Save workflow to keep it in Neon.", "ok");
      return current;
    }

    function select(mode) {
      const current = currentMode();
      if (mode === current) return sync();
      if (mode === "parallel" && !supported.parallel ||
          mode === "background" && !supported.background) {
        show("Cloud Tasks is not enabled on Studio. Recheck cloud after the backend is configured.", "warning");
        return sync();
      }
      const nextParallel = mode === "parallel";
      const previousParallel = current === "parallel";
      const previousBackground = underlyingBackground.checked;
      try {
        if (nextParallel !== previousParallel) writeParallel(nextParallel);
        // Parallel runs force background=true in the existing runCloud() code.
        // Explicitly mirror the UI for consistency with later mode switching.
        underlyingBackground.checked = mode !== "standard";
        sync();
        show("Execution mode set to " + descriptions[mode] + ". Save workflow to persist the draft.", "ok");
      } catch (error) {
        underlyingBackground.checked = previousBackground;
        // The original Save API outputs handler failed; don't blindly overwrite
        // the other API export settings or assume success.
        sync();
        show("Could not change execution mode: " + error.message, "warning");
      }
    }

    async function refresh() {
      const token = ++activeRefresh;
      if (!win.MimoCloud?.authorized) {
        supported = {background:false,parallel:false};
        checkedCloud = false;
        sync();
        return;
      }
      show("Checking Studio Cloud Tasks capabilities…", "info");
      try {
        const result = await win.MimoCloud.request("/v1/capabilities");
        if (token !== activeRefresh) return;
        supported = availability(result);
        checkedCloud = true;
        sync();
      } catch (_) {
        if (token !== activeRefresh) return;
        supported = {background:false,parallel:false};
        checkedCloud = true;
        sync();
        show("Cannot verify Studio capabilities. Background/parallel unavailable until the connection succeeds.", "warning");
      }
    }

    menu.addEventListener("toggle", () => {
      if (menu.open) {
        sync();
        void refresh();
      }
    });
    menu.addEventListener("change", event => {
      if (event.target?.name !== "mimoExecutionMode") return;
      select(event.target.value);
    });
    recheck.addEventListener("click", () => {
      // Also refresh the existing private cloudCapabilities variable and
      // backgroundRun.disabled state maintained by the frozen Studio code.
      win.dispatchEvent(new Event("mimo:auth-changed"));
      void refresh();
    });
    check.addEventListener("click", () => {
      menu.open = false;
      document.getElementById("checkFlowBtn")?.click();
    });
    save.addEventListener("click", () => {
      menu.open = false;
      document.getElementById("saveFlow")?.click();
    });
    win.addEventListener("mimo:auth-changed", () => { void refresh(); });

    // Imported and opened workflows are reflected from the existing editor
    // whenever the operator opens the Run options menu. No imported JSON edits.
    return {menu, sync, select, refresh, availability};
  }

  return {availability, modeOf, install};
});
