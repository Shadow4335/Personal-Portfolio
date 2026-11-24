import * as THREE from 'three';

// The launch in real 3D, for chapter two of the opening film. Units are metres.
// A pure function of film time t: render(t) can be called with any t, so skipping is safe.
// The 2D film draws the countdown, telemetry and callouts on top.

const IGN = 4.6, LIFT = 5.0, MECO = 6.9, SEP = 7.3;
const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const altAt = (t) => (t < LIFT ? 0 : 140 * (t - LIFT) ** 2.2);

/* ── textures drawn on canvases (no downloads) ─────────────── */
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// first-stage paint: off-white, weld lines, a sooty base, an orange band and the flight number
function liveryTex(stage) {
  return canvasTex(1024, 2048, (g, w, h) => {
    g.fillStyle = '#ebe7df'; g.fillRect(0, 0, w, h);
    // subtle panel-to-panel tone variation
    for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(0,0,0,${0.012 + (i % 3) * 0.008})`; g.fillRect(0, (i / 9) * h, w, h / 9); }
    // weld lines and a vertical seam
    g.strokeStyle = 'rgba(70,70,70,0.28)'; g.lineWidth = 2;
    for (let i = 1; i < 9; i++) { g.beginPath(); g.moveTo(0, (i / 9) * h); g.lineTo(w, (i / 9) * h); g.stroke(); }
    g.beginPath(); g.moveTo(w * 0.62, 0); g.lineTo(w * 0.62, h); g.stroke();
    if (stage === 1) {
      // soot from the engines climbs a little way up the booster
      const s = g.createLinearGradient(0, h, 0, h * 0.82);
      s.addColorStop(0, 'rgba(40,32,26,0.75)'); s.addColorStop(1, 'rgba(40,32,26,0)');
      g.fillStyle = s; g.fillRect(0, h * 0.8, w, h * 0.2);
      g.fillStyle = '#ff5a1f'; g.fillRect(0, h * 0.135, w, h * 0.018);
      // the flight number, vertical, on the side the camera sees
      g.save(); g.translate(w * 0.9, h * 0.52); g.rotate(-Math.PI / 2);
      g.fillStyle = '#1b1c20'; g.font = '800 150px "Archivo Variable", Archivo, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('AV26', 0, 0);
      g.font = '600 34px "JetBrains Mono Variable", monospace'; g.fillText('ARNAV VERMA · FLIGHT 26', 0, 120);
      g.restore();
    } else {
      g.save(); g.translate(w * 0.9, h * 0.5); g.rotate(-Math.PI / 2);
      g.fillStyle = '#1b1c20'; g.font = '600 52px "JetBrains Mono Variable", monospace'; g.textAlign = 'center';
      g.fillText('STAGE 2', 0, 0);
      g.restore();
    }
    // tiny weathering speckle
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(60,55,50,${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  });
}

function smokeTex() {
  // soft puff: a radial falloff broken up by four octaves of value noise
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
  }, false);
}

function glowTex() {
  return canvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,200,140,0.6)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }, false);
}

/* ── shaders ──────────────────────────────────────────────── */
const NOISE = `
float h3(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ return 0.55*vn(p)+0.3*vn(p*2.1)+0.15*vn(p*4.3); }`;

const skyMat = () => new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { uAlt: { value: 0 }, uSun: { value: new THREE.Vector3(0.97, 0.035, 0.24).normalize() } },
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
  fragmentShader: `uniform float uAlt; uniform vec3 uSun; varying vec3 vDir;
    float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
    void main(){
      float h = vDir.y;
      vec3 zen = mix(vec3(0.02,0.045,0.11), vec3(0.002,0.003,0.008), uAlt);
      vec3 mid = mix(vec3(0.09,0.15,0.3), vec3(0.006,0.008,0.02), uAlt);
      vec3 hor = mix(vec3(0.55,0.33,0.24), vec3(0.03,0.06,0.13), uAlt);
      vec3 col = h > 0.0 ? mix(mix(hor, mid, smoothstep(0.0,0.12,h)), zen, smoothstep(0.12,0.75,h)) : mix(hor*0.35, vec3(0.008), smoothstep(0.0,-0.15,h));
      float s = max(dot(vDir, uSun), 0.0);
      col += vec3(1.0,0.5,0.25)*pow(s,18.0)*0.55*(1.0-0.5*uAlt) + vec3(1.0,0.85,0.7)*pow(s,900.0)*4.0;
      float st = step(0.9982, hash(floor(vDir*700.0)));
      col += st * smoothstep(0.02,0.25,h) * mix(0.12, 1.1, uAlt);
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
      float y = vUv.y;                          // 0 at the nozzle, 1 at the tail
      float n = fbm(vec3(vUv.x*7.0, y*9.0 - uTime*16.0, uTime*1.7));
      float along = pow(1.0 - y, uOuter > 0.5 ? 0.9 : 1.2);
      float edge = pow(vFace, uOuter > 0.5 ? 2.0 : 1.2);
      float core = (1.0 - smoothstep(0.02, 0.45, y)) * edge;
      vec3 hot = vec3(1.0,0.96,0.88), mid = mix(vec3(1.0,0.58,0.22), vec3(0.62,0.72,1.0), uVac), cool = mix(vec3(0.85,0.28,0.06), vec3(0.25,0.35,0.9), uVac);
      vec3 col = mix(cool, mid, along); col = mix(col, hot, core*(1.0-uOuter));
      float dia = (1.0-uVac)*(1.0-uOuter)*pow(0.5+0.5*cos(y*70.0 - 0.4), 8.0)*(1.0-smoothstep(0.05,0.5,y));
      float a = along*edge*(0.55+0.6*n)*uPower*(uOuter > 0.5 ? 0.35 : 1.0);
      gl_FragColor = vec4(col*(a*(uOuter > 0.5 ? 1.0 : 1.7) + dia*1.3*uPower), 1.0);
    }`,
});

// smoke, vapour and clouds: instanced camera-facing quads whose motion is computed from time on the GPU
const smokeMat = (tex) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uTime: { value: 0 }, uTex: { value: tex }, uFlame: { value: 0 }, uNozzle: { value: new THREE.Vector3() }, uRocket: { value: new THREE.Vector3() }, uAlt: { value: 0 } },
  vertexShader: `attribute vec4 aA; attribute vec4 aB; // aA: spawn, kind, size, seed  aB: dir.xyz, speed
    uniform float uTime; uniform vec3 uRocket; varying vec2 vUv; varying float vAlpha; varying vec3 vWorld; varying float vSeed; varying float vKind;
    void main(){
      float age = uTime - aA.x, kind = aA.y, size = aA.z, seed = aA.w;
      vec3 p; float s = size, al = 0.0;
      if (kind < 0.5) {                              // exhaust smoke out of the flame trench
        float k = 1.2; vec3 d = aB.xyz * aB.w;
        p = vec3(0.0, 3.0, 0.0) + d*(1.0-exp(-age*k))/k + vec3(0.0, 4.0*age + 1.5*age*age, 0.0);
        s = size*(1.0 + age*2.3); al = smoothstep(0.0,0.15,age)*(1.0-smoothstep(4.0,8.0,age))*0.92;
      } else if (kind < 1.5) {                       // cold vapour venting off the tanks, drifting down
        float a2 = mod(age, 1.6); p = uRocket + aB.xyz + vec3(aB.x*0.8*a2, -2.5*a2, aB.z*0.8*a2);
        s = size*(1.0 + a2*1.8); al = (age > 0.0 ? 1.0 : 0.0)*smoothstep(0.0,0.2,a2)*(1.0-smoothstep(0.6,1.6,a2))*0.5*(1.0-smoothstep(4.6,5.0,uTime));
      } else {                                       // cloud deck high above the pad
        p = aB.xyz + vec3(sin(uTime*0.05+seed*6.0)*20.0, 0.0, 0.0); s = size; al = 0.38;
      }
      if (age < 0.0) al = 0.0;
      vAlpha = al; vSeed = seed; vKind = kind; vWorld = p;
      vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      float r = seed*6.283; vec2 c = mat2(cos(r),-sin(r),sin(r),cos(r))*(position.xy);
      vec3 world = p + (right*c.x + up*c.y)*s;
      vUv = uv;
      gl_Position = al > 0.0 ? projectionMatrix*viewMatrix*vec4(world,1.0) : vec4(2.0,2.0,2.0,1.0);
    }`,
  fragmentShader: `uniform sampler2D uTex; uniform float uFlame, uAlt; uniform vec3 uNozzle; varying vec2 vUv; varying float vAlpha; varying vec3 vWorld; varying float vSeed; varying float vKind;
    void main(){
      float a = texture2D(uTex, vUv).a * vAlpha;
      if (a < 0.01) discard;
      vec3 base = vKind > 1.5 ? vec3(0.52,0.55,0.62) : vec3(0.8,0.79,0.8);
      base *= 0.55 + 0.45*vUv.y;                                  // lit from above
      float d = length(vWorld - uNozzle);
      vec3 fire = vec3(1.0,0.46,0.14) * uFlame * 4.0 * exp(-d/48.0) * (1.3 - vUv.y*0.7);
      vec3 col = base * mix(0.55, 0.12, uAlt) + fire;
      gl_FragColor = vec4(col, a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});

/* ── geometry helpers ─────────────────────────────────────── */
function bell(throat, exit, len, segs = 32) {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const k = i / 12; pts.push(new THREE.Vector2(throat + (exit - throat) * Math.sqrt(k) * (0.6 + 0.4 * k), -k * len)); }
  return new THREE.LatheGeometry(pts, segs);
}

export async function createLaunch3D(canvas, { lowPower = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowPower ? 1.25 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 80000);

  // sky, and a dawn environment for the paint and metal to reflect
  const sky = new THREE.Mesh(new THREE.SphereGeometry(60000, 48, 24), skyMat());
  sky.frustumCulled = false;
  scene.add(sky);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat()));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
  scene.fog = new THREE.FogExp2(0x1b2335, 0.00028);

  // light: a low dawn sun, cool sky fill, two xenon floodlights on the pad, and the flame itself
  const sun = new THREE.DirectionalLight(0xffc29a, 2.4);
  sun.position.set(1000, 70, 240);
  sun.castShadow = !lowPower;
  Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 140, bottom: -20, near: 10, far: 3000 });
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0x5d7bb0, 0x0b0b0e, 0.55));
  const floods = [-1, 1].map((sx) => {
    const l = new THREE.SpotLight(0xe6eeff, 2600, 700, 0.22, 0.6, 1.6);
    l.position.set(sx * 70, 75, 160);
    l.target.position.set(0, 38, 0);
    scene.add(l, l.target);
    return l;
  });
  const fireLight = new THREE.PointLight(0xff8a3a, 0, 520, 2);
  scene.add(fireLight);

  /* ground, hills and pad */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const hillGeo = new THREE.CylinderGeometry(9000, 9000, 420, 96, 1, true);
  const hp = hillGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) if (hp.getY(i) > 0) hp.setY(i, 210 * (0.3 + 0.7 * Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11))));
  scene.add(new THREE.Mesh(hillGeo, new THREE.MeshBasicMaterial({ color: 0x07080b, side: THREE.BackSide, fog: true })));

  const concrete = new THREE.MeshStandardMaterial({ color: 0x45474b, roughness: 0.92 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x6d727b, metalness: 0.6, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.7 });
  const add = (geo, mat, x, y, z, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; scene.add(m); return m; };
  add(new THREE.BoxGeometry(90, 3, 90), concrete, 0, 1.5, 0, false);
  add(new THREE.BoxGeometry(16, 1, 60), dark, 0, 3.05, 22, false);           // flame trench
  add(new THREE.CylinderGeometry(3.4, 4.2, 3, 24), steel, 0, 4.5, 0);        // hold-down ring

  // fixed service tower: a steel lattice from instanced beams, with a red obstruction light on top
  const TX = -15, TH = 92, TW = 9, LV = 4;
  const beams = [];
  for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) beams.push([TX + (cx * TW) / 2, TH / 2, (cz * TW) / 2, 0.6, TH, 0.6, 0, 0]);
  for (let y = LV; y < TH; y += LV) {
    beams.push([TX, y, -TW / 2, TW, 0.35, 0.35, 0, 0], [TX, y, TW / 2, TW, 0.35, 0.35, 0, 0], [TX - TW / 2, y, 0, 0.35, 0.35, TW, 0, 0], [TX + TW / 2, y, 0, 0.35, 0.35, TW, 0, 0]);
    const diag = Math.hypot(TW, LV), ang = Math.atan2(LV, TW);
    beams.push([TX, y - LV / 2, -TW / 2, diag, 0.25, 0.25, 0, (y / LV) % 2 ? ang : -ang], [TX, y - LV / 2, TW / 2, diag, 0.25, 0.25, 0, (y / LV) % 2 ? -ang : ang]);
    beams.push([TX + TW / 2, y - LV / 2, 0, 0.25, 0.25, diag, (y / LV) % 2 ? ang : -ang, 0]);
  }
  const lattice = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), steel, beams.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  beams.forEach(([x, y, z, sx, sy, sz, rx, rz], i) => {
    q.setFromEuler(e.set(rx, 0, rz));
    lattice.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz)));
  });
  lattice.castShadow = true;
  scene.add(lattice);
  const arm = new THREE.Group();
  arm.position.set(TX + TW / 2, 66, 0);
  const armBox = new THREE.Mesh(new THREE.BoxGeometry(10, 2.4, 2.6), steel);
  armBox.position.x = 5; armBox.castShadow = true;
  arm.add(armBox);
  scene.add(arm);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  beacon.position.set(TX, TH + 2, 0);
  scene.add(beacon);
  // lightning masts with their catenary wires, as on real pads
  const mastPts = [[-95, -110], [105, -95], [20, -190]];
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x1c1e22, metalness: 0.2, roughness: 0.9 });
  mastPts.forEach(([x, z]) => add(new THREE.CylinderGeometry(0.35, 0.6, 130, 8), mastMat, x, 65, z));
  const wire = new THREE.BufferGeometry().setFromPoints(mastPts.flatMap(([x, z], i) => {
    const [x2, z2] = mastPts[(i + 1) % 3], pts = [];
    for (let k = 0; k <= 16; k++) { const f = k / 16; pts.push(new THREE.Vector3(x + (x2 - x) * f, 130 - Math.sin(f * Math.PI) * 28, z + (z2 - z) * f)); }
    return pts.flatMap((p, j) => (j ? [pts[j - 1], p] : []));
  }));
  scene.add(new THREE.LineSegments(wire, new THREE.LineBasicMaterial({ color: 0x3a3e46, fog: true })));

  /* the rocket: about 75 m tall, 3.7 m wide */
  const rocket = new THREE.Group(), lower = new THREE.Group(), upper = new THREE.Group();
  rocket.add(lower, upper);
  scene.add(rocket);
  const paint1 = new THREE.MeshPhysicalMaterial({ map: liveryTex(1), roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.35 });
  const paint2 = new THREE.MeshPhysicalMaterial({ map: liveryTex(2), roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.35 });
  const white = new THREE.MeshPhysicalMaterial({ color: 0xeeebe4, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.3 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x101113, roughness: 0.5, metalness: 0.2 });
  const engineMetal = new THREE.MeshStandardMaterial({ color: 0x2b2b2f, metalness: 0.9, roughness: 0.32, side: THREE.DoubleSide });
  const niobium = new THREE.MeshStandardMaterial({ color: 0x4a3f36, metalness: 0.92, roughness: 0.28, side: THREE.DoubleSide });
  const part = (group, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; group.add(m); return m; };
  const R = 1.85;
  // nine engines in an octaweb
  const bellGeo = bell(0.18, 0.46, 1.7);
  part(lower, bellGeo, engineMetal, 0, 1.75, 0);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; part(lower, bellGeo, engineMetal, Math.cos(a) * 1.18, 1.75, Math.sin(a) * 1.18); }
  part(lower, new THREE.CylinderGeometry(R, R * 0.98, 0.5, 48), carbon, 0, 2, 0);
  const s1 = part(lower, new THREE.CylinderGeometry(R, R, 41, 64), paint1, 0, 22.75, 0);
  s1.rotation.y = 0.35;
  part(lower, new THREE.BoxGeometry(0.28, 38, 0.22), white, Math.sin(-1.1) * (R + 0.08), 22, Math.cos(-1.1) * (R + 0.08)).rotation.y = -1.1; // cable raceway
  // landing legs folded against the booster
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2, leg = new THREE.Group();
    leg.position.set(Math.sin(a) * (R + 0.18), 2.4, Math.cos(a) * (R + 0.18)); leg.rotation.y = a;
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9.6, 0.3), carbon); l.position.y = 4.8; l.castShadow = true; leg.add(l);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.45), engineMetal); foot.position.y = 0.2; leg.add(foot);
    lower.add(leg);
  }
  // grid fins near the top of the booster
  const finTex = canvasTex(64, 64, (g, w) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, w); g.fillStyle = '#fff'; for (let k = 0; k < w; k += 8) { g.fillRect(k, 0, 2, w); g.fillRect(0, k, w, 2); } g.fillRect(0, 0, w, 4); g.fillRect(0, w - 4, w, 4); g.fillRect(0, 0, 4, w); g.fillRect(w - 4, 0, 4, w); }, false);
  const finMat = new THREE.MeshStandardMaterial({ color: 0x2e3036, metalness: 0.8, roughness: 0.4, alphaMap: finTex, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2, fin = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.3), finMat);
    fin.position.set(Math.sin(a) * (R + 0.75), 41.2, Math.cos(a) * (R + 0.75)); fin.rotation.y = a + Math.PI / 2; fin.castShadow = true;
    lower.add(fin);
  }
  part(lower, new THREE.CylinderGeometry(R + 0.01, R + 0.01, 6.5, 64), carbon, 0, 46.5, 0); // interstage
  // second stage: tank, vacuum engine (hidden in the interstage until separation), fairing
  part(upper, bell(0.32, 1.45, 4.2, 40), niobium, 0, 49.6, 0);
  const s2 = part(upper, new THREE.CylinderGeometry(R, R, 12.5, 64), paint2, 0, 55.85, 0);
  s2.rotation.y = 0.35;
  const fp = [];
  for (let i = 0; i <= 40; i++) {
    const y = 62 + (i / 40) * 13.6;
    let r;
    if (y < 63.4) r = R + ((y - 62) / 1.4) * (2.6 - R);
    else if (y < 69) r = 2.6;
    else { const k = (y - 69) / 6.6; r = 2.6 * Math.sqrt(Math.max(0, 1 - k * k * 0.98)); }
    fp.push(new THREE.Vector2(Math.max(r, 0.05), y));
  }
  const fairing = new THREE.Mesh(new THREE.LatheGeometry(fp, 64), new THREE.MeshPhysicalMaterial({ map: canvasTex(512, 512, (g, w) => { g.fillStyle = '#eeebe4'; g.fillRect(0, 0, w, w); g.fillStyle = 'rgba(40,40,40,0.35)'; g.fillRect(w * 0.25 - 1, 0, 3, w); g.fillRect(w * 0.75 - 1, 0, 3, w); }), roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: 0.55 }));
  fairing.castShadow = true;
  upper.add(fairing);

  /* exhaust */
  const plumeGeo = (len, r0, r1) => {
    const pts = [];
    for (let i = 0; i <= 24; i++) { const k = i / 24; pts.push(new THREE.Vector2(r0 + (r1 - r0) * Math.pow(k, 0.6), -k * len)); }
    const g = new THREE.LatheGeometry(pts, 32);
    const uv = g.attributes.uv; // lathe uv.y runs along the profile; flip so 0 sits at the nozzle
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    return g;
  };
  const plumes = [plumeMat(false, false), plumeMat(false, true), plumeMat(true, false)];
  const core = new THREE.Mesh(plumeGeo(1, 0.06, 0.16), plumes[0]);
  const outer = new THREE.Mesh(plumeGeo(1, 0.08, 0.38), plumes[1]);
  const vac = new THREE.Mesh(plumeGeo(1, 0.08, 0.3), plumes[2]);
  [core, outer].forEach((m) => { m.position.y = 0.1; m.frustumCulled = false; m.renderOrder = 3; lower.add(m); }); // the flame shines through the smoke
  vac.position.y = 45.4; vac.frustumCulled = false; vac.renderOrder = 3; upper.add(vac);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.position.y = -1; glow.renderOrder = 4; lower.add(glow);

  /* smoke, vapour and clouds */
  const N = lowPower ? 300 : 760, NV = lowPower ? 24 : 48, NC = lowPower ? 26 : 55;
  const total = N + NV + NC, aA = new Float32Array(total * 4), aB = new Float32Array(total * 4);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (i < N) { // exhaust: most leaves along the trench, some billows up and out
      const along = rnd() < 0.7, side = rnd() < 0.5 ? -1 : 1, ang = rnd() * Math.PI * 2;
      // the trench vents left and right, so the cloud spreads across the frame rather than at the camera
      const dir = along ? new THREE.Vector3(side, 0.12 + rnd() * 0.25, (rnd() - 0.5) * 0.5).normalize() : new THREE.Vector3(Math.cos(ang), 0.25 + rnd() * 0.45, Math.sin(ang) * 0.35).normalize();
      aA.set([IGN + 0.05 + rnd() * 2.4, 0, 5 + rnd() * 9, rnd()], o); aB.set([dir.x, dir.y, dir.z, 30 + rnd() * 75], o);
    } else if (i < N + NV) {
      const a = rnd() * Math.PI * 2, y = [34, 44, 52, 58][(rnd() * 4) | 0];
      aA.set([2.0 + rnd() * 1.6, 1, 1 + rnd() * 1.4, rnd()], o); aB.set([Math.sin(a) * 2.2, y, Math.cos(a) * 2.2, 0], o);
    } else {
      const a = rnd() * Math.PI * 2, r = 80 + rnd() * 900;
      aA.set([0, 2, 260 + rnd() * 420, rnd()], o); aB.set([Math.cos(a) * r, 700 + rnd() * 450, Math.sin(a) * r, 0], o);
    }
  }
  const quad = new THREE.InstancedBufferGeometry();
  const pg = new THREE.PlaneGeometry(1, 1);
  quad.index = pg.index; quad.attributes.position = pg.attributes.position; quad.attributes.uv = pg.attributes.uv;
  quad.setAttribute('aA', new THREE.InstancedBufferAttribute(aA, 4));
  quad.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 4));
  quad.instanceCount = total;
  const smoke = new THREE.Mesh(quad, smokeMat(smokeTex()));
  smoke.frustumCulled = false;
  smoke.renderOrder = 2;
  scene.add(smoke);

  /* sizing */
  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);

  const tmp = new THREE.Vector3(), look = new THREE.Vector3(), nozzle = new THREE.Vector3();
  const narrow = () => innerWidth / innerHeight < 0.9;

  function render(t) {
    const alt = altAt(t);
    const pitch = 0.2 * smooth(6.0, 8.2, t);
    rocket.position.set(alt * Math.sin(pitch) * 0.35, alt, 0);
    rocket.rotation.z = -pitch;
    // separation: the spent booster falls back and tumbles; the second stage lights up
    const k = Math.max(0, t - SEP);
    lower.position.set(k * 8, -(k * 30 + k * k * 80), -k * 5); // drops back, drifting away from the camera
    lower.rotation.set(k * 0.25, 0, k * 0.4);
    arm.rotation.y = -1.25 * smooth(IGN - 1.2, IGN - 0.3, t); // access arm swings away before ignition

    const power = smooth(IGN, IGN + 0.3, t) * (1 - smooth(MECO, MECO + 0.12, t));
    const flick = 0.9 + 0.1 * Math.sin(t * 53) * Math.sin(t * 31 + 1);
    const thin = smooth(5.6, 8.0, t); // the air thins and the plume spreads
    core.scale.set(19 * (1 + thin * 0.8), 62 * power * flick, 19 * (1 + thin * 0.8));
    outer.scale.set(19 * (1 + thin * 2.4), 88 * power * flick, 19 * (1 + thin * 2.4));
    const vp = smooth(SEP + 0.5, SEP + 0.9, t); // second stage lights once the booster is clear
    vac.scale.set(18, 30 * vp, 18);
    plumes.forEach((m) => { m.uniforms.uTime.value = t; });
    plumes[0].uniforms.uPower.value = plumes[1].uniforms.uPower.value = power;
    plumes[2].uniforms.uPower.value = vp;
    glow.scale.setScalar(15 * power * flick);
    glow.material.opacity = 0.75 * power;

    lower.localToWorld(nozzle.set(0, 0, 0));
    fireLight.position.copy(nozzle).y -= 4;
    fireLight.intensity = (lowPower ? 380000 : 900000) * power * flick * (1 - thin * 0.8); // no shadows on phones, so less light
    sky.material.uniforms.uAlt.value = thin;
    scene.fog.density = 0.00028 * (1 - thin * 0.85);
    floods.forEach((f) => { f.intensity = 2600 * (1 - smooth(5.5, 6.5, t)); });
    beacon.visible = Math.sin(t * 5) > 0;

    const su = smoke.material.uniforms;
    su.uTime.value = t; su.uFlame.value = power * (1 - smooth(5.6, 6.6, t)); su.uAlt.value = thin;
    su.uNozzle.value.copy(nozzle); su.uRocket.value.copy(rocket.position);

    // camera: a long lens on the ground, then a chase view as it climbs
    const shake = 0.35 * smooth(IGN, IGN + 0.2, t) * (1 - smooth(LIFT + 0.6, LIFT + 1.6, t));
    if (t < 5.9) {
      const push = smooth(2.3, 5.9, t);
      camera.position.set(-118 + push * 12, 4 + push * 1.5, narrow() ? 250 - push * 18 : 176 - push * 14);
      look.set(0, 34 + alt * 0.92 - 8 * smooth(LIFT, LIFT + 0.6, t), 0);
      camera.fov = (narrow() ? 42 : 30) - smooth(LIFT, 5.9, t) * 6;
    } else {
      const c = smooth(5.9, 8.2, t);
      tmp.set(-78 + c * 16, -22 - c * 26, 46 - c * 10);
      camera.position.copy(rocket.position).add(tmp);
      look.copy(rocket.position).y += 22;
      camera.fov = narrow() ? 55 : 42;
    }
    camera.position.x += Math.sin(t * 87) * shake; camera.position.y += Math.sin(t * 71 + 1) * shake;
    camera.updateProjectionMatrix();
    camera.lookAt(look);
    sun.target.position.copy(rocket.position);
    renderer.render(scene, camera);
  }

  // compile everything now, while the visitor reads the sound gate, so the launch doesn't stutter
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
