# M-FE.5 — Frontend source readiness and Studio-design preservation

## Verdict

**Frontend M-FE.1–M-FE.5 source/testbed milestones: COMPLETE.** This is NOT an authorization to deploy or merge. **Live isolated-staging acceptance, M7 Cloud Run/Cloud Tasks, and M8 production release remain BLOCKED / NO-GO.**

M-FE.5 code commit [`6e07afdcae09792d482031dd1ed08b3b7e520235`](https://github.com/azmath25/mimo/commit/6e07afdcae09792d482031dd1ed08b3b7e520235) added `tests/mfe5_design_freeze.test.cjs`, verified by [push CI 41658847008](https://github.com/azmath25/mimo/actions/runs/41658847008) and [PR CI 41658860347](https://github.com/azmath25/mimo/actions/runs/41658860347), both success. This documentation-only final commit requires a fresh successful push + PR check to close the branch head.

## Main Studio design — hard preservation rule

- **No changes to `studio.html`** across M-FE.1–M-FE.5. The audited Git blob SHA **`6da37438bcd5dcc5d2446de5b916693bc1169cc4`** remains identical to the original editor. The preservation regression computes and checks this exact SHA; changing the canvas, block design, controls, workflow builder or inline execution logic now requires a deliberately approved update to the test.
- Desktop's major Studio layout remains the same (60px Studio toolbar, 226px / flexible canvas / 300px columns). The one M-FE.4 style fix applies only at widths **≤640px**, containing a closed, translated offscreen inspector so it no longer doubles document scroll width.
- The existing Studio block interactions, model configuration, saving, connectors, preview, run buttons, and workflows were not redesigned by these milestones.

## Frontend milestone closure

| Milestone | Completed evidence | Limit |
|---|---|---|
| **M-FE.1** | Read-only cross-repo frontend/backend source audit; backend exact CORS and role-boundary unit tests | Real browser/backend session not examined |
| **M-FE.2** | Exact source-reviewed staging Studio URL allowlist; no runtime token-exfiltration redirects; stale Firebase session request fencing; deterministic tests | Staging origin deliberately unconfigured; real Firebase/CORS unverified |
| **M-FE.3** | Keyboard skip link, accessible mobile controls, run selection/filter race fencing, VM/source tests | No real device validation |
| **M-FE.4** | Real headless Chromium localhost browser tests on **320, 360, 390, 768px** and Studio desktop **1280px**; mobile overflow fixed; keyboard, interactive inspector and fake error UX verified | Browser Firebase modules deliberately blocked; no live provider or Cloud Run calls |
| **M-FE.5** | `studio.html` byte-for-byte preservation guard, unchanged desktop layout/source interfaces, pinned staging-only target and CI browser-suite checks | Source freeze is not a compatibility test against a deployed backend |

[Real browser screenshot artifacts from passed PR CI](https://github.com/azmath25/mimo/actions/runs/41658860347/artifacts/13240463648) contain fixture-only desktop/mobile views, retained for seven days. These are **not** production screenshots or a visual-diff approval.

## Read-only frontend ↔ backend route review

Compared frontend branch source to backend feature branch as it stood at `98e456979b0920c54c2c6f3cf5b1086e95f690a9` (M-FE.1 read-only audited backend). This is a source-only interface match, not real API integration.

- `cloud-auth.js` uses Studio `GET /v1/me` with Firebase ID token; backend `auth.router` defines it on Studio, not Execution.
- Studio draft `POST /v1/runs/drafts`, `GET /v1/runs/{id}/timeline`, `/cancel`, `/resume`, `/retry-block`, `/recover-node`, and GET artifact paths in the frontend have corresponding backend `runs.router` declarations.
- `workflows.js` GET `/v1/workflows`, validate, publish, export, versions and draft create correspond to backend `workflows.router` declarations.
- `access.js` GET/POST projects, permissions, rotate/revoke correspond to backend `projects.router`. Its Execution URL is intended only for unauthenticated health checking and server-side project-key API examples; no Firebase bearer token is sent to user-entered endpoints.
- An existing unverified mismatch is still possible in response field shapes, effective role permissions, origin/CORS, uploaded artifact metadata, Firebase identity, auth expiration, streaming, engine versions, and real cloud service revisions. These **must** be proven separately through an explicitly authorized isolated-staging end-to-end smoke.

## Remaining approval gates (NOT complete)

1. **M7.2 read-only real isolated GCP inventory:** verify staging project separation from production, service images/build SHA and digest, Cloud Run IAM/ingress, staging-only database/storage/Secret Manager/budgets (alerts are not caps), existing revision rollback and exact CORS.
2. **M7.3–M7.5 live staging:** real Cloud Tasks OIDC/recovery, authenticated Studio/browser, genuine compiler/storage and provider tests with explicit small spend ceiling, external actions only in throwaway targets, load/rollback/monitoring/cost/backup recovery.
3. **Real frontend integration/UX acceptance:** login and account-switch flows using Firebase-approved staging domain, authenticated Studio save/run/image/PDF/artifact/review, mobile/keyboard tests on actual rendered authenticated data, screen reader and physical touch if required.
4. **M8:** separate explicit production decision and scoped approval for merges, production migrations/deploy and rollback. No production work is authorized by these source milestones.

**STOP:** All remaining *source-level frontend* milestones are complete; **real staging and production milestones are not**. Preserve the user's existing Studio design and main controls unless separately requested.
