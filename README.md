# Mimo Studio — Cloud-connected frontend

**Preview:** `index.html` preserves the v3.3 workflow canvas and block builder, and adds Firebase administrator login, cloud draft sync, and cloud execution.

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

**Backend dependency:** Merge and deploy the accompanying backend Studio drafts PR:
`GET /v1/workflows` lists your saved workflows, `POST/PATCH` can save unfinished canvases, and `DELETE /v1/workflows/{id}` deletes unpublished drafts. Publish and execute still perform full graph validation.

## Features and limits

- **Save:** writes a browser backup first, then a cloud draft to Neon. A failure is shown explicitly, never disguised as success.
- **Open:** lists cloud drafts and opens them from the backend. JSON import/export stays supported.
- **Preview:** keeps the original local, non-AI simulator, including unsupported tools.
- **Run in cloud:** uses the authenticated `POST /v1/workflows/execute` endpoint and displays real node results. Currently works for the backend's allowed text tools and configured models.
- **AI model setup:** Cloud Run does not itself supply API keys or models. Models must be added to the backend registry, with secret references; don't store keys in HTML.
- **Unsupported operations:** v3.3's numeric condition operators, TikZ compiler integration, trim/replace/json-field local tools, and binary file uploads are **preview-only** until backend capabilities are added. The Run action clearly blocks unsupported workflows rather than simulating success.
- **Limit:** The direct `execute` endpoint returns a completed result but does not create a persisted run record. Published workflow/job execution uses separate backend APIs.
- **Admin-only access:** The page hides behind Firebase sign-in, and each backend request contains a fresh ID token. The public Firebase web config is not a secret. Backend authorization, not UI hiding, enforces access.
- **Not yet supported:** Reusable block libraries are still browser-local, and `index.html` is a single-file canvas pending modularization.

Run checks with `node --check cloud-auth.js` and `node --test tests/*.test.cjs`.
