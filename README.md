# ONE TAKE: Portfolio V2

Mani's second cinematic portfolio: one unbroken camera flight from a monsoon stepwell to orbit, scrubbed by scroll, with his 4 projects living inside the film. WebGL film with a depth map per frame, so the type sits inside the scene.

Live: https://mani-onetake.sites.tab.bot/

Status: rough cut. Shot 1 is real AI-rendered footage; shots 2–9 are depth-animated keyframes standing in until they are filmed.

## What's inside
- `site/`: the page (`index.html`, `app.js`, `style.css`), `frames/film.json` (timeline + frame hosts), posters, project images
  - WebGL film renderer with depth displacement, speed-based motion blur, tilt/gyro parallax
  - Type in 3D space, chapter transitions (shockwave, water-ripple wipe, lightning, light-leak whip, light seam)
  - Generated sound score, off by default
- `keyframes/`: the 10 storyboard keyframes (k0–k9)
- `pipeline/`: how the frames are made
  - `shot-plan.json`: the 9 chained shots and their prompts
  - `build_frames.py`, `depth.py`, `encode.py`: frame extraction, monocular depth maps, AVIF tiers for phone/desktop
  - `placeholder.py`: depth-animated stand-ins for unfilmed shots
  - `shot.py`, `reel.py`, `weight.py`: screenshots, showreel, page weight

The frames themselves (~30 MB of AVIF) are not in this repo; the live site streams them from its frame hosts (listed in `site/frames/film.json`). Re-run the pipeline to build them locally.

## Run locally
```bash
cd site && python3 -m http.server 8080
# open http://localhost:8080
```

## Tech
WebGL (custom shaders), vanilla JS, Lenis smooth scroll (MIT), Web Audio. Pipeline: Python, ffmpeg, Depth Anything V2 Small (monocular depth), AVIF encoding.

Techniques studied from public scroll-film work (including gireeshkumarreddy/freefall-portfolio, which has no licence); no code from it is used. Our own engine.
