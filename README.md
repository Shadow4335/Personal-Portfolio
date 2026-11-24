# Arnav Verma — Portfolio

My personal site. Scrolling is a climb: it starts on the launch pad and ends 6 billion km out, looking back at Earth as a pale blue dot. Each section sits at a real waypoint on the way out (low Earth orbit, geostationary orbit, the Moon, Sun–Earth L2).

**Live:** https://arnavvermaportfolio.vercel.app

## What's in it

- **Opening film.** A sound gate, then twelve seconds in four chapters: an ATC radar and tower clearance, a cockpit flight display through V1 and rotate, a climb past the Kármán line into a star chart with Orion, and the stars flying together into my name before a telescope-aperture iris opens onto the site. Skippable (Esc), and same-session revisits skip it.
- **3D scene** in three.js with procedural shaders: Earth built from Natural Earth coastlines, clouds, city lights and atmosphere, a cratered Moon, a starfield with a Milky Way band, and the Pale Blue Dot at the end. The camera is driven by scroll.
- **Live ISS position** from [wheretheiss.at](https://wheretheiss.at), shown in the About section and as a marker on the globe.
- **Music and sound** made entirely with the Web Audio API (no audio files): a generative score that follows the film's chapters and then settles into a quiet background, plus radar pings, radio squelch, cockpit callouts, engine spool and Apollo-style Quindar tones on outgoing links. Toggle with the button or the `M` key.
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
