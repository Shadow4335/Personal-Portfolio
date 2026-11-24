# Arnav Verma — Portfolio

My personal site. Scrolling is a climb: it starts on the launch pad and ends 6 billion km out, looking back at Earth as a pale blue dot. Each section sits at a real waypoint on the way out (low Earth orbit, geostationary orbit, the Moon, Sun–Earth L2).

**Live:** https://arnavvermaportfolio.vercel.app

## What's in it

- **Opening film.** A sound gate, then thirteen seconds in four chapters: range control on radar giving the go, a night launch of NASA's Saturn V model in real 3D (red umbilical tower with swing arms, xenon floodlights, oxygen boil-off, ice falling at ignition, five-engine F-1 plume and lit exhaust smoke, liftoff, tower cleared, max-Q, engine cutoff, staging and the second stage's J-2 burn) cut across four camera shots, with a mission clock, real Saturn V ascent telemetry and callouts that all run off the same timeline, the climb past the Kármán line into a star chart with Orion, and the stars flying together into my name before a telescope-aperture iris opens onto the site. Skippable (Esc), and same-session revisits skip it.
- **3D scene** in three.js with procedural shaders: Earth built from Natural Earth coastlines, clouds, city lights and atmosphere, a cratered Moon, a starfield with a Milky Way band, and the Pale Blue Dot at the end. The camera is driven by scroll.
- **Live ISS position** from [wheretheiss.at](https://wheretheiss.at), shown in the About section and as a marker on the globe.
- **Music and sound** made entirely with the Web Audio API (no audio files): a generative score that follows the film's chapters and then settles into a quiet background, plus radar pings, radio squelch, countdown beeps, the launch roar, stage separation, callout chimes and Apollo-style Quindar tones on outgoing links. Toggle with the button or the `M` key.
- **Mission-patch project cards** in a pinned 3D carousel, a skills star chart, a flight-log timeline, and tonight's Moon phase over Faridabad in the footer.
- **A page that feels alive:** a custom cursor (a dot plus an orbiting ring) that leaves a short comet trail, the odd shooting star, a small rocket that climbs the altimeter as you scroll, the hero name splitting apart like separating stages, About text lighting up word by word, a ticker band that speeds up and leans with your scroll, tilting cards and magnetic buttons.
- **Crew badge with a photo slot.** To add your photo, save it as `public/arnav.jpg` (portrait, about 4:5) and uncomment the `<img>` line inside `.crew-frame` in `index.html`. The astronaut placeholder hides itself.
- Works without WebGL (flat sky fallback) and without JavaScript (all content is plain HTML). Respects `prefers-reduced-motion`.

## Credits

Saturn V 3D model: [NASA 3D Resources](https://science.nasa.gov/3d-resources/saturn-v/) (free to use under NASA's media guidelines). Coastlines: Natural Earth via `world-atlas`.

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
