import { gsap } from 'gsap';

// Skill constellations. Star coordinates live in a 1000×620 box; names come from the HTML lists
// (the lists are the accessible content; the chart is decoration on top).
const SHAPES = {
  ai: { label: [70, 52], stars: [[90, 150], [170, 96], [250, 158], [330, 104], [400, 176], [312, 236]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5]] },
  product: { label: [600, 40], stars: [[610, 92], [690, 136], [776, 98], [842, 178], [728, 222]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1]] },
  build: { label: [430, 300], stars: [[452, 350], [540, 318], [604, 392], [528, 456], [450, 430]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [1, 3]] },
  ui: { label: [70, 400], stars: [[110, 448], [196, 494], [160, 572], [274, 548]], edges: [[0, 1], [1, 2], [1, 3]] },
  cad: { label: [790, 430], stars: [[852, 488]], edges: [] },
};
const NS = 'http://www.w3.org/2000/svg';
const mk = (tag, attrs, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  parent && parent.appendChild(n);
  return n;
};

export function initSkills({ reduced, sound }) {
  const chart = document.querySelector('.chart');
  if (!chart) return;
  const linesSvg = chart.querySelector('.chart-lines');
  const starsSvg = chart.querySelector('.chart-stars');
  const tip = chart.querySelector('.chart-tip');
  const defs = mk('defs', {}, starsSvg);
  const grad = mk('radialGradient', { id: 'starGlow' }, defs);
  mk('stop', { offset: '0', 'stop-color': '#ece6da', 'stop-opacity': '0.55' }, grad);
  mk('stop', { offset: '1', 'stop-color': '#ece6da', 'stop-opacity': '0' }, grad);

  const groups = {};
  const allLines = [];
  const allStars = [];

  document.querySelectorAll('.cluster').forEach((cl) => {
    const key = cl.dataset.c;
    const shape = SHAPES[key];
    if (!shape) return;
    const names = [...cl.querySelectorAll('li')];
    const h3 = cl.querySelector('h3');
    const title = h3.textContent.slice(h3.querySelector('span').textContent.length).trim();
    const lg = mk('g', {}, linesSvg);
    const sg = mk('g', {}, starsSvg);
    const lbl = mk('text', { x: shape.label[0], y: shape.label[1], class: 'c-name' }, linesSvg);
    lbl.textContent = title;
    shape.edges.forEach(([a, b]) => {
      const [x1, y1] = shape.stars[a], [x2, y2] = shape.stars[b];
      allLines.push(mk('line', { x1, y1, x2, y2 }, lg));
    });
    shape.stars.forEach(([x, y], i) => {
      const r = 3 + ((i * 7 + key.length) % 4) * 0.7;
      const g = mk('g', {}, sg);
      const halo = mk('circle', { cx: x, cy: y, r: r * 4, class: 'halo' }, g);
      halo.style.animationDelay = `${-((i * 0.83 + key.length) % 3.2)}s`;
      mk('circle', { cx: x, cy: y, r }, g);
      // larger invisible hit area for fingers and mice
      const hit = mk('circle', { cx: x, cy: y, r: 18, class: 'hit' }, g);
      const li = names[i];
      const on = () => {
        clear();
        focus(key);
        li && li.classList.add('is-on');
        tip.textContent = li ? li.textContent : title;
        tip.style.left = `${(x / 1000) * 100}%`;
        tip.style.top = `${(y / 620) * 100}%`;
        tip.classList.add('is-on');
        sound.hover();
      };
      hit.addEventListener('pointerenter', on);
      // on touch, leave fires as the finger lifts; keep the label until the next tap elsewhere
      hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') clear(); });
      allStars.push(g);
    });
    groups[key] = { lg, sg, lbl, cl };
    cl.addEventListener('pointerenter', () => focus(key));
    cl.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') focus(null); });
  });
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' && !e.target.closest('.hit, .cluster')) clear();
  }, { passive: true });

  function clear() {
    document.querySelectorAll('.cluster li.is-on').forEach((li) => li.classList.remove('is-on'));
    tip.classList.remove('is-on');
    focus(null);
  }

  function focus(key) {
    chart.classList.toggle('has-focus', !!key);
    for (const k in groups) {
      const on = k === key;
      groups[k].lg.classList.toggle('on', on);
      groups[k].sg.classList.toggle('on', on);
      groups[k].lbl.classList.toggle('on', on);
      groups[k].cl.classList.toggle('is-on', on);
    }
  }

  // Draw the constellations in when the chart scrolls into view.
  allLines.forEach((l) => {
    const len = Math.hypot(l.x2.baseVal.value - l.x1.baseVal.value, l.y2.baseVal.value - l.y1.baseVal.value);
    l.style.strokeDasharray = len;
    l.style.strokeDashoffset = reduced ? 0 : len;
  });
  if (!reduced) {
    gsap.set(allStars, { opacity: 0, scale: 0, transformOrigin: 'center', transformBox: 'fill-box' });
    gsap.timeline({ scrollTrigger: { trigger: chart, start: 'top 75%', once: true } })
      .to(allStars, { opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(3)', stagger: { each: 0.04, from: 'random' } })
      .to(allLines, { strokeDashoffset: 0, duration: 0.9, ease: 'power2.inOut', stagger: 0.05 }, 0.25);

    // Depth tilt: stars and lines sit on different planes, so the chart reads as 3D.
    const sky = chart.closest('.sky');
    gsap.set(chart, { transformPerspective: 1000 });
    const rx = gsap.quickTo(chart, 'rotationX', { duration: 0.8, ease: 'power3' });
    const ry = gsap.quickTo(chart, 'rotationY', { duration: 0.8, ease: 'power3' });
    sky.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const b = chart.getBoundingClientRect();
      rx(((e.clientY - b.top) / b.height - 0.5) * -10);
      ry(((e.clientX - b.left) / b.width - 0.5) * 14);
    });
    sky.addEventListener('pointerleave', () => { rx(0); ry(0); });
  }
}
