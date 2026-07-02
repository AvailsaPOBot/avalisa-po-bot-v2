# Avalisa PO Bot — Component Versions & Changelog

> One file, one truth for "what version is running where."
> Update this file in the SAME commit as any version bump. Newest entries on top.
> Rule: every behavior change = version bump + entry here + git tag when significant.

## Current versions (updated 2026-07-02)

| Component | Version | Where it runs | Source of truth |
|---|---|---|---|
| Extension (CWS public) | **2.3.19** | Users' Chrome via Web Store | CWS listing `mkcpdbnlofljijfjiglkodddicpgdapa` |
| Extension (local/dev) | **2.4.8** | Mr. Oil's Chrome (unpacked from this repo `extension/`) | `extension/manifest.json` |
| Backend | main @ `d86b591` | Render (auto-deploy from GitHub `main`) | `git log origin/main` |
| Dashboard/site | main @ `d86b591` | Vercel (auto-deploy from GitHub `main`) | `git log origin/main` |
| Webapp Bot (mobile proof) | v1.02 | Mac WKWebView shell / mobile webview | `mobile-proof/` |

⚠️ **The repo `extension/` folder is LIVE** — Mr. Oil's Chrome loads it unpacked.
Never leave it broken or mid-refactor. Smoke test (`node test/extension-settings-smoke.test.js`)
must pass before any commit that touches it. The AGE dispatcher enforces this (fail-closed revert).

## Extension changelog

### 2.4.8 — 2026-07-02 (tag `v2.4.8-ladder-fix`) — ladder-stability rework [Board-approved]
- **Never abandon a live martingale ladder.** Root-cause fix for "martingale fails after a while"
  on local 2.4.x builds (published 2.3.19 was unaffected):
  - `getBalance()`: dedicated selectors first (visibility-guarded), free-text parse fallback only.
  - Stake-above-balance pause now requires a **double-confirmed** balance (two agreeing reads).
  - Amount-control recovery allows **2** self-heal reloads (was 1), session persists through.
  - Unexpected cycle errors: retry ×2 with backoff → one self-heal reload → only then stop
    (was: stop on first strike).
  - **Every safety stop preserves the ladder** (`avalisaPausedLadder`); next Start resumes the
    saved stake/step if martingale settings unchanged (30-min window). Manual Stop clears it.
- Re-exposed `tradesCount` in `avDebug()` (the fail-closed publish gate live-test waits on it).
- Soak harness added: `~/avalisa-age/extension-soak-test.mjs` (multi-hour demo run, JSONL log).

### 2.4.7 — 2026-07-02 (AGE job-4)
- Centralized all PO DOM selectors into `PO_SELECTORS` (`config.js`). Refactor only.

### 2.4.1 → 2.4.6 — 2026-06-22…25 (AGE job-4 + live-test session)
- 2.4.1: catch-all safe-stop on unexpected trade-cycle errors (superseded by 2.4.8 retry logic).
- 2.4.2: version proof badge (`av-build-badge`) for live QA.
- 2.4.3: hide stale "limit reached" warning.
- 2.4.4: persist runtime session (ladder survives PO reloads).
- 2.4.5: pause impossible recovery loops (superseded by 2.4.8 double-confirm + resume).
- 2.4.6: prefer visible PO balance text (superseded by 2.4.8 selectors-first + visibility guard).

### 2.4.0 — 2026-06-21
- Version reconcile: repo source == shipped 2.3.19 content + layout-health guards.

(Older history: `Oil's Vault/2-Projects/21-Avalisa PO Bot/214-research/21421-status-history-through-2026-05-15.md`)
