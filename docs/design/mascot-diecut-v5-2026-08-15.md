# Avalisa mascot — TRUE die-cut (v5)

The v4 hero shipped as a hard-edged rectangle sitting on the page. It reads as a stock
photo pasted in, not as design. The Board rejected it. We need a real die-cut so she can
overlap the copy and the product screenshot.

The v4 "cutout" produced by keying the background out was broken — missing hair chunks, a
slice out of the calf, blocky edges. Do NOT key a background out again.

## Do this instead
Generate the image with a genuinely transparent background at source: gpt-image-1
supports a transparent background option (`background: "transparent"`, format png).
Use it. That gives a real alpha channel with clean hair edges instead of a matte.

## Identity lock — unchanged
`/Volumes/Disk/2-Projects/Avalisa PO Bot/Promo Assets/Avalisa Mascot/Avalisa Character Reference Sheet.png`
passed as an image input at high input fidelity. East-Asian features, warm brown eyes,
LONG wavy honey-blonde hair past the shoulders, soft coral-pink lips, adult 24-28,
slim / petite. Same short champagne-gold satin dress and gold heels as the current hero
image so it reads as the same shoot.

## Output
- `avalisa-girl-diecut.png`, portrait, 1024x1536, **transparent background**.
- Full body, head to heels, standing, confident, facing camera.
- Nothing cropped at any edge — leave a small margin all round so no limb is clipped.
- Lighting must suit a DARK page: warm gold rim light on her, no bright halo, no white
  fringe, no drop shadow baked in (the page adds its own).
- Tasteful and premium, fully clothed, non-explicit.

Verify before finishing: open the PNG, confirm the alpha channel is real (corner pixels
fully transparent), confirm hair and both legs are intact with no missing chunks or
straight-line cuts. If the alpha is broken, regenerate — do not ship a damaged matte.
Generate up to 3 attempts to get a clean one.

## Wiring
Export `AVALISA_DIECUT_IMAGE` from `dashboard/src/lib/brandAssets.js`. Do not edit any
page component — I am rebuilding the hero layout myself. Build must pass. Do not push.
Report the alpha verification you actually performed.
