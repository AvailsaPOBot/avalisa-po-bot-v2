# Avalisa Landing Page — Design Spec v1
> Locked spec for "Trader's Studio" direction. Approved by Mr. Oil 2026-04-26.
> Consumed by: image-gen agents (OpenClaw / Nano Banana), code agent (Codex).
> Reference workflow: Nate Herk's Claude Design tutorial (lock spec → gen assets → build → deploy).

---

## 1. Brand Identity

### Voice
Confident, sophisticated, slightly daring. Editorial — not corporate, not techbro, not robotic AI.
Chart-as-art, not chart-as-data. Outcome-led, not feature-led.

### Color Palette
| Token | Hex | Usage |
|---|---|---|
| `--bg-base` | `#0a0a0f` | Page background, deep charcoal |
| `--bg-surface` | `#14141d` | Cards, elevated surfaces |
| `--bg-elevated` | `#1c1c28` | Modals, top-level surfaces |
| `--text-primary` | `#ededed` | Body copy |
| `--text-muted` | `#8a8a93` | Secondary copy |
| `--accent-gold` | `#d4a256` | Primary CTAs, highlights, "01/02/03" numerals |
| `--accent-gold-soft` | `#a37f3e` | Hover states |
| `--accent-jade` | `#4a9b7e` | Win/positive, chart up-candles |
| `--accent-crimson` | `#c44545` | Loss/negative, chart down-candles |
| `--accent-lifetime` | `#a78bfa` | Lifetime tier badge (kept from existing) |

### Typography
- **Display (headlines):** Fraunces — variable serif with optical size, sophisticated editorial character. Google Fonts.
- **Body (paragraphs, UI):** Geist Sans — clean modern sans, more character than Inter. Vercel.
- **Mono (data, ticker):** Geist Mono — pairs with Geist Sans.

NEVER use: Inter, Roboto, Arial, Space Grotesk, Poppins, Montserrat (overused / generic).

### Motion Principles
- Smooth scroll via Lenis
- Section entrances via Framer Motion (stagger 80ms, ease "easeOut")
- Scroll-reveal for "How it works" cards (GSAP ScrollTrigger)
- Hero: slow zoom on bg image (15s loop), candlestick decorations drift up at 0.3 px/frame
- Pricing card hover: subtle lift (translateY(-4px)) + gold glow
- Reduce-motion media query respected throughout

---

## 2. Page Structure (top to bottom)

### Section 1 — HERO
- **Layout:** full-bleed dark background image, copy left-aligned at 1/3 width, CTA below subhead
- **Headline (Fraunces, 72px, regular):** Trade on autopilot.
- **Subhead (Geist Sans, 18px, muted):** Avalisa is a Chrome extension that runs your Pocket Option strategy automatically. Charles, our AI bot, watches the market while you live your life.
- **Primary CTA (gold filled button):** Start Free → routes to `/register`
- **Secondary link (gold underline, small):** Already on Pocket Option? Skip to Step 2 →
- **Background image:** see image-gen prompt #1
- **Floating decoration:** 3-5 semi-transparent candlestick SVGs drifting upward, parallax depth

### Section 2 — THE 3-STEP LADDER (heart of the funnel)
- **Eyebrow (gold mono, uppercase):** HOW IT WORKS
- **Section headline (Fraunces, 48px):** Three steps. One bot. Done.
- **Layout:** 3 horizontal cards, equal width, gap 24px. Mobile: stack vertical.
- **Card structure:** big "01" Fraunces 96px gold + headline + 2-line body + small CTA link
- **Scroll-reveal:** stagger 120ms as cards enter viewport

| # | Headline | Body | CTA |
|---|---|---|---|
| 01 | Connect Pocket Option | New here? Register a Pocket Option account through our affiliate link — Lifetime tier comes free. Already trade on PO? Skip to step 2. | Register PO → (affiliate link) |
| 02 | Install the extension | Add Avalisa to Chrome in 30 seconds. Sign up at avalisabot.vercel.app to claim your tier. | Add to Chrome → |
| 03 | Let Charles trade | Open Pocket Option, click the Avalisa button, pick a strategy, hit Start. Charles takes over. | See it in action ↓ (anchors to demo) |

### Section 3 — BOT DEMO (live-feeling mockup)
- **Headline (Fraunces, 48px):** Watch Charles work.
- **Sub (muted):** This is the actual bot panel that lives on your Pocket Option page.
- **Visual:** animated mockup of in-page panel cycling through:
  1. `Loading: 30/30` (1s)
  2. `Charles: action=CALL  regime=trending  tf=M1  rules=3` (2s)
  3. `Trade open — waiting 60s for result` (2s)
  4. `+$19.20` (jade flash, 2s)
  Then loop.
- **Three info chips (mono, gold border):** WebSocket-based · Real-time signals · No external servers

### Section 4 — CHARLES AI EXPLAINER
- **Eyebrow:** THE STRATEGY
- **Headline:** Three intensities. One AI.
- **Sub:** Charles adapts to market regime — trending or ranging — and picks the timeframe with the cleanest signal.
- **Layout:** 2-column. Left: editorial portrait (image #5). Right: 3 stacked intensity cards.

| Intensity | Pitch | Detail |
|---|---|---|
| LOW | More trades. Forex + OTC. Best for weekends. | RSI 30/70, BB k=2.0, momentum optional |
| MID *(default)* | Balanced. Forex only. | RSI 25/75, BB k=2.2, OTC filter on |
| HIGH | Selective. Strict filters. Higher conviction. | RSI 20/80, BB k=2.5, OTC filter on, conflict guard |

### Section 5 — PRICING
- **Above-pricing callout (gold accent box):** Register Pocket Option through us → Lifetime is free. We earn from PO, not from you.
- **3 tier cards:**

| Tier | Price | Trades | Tagline | CTA |
|---|---|---|---|---|
| FREE | $0 | 10 trades | Try Charles risk-free | Start Free |
| BASIC | $50 once | 100 trades | For weekend traders | Buy Basic |
| LIFETIME | $100 once | Unlimited | Most popular — gold border | Get Lifetime |

- **Below-pricing reassurance:** One-time payment. No subscription. Pay once, own it.

### Section 6 — REAL RESULTS (placeholder; show structure)
- **Headline:** Numbers don't lie.
- **Sub:** Aggregated win rates across all Avalisa users this week.
- **Three big stat blocks (Fraunces 72px gold + Geist mono caption):**
  - 61% — win rate
  - 12,847 — trades executed
  - 184 — active traders
- **Disclaimer (muted small):** Stats refresh hourly. Past performance is not a guarantee of future results.

### Section 7 — FAQ
- **Headline:** Questions, answered.
- **Layout:** clean dark accordion, 10 items.
- Q1: Is Avalisa safe to use on my real PO account? — *Yes. The extension only reads market data and clicks buy/sell on your behalf. No password, no API key, no money leaves PO.*
- Q2: What's the minimum I need to start? — *$10 USD on Pocket Option and the free Avalisa tier. Try 10 trades on demo first.*
- Q3: Do I need to know how to trade? — *No. Pick an intensity, hit Start. Charles handles entries and exits.*
- Q4: What happens if I close my browser? — *Charles stops. Re-open Pocket Option, click the Avalisa button, hit Start. Resumes instantly.*
- Q5: How does Charles decide CALL vs PUT? — *Regime detection (trending vs ranging) + RSI + Bollinger Bands + momentum confirm. Skips trades when signals conflict.*
- Q6: Can I switch between strategies? — *Yes. Charles (AI) and Martingale modes coexist. Switch any time.*
- Q7: What's the difference between Free / Basic / Lifetime? — *Free: 10 trades to test. Basic: 100 trades for $50. Lifetime: unlimited for $100. All tiers include Charles AI.*
- Q8: How do I get Lifetime free? — *Register a Pocket Option account through our affiliate link. We grant Lifetime automatically once your PO account confirms.*
- Q9: Is this gambling or trading? — *Binary options is high-risk speculation. Charles improves your odds with disciplined rules — it doesn't eliminate risk. Trade only what you can afford to lose.*
- Q10: How do refunds work? — *All sales final. We offer a free tier so you can validate Charles on your account before paying.*

### Section 8 — FINAL CTA
- **Background:** dark with single animated gold candlestick line drawing across (image #6)
- **Headline (Fraunces, 64px, centered):** Charles is waiting.
- **CTAs (centered, side by side):** Start Free (gold filled) · View Pricing (gold outline)

### FOOTER
- **Logo + tagline:** Avalisa — trade on autopilot.
- **Columns:** Product (Pricing, Login, Dashboard) · Resources (Support, Privacy, Terms) · Connect (YouTube, TikTok, Facebook, Telegram, Email)
- **Bottom strip:** © 2026 Avalisa · Built for traders who want their time back.

---

## 3. Image-Generation Prompts (for Nano Banana 2 / Gemini Image / OpenClaw)

> All prompts: cinematic, editorial, NOT robotic, NOT AI-cliché. Vogue Korea × Bloomberg Terminal × modern crypto.

### Image #1 — HERO (16:9, web optimized)
> Editorial photograph of an elegant East Asian woman in her mid-20s, seated confidently at a dark wooden desk in a luxurious studio apartment at night. She wears a sophisticated minimalist black silk slip dress or a tailored blazer with subtle gold jewelry. Soft warm tungsten key light from the left, cool city lights through the window behind. Multiple ultrawide curved monitors visible in the background showing candlestick charts in green and red, blurred bokeh. Shallow depth of field, 50mm lens, cinematic color grade with charcoal blacks, warm gold midtones, and subtle jade highlights from the screens. Vogue Korea editorial style. No text, no logos. The left third of the frame is darker / negative space to allow text overlay. 16:9 aspect ratio. 1920x1080.

### Image #2 — STEP CARD 01 (1:1)
> Stylized minimalist illustration of two abstract geometric shapes connecting via a subtle gold link or chain: one representing Pocket Option (jade green circle), one representing Avalisa (warm gold rectangle). Dark charcoal background #0a0a0f with subtle grid pattern. Editorial graphic design style, premium fintech aesthetic. Flat with subtle gradients. Square 1:1, 1024x1024.

### Image #3 — STEP CARD 02 (1:1)
> Stylized minimalist illustration of a Chrome browser frame with a glowing warm gold extension icon being added. Abstract clean lines, dark charcoal background #0a0a0f, warm gold #d4a256 accent. Subtle rim light on the icon. Editorial graphic design style. Square 1:1, 1024x1024.

### Image #4 — STEP CARD 03 (1:1)
> Editorial photograph close-up of an East Asian woman's hand holding a smartphone, screen subtly glowing with a candlestick chart UI. Warm gold key light from upper left, soft falloff. Shallow depth of field, 85mm lens. Dark out-of-focus background. No text, no specific app branding visible on the phone. Square 1:1, 1024x1024.

### Image #5 — CHARLES AI SECTION (16:9)
> Editorial photograph of the same East Asian woman from image #1, now in profile, looking thoughtfully at floating holographic candlestick chart elements that surround her. Dark cinematic lighting, warm gold and jade tones. Half editorial portrait, half subtle sci-fi — but absolutely no robotic / AI / cyberpunk visual clichés. No glowing brain icons, no neon circuits, no Matrix code. Just elegant chart elements and a thoughtful human. No text. 16:9 aspect ratio. 1920x1080.

### Image #6 — FINAL CTA BACKGROUND (16:9, animatable)
> Abstract minimalist composition: dark charcoal background #0a0a0f with a single horizontal candlestick chart line drawing itself across the frame in warm gold #d4a256. Cinematic, no people, no text. Subtle grain texture. The path of the chart should rise gently from left to right — implying upward trajectory. 16:9 aspect ratio. 1920x1080.

---

## 4. Tech Stack & Dependencies

### Already in repo
- React 19.2 + react-router-dom 7.13
- Tailwind 3.4 + PostCSS
- lucide-react (icons)

### To add (all MIT, npm install)
- `framer-motion` — section entrances, hover micro-interactions
- `lenis` — smooth scroll
- `gsap` + `@gsap/react` — ScrollTrigger for the 3-step ladder reveal
- `@fontsource/fraunces` + `geist` — fonts (self-host, no Google CDN)

### To copy-paste (no npm dep, source goes into repo)
- shadcn/ui: Accordion (FAQ), Card (pricing), Button base
- MagicUI: AnimatedBeam (optional decoration), MarqueeStats (real-results numbers)

### NOT adding
- Next.js (CRA migration cost not worth it for this iteration)
- Three.js (no true 3D needed; CSS 3D + GSAP is enough)
- Any closed-source / unverified component library

---

## 5. Build Plan (for Codex)

1. Install new deps: `framer-motion lenis gsap @gsap/react @fontsource/fraunces geist`
2. Add CSS variables to `src/index.css` per palette table above
3. Add Lenis smooth scroll wrapper in `src/App.js`
4. Replace `src/pages/Landing.jsx` with new sectioned component (one component per section, composed in Landing)
5. Drop generated images into `public/images/landing/` (filenames: `hero.jpg`, `step-01.jpg`, `step-02.jpg`, `step-03.jpg`, `charles.jpg`, `cta-bg.jpg`)
6. Hook existing routes: Step 1 CTA → external affiliate URL · Step 2 CTA → existing /register · Step 3 CTA → smooth scroll to demo section
7. Verify mobile responsive at 375px and 768px breakpoints
8. Push to GitHub → Vercel auto-deploys

### Existing routes to preserve
- `/` Landing (this redesign)
- `/login`, `/register`, `/pricing`, `/support`, `/privacy`, `/dashboard` — unchanged

---

## 6. Out of Scope (v1)
- Real trade-history stats integration (use placeholder numbers)
- Background video (per Nate's video — start with image, add video only if image hero underwhelms)
- Custom domain on Vercel (later)
- A/B testing variants (later)
- i18n (later)

---

*End of spec. Image gen fires next, then Codex builds.*
