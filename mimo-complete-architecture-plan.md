# Mimo — Complete System Architecture and Backend Plan

**Status:** Design blueprint (not an implemented backend)  
**Revision:** 1.0 • 2026-11-01  
**Goal:** A private workflow design studio and a secure Workflow-as-a-Service API reusable from other apps.

## 1. Decisions frozen for the first implementation

- **Python/FastAPI** services and workers, using **Uvicorn**.
- **One workflow executor** for both job and interactive executions. Graph definitions are validated and compiled from saved workflow JSON. Consider LangGraph as an internal engine; Mimo controls validation, block contracts, permissions and audit records.
- **One provider/model initially**, using a LiteLLM SDK-compatible adapter. A **Models registry** provides Add/Edit/Test/Disable/Default, with capability flags, response options, pricing, token usage and cost accounting.
- **PostgreSQL** for workflow metadata, versioned definitions, run/checkpoint state, accounting, project permissions, and model metadata. **Cloud Storage** for PDF/images/generated outputs; **Secret Manager** for credentials.
- **Cloud Tasks** for dispatch of background HTTP tasks, **Cloud Run Jobs** for isolated or long-running batches, **SSE** for token/progress streaming, **Cloud Run services** for FastAPI.
- **GitHub Pages** for public source/static Studio, **Firebase Auth** for actual Studio access; **Cloud Run IAM/OIDC** for backend-to-backend calls. No secrets in browser, GitHub, or workflow JSON.
- **Published workflow versions are immutable**, have stable workflow IDs, and expose typed input/output schemas. Each run pins a version and retains per-block checkpoints.

## 2. Key distinction: result content vs delivery mode

**Result kinds**: `text`, `chat`, `code`, `json`, `image`, `document`, `bundle` (named outputs).  
**Delivery modes**: `complete` (single response), `stream` (SSE text or chat/code chunks and events), `job` (return run ID and perform asynchronously).  
**Execution modes**: `interactive`, `background`, `auto` (route based on policy/input size). A background job may expose a **progress event stream**.

- `text`: UTF-8 plain text or Markdown.
- `chat`: array of role-labeled messages, optional persistent conversation/thread ID.
- `code`: string plus language (`latex`, `tikz`, `python`, `javascript`, etc.), filename, syntax validation metadata.
- `json`: validated structured object, optional JSON Schema.
- `image`: artifact reference(s), format/mime, resolution, preview link, metadata; do not dump binary in SSE events.
- `document`: PDF/DOCX/etc. artifact reference(s), not embedded base64.
- `bundle`: multiple named typed results, potentially including chat, code, image and document concurrently.
- `stream`: a *delivery selection*, not a storage/content type. UI can expose it as an “Answer behavior” control alongside “Answer format.”

Provider capabilities (vision, image generation, streaming, JSON schema, reasoning effort, etc.) determine allowed settings. A provider may not support all combinations.

## 3. Repository map

```text
mimo/
├── README.md
├── .gitignore
├── .env.example                     # placeholders, NEVER real credentials
├── frontend/                        # existing Mimo UI, hosted via GitHub Pages
│   ├── index.html
│   ├── assets/
│   ├── pages/
│   │   ├── workflow-studio.html      # canvas, connections and conditions
│   │   ├── block-builder.html        # custom reusable blocks
│   │   ├── workflow-guide.html       # generated documentation and index
│   │   ├── models.html               # Add Model + capabilities + pricing
│   │   ├── runs.html                 # runs, status, streaming and replay
│   │   ├── review.html               # human approval and corrections
│   │   ├── usage.html                # tokens/cost dashboard
│   │   └── api-access.html           # project permissions / integration docs
│   └── js/
│       ├── auth.js                   # Firebase Auth client
│       ├── api-client.js             # typed backend API client
│       ├── events.js                 # SSE reader/reconnect
│       ├── artifact-viewer.js        # image/PDF/code previews
│       └── editor-state.js
│
├── backend/
│   ├── pyproject.toml
│   ├── Dockerfile
│   ├── alembic.ini
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                    # FastAPI app creation, routers
│   │   ├── settings.py                # environment configuration
│   │   ├── lifespan.py                # startup/shutdown resources
│   │   ├── api/
│   │   │   ├── dependencies.py        # current principal, DB session, permissions
│   │   │   ├── error_handlers.py
│   │   │   └── routes/
│   │   │       ├── health.py
│   │   │       ├── auth.py
│   │   │       ├── workflows.py       # drafts, list, import/export
│   │   │       ├── publications.py    # immutable versions and aliases
│   │   │       ├── block_templates.py # reusable block definitions
│   │   │       ├── models.py          # Add/Edit/Test/Disable/List
│   │   │       ├── pricing.py         # pricing and estimated cost
│   │   │       ├── projects.py        # authorized external apps
│   │   │       ├── credentials.py     # credentials/revocation, no plaintext readback
│   │   │       ├── runs.py            # create/status/cancel/retry
│   │   │       ├── events.py          # streaming token/progress events
│   │   │       ├── artifacts.py       # upload/download via signed URLs
│   │   │       ├── reviews.py         # approve/reject/resume
│   │   │       ├── usage.py           # per call/block/run/project cost
│   │   │       └── internal.py        # strictly private worker callbacks
│   │   │
│   │   ├── auth/
│   │   │   ├── firebase.py            # verify signed Firebase ID tokens
│   │   │   ├── service_identity.py    # Google Cloud IAM/OIDC service identity
│   │   │   ├── policies.py            # role/scope/workflow authorization
│   │   │   ├── principals.py          # admin/project/worker principal types
│   │   │   └── rate_limits.py
│   │   │
│   │   ├── schemas/
│   │   │   ├── workflow.py            # schema_version, nodes, edges, I/O
│   │   │   ├── block.py               # types, ports, config, prompt, defaults
│   │   │   ├── model.py               # provider, capabilities, options
│   │   │   ├── run.py                 # run request/status/checkpoint
│   │   │   ├── output.py              # typed result and artifact refs
│   │   │   ├── event.py               # SSE event envelope
│   │   │   ├── pricing.py             # price tiers, token usage and estimates
│   │   │   ├── artifact.py
│   │   │   └── security.py
│   │   │
│   │   ├── engine/
│   │   │   ├── validator.py           # graph + type + permission validation
│   │   │   ├── graph_builder.py       # compile JSON to executable graph
│   │   │   ├── scheduler.py           # fan-in/fan-out, parallel dependencies
│   │   │   ├── executor.py            # execute a pinned workflow version
│   │   │   ├── state.py               # current run/branch state
│   │   │   ├── ports.py               # typed ports and wiring
│   │   │   ├── conditions.py          # 2–5 conditional branch outcomes
│   │   │   ├── variables.py           # {{input}}, {{inputs.1}}, JSON paths
│   │   │   ├── prompt_renderer.py     # user prompts, safe interpolation
│   │   │   ├── context_builder.py     # per-block workflow guide injection
│   │   │   ├── checkpoints.py         # persist/recover block results
│   │   │   ├── outputs.py             # named result collection and normalization
│   │   │   ├── subworkflows.py        # another workflow as block, depth limit
│   │   │   ├── documentation.py       # objective, indices, prompts, route map
│   │   │   └── errors.py
│   │   │
│   │   ├── blocks/
│   │   │   ├── base.py                # Block.execute(...) -> BlockResult
│   │   │   ├── registry.py            # available executable block types
│   │   │   ├── input_block.py         # unchanged input fan-out
│   │   │   ├── output_block.py        # collect chosen upstream results
│   │   │   ├── ai_block.py            # model invocation, costs, output modes
│   │   │   ├── condition_block.py     # non-AI comparisons / AI classification
│   │   │   ├── tool_block.py          # allowlisted deterministic tools
│   │   │   ├── compiler_block.py      # invoke isolated TeX worker
│   │   │   ├── review_block.py        # pause and wait for human approval
│   │   │   └── subworkflow_block.py   # launch selected published workflow
│   │   │
│   │   ├── models/
│   │   │   ├── registry.py            # stable model_id + metadata
│   │   │   ├── gateway.py             # invoke chosen provider model
│   │   │   ├── capabilities.py        # flags and supported combinations
│   │   │   ├── response_settings.py   # effort, length, response mode/format
│   │   │   ├── usage_normalizer.py    # provider usage -> canonical tokens
│   │   │   ├── pricing.py             # model rates and price snapshots
│   │   │   └── providers/
│   │   │       ├── base.py
│   │   │       ├── openai_compatible.py # first one-model implementation
│   │   │       ├── image_generation.py # when provider supports generation
│   │   │       └── custom.py          # later provider extensions
│   │   │
│   │   ├── runtimes/
│   │   │   ├── router.py              # interactive/background/auto decision
│   │   │   ├── interactive.py         # low-latency request execution
│   │   │   ├── streaming.py           # SSE tokens, status, errors, final usage
│   │   │   ├── background.py          # scheduled async execution
│   │   │   ├── dispatcher.py          # Cloud Tasks or Cloud Run Jobs
│   │   │   └── event_bus.py           # append/replay progress events
│   │   │
│   │   ├── tools/
│   │   │   ├── registry.py            # approved functions, not arbitrary eval
│   │   │   ├── text_tools.py
│   │   │   ├── json_tools.py
│   │   │   ├── file_tools.py
│   │   │   └── http_tools.py          # allowlist and SSRF protection if enabled
│   │   │
│   │   ├── services/
│   │   │   ├── workflows.py
│   │   │   ├── publications.py
│   │   │   ├── blocks.py
│   │   │   ├── models.py
│   │   │   ├── projects.py
│   │   │   ├── runs.py
│   │   │   ├── reviews.py
│   │   │   └── artifacts.py
│   │   │
│   │   ├── accounting/
│   │   │   ├── usage.py               # per-call token breakdown
│   │   │   ├── cost_calculator.py     # rate snapshot * actual usage
│   │   │   ├── estimates.py           # prior-run-based cost estimates
│   │   │   ├── ledger.py              # immutable/billable usage events
│   │   │   ├── budgets.py             # limits by run/user/project/model
│   │   │   └── reports.py
│   │   │
│   │   ├── storage/
│   │   │   ├── database.py            # SQLAlchemy session and migrations
│   │   │   ├── tables.py              # ORM models
│   │   │   ├── repositories.py        # persistence interfaces
│   │   │   ├── object_storage.py      # PDFs, images, generated artifacts
│   │   │   └── secrets.py             # Secret Manager references
│   │   │
│   │   ├── workers/
│   │   │   ├── task_handler.py        # Cloud Tasks HTTP entry
│   │   │   ├── batch_entry.py         # Cloud Run Jobs container entry
│   │   │   ├── pdf_ingestion.py       # PDF parsing and problem extraction
│   │   │   ├── compiler_client.py     # call isolated compiler service
│   │   │   └── retry_policy.py
│   │   │
│   │   └── observability/
│   │       ├── logs.py
│   │       ├── metrics.py
│   │       └── tracing.py
│   ├── migrations/                    # Alembic database migrations
│   └── tests/
│       ├── unit/
│       ├── integration/
│       ├── security/
│       └── e2e/
│
├── compiler/                          # separate restricted image/service/job
│   ├── Dockerfile
│   ├── entrypoint.py                   # compile TikZ/LaTeX with constraints
│   ├── converters.py                   # PDF -> SVG/PNG
│   └── limits.py                       # no network/shell escape, CPU/mem/time
│
├── deployment/
│   ├── docker-compose.yml              # local API + Postgres + mock worker
│   ├── cloud-run-studio-api.yaml        # public endpoint, app-layer Firebase auth
│   ├── cloud-run-execution-api.yaml     # IAM-protected project-to-project endpoint
│   ├── cloud-run-task-worker.yaml
│   ├── cloud-run-batch-job.yaml
│   ├── cloud-run-compiler-job.yaml
│   ├── cloud-tasks.yaml
│   └── iam-notes.md
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── WORKFLOW-SCHEMA.md
│   ├── BLOCK-CONTRACT.md
│   ├── MODEL-CONTRACT.md
│   ├── EVENTS.md
│   ├── SECURITY.md
│   └── DEPLOYMENT.md
└── .github/workflows/
    ├── tests.yml
    ├── deploy-frontend.yml
    └── deploy-backend.yml
```

**Note:** Some modules (e.g. `compiler_client.py` vs compiler `entrypoint.py`) belong to separate runtimes, not duplicate implementations. This map is a target structure: create files progressively as features are built. Do not create dozens of empty modules up front. The existing standalone frontend can be kept as-is until it's deliberately split into pages.

## 4. Core entity and database map

| Entity / table | Core fields / purpose |
|---|---|
| `users` | `uid`, role, status |
| `projects` | external caller ID, name, owner, allowed workflows |
| `project_permissions` | scopes: run/read own results; per-workflow/version access |
| `api_credentials` | hashed key IDs (where used), revoked status, scope; **no plaintext secret retrieval** |
| `block_templates` | stable template ID, JSON configuration, owner, revisions |
| `workflows` | stable workflow ID, name, owner, draft metadata |
| `workflow_versions` | immutable version, graph JSON, input/output schemas, generated documentation |
| `models` | model ID, provider, remote ID, capabilities, endpoint, secret reference |
| `model_prices` | price tiers, currency, effective time, source/manual override |
| `runs` | run ID, project, pinned version, execution mode, status, timestamps |
| `block_runs` | node ID, attempt, inputs/outputs refs, status, prompt snapshot, latency |
| `checkpoints` | resumable workflow states, completed node refs, branch decisions |
| `artifacts` | object key, media type, file size, checksum, ownership, retention |
| `events` | run ID, ordered event sequence number, type, payload |
| `reviews` | approval requests, correction sets, reviewer and decision |
| `model_calls` | provider request ID, model, settings, token usage, rate snapshot |
| `usage_ledger` | append-only costs and corrections, deduplicated by provider call ID |
| `budget_policies` | hard/soft limits per project/model/workflow/time window |
| `audit_logs` | edit, publish, grant, revoke, run and export activity |

Recommended high-level relationships:

```text
project ── grants ──> workflow_version
workflow ── has ──> workflow_versions
workflow_version ── launches ──> runs
run ── has ──> block_runs, checkpoints, events, reviews
block_run ── has ──> model_calls, artifacts
model_call ── has ──> usage_ledger entries + pricing snapshot
```

## 5. Workflow JSON (conceptual, versioned)

```json
{
  "schema_version": 1,
  "workflow_id": "wf_math_001",
  "version": 2,
  "title": "Math problem processor",
  "objective": "Convert problems into verified LaTeX with figures",
  "inputs": { "problem_text": { "kind": "text", "required": true } },
  "outputs": { "latex": { "kind": "code", "language": "latex" } },
  "execution": { "mode": "auto", "default_delivery": "complete" },
  "nodes": [
    { "id": "node-a", "type": "input", "config": {} },
    { "id": "node-b", "type": "ai", "config": {
      "model_id": "model_primary",
      "prompt": "Convert: {{workflow.input}}",
      "response": { "kind": "code", "language": "latex", "delivery": "stream" }
    } },
    { "id": "node-c", "type": "output", "config": { "collect": ["node-b"] } }
  ],
  "edges": [
    { "source": "node-a", "source_port": "out", "target": "node-b", "target_port": "in" },
    { "source": "node-b", "source_port": "out", "target": "node-c", "target_port": "in" }
  ]
}
```

**Stable node IDs** are permanent reference keys. User-facing `#1`, `#2`, `#3` numbers are derived from the graph at rendering/document-generation time. Parallel nodes share a stage, but each gets its own deterministic display index.

A condition node has 2–5 named outgoing ports. Its decision activates exactly one matching edge by default; optional explicit fanout policies can be added later. A Review block is resumable. An Output block can select any named result from specific source nodes. For v1 use a **DAG** (no arbitrary cycles); add explicitly bounded loop/subworkflow semantics later.

## 6. Block contract

Every block receives a typed input map, a read-only execution context and its configuration; it returns a standardized `BlockResult` or a stream of typed events terminating in `BlockResult`.

```json
{
  "block_id": "node-b",
  "status": "completed",
  "result": {
    "kind": "code",
    "language": "latex",
    "content": "\\begin{tikzpicture}..."
  },
  "artifacts": [],
  "task_summary": "Converted problem to LaTeX",
  "usage": {
    "input_tokens": 1200,
    "cached_input_tokens": 300,
    "output_tokens": 450,
    "reasoning_tokens": 80,
    "total_tokens": 1650
  },
  "cost": { "amount_usd": "0.001234", "basis": "provider_reported" },
  "metadata": { "model_id": "model_primary" }
}
```

`reasoning_tokens` are typically a subset of `output_tokens`, and `cached_input_tokens` are typically a subset of `input_tokens`; do not double-count. Some providers don't report all details. Never represent unknown usage/cost as zero without labeling it estimated/unknown. Code output is **data**, not permission to execute arbitrary Python. A code-runner tool requires separately sandboxed and authorized execution.

## 7. Model registry and 'Add Model' feature

Fields to save:

- **Identification:** stable `model_id`, display name, provider, remote model ID, endpoint, enabled/default.
- **Access:** `secret_ref` pointing to Secret Manager; never expose the original API key after submission.
- **Capability flags:** text, chat, vision input, image generation, structured JSON, native streaming, system prompts, tools/function calls, reasoning effort, context length.
- **Default response options:** `kind` (`text/chat/code/json/image/document` as supported), `delivery` (`complete/stream` as supported), length/verbosity, reasoning effort, max output tokens, temperature (where supported), JSON schema, code language.
- **Pricing:** currency, input/uncached, cached input, output, other modalities, tier rules, effective date, provider source vs manual override.
- **Quota/routing:** per-model concurrency, rate limits, soft/hard spending cap, fallback (later).

UI operations: **Add Model**, **Test Connection**, **Save**, **Set Default**, **Edit**, **Disable**, **Price History**, **View Usage**. Block editor uses the exact same model registry and supports per-block overrides, validated against model capabilities.

Initially install exactly one model adapter. 'Add Model' can register another compatible model without modifying the engine; integrate new provider adapters only when required.

## 8. Pricing and token accounting

After each provider call:

1. Store provider/raw usage, normalized token counts and provider request ID.
2. Snapshot the applicable model price tiers for the historical calculation.
3. Calculate input (uncached), cached input, output, and other modality/tool fees separately.
4. Record cost in the append-only ledger, deduplicated across retries.
5. Enforce pre-call budgets, hard limits, timeouts, concurrency and project quotas.
6. Aggregate at **model-call → block → run → workflow → project** levels.
7. Show **estimated**, **provider-reported**, and **invoice-reconciled** figures distinctly.

An estimator may predict likely spend before large batch runs using past executions, but must warn about unknown tokens, image prices, retries and branches. Include total request latency and tool/runtime costs separately from AI model fees.

## 9. Execution and event lifecycle

**Interactive / stream:** `request → authentication → input validation → pinned workflow → execute → SSE (run.started, block.started, output.delta, block.completed, usage.updated, run.completed)`; a final `BlockResult` is always saved even when chunks streamed earlier. Aborted client connections must not be confused with a successfully verified result.

**Background job:** `request → authentication → persist run (queued) → Cloud Tasks dispatch → worker or Cloud Run Job → checkpoints and ordered progress events → optional waiting_for_review → resume → completed/failed/cancelled`; initial call returns `run_id`. The job initiator must not block until processing finishes.

**Review:** pause, persist state, notify the user, accept authorized changes, invalidate downstream cached outputs only, resume. Never leave a worker waiting for a human.

**Retries:** at-least-once delivery and worker crashes require idempotency keys and stable provider call/request IDs. The run must never treat uncommitted work as completed. Cloud Run Jobs can execute independently parallel tasks, but do not assume they automatically understand Mimo graph dependencies; the Mimo scheduler coordinates nodes.

**Event types** (proposed): `run.queued`, `run.started`, `node.started`, `node.output.delta`, `node.artifact.ready`, `node.completed`, `node.skipped`, `node.failed`, `usage.updated`, `review.required`, `run.completed`, `run.failed`, `run.cancelled`, `heartbeat`.

**SSE:** events carry event sequence IDs; support reconnect/replay of saved status events. Stream tokens only for providers supporting native streaming; optionally chunk completed responses for UI rendering only if clearly marked as not native model streaming. Output image/document artifacts produce `artifact.ready` with a safe reference, not binary SSE chunks.

## 10. HTTP API surface

Studio APIs (Firebase ID token, admin role checks):

```text
GET    /v1/me
GET    /v1/block-templates
POST   /v1/block-templates
GET    /v1/workflows
POST   /v1/workflows
PATCH  /v1/workflows/{id}
POST   /v1/workflows/{id}/publish
GET    /v1/workflows/{id}/versions
GET    /v1/workflows/{id}/guide
GET    /v1/models
POST   /v1/models
POST   /v1/models/{id}/test
PATCH  /v1/models/{id}
GET    /v1/models/{id}/pricing
GET    /v1/usage
GET    /v1/projects
POST   /v1/projects
POST   /v1/projects/{id}/permissions
POST   /v1/reviews/{id}/decision
```

Execution API (IAM OIDC and per-project workflow permissions):

```text
POST   /v1/workflows/{id}/runs
POST   /v1/workflows/{id}/stream
GET    /v1/runs/{run_id}
GET    /v1/runs/{run_id}/events
GET    /v1/runs/{run_id}/outputs
POST   /v1/runs/{run_id}/cancel
POST   /v1/runs/{run_id}/resume
POST   /v1/runs/{run_id}/retry-block
GET    /v1/workflows/{id}/input-schema
GET    /v1/workflows/{id}/output-schema
```

These are design endpoints, not live URLs. Store upload/download artifacts in Cloud Storage with authorized, short-lived signed URLs or equivalent proxy authorization. Support idempotency keys on run creation.

## 11. Security and deployment boundaries

**Do not treat the workflow ID as a credential.** Access checks use both caller identity and per-workflow permissions.

```text
GitHub Pages (static code is public)
    → Mimo Studio API (internet-accessible, verifies Firebase ID token,
                       admin allowlist + request limits; no secrets in browser)

Math Quiz browser (Firebase Auth)
    → Math Quiz Firebase Function (verify student + authorize action)
    → Mimo Execution API (private Cloud Run IAM/OIDC identity,
                          plus Mimo project/workflow authorization)
    → workflow worker / Cloud Run Job
    → model gateway / isolated compiler / storage
```

For easier initial deployment these API paths can share one FastAPI codebase, deployed twice with different public/private ingress settings. Avoid making a private IAM Cloud Run service directly accessible to GitHub Pages browser requests. Never store provider API keys in workflow JSON, JS bundles, database plaintext or logs. Secret access should use least-privilege IAM; raw uploaded documents/results need per-project access checks and retention policies. Restrict arbitrary outbound HTTP tools to avoid SSRF. Restrict untrusted LaTeX/code and disable unnecessary network and shell execution in workers.

## 12. Phased construction (avoid writing everything at once)

| Phase | Deliverable | Acceptance test |
|---|---|---|
| 0 | Working local FastAPI + PostgreSQL + Firebase-authenticated admin | Unauthorized request denied |
| 1 | Model registry, Add/Test/Default model, one real provider, usage/cost | Model works; raw usage and pricing recorded |
| 2 | Block schema and DAG executor: Input, AI, Condition, Output, Tool | Fan-out, fan-in, conditional skip and prompt variables validated |
| 3 | Publish/import/export workflow versions, project permissions | External authorized project executes pinned workflow ID |
| 4 | Interactive SSE text/chat/code + persistent events | Streaming chunks, final saved result, reconnects |
| 5 | Cloud Tasks background runs + checkpoints + retry/cancel | Multi-step workflow survives worker failure |
| 6 | Cloud Storage, PDF/image ingestion + isolated TikZ/PDF compiler | Binary artifact flows through blocks safely |
| 7 | Review and targeted rerun + oversight model | Approve/revise one problem without rerunning unrelated nodes |
| 8 | Image generation and richer models + accounting dashboard | Image artifact + usage records + supported options validated |
| 9 | Production hardening (CI, metrics, budgets, secrets rotation, backups) | Rate-limit and authorization abuse tests |

## 13. Minimum critical tests

- Workflow validation catches missing ports, unsupported types, unreachable outputs, invalid cycles, inaccessible subworkflows, missing models.
- Condition routes exactly one of 2–5 outputs; downstream nodes on skipped edges do not run.
- Multiple incoming values preserve deterministic `{{inputs.1}}` order and stable ID referencing; missing variables produce a documented validation/runtime error.
- Parallel blocks run when dependencies are ready; fan-in waits for required arrivals; terminated/false branches do not deadlock joins.
- Output collector returns only chosen executed results and respects user privacy.
- AI model settings, code/chat/JSON/text/image/document formats are validated against capability flags.
- Streaming emits incremental text events, `usage.updated` after provider usage is known, and an unambiguous completion/error event.
- An `artifact.ready` image/document reference resolves only for authorized callers.
- Cost never double-counts cached or reasoning tokens and never duplicates ledger charges on retries.
- Frontend source download provides no workflow data, provider secret, IAM token or API key.
- Invalid Firebase tokens, unapproved service identities, ungranted workflow IDs and private artifact downloads are rejected.
- Publishing a new version never changes in-flight or pinned external runs.
- Compiler safely rejects unsafe options and limits CPU, memory, disk and runtime.

## 14. Practical starting scope

Keep a single model and a single execution mode running end-to-end first: **Input → AI (text/code) → Output**, authenticated via the Studio API, with usage and cost accounting. Add conditional/parallel execution next, then published IDs, streaming, and background jobs. Build the general interfaces early, but implement specialist adapters only as needed. This is a specification to guide implementation, not code that currently runs.
