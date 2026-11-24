import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import modelUrl from './assets/saturn-v.glb?url';
import { IGN, LIFT, CUTOFF, SEP, S2 } from './film.js';

// Chapter two of the opening film: a night launch of NASA's Saturn V model (NASA 3D Resources),
// in metres. render(t) is a pure function of film time, so skipping is safe. The 2D film draws
// the countdown, telemetry and callouts on top, keyed to the same constants.

const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const lerp = (a, b, k) => a + (b - a) * k;
const HEIGHT = 110.6;      // Saturn V, metres
const BASE = 10;           // engine exits sit just above the mobile launcher deck
const STAGE_CUT = 42;      // S-IC / S-II interface, metres above the engine exits
// constant acceleration off the pad; clears the 120 m tower at 5.55 s, when TOWER CLEARED is called
const altAt = (t) => (t < LIFT ? 0 : 430 * (t - LIFT) ** 2);

/* ── textures drawn on canvases ──────────────────────────── */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return new THREE.CanvasTexture(c);
}

function smokeTex() {
  // a soft puff: radial falloff broken up by four octaves of value noise
  return canvasTex(128, 128, (g, w) => {
    const grid = (n) => Array.from({ length: (n + 1) * (n + 1) }, () => Math.random());
    const octs = [4, 8, 16, 32].map((n) => ({ n, v: grid(n) }));
    const sample = ({ n, v }, x, y) => {
      const fx = x * n, fy = y * n, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), at = (i, j) => v[Math.min(n, j) * (n + 1) + Math.min(n, i)];
      return (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
    };
    const img = g.createImageData(w, w);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / w, r = Math.hypot(u - 0.5, v - 0.5) * 2;
      let n = 0, amp = 0.5;
      for (const o of octs) { n += sample(o, u, v) * amp; amp *= 0.5; }
      const a = Math.max(0, 1 - r) ** 1.4 * Math.min(1, Math.max(0, (n - 0.18) * 1.9));
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
  });
}

function glowTex() {
  return canvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,210,150,0.6)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
}

/* ── shaders ──────────────────────────────────────────────── */
const NOISE = `
float h3(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ return 0.55*vn(p)+0.3*vn(p*2.1)+0.15*vn(p*4.3); }`;

// a night sky: near-black, stars, a faint glow of distant towns on the horizon
const skyMat = () => new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { uAlt: { value: 0 } },
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
  fragmentShader: `uniform float uAlt; varying vec3 vDir;
    float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
    void main(){
      float h = vDir.y;
      vec3 zen = vec3(0.002,0.003,0.008), mid = vec3(0.006,0.009,0.02), hor = mix(vec3(0.026,0.036,0.064), vec3(0.01,0.016,0.035), uAlt);
      vec3 col = h > 0.0 ? mix(mix(hor, mid, smoothstep(0.0,0.1,h)), zen, smoothstep(0.1,0.6,h)) : hor*0.4;
      float town = exp(-abs(h)*55.0) * (0.5 + 0.5*sin(atan(vDir.z, vDir.x)*3.0 + 1.3));
      col += vec3(0.22,0.11,0.05) * town * 0.35 * (1.0 - uAlt);
      gl_FragColor = vec4(col,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});

const plumeMat = (vac, outer) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uVac: { value: vac ? 1 : 0 }, uOuter: { value: outer ? 1 : 0 } },
  vertexShader: `varying vec2 vUv; varying float vFace;
    void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0);
      vec3 n = normalize(normalMatrix*normal); vFace = abs(dot(n, normalize(-mv.xyz)));
      gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `uniform float uTime, uPower, uVac, uOuter; varying vec2 vUv; varying float vFace; ${NOISE}
    void main(){
      float y = vUv.y;                                  // 0 at the nozzles, 1 at the tail
      float n = fbm(vec3(vUv.x*7.0, y*9.0 - uTime*16.0, uTime*1.7));
      float along = pow(1.0 - y, uOuter > 0.5 ? 0.9 : 1.2);
      float edge = pow(vFace, uOuter > 0.5 ? 2.0 : 1.2);
      float core = (1.0 - smoothstep(0.02, 0.45, y)) * edge;
      vec3 hot = vec3(1.0,0.93,0.78), mid = mix(vec3(1.0,0.6,0.2), vec3(0.62,0.72,1.0), uVac), cool = mix(vec3(0.85,0.32,0.07), vec3(0.25,0.35,0.9), uVac);
      vec3 col = mix(cool, mid, along); col = mix(col, hot, core*(1.0-uOuter));
      float dia = (1.0-uVac)*(1.0-uOuter)*pow(0.5+0.5*cos(y*60.0 - 0.4), 8.0)*(1.0-smoothstep(0.05,0.45,y));
      float a = along*edge*(0.55+0.6*n)*uPower*(uOuter > 0.5 ? 0.35 : 1.0);
      gl_FragColor = vec4(col*(a*(uOuter > 0.5 ? 1.0 : 1.7) + dia*1.3*uPower), 1.0);
    }`,
});

// smoke, vapour, falling ice, the exhaust trail and clouds: camera-facing quads moved on the GPU from time
const smokeMat = (tex) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uTime: { value: 0 }, uTex: { value: tex }, uFlame: { value: 0 }, uNozzle: { value: new THREE.Vector3() }, uAlt: { value: 0 } },
  vertexShader: `attribute vec4 aA; attribute vec4 aB; // aA: spawn, kind, size, seed   aB: dir.xyz|pos.xyz, speed
    uniform float uTime; varying vec2 vUv; varying float vAlpha; varying vec3 vWorld; varying float vKind;
    void main(){
      float age = uTime - aA.x, kind = aA.y, size = aA.z, seed = aA.w;
      vec3 p; float s = size, al = 0.0;
      if (kind < 0.5) {                                 // exhaust out of the flame trench
        float k = 1.1; vec3 d = aB.xyz * aB.w;
        p = vec3(0.0, 6.0, 0.0) + d*(1.0-exp(-age*k))/k + vec3(0.0, 6.0*age + 2.0*age*age, 0.0);
        s = size*(1.0 + age*2.3); al = smoothstep(0.0,0.15,age)*(1.0-smoothstep(4.5,8.0,age))*0.92;
      } else if (kind < 1.5) {                          // liquid-oxygen vapour boiling off the tanks
        float a2 = mod(age, 1.6); p = aB.xyz + vec3(aB.x*0.12*a2, -4.0*a2, aB.z*0.12*a2);
        s = size*(1.0 + a2*1.8); al = (age > 0.0 ? 1.0 : 0.0)*smoothstep(0.0,0.2,a2)*(1.0-smoothstep(0.6,1.6,a2))*0.45*(1.0-smoothstep(${IGN.toFixed(2)},${(IGN + 0.4).toFixed(2)},uTime));
      } else if (kind < 2.5) {                          // cloud deck
        p = aB.xyz + vec3(sin(uTime*0.05+seed*6.0)*20.0, 0.0, 0.0); s = size; al = 0.32;
      } else if (kind < 3.5) {                          // sheets of ice shaken off the tanks at ignition
        p = aB.xyz + vec3(aB.x*0.06*age, -0.5*9.8*age*age*3.0, aB.z*0.06*age);
        s = size; al = smoothstep(0.0,0.05,age)*(1.0-smoothstep(0.8,1.4,age))*step(0.0, p.y)*0.9;
      } else {                                          // the exhaust trail left hanging in the air
        p = aB.xyz + vec3(0.0, -2.0*age, 0.0); s = size*(1.0 + age*1.6); al = smoothstep(0.0,0.12,age)*(1.0-smoothstep(1.0,3.2,age))*0.55;
      }
      if (age < 0.0) al = 0.0;
      vAlpha = al; vKind = kind; vWorld = p;
      vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      float r = seed*6.283 + (kind > 2.5 && kind < 3.5 ? age*6.0 : 0.0); vec2 c = mat2(cos(r),-sin(r),sin(r),cos(r))*(position.xy);
      vUv = uv;
      gl_Position = al > 0.0 ? projectionMatrix*viewMatrix*vec4(p + (right*c.x + up*c.y)*s, 1.0) : vec4(2.0,2.0,2.0,1.0);
    }`,
  fragmentShader: `uniform sampler2D uTex; uniform float uFlame, uAlt; uniform vec3 uNozzle; varying vec2 vUv; varying float vAlpha; varying vec3 vWorld; varying float vKind;
    void main(){
      float tex = texture2D(uTex, vUv).a;
      float a = (vKind > 2.5 && vKind < 3.5 ? step(0.25, tex) : tex) * vAlpha;
      if (a < 0.01) discard;
      vec3 base = vKind > 1.5 && vKind < 2.5 ? vec3(0.16,0.18,0.22) : vKind > 2.5 && vKind < 3.5 ? vec3(0.9,0.94,1.0) : vec3(0.62,0.6,0.58);
      base *= 0.5 + 0.5*vUv.y;                                    // lit from the floodlights above
      float d = length(vWorld - uNozzle);
      vec3 fire = vec3(1.0,0.46,0.14) * uFlame * 4.4 * exp(-d/90.0) * (1.3 - vUv.y*0.7);
      gl_FragColor = vec4(base * mix(0.5, 0.15, uAlt) + fire, a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});

function bell(throat, exit, len, segs = 32) {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const k = i / 12; pts.push(new THREE.Vector2(throat + (exit - throat) * Math.sqrt(k) * (0.6 + 0.4 * k), -k * len)); }
  return new THREE.LatheGeometry(pts, segs);
}

// The model's flag decal sits on an opaque navy sheet, which would paint a blue band round the first
// stage. The real rocket is white there, so turn the navy white everywhere except around the flags.
function whiteOutBackdrop(g, w, h) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  const navy = (i) => d[i] < 30 && d[i + 1] < 30 && d[i + 2] > 80 && d[i + 2] < 150;
  if (!navy(((h >> 1) * w + (w >> 1)) * 4) && !navy(0)) return; // only the navy sheet needs this
  const boxes = []; // red stripes mark each flag; keep a margin round them
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (d[i] > 150 && d[i + 1] < 110 && d[i + 2] < 110) {
      const b = boxes.find((q) => x >= q[0] - 14 && x <= q[2] + 14 && y >= q[1] - 14 && y <= q[3] + 14);
      if (b) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); } else boxes.push([x, y, x, y]);
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (navy(i) && !boxes.some((q) => x >= q[0] - 6 && x <= q[2] + 6 && y >= q[1] - 6 && y <= q[3] + 6)) { d[i] = 241; d[i + 1] = 239; d[i + 2] = 233; }
  }
  g.putImageData(img, 0, 0);
}

// cut a mesh's triangles at a height so the model's single-piece body becomes two stages
function splitMesh(mesh, cutY) {
  const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  geo.applyMatrix4(mesh.matrixWorld);
  const pos = geo.attributes.position, keep = [[], []];
  for (let i = 0; i < pos.count; i += 3) {
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    keep[cy < cutY ? 0 : 1].push(i);
  }
  return keep.map((tris) => {
    if (!tris.length) return null;
    const g = new THREE.BufferGeometry();
    for (const name in geo.attributes) {
      const src = geo.attributes[name], n = src.itemSize, arr = new src.array.constructor(tris.length * 3 * n);
      tris.forEach((i, k) => { for (let v = 0; v < 3; v++) for (let c = 0; c < n; c++) arr[(k * 3 + v) * n + c] = src.array[(i + v) * n + c]; });
      g.setAttribute(name, new THREE.BufferAttribute(arr, n, src.normalized));
    }
    return g;
  });
}

export async function createLaunch3D(canvas, { lowPower = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowPower ? 1.25 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 120000);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(80000, 48, 24), skyMat());
  sky.frustumCulled = false;
  scene.add(sky);
  // stars as points with a fixed pixel size, so a long lens doesn't blow them up into blocks
  {
    const n = lowPower ? 1600 : 3200, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let sd = 3;
    const r = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    for (let i = 0; i < n; i++) {
      const u = r(), v = r() * 0.95 + 0.05, th = u * Math.PI * 2, ph = Math.acos(1 - v); // upper sky only
      pos.set([Math.sin(ph) * Math.cos(th) * 50000, Math.cos(ph) * 50000, Math.sin(ph) * Math.sin(th) * 50000], i * 3);
      const b = 0.25 + 0.75 * r() ** 3, warm = r();
      col.set([b * (0.85 + 0.15 * warm), b * 0.9, b * (1 - 0.15 * warm)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
    stars.frustumCulled = false;
    scene.add(stars);
  }
  // a soft night environment so paint and metal pick up a little sky
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.MeshBasicMaterial({ color: 0x1a2238, side: THREE.BackSide })));
  const envFloor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x050608 }));
  envFloor.rotation.x = -Math.PI / 2;
  envScene.add(envFloor);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
  scene.fog = new THREE.FogExp2(0x05070c, 0.00022);

  /* light: xenon floodlights on the pad (the Apollo 17 look), a cool moon rim, then the flame */
  scene.add(new THREE.HemisphereLight(0x22304e, 0x050506, 0.35));
  const moon = new THREE.DirectionalLight(0x8aa2d8, 0.45);
  moon.position.set(400, 600, -500);
  scene.add(moon, moon.target);
  const key = new THREE.SpotLight(0xeef3ff, 70000, 900, 0.26, 0.5, 1.7);
  key.position.set(-210, 40, 260); key.target.position.set(0, 60, 0);
  key.castShadow = !lowPower; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0003;
  const fill = new THREE.SpotLight(0xdfe8ff, 30000, 900, 0.3, 0.6, 1.7);
  fill.position.set(240, 30, 140); fill.target.position.set(0, 55, 0);
  const floods = [key, fill];
  floods.forEach((l) => scene.add(l, l.target));
  const fireLight = new THREE.PointLight(0xff8a3a, 0, 900, 2);
  const bodyLight = new THREE.PointLight(0xffa868, 0, 420, 2);
  scene.add(fireLight, bodyLight);

  /* ground, pad and the launch umbilical tower */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), new THREE.MeshStandardMaterial({ color: 0x060709, roughness: 0.92, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const concrete = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.9 });
  const steelRed = new THREE.MeshStandardMaterial({ color: 0x8a2e22, metalness: 0.4, roughness: 0.6 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x5c6068, metalness: 0.6, roughness: 0.5 });
  const add = (geo, mat, x, y, z, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; scene.add(m); return m; };
  add(new THREE.BoxGeometry(160, 2, 160), concrete, 0, 1, 0, false);                 // pad
  add(new THREE.BoxGeometry(49, 7.6, 41), new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.8 }), -4, 5.8, 0); // mobile launcher deck
  for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) add(new THREE.BoxGeometry(2, 3, 2), steel, x, 11, z); // hold-down arms

  // the tower: 120 m of red lattice with a hammerhead crane and swing arms reaching to the rocket
  const TX = -26, TH = 120, TW = 12, LV = 6;
  const beams = [];
  for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) beams.push([TX + (cx * TW) / 2, 9.6 + TH / 2, (cz * TW) / 2, 0.9, TH, 0.9, 0, 0]);
  for (let y = 9.6 + LV; y < 9.6 + TH; y += LV) {
    beams.push([TX, y, -TW / 2, TW, 0.5, 0.5, 0, 0], [TX, y, TW / 2, TW, 0.5, 0.5, 0, 0], [TX - TW / 2, y, 0, 0.5, 0.5, TW, 0, 0], [TX + TW / 2, y, 0, 0.5, 0.5, TW, 0, 0]);
    const diag = Math.hypot(TW, LV), ang = Math.atan2(LV, TW), f = (y / LV) % 2 ? 1 : -1;
    beams.push([TX, y - LV / 2, -TW / 2, diag, 0.35, 0.35, 0, ang * f], [TX, y - LV / 2, TW / 2, diag, 0.35, 0.35, 0, -ang * f], [TX + TW / 2, y - LV / 2, 0, 0.35, 0.35, diag, ang * f, 0], [TX - TW / 2, y - LV / 2, 0, 0.35, 0.35, diag, -ang * f, 0]);
  }
  beams.push([TX + 6, 9.6 + TH + 2, 0, 30, 2, 2.2, 0, 0]); // hammerhead crane
  const lattice = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), steelRed, beams.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  beams.forEach(([x, y, z, sx, sy, sz, rx, rz], i) => lattice.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(rx, 0, rz)), new THREE.Vector3(sx, sy, sz))));
  lattice.castShadow = true;
  scene.add(lattice);
  const arms = [24, 38, 52, 66, 80, 92, 104].map((y, i) => {
    const g = new THREE.Group();
    g.position.set(TX + TW / 2, BASE + y, i % 2 ? 1.5 : -1.5);
    const b = new THREE.Mesh(new THREE.BoxGeometry(14.5, 2.2, 2.6), steelRed);
    b.position.x = 7.25; b.castShadow = true;
    g.add(b); scene.add(g);
    return g;
  });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  beacon.position.set(TX, 9.6 + TH + 4, 0);
  scene.add(beacon);

  /* the rocket: NASA's Saturn V model, cut into the first stage and everything above it */
  const gltf = await new GLTFLoader().loadAsync(modelUrl);
  const model = gltf.scene;
  const box0 = new THREE.Box3().setFromObject(model), sc = HEIGHT / (box0.max.y - box0.min.y);
  model.scale.setScalar(sc);
  model.position.set(-((box0.min.x + box0.max.x) / 2) * sc, BASE - box0.min.y * sc, -((box0.min.z + box0.max.z) / 2) * sc + 0);
  model.updateMatrixWorld(true);
  const rocket = new THREE.Group(), lower = new THREE.Group(), upper = new THREE.Group();
  rocket.add(lower, upper);
  scene.add(rocket);
  model.traverse((o) => {
    if (!o.isMesh) return;
    const mat = o.material;
    if (mat.isMeshStandardMaterial) {
      mat.envMapIntensity = 0.7;
      mat.roughness = Math.max(0.42, mat.roughness);
      if (mat.map && !mat.map.userData.flat) {
        // the decals (UNITED STATES, USA, the flag) have transparent backgrounds but the model marks
        // them opaque, which paints the gaps a flat colour; lay each decal over the white paint instead
        const img = mat.map.image, c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.fillStyle = '#f1efe9'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0);
        whiteOutBackdrop(g, c.width, c.height);
        const flat = new THREE.CanvasTexture(c);
        Object.assign(flat, { flipY: false, colorSpace: THREE.SRGBColorSpace, wrapS: mat.map.wrapS, wrapT: mat.map.wrapT, anisotropy: 8 });
        flat.userData.flat = true;
        mat.map.dispose();
        mat.map = flat;
        mat.needsUpdate = true;
      }
    }
    splitMesh(o, BASE + STAGE_CUT).forEach((g, i) => {
      if (!g) return;
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true; m.receiveShadow = true;
      (i ? upper : lower).add(m);
    });
  });
  // the J-2 vacuum engines under the second stage, hidden by the interstage until separation
  const j2 = new THREE.MeshStandardMaterial({ color: 0x2c2c30, metalness: 0.85, roughness: 0.35, side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) {
    const a = (i / 4) * Math.PI * 2, r = i === 4 ? 0 : 2.6, m = new THREE.Mesh(bell(0.35, 1.0, 3.3), j2);
    m.position.set(Math.cos(a) * r, BASE + STAGE_CUT + 0.3, Math.sin(a) * r); upper.add(m);
  }

  /* exhaust: five F-1s at the bottom, five J-2s for the second stage */
  const plumeGeo = (r0, r1) => {
    const pts = [];
    for (let i = 0; i <= 24; i++) { const k = i / 24; pts.push(new THREE.Vector2(r0 + (r1 - r0) * Math.pow(k, 0.6), -k)); }
    const g = new THREE.LatheGeometry(pts, 32), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); // 0 at the nozzle
    return g;
  };
  const plumes = [plumeMat(false, false), plumeMat(false, true), plumeMat(true, false)];
  const core = new THREE.Mesh(plumeGeo(0.06, 0.16), plumes[0]);
  const outer = new THREE.Mesh(plumeGeo(0.08, 0.38), plumes[1]);
  const vac = new THREE.Mesh(plumeGeo(0.08, 0.3), plumes[2]);
  [core, outer].forEach((m) => { m.position.y = BASE + 0.2; m.frustumCulled = false; m.renderOrder = 3; lower.add(m); });
  vac.position.y = BASE + STAGE_CUT - 3; vac.frustumCulled = false; vac.renderOrder = 3; upper.add(vac);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.position.y = BASE - 2; glow.renderOrder = 4; lower.add(glow);
  const sepFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow.material.map, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffd2a0 }));
  sepFlash.position.y = BASE + STAGE_CUT; sepFlash.renderOrder = 4; rocket.add(sepFlash);

  // where the engines are at a given moment (used to lay the exhaust trail)
  const nozzleAt = (t) => new THREE.Vector3(0, BASE + altAt(t), 0);

  /* particles */
  const N = lowPower ? 320 : 820, NV = lowPower ? 30 : 60, NC = lowPower ? 26 : 55, NI = lowPower ? 60 : 160, NT = lowPower ? 50 : 110;
  const total = N + NV + NC + NI + NT, aA = new Float32Array(total * 4), aB = new Float32Array(total * 4);
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (i < N) { // the trench vents left and right, so the cloud spreads across the frame
      const along = rnd() < 0.72, side = rnd() < 0.5 ? -1 : 1, ang = rnd() * Math.PI * 2;
      const dir = along ? new THREE.Vector3(side, 0.1 + rnd() * 0.25, (rnd() - 0.5) * 0.5).normalize() : new THREE.Vector3(Math.cos(ang), 0.25 + rnd() * 0.45, Math.sin(ang) * 0.35).normalize();
      aA.set([IGN + 0.05 + rnd() * 2.6, 0, 10 + rnd() * 16, rnd()], o); aB.set([dir.x, dir.y, dir.z, 40 + rnd() * 110], o);
    } else if (i < N + NV) {
      const a = rnd() * Math.PI * 2, y = BASE + [30, 48, 62, 78, 90][(rnd() * 5) | 0];
      aA.set([2.0 + rnd() * 1.6, 1, 2.5 + rnd() * 3, rnd()], o); aB.set([Math.sin(a) * 6, y, Math.cos(a) * 6, 0], o);
    } else if (i < N + NV + NC) {
      const a = rnd() * Math.PI * 2, r = 200 + rnd() * 1400;
      aA.set([0, 2, 380 + rnd() * 520, rnd()], o); aB.set([Math.cos(a) * r, 1300 + rnd() * 700, Math.sin(a) * r, 0], o);
    } else if (i < N + NV + NC + NI) {
      const a = rnd() * Math.PI * 2, y = BASE + 18 + rnd() * 75;
      aA.set([IGN - 0.1 + rnd() * 0.6, 3, 0.7 + rnd() * 1.4, rnd()], o); aB.set([Math.sin(a) * 5.4, y, Math.cos(a) * 5.4, 0], o);
    } else {
      const k = (i - N - NV - NC - NI) / NT, ts = LIFT + 0.25 + k * (CUTOFF - LIFT - 0.3), p = nozzleAt(ts);
      aA.set([ts, 4, 14 + rnd() * 10, rnd()], o); aB.set([p.x + (rnd() - 0.5) * 6, p.y - 40 - rnd() * 60, p.z + (rnd() - 0.5) * 6, 0], o);
    }
  }
  const quad = new THREE.InstancedBufferGeometry();
  const pg = new THREE.PlaneGeometry(1, 1);
  quad.index = pg.index; quad.attributes.position = pg.attributes.position; quad.attributes.uv = pg.attributes.uv;
  quad.setAttribute('aA', new THREE.InstancedBufferAttribute(aA, 4));
  quad.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 4));
  quad.instanceCount = total;
  const smoke = new THREE.Mesh(quad, smokeMat(smokeTex()));
  smoke.frustumCulled = false; smoke.renderOrder = 2;
  scene.add(smoke);

  const resize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  resize();
  addEventListener('resize', resize);

  const tmp = new THREE.Vector3(), look = new THREE.Vector3(), nozzle = new THREE.Vector3();
  const narrow = () => innerWidth / innerHeight < 0.9;

  // four shots, cut on the beat of the countdown: wide pad, engines, long lens, chase
  function shoot(t, alt) {
    const n = narrow();
    if (t < 4.25) {
      const k = smooth(2.3, 4.25, t);
      // close and low: the rocket fills the frame top to bottom
      camera.position.set(n ? lerp(-80, -72, k) : lerp(-74, -64, k), lerp(3, 4, k), n ? lerp(118, 106, k) : lerp(100, 86, k));
      look.set(-4, 58, 0); camera.fov = n ? 48 : 50;
    } else if (t < 5.35) {
      const k = smooth(4.25, 5.35, t);
      // up on the launcher deck, at the engine bells: the flame, the smoke, the first inch of movement
      camera.position.set(lerp(-46, -42, k), lerp(13, 14, k), n ? lerp(76, 70, k) : lerp(60, 55, k));
      look.set(0, 22 + alt * 0.7, 0); camera.fov = n ? 70 : 56;
    } else if (t < 6.5) {
      camera.position.set(-520, 3, 760);
      look.set(0, BASE + alt + 50, 0); camera.fov = n ? 16 : 10.5;
    } else {
      const k = smooth(6.5, 8.1, t);
      tmp.set(lerp(-210, -160, k), lerp(-110, -160, k), lerp(170, 130, k));
      camera.position.copy(rocket.position).add(tmp);
      look.copy(rocket.position).y += BASE + 55; camera.fov = n ? 50 : 38;
    }
  }

  function render(t) {
    const alt = altAt(t);
    const pitch = 0.16 * smooth(6.0, 8.0, t);
    rocket.position.set(alt * Math.sin(pitch) * 0.3, alt, 0);
    rocket.rotation.z = -pitch;
    const k = Math.max(0, t - SEP); // staging: the spent first stage drops back and tumbles
    const gap = k * 40 + k * k * 120;
    lower.position.set(k * 14, -gap, -k * 8);
    lower.rotation.set(k * 0.2, 0, k * 0.35);
    arms.forEach((a, i) => { a.rotation.y = -1.35 * smooth(LIFT - 0.15 + i * 0.03, LIFT + 0.25 + i * 0.03, t); }); // swing arms retract at liftoff
    beacon.visible = Math.sin(t * 5) > 0;

    const power = smooth(IGN, IGN + 0.35, t) * (1 - smooth(CUTOFF, CUTOFF + 0.1, t));
    const flick = 0.9 + 0.1 * Math.sin(t * 53) * Math.sin(t * 31 + 1);
    const thin = smooth(5.8, 7.8, t); // thinner air, wider plume
    core.scale.set(85 * (1 + thin * 0.8), 170 * power * flick, 85 * (1 + thin * 0.8));
    outer.scale.set(85 * (1 + thin * 2.4), 240 * power * flick, 85 * (1 + thin * 2.4));
    const vp = smooth(S2, S2 + 0.25, t);
    vac.scale.set(22, Math.min(90 * vp, Math.max(0, gap - 8)), 22); // never longer than the gap to the falling stage
    plumes.forEach((m) => { m.uniforms.uTime.value = t; });
    plumes[0].uniforms.uPower.value = plumes[1].uniforms.uPower.value = power;
    plumes[2].uniforms.uPower.value = vp * 0.6;
    glow.scale.setScalar(26 * power * flick);
    glow.material.opacity = 0.8 * power;
    const sf = smooth(SEP, SEP + 0.04, t) * (1 - smooth(SEP + 0.08, SEP + 0.35, t)); // retro-rockets fire at staging
    sepFlash.scale.setScalar(70 * sf); sepFlash.material.opacity = sf;

    lower.localToWorld(nozzle.set(0, BASE, 0));
    fireLight.position.copy(nozzle).y -= 6;
    bodyLight.position.copy(nozzle).add(tmp.set(-34, -12, 44));
    bodyLight.intensity = (lowPower ? 1.5e5 : 3e5) * power * flick * smooth(LIFT, LIFT + 0.4, t);
    fireLight.intensity = (lowPower ? 7e5 : 1.4e6) * power * flick * (1 - thin * 0.85);
    sky.material.uniforms.uAlt.value = thin;
    scene.fog.density = 0.00022 * (1 - thin * 0.8);
    floods.forEach((f, i) => { f.intensity = (i ? 30000 : 70000) * (1 - smooth(5.8, 6.6, t)); });

    const su = smoke.material.uniforms;
    su.uTime.value = t; su.uFlame.value = power * (1 - smooth(5.8, 6.8, t)); su.uAlt.value = thin;
    su.uNozzle.value.copy(nozzle);

    const shake = (t < 5.35 ? 0.45 : 0.25) * smooth(IGN, IGN + 0.3, t) * (1 - smooth(LIFT + 0.8, LIFT + 1.8, t));
    shoot(t, alt);
    camera.position.x += Math.sin(t * 87) * shake; camera.position.y += Math.sin(t * 71 + 1) * shake;
    camera.updateProjectionMatrix();
    camera.lookAt(look);
    renderer.render(scene, camera);
  }

  // compile while the visitor reads the sound gate, so the launch doesn't stutter
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  render(2.4);

  return {
    render,
    dispose() {
      removeEventListener('resize', resize);
      scene.traverse((o) => { o.geometry?.dispose(); [].concat(o.material || []).forEach((m) => { Object.values(m).forEach((v) => v?.isTexture && v.dispose()); m.dispose(); }); });
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
}
