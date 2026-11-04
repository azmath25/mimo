# Mimo Usage & Capacity release checkpoint — November 2026

Scope: isolated Mimo frontend only; no Quizer changes and no large-scale concurrency rollout.

## Included
- Mobile-responsive read-only Usage & Capacity overview within Budgets & Usage.
- Model registry status, lifetime completed call share, tokens and recorded costs.
- Per provider endpoint/remote model/credential configured RPM limit, rolling 60-second admissions, remaining RPM, 429/cooldown warnings.
- Current running/queued parallel DAG task counts and active parallel workflow runs.
- Manual refresh and 30-second polling only when authenticated and page visible.
- Honest unknown-state: no configured RPM policy does NOT mean unlimited provider quota; running/queued share is not cloud CPU or queue utilization.

## Load expectation
At most 3 simultaneous users and 5 running workflow instances next month. Existing concurrency 2 is sufficient for basic use but can lead to waiting if several independent nodes are ready; measure before changing Worker/queue settings. Architecture should remain extensible to 1,000+ across additional workers/providers/databases, but do not implement that capacity without demand.

## Release gates
1. Frontend tests and Node syntax checks pass on the exact PR commit.
2. Compatible private compiler revision recognizes and attests requested PNG DPI.
3. Backend Studio, Execution, Worker remain pinned and checked for cross-service compatibility.
4. Production front end authenticated smoke test in desktop and mobile browsers, including verified RPM unknown states, failed metrics, no secrets and PNG 300 DPI download.
5. No database migration, no model calls for tests except an explicitly capped smoke, no unrelated Cloud Run configuration change.
