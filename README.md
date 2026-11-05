# Mimo Studio — current frontend state

**Status as of 2026-11-05.** This README completely replaces the obsolete staging and first-install instructions. It describes current source, known gaps and release acceptance. It does not claim that the currently running Google Cloud backend has the newest source.

- Repository: **azmath25/mimo**.
- Audited published frontend baseline: **main at 49d77b4707ca506efeab2e30b337c7668d023c28** (includes M-COST and the M-TEX package UI). This documentation-only change may advance the main commit.
- Frontend tests: [GitHub Actions 42029330946](https://github.com/azmath25/mimo/actions/runs/42029330946), **passed** for audited baseline.
- GitHub Pages: [deployment 42029329622](https://github.com/azmath25/mimo/actions/runs/42029329622), **successful** for audited baseline.
- Published site: **https://azmath25.github.io/mimo/**.
- Backend repository: [azmath25/mimo-backend](https://github.com/azmath25/mimo-backend); audited application baseline **093502a2ad73e9ddc47b12a535deff29dca826be**.
- **Critical gap:** the reviewed new REST API Request UI is on [draft PR #28](https://github.com/azmath25/mimo/pull/28), **not in frontend main**. The REST backend has already been merged, but is disabled by default and its production activation has not been independently confirmed.

## Present architecture

Mimo is a multi-page static management interface using Firebase admin authentication. Business rules, project authentication, provider credentials, workflow execution and file access belong to the FastAPI/Neon/Cloud Run backend; the browser is not a secret store.

The shared shell uses **site.js**, **site.css** and **cloud-auth.js**; management pages use their own controllers. **studio.html** contains the visual drag-and-connect canvas and substantial embedded controller logic. Cloud model/tool calls are made only through authenticated backend requests; the local simulation/Preview is not a claim of cloud execution.

### Pages in the published main

| Page | Current purpose | Notes |
| --- | --- | --- |
| [Overview](index.html) | Navigation, health and summary cards | Firebase authentication required for private data |
| [Workflows](workflows.html) | Drafts, versioning, publication and import/export | Requires matching backend APIs |
| [Studio](studio.html) | Block editor, canvas, conditions, inputs/outputs, run controls | Large coupled source; can be improved incrementally |
| [TikZ Lab](tikz.html) | PDF/PNG compile, DPI presets, package catalog and name lookup | Package panel reflects active private compiler; does not install packages |
| [Runs & reviews](runs.html) | Durable run history, checkpoints, events, approvals, retry, resume/cancel | Live network/runtime still needs acceptance |
| [Files](files.html) | PDF and image uploads, text/page inspection and workflow reuse | Whole-PDF vision OCR not present |
| [Diagnostics](diagnostics.html) | Service health, capabilities, metrics and runtime state | A health check alone is not provider or workflow acceptance |
| [AI models](models.html) | Model endpoint/remote-model registration, secret references, pricing and RPM | Provider-native differences/quotas require live checks |
| [API access](access.html) | Published workflow URLs, project keys, grants and API examples | Project keys belong in consuming servers |
| [Connectors](connectors.html) | Existing installations, project grants and human approvals | Generic REST UI is in PR #28, not here yet |
| [Budgets & usage](budgets.html) | M-COST spending policies, cost reports and reconciliation | Provider charge estimates only; not total cloud invoice |

## Confirmed source features in main

- Connected workflow canvas with an Input/AI/tool/compiler/condition/review/output model, JSON import/export and optional context guide.
- Backend-aware model selection, real run submit paths, explicit execution options, pre-run AI cost quote, fallback estimates and user spending limits.
- Firebase sign-in and a shared page shell, including navigation and authentication restoration.
- PDF input: embedded text from all PDF pages, or a selected page rendered for vision; artifacts remain backend-owned.
- TikZ Lab with PDF/PNG, 72–600 DPI backend contract, verification of requested image DPI, and a lazy read-only package-check panel.
- Runs/reviews, artifact downloads, operational diagnostics and provider/RPM/cost management.
- Static responsive and keyboard/browser regression checks; tests are local or mocked and do not prove real cloud or Firebase operation.

### Important constraints

- The **real REST API Request** block, REST connection management form, metadata-backed selection, scalar argument mapping and typed output wiring exist only in **feature/m-api-orchestration-20261105** / [draft PR #28](https://github.com/azmath25/mimo/pull/28). Feature CI [42040949613](https://github.com/azmath25/mimo/actions/runs/42040949613) passed; this is **not** a production deployment.
- Studio is a large monolithic HTML/controller file. Do not delete or redesign it blindly; first extract modules behind tests and preserve graph serialization and user drafts.
- AI-based conditional routing and truly nested subworkflows are not implemented by the current backend, even if the visual editor can show related concepts.
- Backend Execution-role native provider SSE exists, but Studio's persisted-draft workflow interface is not a complete native token-by-token chat experience.
- PDF scanning/diagram reconstruction and semantic figure accuracy require additional AI and review orchestration. Successful TeX compilation is not proof that a diagram matches the source.
- The expanded TeX Live image is a source definition until the private compiler image is rebuilt and verified; the package checker must not be interpreted as supporting arbitrary TeX, XeLaTeX or untrusted source.
- External REST fees, Google Cloud billing and Neon charges are not included in AI-provider M-COST totals.

## Current release state: source is not runtime

| Item | Audited evidence |
| --- | --- |
| Published frontend main contains M-COST controls | **Confirmed** |
| Published frontend main contains TikZ package interface | **Confirmed** |
| GitHub Pages deployment for audited main | **Passed** |
| Full REST UI in published frontend main | **No** — still draft PR #28 |
| Backend main contains REST execution engine | **Yes** |
| Production Neon migration 0024 applied | **Not independently confirmed** |
| REST enabled in Cloud Run | **Not independently confirmed**; source flag defaults off |
| New backend/worker/compiler runtime versions | **Not independently confirmed** |
| Authenticated browser end-to-end REST run | **Not independently confirmed** |

The frontend hardcodes a reviewed Studio HTTPS origin in **cloud-auth.js** rather than accepting user-supplied API URLs. This is intentional credential-leak protection. Do not change its authenticated request destination through query parameters, local storage or an arbitrary user input.

## What remains before Mimo works end-to-end

**Release-critical sequence:**

1. In production, verify Studio/Execution/Worker/Compiler Cloud Run revisions, auth/CORS/IAM, shared Neon revision, Cloud Tasks, object storage and rollback positions.
2. Review and apply backend additive REST migration **0024** to the intended Neon production DB, preserving existing data. Confirm REST remains disabled until activation.
3. Deploy matching backend roles and private TeX compiler under guarded health and rollback checks. Test normal workflows, budgets, PDF and requested PNG DPI before enabling REST.
4. Enable approved REST execution consistently in the backend only after the migration. Run a no-cost approved HTTPS read, project grant and exact response mapping, and a separate approved-write safety test without triggering real paid actions.
5. Publish the reviewed frontend **PR #28** after backend capability checks; verify REST connection listing/create/edit-as-new-ID, project grants, one deliberate free read test and API Request block execution from an external project server.
6. Verify real Firebase login/navigation, mobile 320/360/390px views, bounded provider calls, background/parallel jobs, errors, retries and rollback in a production acceptance checklist.

**Product polish and longer-term full vision:**

7. Build a guided REST operation editor instead of raw JSON; remove unnecessary metadata/API calls and show clear secret, cost, approval and test states.
8. Modularize Studio while preserving the existing user flow. Add genuinely reusable saved block templates and eventual subworkflow/AI-condition support only after matching backend contracts.
9. Build a first-class all-page mathematics PDF pipeline: scanned-page vision batches, figure reconstruction in TikZ, compiled-artifact comparison, individual review and checkpoint retry.
10. Add infrastructure and third-party API cost visibility plus alerting, service-level tracing and documented restore procedures.

**Smallest definition of API launch-ready:** steps 1–6, with a verified end-to-end workflow called by an external server and explicit rollback proof. **Full autonomous mathematics workflow completeness** additionally requires the product capabilities in steps 7–10.

## Maintenance and references

- [Backend current state](https://github.com/azmath25/mimo-backend/blob/main/README.md)
- [REST UI PR #28](https://github.com/azmath25/mimo/pull/28)
- [Frontend M-COST checkpoint](docs/M_COST8_FRONTEND_CHECKPOINT_20261105.md)
- [Frontend mobile/browser audit](docs/M_FE4_LOCAL_BROWSER_AUDIT.md)
- [Frontend design freeze](docs/M_FE5_FRONTEND_SOURCE_CLOSURE.md)
- [Backend REST release gate](https://github.com/azmath25/mimo-backend/blob/main/docs/M_API_IMPLEMENTATION_20261105.md)
- [Backend compiler package checkpoint](https://github.com/azmath25/mimo-backend/blob/main/docs/M_TEX1_PACKAGE_CATALOG_CHECKPOINT_20261105.md)

Other old milestone notes remain as historical records, not authoritative assertions of current production deployment. When the next release occurs, update this README with its exact commit, checked live runtime capability, CI and known limitations. **Never equate a merge or passing unit tests with a deployed, billed, authenticated end-to-end system.**
