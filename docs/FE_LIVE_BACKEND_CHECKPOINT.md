# M-FE — Production backend integration candidate (2026-11-04)

**Scope:** Isolated frontend branch `feature/fe-live-backend-20261104`, forked from `feature/platform-autonomy-v1`. **No merge, GitHub Pages deployment, Cloud Run changes, Neon changes, or edits to `studio.html`.**

## Evidence

- Previously validated backend: user Cloud Shell rollout concluded `MIMO_BACKEND_IMAGE_RELEASE_PASS`; Studio, Execution and Worker were promoted, and production Neon Alembic schema is `0022`.
- The Cloud Shell `gcloud run services describe mimo-backend-git` output identified the exact Studio origin:
  `https://mimo-backend-git-hhe6zssqxa-ew.a.run.app`.
- The frontend previously defaulted to unconfigured isolated staging and could not send Firebase requests. This new **unreleased** branch chooses the verified production origin in `cloud-auth.js`.
- The origin is a source-pinned HTTPS Cloud Run origin. The existing request path guard, Firebase account change fencing, token routing, administrator verification, and never-send-to-query/localStorage/window security contracts remain.
- `access.js` still derives the Studio origin from the same immutable authenticated origin. **Execution API URL remains separate and must be verified with unauthenticated role/health probes; no Firebase admin token is sent to the user-entered Execution origin.**
- Tests adjusted to enforce that this branch targets the verified production Studio and that the unconfigured staging environment still fails closed, including rejection of both older and current production URLs as staging targets.
- GitHub Actions frontend CI: `https://github.com/azmath25/mimo/actions/runs/41791499230` passed its `check` job on commit `daacf7f0425319d8bc4a06d7e45d6546cb4a6410`. Later documentation-only commit should receive its own CI.

## Release gates not yet verified

1. **GitHub Pages authorization:** confirm the static frontend's final web origin is allowlisted in Firebase Authentication Authorized domains (e.g. `azmath25.github.io`). Never expose project keys in browser code.
2. **Backend CORS:** the deployed Studio's `MIMO_CORS_ORIGINS` must allow the exact GitHub Pages origin (not a wildcard). This was *not* checked with an authenticated browser in this milestone.
3. **Real Firebase role handshake:** after explicit frontend release approval, sign in and verify `GET /v1/me` returns `admin` for the designated user; reject non-admin.
4. **Cloud UI integration:** verify saved workflows/models, a cloud draft save/load, and the Runs page. A real paid model call is a separate optional smoke check with explicit spend awareness.
5. **Execution service:** on API Access, enter the actual URL returned by `gcloud run services describe mimo-execution`; the role and readiness probe must succeed before allowing endpoint copies. Do not guess the URL.
6. **Compiler:** TikZ Lab depends on the separate compiler service and is outside this frontend-origin milestone.

**Stop at source-level integration:** do not merge into `main` or `main-backup`, publish GitHub Pages, change Studio's large editor, change Google Cloud/Neon, or claim production browser login is verified.
