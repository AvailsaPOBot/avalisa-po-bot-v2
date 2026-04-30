# Codex Build Prompt — Avalisa Landing v1

## Context
You are working in `/Users/thanadej/AvalisaPOBot-V2-Audit/dashboard` on the Mac Mini M4.
This is a Create React App (CRA) project, React 19.2 + Tailwind 3.4 + react-router-dom 7.13.
Repo: `AvailsaPOBot/avalisa-po-bot-v2`, branch `main`, deploys to Vercel automatically on push.

The full design spec lives at `dashboard/design-spec/landing-v1.md`. Read it fully before writing code.
The locked hero direction is documented at `dashboard/design-spec/locked-hero.md`.

## Your task
Replace `src/pages/Landing.jsx` with a new sectioned implementation following the spec.

## Critical rules
1. **Do not break existing routes.** `/login`, `/register`, `/pricing`, `/support`, `/privacy`, `/dashboard` must keep working unchanged.
2. **Preserve `Navbar` and `FloatingChat` components** — they wrap Landing currently. Don't remove them, just replace Landing's own content.
3. **CTA wiring (verify with the user before guessing):**
   - Hero "Start Free" → `/register` (existing route)
   - Hero "Already on PO? Skip to Step 2" → smooth-scroll anchor to Step 02 card
   - Step 01 CTA "Register PO" → external affiliate URL (read from spec, currently in user memory: `https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50`)
   - Step 02 CTA "Add to Chrome" → approved Chrome Web Store listing: `https://chromewebstore.google.com/detail/avalisa-po-bot/mkcpdbnlofljijfjiglkodddicpgdapa`
   - Step 03 CTA "See it in action" → smooth-scroll anchor to bot demo section (#demo)
   - Pricing CTAs → `/register` (Free), `/pricing#basic` (Basic), `/pricing#pro` (Pro)
4. **Mobile breakpoints:** must look correct at 375px, 768px, 1280px, 1920px. Mobile collapses 3-step ladder to vertical stack.
5. **Dark mode is default.** No light theme. Match the palette CSS variables in spec.
6. **Performance:** lazy-load images below the fold via `loading="lazy"`. Hero image gets `loading="eager"` and `fetchpriority="high"`.
7. **Accessibility:** semantic HTML5, alt text on every image, `aria-label` on icon-only buttons, respect `prefers-reduced-motion`.

## Dependencies to install
```bash
cd ~/AvalisaPOBot-V2-Audit/dashboard
npm install framer-motion lenis gsap @gsap/react @fontsource/fraunces geist
```

## Image asset paths (already generated, do not regenerate)
| Image | Path |
|---|---|
| Hero (Variant B) | `/images/landing/hero.jpg` |
| Step 01 Connect PO | `/images/landing/step-01.jpg` |
| Step 02 Install Extension | `/images/landing/step-02.jpg` |
| Step 03 Hand+Phone | `/images/landing/step-03.jpg` |
| Avalisa AI section | `/images/landing/avalisa-ai.jpg` |
| Final CTA background | `/images/landing/cta-bg.jpg` |

(In React, reference as `/images/landing/hero.jpg` — CRA serves from `public/`.)

## File structure to create
```
src/pages/Landing.jsx                   # main composition, imports all sections
src/pages/landing/Hero.jsx
src/pages/landing/HowItWorks.jsx        # 3-step ladder
src/pages/landing/BotDemo.jsx
src/pages/landing/AvalisaAI.jsx
src/pages/landing/PricingTeaser.jsx     # NOT replacing /pricing page; just a teaser
src/pages/landing/RealResults.jsx
src/pages/landing/FAQ.jsx
src/pages/landing/FinalCTA.jsx
src/pages/landing/Footer.jsx
src/lib/useLenis.js                     # smooth-scroll hook
src/styles/landing.css                  # CSS variables + global landing styles
```

`Landing.jsx` is the orchestrator — it imports the sections, wraps them in `<main>`, and uses `useLenis()`.

## Tailwind config
Update `tailwind.config.js` to extend with:
- Colors matching the palette table (bg-base, bg-surface, accent-gold, accent-jade, etc.)
- Font families: `display: ['Fraunces', 'serif']`, `sans: ['Geist', 'sans-serif']`, `mono: ['Geist Mono', 'monospace']`

## Animation implementation notes
- Use `framer-motion` for section entrances: `initial={{opacity:0, y:30}} whileInView={{opacity:1, y:0}} viewport={{once:true, margin:"-100px"}}`
- Stagger children with `staggerChildren: 0.1`
- Use `gsap` + `ScrollTrigger` ONLY for the 3-step ladder (the cards reveal as the user scrolls past). Everything else uses framer-motion.
- For the bot demo cycling status (Loading → Avalisa AI action → Trade open → Result), use `setInterval` with React state, NOT framer-motion (simpler, deterministic).
- Wrap the entire app in Lenis on mount for smooth scrolling. Lenis instance lives in `useLenis` hook.

## Copy (verbatim from spec)
- Hero H1: **Trade on autopilot.**
- Hero sub: Avalisa is a Chrome extension that runs your Pocket Option strategy automatically. Avalisa AI watches the market while you live your life.
- Hero primary CTA: **Start Free**
- Hero secondary: **Already on Pocket Option? Skip to Step 2 →**
- HowItWorks H2: **Three steps. One bot. Done.**
- CTA section H2: **Avalisa is waiting.**
- All other copy lives in the spec — pull verbatim.

## Quality gates before commit
1. `npm run build` succeeds with no errors and no new warnings (existing warnings OK).
2. `npm start` runs and renders without console errors.
3. Open http://localhost:3000 and visually verify each section.
4. Test at 375px width (Chrome devtools mobile mode).
5. Run `prefers-reduced-motion: reduce` and verify animations disable.

## Commit instructions
After QA passes:
```
git add dashboard/
git commit -m "feat(landing): full redesign — Trader's Studio direction (v1)

- Replaced Landing.jsx with sectioned implementation per design-spec/landing-v1.md
- New sections: Hero, HowItWorks, BotDemo, AvalisaAI, PricingTeaser, RealResults, FAQ, FinalCTA
- Added framer-motion + lenis + gsap for smooth scroll & section entrances
- Added Fraunces (display) + Geist (body/mono) self-hosted fonts
- 6 generated images at public/images/landing/ (hero + 3 steps + avalisa-ai + cta-bg)
- Locked dark theme, palette in src/styles/landing.css

Hero direction: Variant B (Contemplative Profile) — see design-spec/locked-hero.md

Approved by Mr. Oil 2026-04-26."
git push origin main
```

Vercel will auto-deploy on push. Confirm deploy URL works at https://avalisabot.vercel.app

## What NOT to do
- Don't migrate to Next.js
- Don't add Three.js (CSS 3D + GSAP is enough for v1)
- Don't add any closed-source / unverified component library
- Don't change `/pricing` page — only create a teaser section on landing
- Don't change `Navbar` or `FloatingChat` components
- Don't regenerate images — they exist
- Don't modify existing route handlers in `App.js` — only add new sections
- Don't bump dashboard version (the dashboard isn't versioned the way the extension is)

## When stuck
- If a CTA destination is unclear, leave a TODO comment and ask the user.
- If a copy decision needs a call (e.g. tone for the FAQ), default to the spec; if the spec is silent, ask.
- If a dependency conflicts with React 19, downgrade the dep (don't downgrade React).

End of brief. Begin.
