# Mimo Studio — Cloud-connected frontend

**Architecture:** A six-page static site. `index.html` is the dashboard, `studio.html` preserves the v3.3 canvas and block builder, and separate pages manage workflows, AI models/API connections, API projects/endpoint generation, and budgets/usage. Firebase Auth protects the UI; Cloud Run protects all admin APIs. The UX upgrade also adds a runnable cloud starter workflow, run-readiness checks, keyboard saving, and per-administrator local recovery after accidental tab closure.

## Services

- Firebase Auth project: `mimo-3fb0f` (administrator UID must appear in the backend's `MIMO_ADMIN_UIDS`).
- Mimo backend: `https://mimo-backend-git-993130348924.europe-west1.run.app`.
- Neon PostgreSQL stores cloud workflow drafts. The browser also keeps local backups.
- Cloud Storage remains private and is accessed only through the backend.

## GitHub Pages deployment (browser-only)

1. Merge the frontend pull request into `main`.
2. On GitHub, go to **Settings → Pages → Build and deployment**.
3. Select **Deploy from a branch**, **main**, **/(root)** and **Save**.
4. Open `https://azmath25.github.io/mimo/`.
5. Under the backend Cloud Run service **Edit & deploy new revision**, add:
   `MIMO_CORS_ORIGINS=https://azmath25.github.io`
   (exact origin; no trailing slash or `/mimo` path). Redeploy.
6. Under Firebase Authentication **Settings → Authorized domains**, ensure
   `azmath25.github.io` is authorized. Enable Email/Password and/or Google sign-in.
7. Sign in with your whitelisted Firebase account. The page checks `GET /v1/me`
   before allowing Studio use.

**Backend dependency:** The Studio drafts backend PR #3 is merged into `mimo-backend/main`; ensure the matching Cloud Run revision has deployed. It provides:
`GET /v1/workflows` lists your saved workflows, `POST/PATCH` can save unfinished canvases, and `DELETE /v1/workflows/{id}` deletes unpublished drafts. Publish and execute still perform full graph validation.

## Page directory

| Page | Purpose |
| --- | --- |
| `index.html` | Overview and service health |
| `studio.html` | Focused drag-and-drop workflow editor and block builder |
| `workflows.html` | Cloud drafts, versions and publishing |
| `models.html` | AI model connection and provider pricing management |
| `access.html` | API projects, one-time keys, grants and endpoint templates |
| `budgets.html` | Usage and cost policies |

## Connect the first real AI provider and Execution API

The backend already supports real OpenAI-compatible text completions and chained AI blocks. This UI release adds:

- **AI Models → Quick provider setup**: OpenRouter free, Groq, or custom provider. The dropdown only fills nonsecret fields; create a provider API key separately in the provider dashboard.
- **Studio → Build real AI chain**: constructs Input → Extraction AI → Proofreading AI → Output, using the first enabled configured text model in the backend registry. Running it makes actual provider calls and may consume credits.
- **Studio block inspector → Connected backend model**: choose the internal model ID stored in Neon (not a demo-provider suggestion).
- **API Access → Verify service**: checks `GET /health/service` returns `role=execution`, then `/health/ready` confirms DB/storage. No credentials are sent in the probe. Endpoint copy requires verification, but a health check is **not** an authenticated end-to-end workflow test.

**Backend dependency:** [mimo-backend PR #5](https://github.com/azmath25/mimo-backend/pull/5) adds the role health endpoint and includes the browser-only setup guide at [docs/REAL_AI_AND_EXECUTION_CLOUD_RUN.md](https://github.com/azmath25/mimo-backend/blob/feature/real-agents-execution-readiness/docs/REAL_AI_AND_EXECUTION_CLOUD_RUN.md).

Setup requires manual actions in your own accounts:
1. Put a provider key in Google Secret Manager; reference it as `MIMO_SECRET_OPENROUTER` (or another chosen name) in Studio's Cloud Run service.
2. Register that model with the matching `secret_ref` in Mimo's AI Models page, then click **Test**.
3. Create a second Cloud Run service with the **same deployed backend image**, `MIMO_API_ROLE=execution`, migrations off, shared Neon/GCS and provider secrets.
4. Paste the actual execution-service HTTPS origin into Mimo API Access and **Verify service**.
5. Publish a workflow version, create a project key, grant it run permission, and call its endpoint from a trusted server.

Only your **server-side** Firebase Function or other backend may hold the one-time project API key. Never embed it in GitHub Pages HTML/JavaScript. Keep `background=false` while the Cloud Tasks worker is disabled. One execution Cloud Run service handles all published workflow IDs.

## New: in-app provider keys and TikZ Lab

The AI Models page now contains a secure key-management form for adding and rotating provider API keys through the backend's Google Secret Manager keyring. Keys are not returned to the browser or stored in Neon. The keyring resource and IAM permissions must be provisioned once on Google Cloud.

The new [TikZ Lab](tikz.html) compiles real standalone LaTeX documents through an isolated private TeX Live service. It supports PDF documents and PNG diagrams, downloadable after compilation. Studio compiler nodes can execute and download compiled artifacts once the service is configured. Until that point, the capability check prevents simulated success.

Backend setup: see the private backend repository's docs/PROVIDER_KEYS_AND_TIKZ.md. GitHub Pages and the backend are **not automatically deployed** merely by pushing this branch.

## Features and limits

- **Save:** writes a browser backup first, then a cloud draft to Neon. A failure is shown explicitly, never disguised as success.
- **Open:** lists cloud drafts and opens them from the backend. JSON import/export stays supported.
- **Preview:** keeps the original local, non-AI simulator, including unsupported tools.
- **Workflow checks:** the Check dialog explains unsupported cloud blocks, disconnected nodes and missing AI models before executing.
- **Quick start:** the sidebar includes a text → uppercase → output workflow runnable without AI provider keys.
- **Recovery:** an 800ms local autosave (scoped to the signed-in UID) offers restoration of unsaved edits; Cmd/Ctrl+S saves the current workflow. Recovery is local, not a substitute for cloud saving.
- **Navigation:** `site.js` / `site.css` provide shared navigation and Firebase sign-in on all pages.
- **Workflow library:** `workflows.html` lists drafts, opens Studio, validates and publishes immutable versions.
- **Model management:** `models.html` registers/updates/disables/tests providers and uses secret references (never raw provider keys).
- **API access:** `access.html` issues one-time project API keys, grants versions, and generates execution URLs and curl examples. An independent `MIMO_API_ROLE=execution` Cloud Run service is required before external run URLs work.
- **Spending:** `budgets.html` displays lifetime usage and configures pre-call hard limits and informational soft thresholds.
- **Run in cloud:** uses the authenticated `POST /v1/workflows/execute` endpoint and displays real node results. Currently works for the backend's allowed text tools and configured models.
- **AI model setup:** Cloud Run does not itself supply API keys or models. Models must be added to the backend registry, with secret references; don't store keys in HTML.
- **Unsupported operations:** numeric condition operators, trim/replace/json-field local tools and PDF input uploads remain preview-only. TikZ PDF/PNG compilation works in the cloud **only when the private compiler is deployed and COMPILER_URL is configured**. The Run action clearly blocks unsupported workflows rather than simulating success.
- **Real results:** the inspector distinguishes actual cloud results from Preview simulations and supports cloud output-bundle exports.
- **Limit:** The direct `execute` endpoint returns a completed result but does not create a persisted run record. Published workflow/job execution uses separate backend APIs.
- **Admin-only access:** The page hides behind Firebase sign-in, and each backend request contains a fresh ID token. The public Firebase web config is not a secret. Backend authorization, not UI hiding, enforces access.
- **Not yet supported:** Reusable block libraries are still browser-local; the canvas remains a single large standalone `studio.html` pending further modularization. The current backend has no project-listing endpoint, so API Access remembers only project IDs/names locally and never stores issued API keys. API endpoints are templates until a separate execution service is deployed.

Run checks with `node --check cloud-auth.js` and `node --test tests/*.test.cjs`. Visit each page over GitHub Pages, not `file://`, so ES modules and Firebase work.


## Mimo v2 integrated release (staging branch)

The v2 frontend includes real administration pages for:
- **Studio:** configurable AI/vision/image generation, deterministic tools, numeric routing, input combination, full workflow guides, TikZ PDF/PNG, persistent draft runs.
- **Runs & Reviews:** durable history, checkpoints/events, retry, resume/cancel, gated approvals and artifact downloads.
- **Files:** PDF/PNG/JPEG uploads, real embedded PDF text extraction, rendered page previews and page-to-vision artifacts.
- **AI Models:** provider registry and in-app API-key rotation backed by Google Secret Manager; raw provider keys are never returned.
- **API Access:** versioned workflow publishing, project API keys, rotation/revocation, per-workflow grants and endpoint examples.
- **Budgets & Usage:** cost and usage reports with backend checks.
- **Diagnostics:** backend service role, database/storage readiness and advertised feature capabilities.

For external consumer applications (e.g. another math quiz website), published
workflow execution is done from the **other project's server**, using a
project-scoped API key. Do not paste that key in public frontend JavaScript.
See the backend repository's docs/EXTERNAL_API_V2.md for Python and Node SDKs,
uploads, project-owned vision inputs, run history and retry/cancel APIs.

### Deployment requirements

These pages are source features, not proof of deployment. Before merging the
stacked PRs, deploy the **Studio** and **Execution** backend roles against the
same Neon database with migration 0009, set up the Secret Manager keyring,
private TeX Live worker, shared artifact storage, and Cloud Tasks worker
if background runs are enabled. Then exercise a real provider and compiler
in staging. GitHub CI does not prove these cloud resources are configured.

**Known limitations:** true parallel AI execution, native provider-token
streaming, automated vision OCR without a configured vision model, and
untrusted public TeX compilation are **not** implemented. Workflow nodes run
sequentially in topological order to preserve checkpoints and side-effect
consistency. Treating preview animations as parallel cloud work would be
misleading.
