# M-FE.4 — Real local-browser viewport and accessibility audit

## Scope and result

**Source + actual headless Chromium acceptance on localhost only**, frontend feature branch `feature/platform-autonomy-v1`. No production/staging Cloud Run, Firebase login, Neon, AI provider, external connector, hosted browser, deployment or other live service was invoked. Network interception blocks **all requests leaving the local fixture host**. This is a real renderer test (not the previous CSS-only VM assertion), but **not** a real authenticated staging E2E test or a physical mobile-device certification.

**Implementation at** [`b86f7c8b679ee737f4bea6a434093668f0d540ce`](https://github.com/azmath25/mimo/commit/b86f7c8b679ee737f4bea6a434093668f0d540ce): [push CI 41658282534](https://github.com/azmath25/mimo/actions/runs/41658282534) and [PR CI 41658294955](https://github.com/azmath25/mimo/actions/runs/41658294955) **passed**.

## What changed

- `browser-tests/mfe4.browser.cjs` is a headless Chromium Playwright Core runner. It starts a throwaway localhost HTTP server for **the actual existing HTML/CSS/JS**, tests management pages at **320, 360, 390, 768px**, Studio at **320, 360, 390, 1280px**, keyboard `Tab` / `Enter` skip-to-main behavior, the inspector's real interactive open/close state, Run/Save visibility, meaningful canvas size, page-level horizontal scroll width, and error announcements from a fake failing backend.
- `.github/workflows/frontend.yml` installs Playwright Core as an ephemeral CI-only dependency, uses runner's Chrome/Chromium binary, executes the local browser suite **after** the established Node smoke suite, and uploads **synthetic fixture screenshots only** for seven days. It **does not** install/deploy a new app, run live auth or mutate cloud resources.
- Actual Chromium initially detected **mobile Studio horizontal page overflow** (320px viewport created 644px scroll width; 360px → 724px; 390px → 764px). Source inspection identified the old closed inspector transformed outside the viewport. A **single narrowly targeted mobile-only rule** now sets `.app{position:relative;overflow-x:clip}` in `studio-polish.css` below 640px. That keeps the translated drawer clipped inside Studio rather than doubling document width.
- Additional browser coverage verifies the drawer **can still open and close** after clipping and stays inside viewport. Desktop Studio header, main blocks, node canvas, core HTML, editing logic and desktop CSS **were not redesigned or changed**.

## Why this is not production validation

All screenshots and browser interactions use synthetic localhost fixture data; external Firebase modules are deliberately blocked, with no Firebase token requested, no live Cloud Run calls, no billing/provider activity and no production data. A real device, touchscreen gestures, screen reader, actual user login, authenticated browser Studio run, performance/accessibility audit under production payloads, real Cloud Tasks and staging cloud security/IAM remain **unverified**. Real M7.2 staging inventory is blocked, so **M8 remains NO-GO**.

## How to reproduce

On a trusted local checkout with Node.js 22 and Chrome/Chromium installed:

```bash
npm install --no-save --no-package-lock --no-audit --no-fund playwright-core@1.56.1
node --test browser-tests/mfe4.browser.cjs
```

No user secrets and no remote URLs are required. Screenshots are placed under `test-artifacts/mfe4/` and retained only as disposable CI artifacts; never treat them as staging acceptance.

**M-FE.4 checkpoint complete at the localhost browser level.** Preserve the main Studio design. The next **M-FE.5** is a source-only frontend release-readiness/compatibility closure and stop, with explicit cloud blockers.
