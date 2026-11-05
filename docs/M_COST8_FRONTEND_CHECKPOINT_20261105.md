# M-COST.8 — Frontend Cost Management checkpoint

**Date:** 2026-11-05 (Asia/Baku)
**Repository:** `azmath25/mimo`
**Branch:** `feature/m-cost-frontend-20261105`
**Tested source head:** `5048e0a361d577b680146293cc037d5d10e30d65`
**Release status:** **NOT DEPLOYED.** No merge, cloud change, production provider request, Neon migration or billing mutation.

## Frontend implementation

The existing M-COST feature branch already contained a substantial cost UI. This checkpoint preserved and repaired it rather than adding an overlapping second dashboard.

- **Budgets & usage:** edit scoped policies (global, model, project, workflow or run) for lifetime/daily/monthly UTC windows, modes monitor/warn/hard/approval and optional soft warning threshold.
- **Optional details:** authenticated, on-demand pricing audit, provider-ledger report by model/project/workflow/run/block, threshold alerts, one-run extra spend approvals and project concurrency caps. Actions do not call AI providers.
- **Live reservations:** pending/uncertain provider holds and audited human invoice reconciliation, with a specific confirmation for potentially irreversible decisions.
- **Studio cost consent:** before executing any graph containing AI blocks, fetch a read-only cost quote and require user acceptance; optionally attach `cost_limit_usd` and `cost_mode` to the durable draft run. Unknown quotes explicitly disable confirmation when the estimate endpoint is unavailable. The UI reports uncertainty if a quote contains unpriced models.
- **Fallback transparency:** preview now labels the conservative candidate estimate and enumerates available primary/fallback model estimates, rather than implying only the primary model can be billed.
- **Reporting honesty:** usage report states the time basis is UTC ledger ingestion, not provider invoice date; cloud infrastructure, Neon, other external calls and taxes remain outside the model ledger.

## Fixed regression failures

The pre-existing branch at `822d19719a44` had failing CI. This checkpoint:
1. Updated a stale budget-policy label assertion without weakening budget logic.
2. Restored expected cost-dialog elements and explicit consent tests in the Run button test harness, including a valid `document.getElementById` simulation.
3. Updated the intentional Studio design freeze fingerprint for its approved cost quote display.
4. Verified the inline Studio script syntax after the quote detail extension.

The tests now verify that AI runs first request a read-only estimate and do **not** send a workflow execution request until the user explicitly confirms a per-run cost policy. A failed estimate does not execute an AI workflow.

## Verification

Two successful, completed frontend GitHub Actions runs at tested source head:

- https://github.com/azmath25/mimo/actions/runs/41971622825
- https://github.com/azmath25/mimo/actions/runs/41971630350

Tests include JavaScript syntax, adapter/Studio unit tests, isolated local Chromium browser checks across required viewports, keyboard interaction and screenshot preservation. No actual Cloud Run, Firebase account or provider billing was exercised.

## Release boundary and remaining work

The matching backend cost API implementation remains on `azmath25/mimo-backend`, branch `feature/m-cost-full-control-20261105`, not authorized to deploy here. The frontend will require an approved compatible backend revision, database migration and carefully scoped staging confirmation before production use. Existing production services may not yet expose `/v1/cost/*`.

Pending follow-up work remains outside M-COST.8: actual Google Cloud and Neon invoice integration, cost-source reconciliation, isolated cross-repository staging with real Firebase auth/CORS, migration 0023 readiness on independently approved data, and explicit production rollout decision.

**Stop condition met: frontend development tests pass; no merge or deployment.**
