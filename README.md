# Arnav Verma — Portfolio

My personal site. Scrolling is a climb: it starts on the launch pad and ends 6 billion km out, looking back at Earth as a pale blue dot. Each section sits at a real waypoint on the way out (low Earth orbit, geostationary orbit, the Moon, Sun–Earth L2).

**Live:** https://arnavvermaportfolio.vercel.app

## What's in it

- **Hold-to-launch opening.** A short boot checklist, then you press and hold to launch (a tap works too, Esc skips). Returning visitors in the same session skip straight in.
- **3D scene** in three.js with procedural shaders: Earth built from Natural Earth coastlines, clouds, city lights and atmosphere, a cratered Moon, a starfield with a Milky Way band, and the Pale Blue Dot at the end. The camera is driven by scroll.
- **Live ISS position** from [wheretheiss.at](https://wheretheiss.at), shown in the About section and as a marker on the globe.
- **Sound design** made entirely with the Web Audio API (no audio files): countdown beeps, launch roar, Apollo-style Quindar tones on outgoing links, a quiet space drone. Toggle with the button or the `M` key.
- **Mission-patch project cards** in a pinned 3D carousel, a skills star chart, a flight-log timeline, and tonight's Moon phase over Faridabad in the footer.
- Works without WebGL (flat sky fallback) and without JavaScript (all content is plain HTML). Respects `prefers-reduced-motion`.

## Stack

Vite · three.js · GSAP (ScrollTrigger, SplitText) · Lenis · self-hosted Archivo and JetBrains Mono.

## Run it

```bash
npm install
npm run dev
```

Build with `npm run build` (output in `dist/`). Tests for the Moon-phase maths: `node --test test/`.

## Deploy

Import the repo at [vercel.com/new](https://vercel.com/new). Vercel picks up `vercel.json` (Vite, `dist/`, security headers, long-cache for hashed assets). If the domain changes, update it in `index.html` (canonical, Open Graph, JSON-LD), `public/robots.txt` and `public/sitemap.xml`.
