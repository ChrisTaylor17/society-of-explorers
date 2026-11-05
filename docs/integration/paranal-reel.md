# Who gets the night sky?

The first Archivist field note is a 24-second portrait Reel for Clips. It uses real footage of the sky over Paranal, Chile. The commentary sets the connectivity benefit of satellite broadband alongside the effect of bright trails on telescope images. It ends by asking what brightness limit a Circle would choose. This episode uses text and a recurring title treatment for the Archivist.

## Footage and reuse

ESO filmed the time-lapse on May 19, 2026 and released it on July 1. The review covers the exact silent edit of the linked ESO video podcast under CC BY 4.0. ESO requires full visible credit and disclosure of changes. The Reel displays **B. Häußler/ESO** throughout. The Clips page links the original and the license and identifies the trim, vertical framing, AI-assisted commentary and omitted audio. The reporting and connectivity sources support the two distinct claims. [ESO footage](https://www.eso.org/public/videos/eso2607d/) · [ESO reuse terms](https://www.eso.org/public/outreach/copyright/) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) · [ESO reporting](https://www.eso.org/public/news/eso2607/) · [ITU connectivity background](https://www.itu.int/en/mediacentre/backgrounders/Pages/Non-geostationary-satellite-systems.aspx)

The excerpt uses source time 1.600 seconds through 25.600 seconds, with the end excluded. The 50 sampled source frames showed the full landscape and telescope buildings. The edit keeps that frame whole on a 720×1280 canvas. The 3,346,521-byte MP4 contains 600 video frames at 25 fps and zero audio tracks. Four timed cues also supply the optional text track and transcript. [Edit specification](../../content/clips/night-sky-traffic-edit.json) · [Rights and media inspection](../../content/clips/night-sky-traffic-inspection.json)

## Review and playback

The exact source, derivative, captions and inspection record are pinned. This source's gate requires silent video, visible credit, the checked ESO policy and CC BY license, embedded text and an output at or below 4,000,000 bytes. The derivative stays under the hosting function's documented payload limit. The original CDN download stays out of the player and the public catalog. [Clip rules](clips.md) · [Vercel function limits](https://vercel.com/docs/functions/limitations)

The Reel has a keyboard-accessible jump link, a direct anchor and a route to the Circles directory. Loading retrieves only the reviewed local media and timed text. Playback starts from the player control. In the guarded built web app, Chromium completed the 24-second Reel at normal speed, loaded all four cues and left the transcript available after unloading. The 320px screen and five decoded samples were inspected. Physical-device playback and public release remain open. [Verification receipt](paranal-reel-verification.json)

The private SoE Media Library has the video, captions, and source and reuse note. Drive readback confirmed the file sizes, parent and unshared status for all three files. The pinned original for local reproduction is in the checkout. The archive holds the silent derivative.

Run the editor from the canonical checkout with the cached Chromium and Mac command-line tools. The fresh output directory holds the render and its media inspection. Keep existing pins until a new candidate is reviewed.

```sh
python3 verification/web/scripts/render-paranal-reel.py reel-paranal-next
```
