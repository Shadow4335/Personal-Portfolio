# Arnav Verma — Portfolio

My personal site. Scrolling is a climb: it starts on the launch pad and ends 6 billion km out, looking back at Earth as a pale blue dot. Each section sits at a real waypoint on the way out (low Earth orbit, geostationary orbit, the Moon, Sun–Earth L2).

**Live:** https://arnavvermaportfolio.vercel.app

## What's in it

- **Opening film.** A sound gate, then twelve seconds in four beats: a terminal types `./takeoff --callsign AV26 --to orbit` and runs its pre-flight checks; the window gives way to a cockpit head-up display rolling down runway 26, whose edge lights are ones and zeros, with V1, ROTATE, POSITIVE RATE and GEAR UP callouts; the climb punches through cloud and keeps going on a log-scale altitude ladder past airliner height, the Kármán line and the ISS; then the stars fly together into my name before a telescope-aperture iris opens onto the site. Skippable (Esc), and same-session revisits skip it.
- **3D scene** in three.js with procedural shaders: Earth built from Natural Earth coastlines, clouds, city lights and atmosphere, a cratered Moon, a starfield with a Milky Way band, and the Pale Blue Dot at the end. The camera is driven by scroll.
- **Live ISS position** from [wheretheiss.at](https://wheretheiss.at), shown in the About section and as a marker on the globe.
- **Music and sound** made entirely with the Web Audio API (no audio files): a generative score that follows the film's chapters and then settles into a quiet background, plus keyboard ticks, radio squelch, callout tones, a jet spooling up and taking off, and Apollo-style Quindar tones on outgoing links. Toggle with the button or the `M` key.
- **Mission-patch project cards** in a pinned 3D carousel, a skills star chart, a flight-log timeline, and tonight's Moon phase over Faridabad in the footer.
- **A page that feels alive:** a custom cursor (a dot plus an orbiting ring) that leaves a short comet trail, the odd shooting star, a small rocket that climbs the altimeter as you scroll, the hero name splitting apart like separating stages, About text lighting up word by word, a ticker band that speeds up and leans with your scroll, tilting cards and magnetic buttons.
- **Crew badge.** My photo (`public/arnav.webp`, 800×1000) sits in a scanning ID-badge frame, cut out and set against a night sky.
- Works without WebGL (flat sky fallback) and without JavaScript (all content is plain HTML). Respects `prefers-reduced-motion`.

## Credits

Coastlines: Natural Earth via `world-atlas`.

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
