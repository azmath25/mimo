# REST orchestration frontend

Adds approved API Request blocks and administrator REST connection management using the existing backend connector API. Outputs compose through the existing workflow graph and published APIs. Explicit metadata loading and read testing avoid accidental provider requests; local preview performs no external action. Unknown external charges and required write approvals are visible.

The branch retains all work from feature/m-cost-frontend-20261105 (c417aa7f783539670cf4d7f737d2346aabd2d291). Existing GitHub blocks remain compatible. No Quizer changes.

Validation: 146 Node tests and 19 local Chromium tests (320–1280px). The Studio source freeze was intentionally updated for the authorized API controls; original layout assertions remain enforced.

Release backend migration 0024 and matching Studio/execution/worker services first, verify REST capability and existing M-COST endpoints, then publish this frontend. REST execution is disabled by default on the backend. Capture the current Pages commit before release; restore that commit and disable backend REST admission to roll back. See backend docs/M_API_IMPLEMENTATION_20261105.md for the full release gate and limitations. Hosted CI and production deployment remain separate gates from a successful feature push.
