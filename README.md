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
- **Unsupported operations:** v3.3's numeric condition operators, TikZ compiler integration, trim/replace/json-field local tools, and binary file uploads are **preview-only** until backend capabilities are added. The Run action clearly blocks unsupported workflows rather than simulating success.
- **Real results:** the inspector distinguishes actual cloud results from Preview simulations and supports cloud output-bundle exports.
- **Limit:** The direct `execute` endpoint returns a completed result but does not create a persisted run record. Published workflow/job execution uses separate backend APIs.
- **Admin-only access:** The page hides behind Firebase sign-in, and each backend request contains a fresh ID token. The public Firebase web config is not a secret. Backend authorization, not UI hiding, enforces access.
- **Not yet supported:** Reusable block libraries are still browser-local; the canvas remains a single large standalone `studio.html` pending further modularization. The current backend has no project-listing endpoint, so API Access remembers only project IDs/names locally and never stores issued API keys. API endpoints are templates until a separate execution service is deployed.

Run checks with `node --check cloud-auth.js` and `node --test tests/*.test.cjs`. Visit each page over GitHub Pages, not `file://`, so ES modules and Firebase work.
