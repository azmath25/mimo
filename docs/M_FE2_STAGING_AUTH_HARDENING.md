# M-FE.2 — Staging API origin and asynchronous Firebase authentication hardening

**Status:** Implemented and unit-tested on frontend feature branch `feature/platform-autonomy-v1`. This is **not a deployment or live browser / Firebase acceptance**. Protected `main`, backend, Quizer and Google Cloud were not changed.

## Approved Studio API targets

`cloud-auth.js` now has a source-controlled, exact-origin allowlist:

- `ACTIVE_API_ENVIRONMENT = "staging"` on this **unreleased feature branch**.
- `APPROVED_STAGING_STUDIO_ORIGIN = ""` until someone independently verifies the **separate isolated staging Cloud Run Studio** project/service URL, access controls, staging billing separation and frontend CORS.
- `PREVIOUS_PRODUCTION_STUDIO_ORIGIN` keeps the known prior production URL for a **separately reviewed future release**; its resource ownership and real readiness were **not independently verified in this milestone**. Staging intentionally rejects reusing this same origin.

An empty staging origin **blocks every authenticated API request before the frontend even asks Firebase for an ID token**. This also prevents an accidentally published feature branch from silently using the existing production Studio endpoint. The sign-in dialog displays a clear configuration error. The HTTPS Cloud Run origin must be a **bare exact origin** (no credentials, extra path, port, query, fragment, subdomain suffix or HTTP). A valid hostname is only a syntax check; it **does not prove Google Cloud project ownership**.

No URL parameter, browser `location`, `localStorage`, user entry field, runtime mutable `window.MimoCloud.apiOrigin` or remote JSON can select the authenticated API target. `MimoCloud.apiOrigin` is now **read-only**. The shared API wrapper also rejects absolute URLs, `@attacker` authority strings, scheme-relative URLs, literal/encoded backslashes and slash separators, control characters, and non-`/v1/` / non-`/health/` paths **before retrieving an ID token**. The fixed origin and approved path are joined only inside `cloud-auth.js`.

`access.js` no longer maintains its own hardcoded Studio URL. It checks the configured read-only `window.MimoCloud.apiOrigin` before considering a separate Execution URL; absent staging configuration keeps external endpoint verification disabled. Its user-entered Execution origin is an **unauthenticated health probe** and a server-side API template, not a Firebase bearer-token destination. A verified health page does not authorize placing a project API key in browser code.

### Future staging configuration — separate review required

1. **First**, identify a dedicated real staging GCP project and Studio service. Read-only verify ownership, ingress, IAM, approved frontend GitHub Pages origin, Firebase authorized domain, database/storage isolation and budget alerts. M7.2 actual inventory is still blocked; do not invent the project or hostname.
2. After authorization, add its *exact verified HTTPS Cloud Run origin* to `APPROVED_STAGING_STUDIO_ORIGIN` in `cloud-auth.js` through a reviewed feature-branch change. Leave `ACTIVE_API_ENVIRONMENT` at `staging`; do **not** fall back to production, add wildcard domains, or source the endpoint from a query string/localStorage.
3. Run `node --check cloud-auth.js` and `node --test tests/*.test.cjs` in CI and verify both GitHub Actions push and PR checks on the **new pinned SHA**. An approved source change is still not a deployment.
4. Only after explicit staging-browser authorization: validate CORS preflight (Authorization, Content-Type and Idempotency-Key), Firebase ID token verification, real admin UID, user switching/logout, upload, no leaked tokens, real Studio/Execution role separation and mobile layout. No real provider calls or external writes unless separately approved.

## Authentication race fence

Every `onAuthStateChanged` callback receives a monotonically increasing local epoch. Successful **and failed** `GET /v1/me` completions are applied only if they still match the latest callback, the original Firebase user object is still `auth.currentUser`, and sign-out is not pending.

The sign-out handler synchronously invalidates old verification callbacks, clears the UI session and locks the app **before awaiting** Firebase `signOut`. It stays locked on a sign-out error. The signed-out callback releases the pending sign-out state. The shared JSON and blob request functions also recheck Firebase user identity after asynchronous ID-token acquisition, refusing to send a token if the user changed during the await.

These are **client-side race and token-routing protections**, not a substitute for backend Firebase JWT validation or role checks.

## Regression evidence and limitations

`tests/auth-navigation.test.cjs` now includes deterministic VM tests for:
- Default staging fail-closed: **zero fetches, zero Firebase token requests**, clear error; explicit production is only an isolated test-harness override.
- Exact, code-reviewed staging token destination; no query/localStorage/window override; explicit rejection of malformed, insecure, credentialed, production-reused or non-Cloud-Run origins.
- Malicious path authority/scheme/encoded-separator attempts blocked **before token retrieval**; valid `/v1/` and blob paths still work.
- Sign-out during delayed admin response; account A → account B switching; stale successful and failed callbacks; user changes during `getIdToken`.

Both push and PR frontend GitHub CI are required green for the final branch head. Tests mock Firebase Auth and `fetch`; **no live Firebase, Cloud Run, Neon, browser, mobile device, provider or billing resource was touched**.

**STOP here:** M-FE.2 source work only. M-FE.3/live staging, M8, merge, deployment, production migration and cloud mutations are not authorized. Backend M7 remains actual-cloud **NO-GO**.
