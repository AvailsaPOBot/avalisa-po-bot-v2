# Avalisa gold-dress mascot — attempt 2 (brief for Codex)

Attempt 1 used ComfyUI and FAILED review. Do not repeat it. What went wrong:
- Wrong character: it produced a European woman with a shoulder-length bob and red lips.
- Wrong framing: a waist-up crop, despite the prompt asking for full-length.

## Use the official character reference sheet — this is the identity lock
`/Volumes/Disk/2-Projects/Avalisa PO Bot/Promo Assets/Avalisa Mascot/Avalisa Character Reference Sheet.png`
Supporting refs in the same folder: `avalisa-ref-accurate-hero-2026-06-10.jpg`,
`avalisa-mascot-ref1-2026-06-10.jpg`, `avalisa-mascot-reference-selected-2026-05-01.png`,
and the notes in `avalisa-mascot-portfolio-2026-05-01.md`.

Avalisa, per that sheet — match ALL of it:
- East-Asian features, warm brown eyes, soft natural glam
- LONG wavy honey-blonde hair, well past the shoulders (NOT a bob)
- Age 24-28, height 164 cm, slim / petite
- Soft coral-pink lips (NOT red)
- Personality: calm, confident, refined. Concept: **luxury fintech mascot**

## Generation method
Use the **OpenAI image API (gpt-image-1)** with the reference sheet passed as an image
input so the identity carries over. Do NOT use ComfyUI — it could not hold the likeness.
Codex already has OpenAI credentials available; use them.

## What to produce
Elegant floor-length **gold** evening gown, satin/silk with a soft metallic sheen,
modest neckline, fully covered, tailored, no slit. Full-length — head to feet, not a
crop. Dark navy/black studio background matching the site (#0a0a0f to #0d1b2e), warm
gold rim light, high-fashion editorial lighting, photoreal. Composition must leave clean
negative space on ONE side for hero copy. Tasteful and premium — luxury brand, never
suggestive.

Produce 3 variants. Also export the best one as a **transparent-background cutout PNG**
(`avalisa-girl-gold-cutout.png`) so it can be composited next to the product screens.

## Wiring — read this carefully, attempt 1 broke it
`AVALISA_MASCOT_IMAGE` currently points at `hero-product-composite.png`, which is the
hero's **product composite** (trading screens + girl). Attempt 1 repointed that constant
at a bare portrait, which stripped the trading screens out of the landing hero and made
the alt text ("on desktop and mobile Pocket Option screens") wrong.

So: do NOT repoint `AVALISA_MASCOT_IMAGE`. Instead add a separate
`AVALISA_CHARACTER_IMAGE` constant for the new gold character art, and use it only where
a character portrait belongs — the auth-page side visuals (Login, Register,
ForgotPassword, ResetPassword). Leave the landing hero and Pricing on the existing
product composite. Update alt text for anything you change.

## Verification
- `cd dashboard && CI=true npx react-scripts test --watchAll=false` and `npm run build` pass.
- Do NOT git push, do NOT deploy.
- Report: the exact prompt, the API/model used, how many variants, file sizes and
  dimensions, and confirm the face matches the reference sheet (hair length, ethnicity,
  lip colour) — if it does not, say so rather than shipping it.
