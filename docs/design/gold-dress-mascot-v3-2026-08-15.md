# Avalisa gold mascot — v3 (short dress)

v2 nailed the character (correct face, long wavy honey-blonde hair, coral lips,
East-Asian features, full-length, dark navy background, left-side negative space).
KEEP ALL OF THAT. Board's change: the gown should be a SHORT dress, and the overall
look glamorous and alluring rather than formal-conservative.

## Identity lock — unchanged, non-negotiable
Same reference sheet:
`/Volumes/Disk/2-Projects/Avalisa PO Bot/Promo Assets/Avalisa Mascot/Avalisa Character Reference Sheet.png`
East-Asian features, warm brown eyes, LONG wavy honey-blonde hair past the shoulders,
soft coral-pink lips, adult woman aged 24-28 per the sheet, slim / petite.
Pass the sheet as an image input with high input fidelity, same as v2.

## The change
- SHORT gold dress — fitted cocktail/mini length, hemline above the knee.
- Gold satin/silk with a metallic sheen, same luxury fabric quality as v2.
- Glamorous and alluring: confident posture, strong eye contact with camera, elegant
  heels, a more fashion-forward and eye-catching silhouette than the v2 gown.
- Still a premium brand image, not explicit: no nudity, no underwear, nothing
  pornographic or graphic. Think a high-end fashion / fragrance / champagne campaign.
- Keep: full body in frame, dark navy-black studio background (#0a0a0f to #0d1b2e),
  warm gold rim light, photoreal quality, clean negative space on the LEFT for hero copy,
  subject on the right.

Negative prompt should still exclude: nude, naked, topless, underwear, explicit,
pornographic, see-through/sheer fabric, wardrobe malfunction, minor/child/teenager,
extra fingers, deformed hands, bad anatomy, watermark, text, blurry, lowres.

## Deliverables
- 3 variants; keep the best.
- Overwrite `dashboard/public/images/landing/generated/avalisa-girl-gold.png`
  and regenerate `avalisa-girl-gold-cutout.png` (transparent RGBA) from the winner.
- Wiring is already correct from v2 — `AVALISA_CHARACTER_IMAGE` points at the gold art
  and `AVALISA_MASCOT_IMAGE` stays on the product composite. Do NOT change the wiring.
- `npm run build` + tests must pass. Do NOT push or deploy.
- Report the prompt used and confirm the face still matches the reference sheet.
