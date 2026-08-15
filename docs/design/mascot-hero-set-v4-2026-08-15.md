# Avalisa mascot — hero image set (v4)

v3 (short gold dress) was approved. Board now wants the mascot dressed to attract a male
audience, and wants a proper hero-quality set rather than a single portrait.

## Identity lock — unchanged, non-negotiable
Reference sheet:
`/Volumes/Disk/2-Projects/Avalisa PO Bot/Promo Assets/Avalisa Mascot/Avalisa Character Reference Sheet.png`
East-Asian features, warm brown eyes, LONG wavy honey-blonde hair past the shoulders,
soft coral-pink lips, adult woman 24-28 per the sheet, slim / petite.
Generate with the OpenAI image model (gpt-image-1) passing the sheet as an image input at
high input fidelity — the same method as v3, which held the likeness. Do NOT use ComfyUI.

## Look
Glamorous and alluring — fitted, short, eye-catching, the kind of styling used in
fragrance, champagne and luxury-watch campaigns. Gold/champagne palette to match the
brand. Confident posture, direct eye contact, elegant heels.

Hard limits, regardless of styling: an adult woman, fully clothed, no nudity, no
underwear-as-outfit, nothing explicit or pornographic, no see-through fabric, no
wardrobe malfunction. It has to be usable as the public face of a finance product.
Put those in the negative prompt along with: minor, child, teenager, extra fingers,
deformed hands, bad anatomy, watermark, text, logo, blurry, lowres.

## Deliverables (3 assets)
1. `avalisa-girl-hero.png` — LANDSCAPE, 1536x1024. Full body, subject on the RIGHT,
   generous clean negative space on the LEFT for hero copy. Dark navy-black studio
   background (#0a0a0f to #0d1b2e), warm gold rim light.
2. `avalisa-girl-hero-portrait.png` — PORTRAIT, 1024x1536. Same character, same outfit,
   same lighting, composed for a narrow phone screen — subject centred, full body,
   nothing important near the edges.
3. `avalisa-girl-cutout.png` — the hero subject on a TRANSPARENT background (RGBA),
   for compositing beside product screenshots.

Assets 1 and 2 must look like the same shoot: same outfit, same hair, same lighting.
The site will show the landscape one on desktop and the portrait one on phones, so they
must read as one image, not two different pictures.

Generate 3 candidates for the hero and keep the best.

## Wiring
Add to `dashboard/src/lib/brandAssets.js`:
`AVALISA_HERO_IMAGE`, `AVALISA_HERO_PORTRAIT_IMAGE`, `AVALISA_CUTOUT_IMAGE`.
Do NOT change existing constants and do NOT edit any page — I am reworking the hero
layout separately and will wire these in myself. Just produce the assets and export the
constants.

`npm run build` must pass. Do NOT push, do NOT deploy.
Report the prompt used, the dimensions of each asset, and confirm the face matches the sheet.
