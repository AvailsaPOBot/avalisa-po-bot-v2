# Avalisa PO Bot — Component Versions & Changelog

> One file, one truth for "what version is running where."
> Update this file in the SAME commit as any version bump. Newest entries on top.
> Rule: every behavior change = version bump + entry here + git tag when significant.

## Current versions (updated 2026-08-17)

| Component | Version | Where it runs | Source of truth |
|---|---|---|---|
| Extension (CWS public) | **2.3.19** | Users' Chrome via Web Store | CWS listing `mkcpdbnlofljijfjiglkodddicpgdapa` |
| Extension (local/dev) | **2.4.9** | Mr. Oil's Chrome (unpacked from this repo `extension/`) | `extension/manifest.json` |
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

### 2.4.9 — 2026-08-17 — Avalisa AI could never trade at Mid/High + credential leak [Board-approved]

Found by driving the **published 2.3.19** build live on the PO demo account. Martingale passed
end-to-end (ladder, reset-on-win, alternating direction, 2-step recovery, payout auto-switch all
correct). Avalisa AI did not: at Mid it scanned 7 favourites over ~2 minutes and placed **zero**
trades, every scan reporting `loading_13_20`.

**Root cause — the candle gate was set above what Pocket Option can supply.**
Measured directly off the socket: every history frame carries a fixed **~1300-1400 raw ticks
(~11 minutes)**, so usable candles = span ÷ period, and asking for a longer window does not work:

| period | ticks | span | candles |
|---|---|---|---|
| 30s | 1369 | 666s | **22** |
| 60s | 1299 | 633s | **10** |
| 300s | 1393 | 678s | **2** |

Scanning ran at the 60s expiry period, yielding ~10-14 candles against gates of mid **20** and
high **30** — unsatisfiable. High was unreachable at *any* period the engine supports. Mid is the
default intensity, so for most users the paid Avalisa AI feature silently did nothing forever.
Low (12) only worked by luck and still failed on seeds that came back at 10.

Fixes:
- `AI_ANALYSIS_PERIOD_SEC = 30`. The whole AI data path (`ensureAvalisaDataForCurrentPair`,
  `prefillCandleHistory`, `watchPOSelectionForAvalisa`) now warms and reads **30s** candles
  instead of whatever the expiry happened to be. The expiry a signal picks is unchanged and is
  still applied at trade time.
- `REQUIRED_CANDLES_BY_INTENSITY` 12/20/30 → **12/16/20** — all reachable from a 30s seed, all at
  or above the 15 closes RSI-14 needs. Intensity strictness is unchanged and still comes from
  `signalEngine.js` (minConfidence 35/68/95, rulesRequired, requireCandleConfirm, skipOTC); the
  candle count was only ever meant to be a data-sufficiency floor.
- **`avalisaRequestHistory` never worked.** Verified live: PO ignores `loadHistoryPeriod`
  completely, at every index — it returns nothing. The bot only ever received candles as a side
  effect of `changeSymbol` when the scanner clicked a pair. It now sends `changeSymbol`, which is
  the verb PO answers and which lets us name the period.
- **History was filed under the wrong period.** The seed handler hardcoded
  `histPeriod = getCurrentPeriodSeconds()` (the UI expiry) and threw away `parsed.period`, on the
  belief that the field was PO's transport granularity. It is not — verified live, `parsed.period`
  is exactly the period named in `changeSymbol` (confirmed at 30/60/300). So a requested 30s seed
  was re-bucketed as 60s, collapsing ~24 candles back down to ~14 and defeating the pin above.
  Now bucketed by the declared period, falling back to the expiry only if PO omits the field.
  (Caught by the readiness test below, not by inspection.)
- Scan log carries `asset`/`period` on the not-ready path — it printed `pair=undefined` on exactly
  the failures you need to read.
- Per-frame `HISTORY binary received` / raw-payload dumps moved behind `debugLog`; the one-line
  `HISTORY seeded N candles` summary stays visible.

**Credential handling (security):**
- `#av-password` kept its value in **po.trade's own DOM** indefinitely after login, so PO's page
  scripts — or any other extension — could read the Avalisa account password with one
  `getElementById`. Confirmed by reading it from the page's main world. `handleLogin` now consumes
  and wipes the field on read.
- `diagnosePOInterface()` ran on **every Start** and logged every input's `value`, printing the
  password in clear text (and a Google OAuth authorization code from a PO field). It no longer
  logs values at all — password inputs are `<redacted>`, others report length only — and the whole
  dump is now behind the debug flag.
- `WS EVENT` / `Socket.IO binary placeholder` / `WS raw msg` / close-event traces moved behind
  `debugLog` (`localStorage.avalisaDebugLogs = '1'`). These fired on every socket frame of a live
  trading page.
- Login inputs marked `autocomplete="off"` / `"new-password"`. Verified after the wipe landed:
  Chrome's own password manager refills the credential into the page on every load, re-creating
  the exposure. This reduces it but is **not** a complete defence — Chrome may override the hint.
  **Open item for the Board:** the only real fix is moving login out of po.trade's DOM into the
  extension popup, which has its own origin. Tracked in `212-status` Known Gaps.

**Signal engine v3 — intensity now means one thing (Board-directed 2026-08-17):**
`signalEngine.js` rewritten. Intensity used to move the RSI bands, Bollinger width, pullback
zone, regime and volatility thresholds, the confidence floor AND an OTC ban all at once, so
"stricter" was several hidden things and per-rule verdicts were not comparable between levels.
Now the bands are **identical at every intensity** and the only dial is how many of four rules
must agree: **Low 2, Mid 3, High 4**.
- **High no longer skips OTC.** It set `skipOTC: true`, and since most of PO's always-on
  catalogue is OTC, High refused nearly everything even when its signals were good. The
  `otc_filter` skip reason and its panel message are gone.
- Rules are now explicit, named and per-direction, four in each regime:
  trending → `trend`, `pullback`, `rsi_zone`, `confirm`;
  ranging → `rsi_extreme`, `bb_break`, `momentum`, `confirm`.
- `confidence` is a real proportion (`matched / 4`). It used to be
  `(matched / required) * minConfidence`, which at the point it was tested could never fall
  below `minConfidence` — so the `low_confidence` branch it guarded was **unreachable dead code**.
  Removed along with `minConfidence`.
- `no_signal` → `not_enough_rules`, and that reason no longer counts toward the no-progress
  cooldown: looking and not being convinced is a normal outcome, not a stall.

**Two defects found during the live run (2026-08-17) — both PRE-EXISTING, not 2.4.9 regressions:**

1. **Martingale could not change the Pocket Option expiry, and looped forever without trading.**
   Reproduced live: panel set to S30 while PO was on M1 → `setTimeframe: could not find option
   for S30`, status oscillating CALL/PUT every ~8s, balance frozen, zero trades. Cause: PO renders
   the quick-expiry buttons as **`+S30` / `+M1`** when the panel is in "add duration" mode, and all
   three matching passes in `setTimeframe()` used strict equality against `S30`. Nothing ever
   matched. The bot only worked when PO's expiry already happened to equal the panel's — which is
   why earlier testing missed it. `chooseAvailableTimeframeFallback()` had the same blind spot, so
   the fallback could not rescue it either. Both now normalise (`^[+-\s]+` stripped, upper-cased).
   Verified live after the fix: `setTimeframe: clicked grid item S30` → trade opens → $1 loss →
   $2 win +1.84, ladder reset. This affects the published 2.3.19 identically.

2. **A favourite could be evaluated against the previous pair's candles.** Measured 1 scan in 12:
   `pair=AEDCNY_otc favorite=Bitcoin OTC` — the pair switch had not completed inside the 7s window,
   so `ensureAvalisaDataForCurrentPair()` returned false, the caller ignored the return value, and
   `evaluateAvalisaCurrentPair()` read whatever was still buffered. A non-SKIP verdict there would
   have traded the newly-selected pair on another pair's indicators. The scan loop now checks the
   return value AND that `state.activePair` matches the pair actually on screen, skipping with an
   explicit "data not ready" line instead of evaluating stale data.

**Renamed "Avalisa AI" → "Avalisa Bot (Board-directed 2026-08-17):** the strategy is a fixed
four-rule checker evaluated locally — no model, no live analysis, no network call. Calling it AI
oversold it, and now that the panel shows the actual rule checklist the honest name matches what
the user sees. Renamed across the extension UI, the live dashboard (`dashboard/src`), the
public pricing/landing copy, the support-bot system prompt (`backend/src/routes/support.js`) and
the Webapp Bot (`mobile-proof/`).

⚠️ **The stored value is still `strategy: 'ai'` — deliberately.** It sits in every existing
user's `chrome.storage.local` and is sent to the backend with each trade; the live CWS 2.3.19
build talks to the same backend. Renaming the wire value would be a migration that resets saved
settings and breaks the published build, for no user-visible gain. Same reasoning for the
`/api/ai/*` routes and the `aiTradesAllowance` / `aiTradesUsed` license fields. Only labels moved.
Guarded by a naming assertion in `test/extension-ai-candles-and-secrets.test.js`, which checks the
option is labelled "Avalisa Bot" while `value="ai"` is preserved, and that no user-visible string
says "AI".

NOT renamed: `dashboard/public/concepts/` and `dashboard/design-spec/` (archived concept mockups
and design history, publicly reachable but not the live product pages) — Board decision pending.

**Live rule readout in the panel (Board-directed):** a new signal box under Status shows the
pair, regime, leading direction, an `N/M rules` score and a ticked checklist of exactly which
rules are met, plus a `checked Ns ago` heartbeat that turns red past 90s. Without it a scan that
is working but unconvinced looked identical to a frozen panel. Hidden outside Avalisa AI mode.
The SKIP status line now also reports `2/4 rules (mid)` instead of a bare reason.

**Sign-in moved to the toolbar popup (Board-approved, CWS-compliant):** the on-page panel no
longer contains any credential field — `#av-email` / `#av-password` and `handleLogin` are gone
from the content script, replaced by a note pointing at the toolbar icon. `popup.html` /
`popup.js` now own the login request; the content script learns about the session through a
`chrome.storage.onChanged` listener and only ever sees the JWT. Checked against Chrome Web Store
program policy first: nothing prohibits authentication in a popup, and the policy requirement to
"keep authentication information secure" argues for the move — a password in a third-party page's
DOM was the riskier design. Also fixes the autofill re-exposure noted below, since Chrome's
password manager has no PO-origin field left to refill.

Remaining verbose tracing (`FETCH`, `XHR`, `WS SEND`, per-tick `WS_TICK`/`TICK ingest`) moved
behind `debugLog` as well.

Tests:
- `test/extension-ai-candles-and-secrets.test.js` — static guard: fails if a candle gate is set
  above a real PO seed, if the analysis period is unpinned, if `loadHistoryPeriod` returns as the
  history verb, if the password is logged or left in the DOM, or if socket tracing is un-gated.
- `test/extension-ai-readiness.test.js` — integration proof: replays a **real** PO history frame
  (`test/fixtures/po-history-30s.json`, AUDCAD_otc @30s, 1558 ticks/750s, captured live
  2026-08-17) through the extension's own ingest path and asserts every intensity reaches a real
  decision instead of `loading_N_M`. On the fixed build: 26 candles → low `SKIP/conflicting_signals`,
  mid **`PUT/ok`**, high `SKIP/otc_filter`. On 2.4.8 mid and high stall forever.
- `test/extension-signal-intensity.test.js` — proves Low/Mid/High = 2/3/4 rules, that a 4-of-4
  **OTC** setup now fires at High, that a 2-of-4 setup fires only at Low, that every verdict
  carries a labelled checklist, and that confidence is a true proportion.
- `test/extension-popup-auth.test.js` — drives the real `popup.html` + `popup.js` against a
  stubbed backend: a successful login stores the JWT and clears the password box, a rejected one
  stores nothing and keeps the user's typing.
- `test/extension-ai-readiness.test.js` also asserts the panel readout renders four rules, ticks
  exactly the matched ones, shows an `N/M rules` score and a `checked …` heartbeat, and hides
  itself outside AI mode.
- `test/extension-settings-smoke.test.js` now reads the expected build badge from the manifest
  instead of a hardcoded `v2.4.8`, which turned every version bump into a fail-closed smoke failure.

⚠️ **Browser-level smoke was NOT possible from the command line.** Chrome 151 no longer honours
`--load-extension` (tried headless and windowed, with and without `--disable-extensions-except`);
the extension never loaded, so nothing here has run inside a real browser. All 9 tests are jsdom
against the real extension sources. Loading it once via `chrome://extensions` → Developer mode →
**Load unpacked** is required before any CWS publish.

Rollback tag `pre-ai-candle-fix-2026-08-17`.

NOT yet verified: a live Mid/High run placing trades (see vault log — the fixed build has not been
loaded into a browser; the profile used for testing runs the CWS 2.3.19 build).

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
