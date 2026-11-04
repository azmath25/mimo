# Mimo frontend autonomous engineering checkpoint — 4 November 2026

## Scope and release status

**Source branch:** `feature/fe-live-backend-20261104`; forked from `feature/platform-autonomy-v1`.
**Deployed frontend:** not changed. **GitHub Pages `main` and `main-backup`:** unchanged.
**Original editor:** `studio.html` remains byte-identical to the earlier design-freeze branch (`6da37438bcd5dcc5d2446de5b916693bc1169cc4` Git blob).

### Included and source-tested improvements

1. Firebase administrator token destination hard-pinned in `cloud-auth.js` to the actual production Studio API `https://mimo-backend-git-hhe6zssqxa-ew.a.run.app`. The environment cannot be switched by query string, window properties or localStorage. Staging origin remains empty, so staging calls fail closed.
2. Models page RPM copy reflects M-RPM.2–4, not outdated M-RPM.1 policy-only semantics. Server `enforced` flag controls labels; no configured policy is clearly **uncapped by RPM**, and spending budgets remain distinct.
3. Read-only `diagnostics.html` + `ops-diagnostics.js` inspect the exact authenticated Studio service; query durable dispatch, model RPM, parallel health, connector outcomes, budget policy counts and project/installation counts. Missing metrics are flagged unknown. **No provider call, Cloud Tasks dispatch, recovery or state mutation.**
4. `runs.html` + `runs.js` add **opt-in** follow of selected run status every 15 seconds, bounded to 10 minutes. Hidden tabs and signed-out users stop polling; the follow path uses only authenticated GET /v1/runs/{id}, never invokes an AI provider. A terminal status refreshes the run timeline and stops following.
5. Long run event histories now load in 200-event pages through the existing timeline `after` cursor; results from previous run selections cannot be appended to a newly selected run. All rendered payloads go through existing HTML escaping.
6. Automated frontend tests cover origin security, run race fencing, pagination, bounded follow, RPM labels, diagnostics summaries, mobile browser dimensions and designer/editor freeze. CI: `https://github.com/azmath25/mimo/actions/runs/41808519013` passed at source commit `7af58caa612e4cd67d89ed24818a07cbc476d2db`; documentation-only changes should pass CI too.

### Explicitly not completed by source work

- Browser-based Firebase login and real `/v1/me` authorization against production.
- GitHub Pages publish/merge, Firebase Authorized domains, or Cloud Run CORS configuration.
- Live provider call, background workflow processing, real external API consumer, TikZ compiler invocation.
- Native provider-token streaming inside **Studio**. The Execution API already has a project-key-protected native `/live` route, but the browser must not use project keys. Studio currently shows persisted runs/status, not actual streamed provider tokens. Adding admin streaming requires separately reviewed Studio backend architecture and deployment.
- No cloud queue, permissions, secrets, providers, Neon production branch, backend service, protected repo branches or Quizer changed.

### Release gate

After explicit approval, review the branch against `main` (it contains earlier unreleased frontend improvements as well as this checkpoint), confirm Studio/Execution CORS exact `https://azmath25.github.io`, Firebase `azmath25.github.io` authorization, and perform human browser sign-in before publishing. Do not conflate CI with a successful real-world sign-in. Avoid auto-merging large unreleased changes.
