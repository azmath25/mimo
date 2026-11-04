# Mimo FE Run options — Studio UX patch

## Goal
Let a user select Standard, Background, or Parallel workflow execution
directly in Mimo Studio without editing JSON. The frozen Studio editor
`studio.html` must remain byte-identical.

## Behavior

`site.js` loads `studio-run-options.js` only on the Studio page. It
inserts a visible **Run options** control in the existing top toolbar.
The control offers:
- **Standard** — sequential workflow, foreground response in Studio.
- **Background** — sequential workflow dispatched by Cloud Tasks; track
  results in Runs & reviews. This is a per-session run preference, not a
  property persisted in the workflow JSON.
- **Parallel** — independently scheduled dependency-ready blocks, up to
  four concurrent; this is a workflow property persisted by Studio Save.

The new UI uses the editor's existing `#workflowExportsBtn`,
`#parallelExecutionEnabled`, `#applyApiExports`, and
`#backgroundRun` event handlers. It never replaces the API export JSON
or forks the workflow serialization. Opening Run options reads the
current state, including after importing a workflow. The original
background checkbox is hidden visually but remains connected to the
existing Run in cloud handler.

## Availability and security

Background and parallel options remain disabled unless the **Studio**
capabilities endpoint explicitly returns `run_api.background_configured
=== true`. Parallel additionally requires `run_api.parallel_nodes
=== true`.

This patch does NOT enable Cloud Tasks, change IAM, change backend
configuration, create provider calls, or bypass the existing Check
readiness logic. The separate backend operator runbook is
`mimo-backend/docs/STUDIO_PARALLEL_PRODUCTION_ENABLEMENT_20261104.md`.
Users may run `enable-studio-parallel.py --plan` then `--apply` in
Cloud Shell after review.

The capability check is performed using the authenticated, pinned
MimoCloud API client; no arbitrary URLs are constructed and Firebase
tokens remain protected.

## Regression coverage

- Node tests: mode mapping, no implicit capability enablement, frozen
  Studio editor guard and non-destructive export behavior.
- Local Playwright: 320/390/1280px Run options accessibility,
  fail-closed behavior without Cloud Tasks, choosing all three modes
  when a synthetic **local** capability response is enabled, and no
  remote API calls. Existing viewport regression tests are retained.
- GitHub Actions frontend checks and Pages build are release gates.

## Rollback

Remove `studio-run-options.js` loader lines from `site.js` and the
new CSS rules from `studio-polish.css`. The frozen HTML remains intact.
This is a client-only change and causes no data migration.
