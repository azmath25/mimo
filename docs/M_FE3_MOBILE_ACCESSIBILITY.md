# M-FE.3 — Mobile, accessibility and Runs race-safety checkpoint

**Scope:** frontend feature branch `feature/platform-autonomy-v1` only. No backend writes, real browser/device runs, Firebase calls, staging environment access, cloud mutations, billing, production merge or deployment.

## Implemented and verified in source tests

1. **Keyboard skip navigation:** `site.js` now inserts a **Skip to main content** link immediately before the global navigation, targeting the existing `<main>` landmark (including Studio's canvas). The main landmark receives a `tabindex=-1` for dependable keyboard focus. `site.css` shows the link on `:focus-visible` and gives keyboard navigation an explicit focus ring.
2. **Mobile navigation and dialog:** `site.css` adds ≥44px targets for mobile management controls and navigation links, 16px input fonts to avoid small-screen form zoom, viewport-bounded scrollable Firebase login dialog, reduced-motion behavior, and restrained mobile card padding. The horizontally scrolling page navigation remains usable instead of hiding pages.
3. **Small-screen Studio toolbar:** `studio-polish.css` introduces a two-row toolbar at widths ≤640px. Primary **Run** and **Save** actions are ordered first in the horizontally scrollable action row, while Check, Plan, Details, and More remain accessible. Canvas/builder viewport heights are adjusted to match the 53px global navigation and 112px Studio toolbar. Side panels are positioned relative to the updated canvas.
4. **Race-safe Runs inspector:** `runs.js` uses monotonically increasing list/selection tokens. Stale successes and failures from previously selected runs or filter requests are ignored. Actions for the previously selected run are disabled immediately while the next run is loading. Load-more requests cannot overlap an existing page request.
5. **New deterministic tests:** `tests/mfe3_mobile_run_races.test.cjs` runs a local VM harness for out-of-order run selection, outdated errors, filter refresh races, duplicate paging, skip-to-main markup, and source-level mobile CSS/accessibility contracts. The script and CSS are checked by the existing frontend GitHub Actions suite.

## CI checkpoint

After an initial failure from the **test harness only** (missing mocked `body.dataset.page`), the harness was corrected; subsequent implementation code passed both frontend checks at commit `29e0f7101ed84135cde224ceadd8cd5fde0552ea`:

- [Push CI 41646244770](https://github.com/azmath25/mimo/actions/runs/41646244770) — success.
- [PR CI 41646251869](https://github.com/azmath25/mimo/actions/runs/41646251869) — success.

The final documentation-only branch-head CI must also pass after this checkpoint is committed.

## Remaining release blockers

- **No physical or real browser visual validation:** source/VM CSS assertions cannot prove actual width overflow, touch ergonomics, keyboard order, screen reader announcements, or real rendered viewport at 320/360/390px. Real Chromium/Firefox/WebKit viewport and accessibility checks remain separate acceptance gates.
- **Staging API is deliberately unconfigured:** M-FE.2 requires verified isolated staging Cloud Run origin to be code-reviewed before any browser authentication. The current feature branch does not contact production as fallback.
- **Backend M7 cloud evidence is incomplete:** actual Cloud Run/Tasks, OIDC, artifact storage, Firebase/CORS, Neon, provider spend, external action approval, and rollback remain unverified. An isolated real end-to-end browser acceptance phase must be separately authorized and bounded.
- **Not a production release decision:** M8 is still NO-GO. No frontend/main, backend/main, backend/main-backup, or Quizer modifications.

**STOP after M-FE.3.** Candidate next step is a separately approved **M-FE.4** browser-automation/viewport and accessibility audit using local fixtures first; do not conflate browser-source checks with proven live staging. No merges, deployments, production migrations or cloud mutations.
