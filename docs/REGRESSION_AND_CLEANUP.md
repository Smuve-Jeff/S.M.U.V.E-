# Regression and cleanup — October 4, 2026

## Browser regression

All 150 Chromium tests across 28 Playwright files passed in bounded, single-worker batches against the Freebuff-managed preview. No tests were skipped or assertions suppressed.

- Studio viewport checks: 66/66 (22 each: desktop landscape, portrait, short landscape).
- Studio quality sweep: 31/31 (22 phone views + 9 functional tests).
- Cinema engine room: 9/9; camera: 4/4; project persistence: 3/3.
- All other suites: 37/37, including authentication, golden path, recommendations, profile editor, home deletion, piano roll, Sets browser, voice spectrum, DJ, drum machine, strategy and Tha Spot.

Environment interruptions (502, container recycling, connection refused and command timeouts) were not counted as passes. The Studio save-status test failed once in a batch and passed on its unchanged isolated rerun; this timing flake remains worth monitoring.

## Repairs exposed by regression

- Mobile Studio's own Home control replaces the overlapping shell floating Home link; the 390px test now taps the real bottom-navigation drawer tab.
- Camera start/stop now has an accessible name. Full Chromium camera tests use software compositing in the hosted container while retaining real fake-device capture and pixel assertions. Recovery coverage uses the current Capture Deck rather than a removed sidebar button.
- Recommendation cards now reflect persisted decisions; acquisition records history, Strategy exposes dismissal/history, and mastering recommendations point to the real mastering route. The cross-surface test verifies persistence after reload.
- Tha Spot RESET clears the room as well as the remaining filters.
- Older E2E tests now use current routes, labels, responsive controls and the actual eight-pad drum bank. Protected-route tests seed authentication; the formerly conditional Studio screenshot test now asserts the workspace renders.

## Scripts audit

Removed 15 obsolete scripts:

- One-off catalog rewrites/additions: `add-focus-second-wave.cjs`, `add-focus-tier.cjs`, `add-franchise-deepfill.cjs`, `apply_tha_spot_updates.cjs`, `expand_embed_catalog.py`, `fill-saga-gaps.cjs`, `fix-tha-spot-catalog.cjs`, `merge_tha_spot_additions.cjs`, `tha-spot-catalog-cleanup.cjs`, `upgrade-catalog-tier.cjs`.
- One-off source patcher: `harden_auth_flow.py`.
- Fixed-candidate probes and redundant browser diagnostics: `probe-candidates.cjs`, `probe-new-sources.cjs`, `studio-probe.cjs`, `anomaly-probe.cjs`.

These are not called by package scripts, CI, application code or retained tooling. Historical catalog rewrites should not be rerun against the current catalog. Their history remains in Git.

Retained reusable read-only audits, catalog discovery/repair pipelines, feed synchronization, music manifest generation, Wasm/server builds, deployment helpers, database migration/backfill tooling and production QA. Production QA/deploy scripts were inspected, not executed: regression does not authorize altering production data.

## Final checks

- Frontend and server TypeScript checks passed.
- Full Jest regression: 186 suites / 2,761 tests passed across four shards (including two new recommendation regression tests).
- Angular development AOT build passed.
- Static catalog audit passed: zero errors, two existing empty-rail warnings (`rail-returning-runs`, `rail-producer-crossover`).
- Retained JS/TS-runtime script syntax, shell syntax and Python AST parsing passed.
- `git diff --check` passed.
