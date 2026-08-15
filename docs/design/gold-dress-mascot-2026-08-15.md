# Avalisa mascot — gold dress render (brief for Codex, 2026-08-15)

Goal: produce ONE hero-quality image of the existing Avalisa girl wearing an elegant
gold evening gown, and wire it into the website. Same character — same face, same hair,
same age. This is a brand mascot refresh, not a new character.

## Verified environment (already checked — do not re-discover)
- M4 is reachable over SSH as host `m4` (also `m4ts` over Tailscale). Non-interactive
  SSH works; always append `</dev/null`.
- ComfyUI lives at `~/ComfyUI` ON THE M4 and is currently NOT running. Its API port is
  **4201** (`http://127.0.0.1:4201`), not the default 8188. Start it yourself with the
  venv at `~/ComfyUI/.venv/bin/python3 main.py --port 4201` in the background, wait for
  `/system_stats` to answer, and shut it down again when you are finished.
- Checkpoint available: `RealVisXL_V5.0_fp16.safetensors` (SDXL photoreal).
- IPAdapter model available: `ip-adapter-faceid-plusv2_sdxl.bin` — use it, it is what
  keeps the face identical.
- Existing helper scripts and workflow JSONs: `~/ai-server/tools/` on the M2 (this
  machine) — `run_ipadapter.sh`, `ipadapter_gen.py`, `wf_ipadapter_v4.json`. The runner
  expects the workflow at `/tmp/wf_ipadapter.json` on the M4. Reuse this pipeline; it was
  previously used for exactly this (client_id `avalisa_ipadapter_dress_003`).

## Face references (copy to the M4)
Best first: `/Users/thanadej/Library/Mobile Documents/iCloud~md~obsidian/Documents/Oil's Vault/2-Projects/21-Avalisa PO Bot/avalisa-mascot-ref.png`
Also usable: `/Users/thanadej/AvalisaPOBot-V2-Audit/dashboard/public/images/landing/generated/avalisa-girl-cutout-highres.png`
and `dashboard/public/images/landing/generated/avalisa-hero-girl-gemini.png` in this worktree.

## What to render
- Full-length or three-quarter shot of the same woman in a floor-length **gold** evening
  gown — satin/silk with a soft metallic sheen, elegant and well-fitted.
- Premium luxury-brand energy: confident, composed, high-fashion editorial lighting,
  dark navy/black background consistent with the site (#0a0a0f – #0d1b2e), warm gold rim
  light. Think a watch or couture campaign.
- Framing must leave clean space so she can sit beside the hero copy, and the background
  must be dark enough to composite against the site.
- KEEP IT TASTEFUL. Elegant and aspirational, not revealing or suggestive — this is a
  finance product and credibility is the point. Put terms like nsfw, nude, lingerie,
  cleavage-focus, sexualised into the NEGATIVE prompt. If a render comes out otherwise,
  discard it and re-roll; do not ship it.
- Also negative-prompt the usual failure modes: extra fingers, deformed hands, bad
  anatomy, watermark, text, logo, blurry, lowres.
- Generate a few candidates and keep the single best one.

## Deliverable
1. Save the chosen render as
   `dashboard/public/images/landing/generated/avalisa-girl-gold-highres.png` in THIS
   worktree (`/Users/thanadej/avalisa-website-ui`).
2. Flip `AVALISA_MASCOT_IMAGE` in `dashboard/src/lib/brandAssets.js` to
   `AVALISA_GOLD_MASCOT_IMAGE` so all five pages pick it up.
3. `cd dashboard && npm run build` must succeed, and the image must actually load in the
   build output (check the file is copied into `dashboard/build/`).
4. Do NOT git push and do NOT deploy. Do not touch `extension/` or `mobile-proof/`.
5. In your final message, state the exact ComfyUI prompt used, how many candidates you
   generated, why you picked the one you did, and the output file size/dimensions.

If ComfyUI cannot be started or the render fails, STOP and report the real error. Do not
substitute a stock image, do not reuse an existing render as if it were new, and do not
fabricate the asset by editing an old file.
