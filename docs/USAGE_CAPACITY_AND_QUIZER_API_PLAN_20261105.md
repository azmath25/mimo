# Mimo — Usage & Capacity and Quizer API handoff

Checkpoint: 2026-11-05. **Isolated frontend branch; no production changes.**

## Expected workload and scale decision
- Next month: up to 3 simultaneous users, up to 5 workflow runs at a time.
- The workflow scheduler currently allows 4 active nodes per parallel run: 5 runs could together request up to 20 simultaneously ready nodes.
- Operator-confirmed current deployment: Cloud Tasks queue has 2 concurrent dispatches and 2 dispatches/second, Worker 2 requests/instance, at most 1 instance.
- This is sufficient for functionality but may cause latency under 5x4. Measure queueing and usage before increasing capacity. A safe first scale step would be 4 global worker slots if there is meaningful waiting.
- **Do not implement the 1,000+ global concurrency design yet.** Keep it as an architecture goal, with fair scheduling, worker autoscaling, provider-specific RPM and budgets, bounded retries, queue isolation and load tests when demand justifies.

## Read-only dashboard delivered in source branch
- Branch: feature/usage-capacity-20261105, forked from feature/fe-live-backend-20261104.
- Changes are scoped to budgets.html and new usage-capacity.css, usage-capacity.js, usage-capacity-math.js, a test and this note. Do not modify studio.html or authentication.
- API data sources:
  - GET /v1/models: registered models, including enabled/disabled.
  - GET /v1/usage/dashboard: lifetime model-call share, tokens and cost.
  - GET /v1/metrics/model-rpm: configured RPM limits per provider endpoint + remote model + credential, admitted last 60s, remaining and cooldown.
  - GET /v1/metrics/parallel: running and queued node-task counts, active parallel run counts.
- Visuals: current-running vs queued donut, model share-of-calls bars, individual model RPM-used percentages and bars, recorded token/cost amounts, model enabled states.
- All auto-refresh requests are GET only, every 30 seconds when visible and signed in. Manual refresh is also available.
- No fabricated provider quota: missing policy means **unknown** capacity. No percent for unavailable telemetry. The running/queued donut is explicitly *processing share*, not total infrastructure utilization.
- No actual external-provider account credit, Cloud Run CPU, Cloud Tasks max capacity or time-series history is available from these API shapes; do not imply otherwise.
- Shared model aliases reuse one RPM policy and quota.

## Validation and merge gates
1. Verify Node syntax and the capacity calculation tests; check existing frontend CI.
2. Test live Firebase authorized login, desktop/mobile layout, zero-load case, shared model RPM, model without policy, provider cooldown and missing admin metric permissions.
3. Review changes relative to the intended release branch; parent feature branch contains other unreleased work.
4. No merges, GitHub Pages publishing, backend changes or cloud infrastructure changes until a separate approval.

## Quizer API integration — after dashboard acceptance
Quizer must call Mimo on a **trusted server**, never from publicly served GitHub Pages code.

1. Publish a tested and pinned Mimo workflow version intended for mathematical extraction or question-to-quiz-LaTeX transformation.
2. In Mimo API Access, create a Quizer-specific API project and grant only its required workflow/version run permission.
3. Store the generated API key and separately verified Mimo Execution origin in Quizer's trusted Firebase Function or Cloud Run environment with Secret Manager; do not paste keys in chat or source.
4. Send authenticated server-to-server POST to Mimo's published workflow run endpoint with an Idempotency-Key. For long jobs use background mode and poll run status.
5. For PDFs or diagrams, upload project-owned files through Mimo integration artifact endpoints before running extraction. Verify outputs before saving to Quizer; do not silently reimport unchanged quiz content.
6. Test least-privilege access, project isolation, quotas, retries and cancellation, real provider costs, revocation and failure display on a disposable Quizer development environment.
7. Promote to real Quizer only after separate authorization. Do not touch Quizer source, Firebase, production Neon or deploy while preparing this handoff.

**Stop here:** no production writes, secret creation, merges or deployments.
