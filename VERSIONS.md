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
| Webapp Bot (mobile proof) | v1.5-expiry-confirmed | Mac WKWebView shell / mobile webview | `mobile-proof/` |

⚠️ **The repo `extension/` folder is LIVE** — Mr. Oil's Chrome loads it unpacked.
Never leave it broken or mid-refactor. Smoke test (`node test/extension-settings-smoke.test.js`)
must pass before any commit that touches it. The AGE dispatcher enforces this (fail-closed revert).

## Webapp Bot (mobile proof) changelog

### 1.5-expiry-confirmed — 2026-08-15 — the bot now actually sets the PO expiry [Board-approved]
Reported by the Board: panel set to 30s, but the bot never switched Pocket Option's expiry
(PO was left on 3m) and instead fired a trade roughly every 30s, so martingale stepped without
knowing whether the previous trade had won or lost.

Root cause — three compounding defects in `mobile-proof/ios/AvalisaMobileProof/ProofRuntime.js`:
1. `settings.timeframe` was never applied to PO. The webapp runtime only ever *read* the expiry
   (`inferDuration`); `setTimeframe()` existed in the Chrome extension (`extension/poDom.js`) but
   was never ported to the webapp.
2. `durationSeconds()` parsed only `HH:MM:SS`, so any other rendering silently fell back to the
   panel timeframe (30s).
3. `classifyResult()` allowed a `loss` verdict after 10s. A still-open trade looks exactly like a
   loss (stake gone, no payout), so an open 3m trade was booked as a loss and the ladder doubled.

Fixes:
- New `applyTimeframe(tf)`: switches PO's expiry and **confirms it by reading the field back**
  after the picker closes. Runs **before** the amount is set (PO re-renders the panel on expiry
  change). Verified live against m.po.trade: `.block--expiration-inputs .value__val` opens the
  `.dops__timeframes-item` grid (S3/S15/S30/M1/M3/M5) — same markup as desktop PO.
- **Fail closed**: if the requested expiry cannot be set and confirmed, the bot stops with a
  reason instead of trading on an unknown expiry. Applies to demo and real alike.
- Reads never come from inside the open picker (its own option list parses as a duration and
  would falsely "confirm" any target).
- `parseDurationToSeconds()` understands `00:03:00`, `3:00`, `3 min`, `30 sec`, `M3`, `S30`.
- Result resolution waits for the **confirmed** expiry, then polls to settlement (+20s grace);
  `loss` is impossible before the expiry has elapsed. 3 unreadable results in a row stops the bot.
- AI mode applies the AI-suggested timeframe, matching extension behaviour.
- Layout is no longer "ready" unless the expiry field is readable — PO's deposit modal was
  satisfying the amount/CALL/PUT checks on its own.

QC: 72 assertions in a jsdom harness (parser table, both PO layouts, fail-closed paths,
expiry→amount→trade ordering, demo *and* real account paths, the reported regression).
Live on the PO demo account: S30→M1→M5→S30→M3→S30 all applied and confirmed, amount preserved
at $2 across switches, picker closed each time.
NOT yet verified live: a full Start→trade→result cycle — the test account is FREE with 0/10
trades left, so the licence gate blocks placement. Needs trade allowance on the test account.

Mac shell (`mobile-proof/mac/AvalisaMobileProofMac.swift`) gained QC-only, env-gated probes
(`AVALISA_QC_TIMEFRAME`, `AVALISA_QC_DUMP`, `AVALISA_QC_SCRIPT`). Inert unless the env var is set.
`AVALISA_QC_SCRIPT` runs an arbitrary JS file against the page — dev tool; decide before this
shell ever ships to users.

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
