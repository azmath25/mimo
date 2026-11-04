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

Background can be selected only when the **Studio** capabilities
endpoint explicitly returns `run_api.background_configured === true`.
**Parallel can always be selected and saved as a workflow design mode.**
However, starting such a workflow through Cloud Run is blocked by the
existing readiness guard until `run_api.background_configured === true`
and `run_api.parallel_nodes === true`. This avoids making workflow
design hostage to current infrastructure without bypassing server safety.

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
- Local Playwright: desktop Run options accessibility,
  fail-closed Cloud Run behavior without Cloud Tasks, designing parallel
  before backend enablement, choosing all three modes
  when a synthetic **local** capability response is enabled, and no
  remote API calls. Existing unrelated mobile viewport regression tests
  remain unchanged, but M-FE.6 does not optimize new features for phones.
- GitHub Actions frontend checks and Pages build are release gates.

## Rollback

Remove `studio-run-options.js` loader lines from `site.js` and the
new CSS rules from `studio-polish.css`. The frozen HTML remains intact.
This is a client-only change and causes no data migration.
