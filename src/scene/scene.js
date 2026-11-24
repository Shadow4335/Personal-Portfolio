// WebGL scene for the portfolio: Earth, atmosphere, Moon, Sun, stars and the
// scroll-driven camera journey from low Earth orbit to the Pale Blue Dot.
// World units: Earth radius = 1, Earth at the origin, Sun is a fixed direction.
import * as THREE from 'three';
import { feature } from 'topojson-client';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

const ATMO_R = 1.035; // analytic top of atmosphere
const ATMO_GEO_R = ATMO_R * 1.012; // mesh radius, a bit larger so facets never clip the glow
const MOON_R = 0.27;
const MOON_DIST = 59.4;
const ISS_R = 1.065;
const HERO_ALT = 0.08;
const INTRO_ALT = 0.0016;
const INTRO_ARC = 13 * DEG; // pre-launch site sits this far toward the sun from the hero sub-point
const SUN_EL = -19.7 * DEG; // sun elevation at hero sub-point: just above the 22.2 deg limb dip
const SUN_AZ = 11 * DEG; // sun right of centre in the hero shot
const SPIN_RATE = TAU / 360; // one revolution per 6 minutes

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const smoother = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

// ---------------------------------------------------------------- GLSL ----

const GLSL_COMMON = /* glsl */ `
#define S_PI 3.14159265
#define S_TAU 6.28318531
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash13(i), b = hash13(i + vec3(1, 0, 0));
  float c = hash13(i + vec3(0, 1, 0)), d = hash13(i + vec3(1, 1, 0));
  float e = hash13(i + vec3(0, 0, 1)), g = hash13(i + vec3(1, 0, 1));
  float h = hash13(i + vec3(0, 1, 1)), k = hash13(i + vec3(1, 1, 1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}
float fbm(vec3 p, int oct) {
  const mat3 R = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 9; i++) {
    if (i >= oct) break;
    s += a * vnoise(p);
    n += a;
    p = R * p * 2.03 + 1.7;
    a *= 0.5;
  }
  return s / n;
}
// geographic frame: lon 0 faces +z, east toward +x, north +y
vec2 dirToUv(vec3 n) { return vec2(atan(n.x, n.z) / S_TAU + 0.5, asin(clamp(n.y, -1.0, 1.0)) / S_PI + 0.5); }
vec3 uvToDir(vec2 uv) {
  float lon = (uv.x - 0.5) * S_TAU, lat = (uv.y - 0.5) * S_PI;
  return vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
}
// equirect lookup without the mip seam at the antimeridian
vec4 texSeam(sampler2D t, vec2 uv) {
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  dx.x -= floor(dx.x + 0.5);
  dy.x -= floor(dy.x + 0.5);
  return textureGrad(t, uv, dx, dy);
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

const BAKE_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// R land, G cloud, B city lights, A aridity
const EARTH_BAKE_FS = /* glsl */ `
uniform sampler2D uMask;
varying vec2 vUv;
float mask(vec3 d) { return texture(uMask, dirToUv(d)).r; }
// gaussian city footprints scattered on a 3D grid, denser where pop is high
float cities(vec3 p, float freq, float seed, float pop) {
  vec3 x = p * freq, i = floor(x);
  float s = 0.0;
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int l = -1; l <= 1; l++) {
    vec3 cell = i + vec3(float(l), float(j), float(k));
    vec3 h = hash33(cell + seed);
    if (h.x > pop * 1.4) continue;
    vec3 c = cell + hash33(cell * 1.7 + seed + 9.0) - x;
    float r = mix(0.07, 0.3, h.y * h.y);
    s += (0.3 + 0.7 * h.z) * exp(-dot(c, c) / (r * r));
  }
  return s;
}
void main() {
  vec3 n = uvToDir(vUv);
  float latD = asin(clamp(n.y, -1.0, 1.0)) * 57.2958;
  float alat = abs(latD);
  vec3 w = vec3(fbm(n * 5.0, 4), fbm(n * 5.0 + 19.1, 4), fbm(n * 5.0 + 41.7, 4)) - 0.5;
  float m = mask(normalize(n + w * 0.03));
  float land = smoothstep(0.45, 0.55, m + (fbm(n * 36.0, 5) - 0.5) * 0.5);
  vec3 t1 = normalize(cross(n, vec3(0.0013, 1.0, 0.0007)));
  vec3 t2 = cross(n, t1);
  float inland = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    inland += mask(normalize(n + (t1 * cos(a) + t2 * sin(a)) * 0.08));
  }
  inland /= 8.0;
  float subtrop = exp(-pow((alat - 23.0) / 10.0, 2.0));
  float tropic = exp(-pow(alat / 10.0, 2.0));
  float arid = subtrop * (0.3 + 0.8 * inland) + inland * 0.12 - tropic * 0.3 + (fbm(n * 6.0 + 3.0, 5) - 0.5) * 0.8;
  arid = clamp(arid, 0.0, 1.0);

  // clouds: zonally stretched, two-level domain warp, thick decks plus thin wisps
  vec3 nz = n * vec3(1.0, 2.0, 1.0);
  vec3 q = vec3(fbm(nz * 1.7 + 1.3, 5), fbm(nz * 1.7 + 8.1, 5), fbm(nz * 1.7 + 15.7, 5));
  vec3 r = vec3(fbm(nz * 3.0 + q * 4.0 + 3.7, 5), fbm(nz * 3.0 + q * 4.0 + 9.2, 5), fbm(nz * 3.0 + q * 4.0 + 1.1, 5));
  float c = fbm(nz * 3.2 + (r - 0.5) * 3.5, 8);
  float bands = 0.05 * exp(-pow((latD - 5.0) / 7.0, 2.0)) - 0.07 * subtrop + 0.05 * exp(-pow((alat - 55.0) / 12.0, 2.0));
  float detail = fbm(nz * 18.0 + r * 6.0, 6);
  float thick = smoothstep(0.54, 0.7, c + bands) * (0.45 + 0.55 * smoothstep(0.38, 0.62, detail));
  float wisp = smoothstep(0.47, 0.56, c + bands) * smoothstep(0.5, 0.72, fbm(nz * 30.0 + r * 9.0, 5)) * 0.55;
  float cl = min(max(thick, wisp), 0.94);

  float cluster = smoothstep(0.5, 0.7, fbm(n * 11.0 + 7.0, 5));
  float coast = smoothstep(0.3, 0.55, m) * (1.0 - smoothstep(0.55, 0.9, inland));
  float habitable = land * (1.0 - smoothstep(0.4, 0.75, arid)) * (1.0 - smoothstep(55.0, 68.0, alat));
  float pop = habitable * clamp(cluster * 0.9 + coast * 0.5, 0.0, 1.0);
  float lights = clamp(pop * (0.03 + cities(n, 46.0, 1.0, pop) * 0.9 + cities(n, 130.0, 2.0, pop) * 0.6), 0.0, 1.0);
  gl_FragColor = vec4(land, cl, lights, arid);
}
`;

// RGB object-space normal, A albedo
const MOON_BAKE_FS = /* glsl */ `
varying vec2 vUv;
void craters(vec3 p, float freq, float seed, float density, inout vec3 g, inout float fresh) {
  vec3 x = p * freq;
  vec3 i = floor(x);
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int l = -1; l <= 1; l++) {
    vec3 cell = i + vec3(float(l), float(j), float(k));
    vec3 h = hash33(cell + seed);
    if (h.x > density) continue;
    vec3 c = cell + hash33(cell * 1.37 + seed * 3.1) - x;
    float r = mix(0.14, 0.46, h.y * h.y);
    float d = length(c);
    float t = d / r;
    if (t > 2.0) continue;
    float e = (t - 1.0) / 0.2;
    float rim = 0.3 * exp(-e * e);
    float dprof = (t < 1.0 ? 1.6 * t : 0.0) + rim * (-2.0 * e / 0.2);
    g += dprof * 0.2 * (-c / max(d, 1e-4));
    fresh += step(0.92, h.z) * (1.0 - smoothstep(0.6, 1.4, t));
  }
}
float rough(vec3 p) { return fbm(p * 60.0, 5); }
void main() {
  vec3 n = uvToDir(vUv);
  float mfield = fbm(n * 1.3 + 4.0, 7) + (fbm(n * 5.0, 4) - 0.5) * 0.12;
  float mare = smoothstep(0.52, 0.58, mfield);
  vec3 g = vec3(0.0);
  float fresh = 0.0;
  craters(n, 2.5, 1.0, 0.3, g, fresh);
  craters(n, 6.0, 2.0, 0.5, g, fresh);
  craters(n, 14.0, 3.0, mix(0.7, 0.25, mare), g, fresh);
#if OCT > 3
  craters(n, 31.0, 4.0, mix(0.8, 0.35, mare), g, fresh);
  craters(n, 70.0, 5.0, mix(0.85, 0.45, mare), g, fresh);
#endif
  // fine regolith roughness (finite differences of fbm)
  vec3 t1 = normalize(cross(n, vec3(0.0013, 1.0, 0.0007)));
  vec3 t2 = cross(n, t1);
  float e = 0.002, r0 = rough(n);
  g += ((rough(n + t1 * e) - r0) * t1 + (rough(n + t2 * e) - r0) * t2) / e * 0.004 * (1.0 - 0.5 * mare);
  vec3 gt = g - n * dot(g, n);
  vec3 N = normalize(n - gt);
  float alb = mix(0.16, 0.065, mare) * (0.78 + 0.44 * fbm(n * 9.0, 5)) + min(fresh, 1.0) * 0.07;
  gl_FragColor = vec4(N * 0.5 + 0.5, clamp(alb * 4.0, 0.0, 1.0));
}
`;

// Milky Way glow (sqrt-encoded for 8-bit precision in the darks)
const SKY_BAKE_FS = /* glsl */ `
uniform vec3 uG;
uniform vec3 uGC;
varying vec2 vUv;
void main() {
  vec3 d = uvToDir(vUv);
  float b = dot(d, uG);
  float lc = dot(normalize(d - uG * b + 1e-5), uGC);
  float core = exp(-b * b / 0.012);
  float wide = exp(-b * b / 0.09);
  float bulge = exp(-(1.0 - lc) * 5.0) * exp(-b * b / 0.035);
  float mott = fbm(d * 6.0, 6);
  float cl = smoothstep(0.38, 0.68, fbm(d * 3.0 + mott * 1.5, 6));
  float lane = smoothstep(0.42, 0.66, fbm(d * 8.0 + 2.0, 6)) * exp(-b * b / 0.0025);
  float I = core * (0.3 + 0.9 * cl) * (0.5 + 0.5 * lc) + wide * 0.1 + bulge * 0.8;
  I *= 1.0 - 0.5 * lane;
  vec3 col = mix(vec3(0.80, 0.84, 0.93), vec3(1.0, 0.88, 0.74), clamp(bulge * 1.3 + 0.15, 0.0, 1.0));
  gl_FragColor = vec4(sqrt(clamp(col * I / 1.5, 0.0, 1.0)), 1.0);
}
`;

const SURFACE_VS = /* glsl */ `
varying vec3 vObj;
varying vec3 vNrm;
varying vec3 vPos;
void main() {
  vObj = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * position);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const EARTH_FS = /* glsl */ `
uniform sampler2D uTex;
uniform vec3 uSun;
uniform vec3 uSunObj;
uniform vec3 uCam;
uniform float uCloudRot;
uniform float uDetail;
uniform float uLights;
varying vec3 vObj;
varying vec3 vNrm;
varying vec3 vPos;
// fine point lights for close range: only the 2x2x2 nearest cells matter for small radii
float towns(vec3 x) {
  vec3 i = floor(x) + step(0.5, fract(x)) - 1.0;
  float s = 0.0;
  for (int k = 0; k < 2; k++)
  for (int j = 0; j < 2; j++)
  for (int l = 0; l < 2; l++) {
    vec3 cell = i + vec3(float(l), float(j), float(k));
    vec3 h = hash33(cell);
    vec3 c = cell + h - x;
    s += step(0.45, h.z) * exp(-dot(c, c) / (0.012 + 0.03 * h.y));
  }
  return s;
}
void main() {
  vec3 n = normalize(vObj);
  vec3 N = normalize(vNrm);
  vec3 V = normalize(uCam - vPos);
  float NL = dot(N, uSun);
  vec2 uv = dirToUv(n);
  vec4 e = texSeam(uTex, uv);
  float land = e.r;
  float li = e.b;
#ifdef DETAIL
  if (uDetail > 0.001) {
    float dn = vnoise(n * 520.0) - 0.5;
    land = mix(land, smoothstep(0.35, 0.65, land + dn * 0.45), uDetail);
    li *= mix(1.0, 0.3 + 1.7 * towns(n * 900.0), uDetail);
  }
#endif
  float cloud = texSeam(uTex, vec2(uv.x + uCloudRot, uv.y)).g;
  vec2 us = dirToUv(normalize(n + uSunObj * 0.008));
  float cshadow = texSeam(uTex, vec2(us.x + uCloudRot, us.y)).g;

  float lat = asin(clamp(n.y, -1.0, 1.0)) * 57.2958;
  float lon = atan(n.x, n.z) * 57.2958;
  float green = step(-75.0, lon) * step(lon, -10.0) * smoothstep(59.0, 65.0, lat);
  float ice = max(1.0 - smoothstep(-66.0, -60.0, lat), max(smoothstep(73.0, 80.0, lat), green));

  float arid = e.a;
  vec3 lc = mix(vec3(0.03, 0.045, 0.022), vec3(0.085, 0.08, 0.045), smoothstep(0.1, 0.45, arid));
  lc = mix(lc, vec3(0.27, 0.19, 0.11), smoothstep(0.45, 0.82, arid));
  lc = mix(lc, vec3(0.52, 0.55, 0.6), ice);
  vec3 oc = vec3(0.004, 0.012, 0.03);
  vec3 surf = mix(oc, lc, land);

  vec3 sunC = vec3(1.0, 0.96, 0.9) * 3.2;
  float day = max(NL, 0.0);
  vec3 redden = mix(vec3(1.0, 0.42, 0.16), vec3(1.0), smoothstep(-0.02, 0.3, NL));
  vec3 col = surf * sunC * redden * day;
  col += surf * vec3(0.9, 0.45, 0.25) * 0.3 * exp(-pow((NL + 0.02) / 0.05, 2.0));

  vec3 H = normalize(uSun + V);
  float NH = max(dot(N, H), 0.0);
  float fr = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  float glint = (pow(NH, 300.0) * 5.0 + pow(NH, 28.0) * 0.12) * (0.35 + fr);
  col += sunC * redden * glint * day * (1.0 - land) * (1.0 - cloud);

  col *= 1.0 - 0.5 * cshadow * smoothstep(0.0, 0.2, NL);
  float cLit = day * 0.9 + 0.1 * smoothstep(-0.12, 0.08, NL);
  vec3 cc = vec3(0.9, 0.92, 0.95) * sunC * mix(vec3(1.0, 0.45, 0.2), vec3(1.0), smoothstep(-0.06, 0.3, NL)) * cLit;
  col = mix(col, cc, cloud);
  col += vec3(0.6, 0.7, 0.9) * 0.006 * cloud * (1.0 - day); // faint moonlit cloud tops on the night side

  float night = 1.0 - smoothstep(-0.16, 0.02, NL);
  col += vec3(1.0, 0.6, 0.28) * li * night * (1.0 - cloud * 0.85) * (1.0 - ice) * uLights;

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const ATMO_VS = /* glsl */ `
varying vec3 vPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// single scattering, Rayleigh + Mie, Chapman approximation for the sun path
const ATMO_FS = /* glsl */ `
uniform vec3 uCam;
uniform vec3 uSun;
uniform vec3 uBetaR;
uniform vec3 uOzone;
uniform float uBetaM;
uniform float uHr;
uniform float uHm;
uniform float uIntensity;
uniform float uTwilight;
varying vec3 vPos;
vec2 raySphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}
float chapman(float X, float h, float mu) {
  float c = sqrt(X + h);
  if (mu >= 0.0) return c / (c * mu + 1.0) * exp(-h);
  float x0 = sqrt(1.0 - mu * mu) * (X + h);
  return 2.0 * sqrt(x0) * exp(X - x0) - c / (1.0 - c * mu) * exp(-h);
}
void main() {
  vec3 ro = uCam;
  vec3 rd = normalize(vPos - uCam);
  vec2 ta = raySphere(ro, rd, ${ATMO_R.toFixed(4)});
  if (ta.y <= 0.0) discard;
  float t0 = max(ta.x, 0.0), t1 = ta.y;
  vec2 tp = raySphere(ro, rd, 1.0);
  if (tp.x > 0.0) t1 = min(t1, tp.x);
  float seg = (t1 - t0) / float(STEPS);
  float jit = ign(gl_FragCoord.xy);
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  float odR = 0.0, odM = 0.0;
  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * (t0 + (float(i) + jit) * seg);
    float r = length(p);
    float h = max(r - 1.0, 0.0);
    float dR = exp(-h / uHr) * seg, dM = exp(-h / uHm) * seg;
    odR += dR * 0.5; odM += dM * 0.5;
    float mu = dot(p, uSun) / r;
    float muH = -sqrt(max(0.0, 1.0 - 1.0 / (r * r)));
    float sh = smoothstep(muH - 0.02, muH + 0.02, mu);
    float muc = max(mu, muH);
    float lR = uHr * chapman(1.0 / uHr, h / uHr, muc);
    float lM = uHm * chapman(1.0 / uHm, h / uHm, muc);
    vec3 att = exp(-((uBetaR + uOzone) * (odR + lR) + uBetaM * 1.1 * (odM + lM))) * sh;
    sumR += dR * att; sumM += dM * att;
    odR += dR * 0.5; odM += dM * 0.5;
  }
  float ct = dot(rd, uSun);
  float pR = 0.0597 * (1.0 + ct * ct);
  const float g = 0.76;
  float pM = 0.1194 * ((1.0 - g * g) * (1.0 + ct * ct)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * ct, 1.5));
  vec3 col = uIntensity * (sumR * uBetaR * pR + sumM * uBetaM * pM);
  vec3 tr = exp(-((uBetaR + uOzone) * odR + uBetaM * 1.1 * odM));
  // stand-in for multiple scattering: deep blue pre-dawn sky, brighter toward the horizon and the sun
  float bb = dot(ro, rd);
  float dmin = bb < 0.0 ? sqrt(max(dot(ro, ro) - bb * bb, 0.0)) : length(ro);
  col += uTwilight * vec3(0.007, 0.02, 0.065) * (1.0 - tr.b) * (0.5 + 0.5 * max(ct, 0.0)) * mix(0.25, 1.0, smoothstep(0.996, 1.0015, dmin));
  gl_FragColor = vec4(col, 1.0 - dot(tr, vec3(0.3333)));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb += (jit - 0.5) / 255.0;
}
`;

const MOON_FS = /* glsl */ `
uniform sampler2D uTex;
uniform vec3 uSun;
uniform vec3 uCam;
uniform vec3 uEarthDir;
uniform float uEarthshine;
varying vec3 vObj;
varying vec3 vNrm;
varying vec3 vPos;
void main() {
  vec3 n = normalize(vObj);
  vec4 t = texSeam(uTex, dirToUv(n));
  vec3 N = normalize(t.rgb * 2.0 - 1.0);
  vec3 Ng = normalize(vNrm);
  vec3 V = normalize(uCam - vPos);
  float alb = t.a * 0.25;
  float mu0 = max(dot(N, uSun), 0.0);
  float mu = max(dot(N, V), 1e-3);
  float brdf = mix(mu0, 2.0 * mu0 / (mu0 + mu), 0.3);
  brdf *= smoothstep(-0.03, 0.05, dot(Ng, uSun));
  vec3 col = alb * vec3(1.0, 0.96, 0.9) * 3.2 * brdf;
  col += alb * vec3(0.5, 0.6, 0.8) * max(dot(N, uEarthDir), 0.0) * uEarthshine;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// direction-only shell: vertices are unit directions drawn at the far plane
const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 c = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  c.z = c.w * 0.99999;
  gl_Position = c;
}
`;

const SKY_FS = /* glsl */ `
uniform sampler2D uTex;
uniform float uGain;
varying vec3 vDir;
void main() {
  vec3 t = texSeam(uTex, dirToUv(normalize(vDir))).rgb;
  gl_FragColor = vec4(t * t * 1.5 * uGain, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
}
`;

const STAR_VS = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aSeed;
uniform float uPR;
uniform float uTime;
uniform float uStretch;
uniform float uGain;
uniform float uTwinkle;
varying vec3 vColor;
varying float vStretch;
void main() {
  vec4 c = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  c.z = c.w * 0.99999;
  gl_Position = c;
  float small = 1.0 - smoothstep(1.5, 4.0, aSize);
  float tw = 1.0 + uTwinkle * (0.1 + 0.15 * small) * sin(uTime * (0.7 + aSeed * 2.3) + aSeed * 61.0);
  vStretch = uStretch * (0.5 + 0.5 * smoothstep(1.4, 3.5, aSize)) * 7.0;
  gl_PointSize = aSize * uPR * (1.0 + vStretch);
  vColor = aColor * uGain * tw / (1.0 + vStretch * 0.6);
}
`;

const STAR_FS = /* glsl */ `
varying vec3 vColor;
varying float vStretch;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  p.x *= 1.0 + vStretch;
  float a = exp(-dot(p, p) * 5.0);
  gl_FragColor = vec4(vColor, a);
}
`;

const SUN_VS = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uCam;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec2 uHalf;
varying vec2 vQ;
varying vec2 vP;
varying vec3 vDir;
void main() {
  vP = position.xy;
  vQ = position.xy * uHalf;
  vDir = uSun + uRight * vQ.x + uUp * vQ.y;
  vec4 c = projectionMatrix * viewMatrix * vec4(uCam + vDir * 100.0, 1.0);
  c.z = 0.0;
  gl_Position = c;
}
`;

const SUN_FS = /* glsl */ `
uniform vec3 uCam;
uniform float uVis;
uniform vec3 uTint;
uniform float uCore;
varying vec2 vQ;
varying vec2 vP;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float r = length(vQ);
  float b = dot(uCam, d);
  float c = dot(uCam, uCam) - 1.0;
  float occl = (b < 0.0 && b * b > c) ? 1.0 : 0.0;
  float imp = b < 0.0 ? sqrt(max(dot(uCam, uCam) - b * b, 0.0)) : 10.0;
  vec3 ext = exp(-vec3(0.3, 0.85, 2.0) * 7.0 * exp(-max(imp - 1.0, 0.0) / 0.007)) * (1.0 - occl);
  float disc = 1.0 - smoothstep(uCore * 0.85, uCore * 1.15, r);
  float inner = exp(-r / (uCore * 1.4));
  float win = (1.0 - smoothstep(0.55, 1.0, abs(vP.x))) * (1.0 - smoothstep(0.55, 1.0, abs(vP.y)));
  float glow = exp(-r * 6.0) / (1.0 + pow(r / (uCore * 5.0), 2.0));
  float wide = exp(-r * 6.0);
  float streak = exp(-abs(vQ.y) / (uCore * 0.35)) * exp(-abs(vQ.x) * 6.0);
  vec3 sunC = vec3(1.0, 0.95, 0.88);
  vec3 col = sunC * ext * (disc * 40.0 + inner * 2.5);
  col += sunC * uTint * uVis * win * (glow * 0.22 + wide * 0.02 + streak * 0.09);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const POINT_VS = /* glsl */ `
uniform float uSize;
uniform float uPR;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * uPR;
}
`;

const ISS_FS = /* glsl */ `
uniform float uTime;
uniform float uAmt;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  float core = 1.0 - smoothstep(0.09, 0.18, r);
  float halo = exp(-r * r * 7.0) * (0.3 + 0.12 * sin(uTime * 2.2));
  vec3 c = vec3(1.0, 0.96, 0.9) * core + vec3(1.0, 0.353, 0.122) * halo;
  gl_FragColor = vec4(c * uAmt, 1.0);
}
`;

const DOT_FS = /* glsl */ `
uniform float uTime;
uniform float uAmt;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  float pulse = 0.82 + 0.18 * sin(uTime * 1.25);
  vec3 c = vec3(0.68, 0.8, 1.0) * (exp(-r2 * 10.0) + exp(-r2 * 2.5) * 0.18) * pulse * uAmt;
  gl_FragColor = vec4(c, 1.0);
}
`;

const RING_VS = /* glsl */ `
attribute float aT;
varying float vT;
void main() {
  vT = aT;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RING_FS = /* glsl */ `
uniform float uPhase;
uniform float uAmt;
varying float vT;
void main() {
  float behind = fract(uPhase - vT);
  float a = (0.22 + 0.6 * exp(-behind * 7.0)) * uAmt;
  gl_FragColor = vec4(vec3(0.72, 0.82, 1.0) * a, 1.0);
}
`;

const BEAM_VS = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// scattered sunlight band through the dot (in display space, no tone mapping)
const BEAM_FS = /* glsl */ `
uniform vec2 uDot;
uniform vec2 uDir;
uniform float uScale;
uniform float uAmt;
void main() {
  vec2 d = (gl_FragCoord.xy - uDot) / uScale;
  float along = dot(d, uDir);
  float x = dot(d, vec2(-uDir.y, uDir.x));
  float b = exp(-pow((x - 0.006) / 0.05, 2.0)) + 0.5 * exp(-pow((x - 0.15) / 0.028, 2.0)) + 0.35 * exp(-pow((x + 0.21) / 0.06, 2.0));
  float fall = smoothstep(-1.5, 0.5, along);
  float grain = 0.88 + 0.12 * sin(x * 160.0 + 1.7) * sin(x * 61.0);
  vec3 col = vec3(0.6, 0.54, 0.47) * b * fall * grain * uAmt * 0.075;
  col += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

// ----------------------------------------------------------- helpers ----

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Land mask: white land on black, equirectangular, lon -180..180 -> x, lat 90..-90 -> y.
async function makeLandCanvas(w, h) {
  const topo = (await import('world-atlas/land-110m.json')).default;
  const geo = feature(topo, topo.objects.land);
  const feats = geo.type === 'FeatureCollection' ? geo.features : [geo];
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const canBlur = 'filter' in ctx;
  // shortcut: without ctx.filter (older Safari) draw at half size and upscale for a cheap blur
  const tgt = canBlur ? cv : Object.assign(document.createElement('canvas'), { width: w / 2, height: h / 2 });
  const g = tgt.getContext('2d');
  const W = tgt.width, H = tgt.height;
  if (canBlur) g.filter = `blur(${w / 1024}px)`;
  g.fillStyle = '#fff';
  g.beginPath();
  for (const f of feats) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      for (const ring of poly) {
        // unwrap antimeridian jumps so each ring is continuous in longitude
        const pts = [];
        let prev = ring[0][0], off = 0, latSum = 0;
        for (const [lon, lat] of ring) {
          let L = lon + off;
          if (L - prev > 180) { off -= 360; L -= 360; } else if (L - prev < -180) { off += 360; L += 360; }
          pts.push([L, lat]);
          latSum += lat;
          prev = L;
        }
        if (Math.abs(pts[pts.length - 1][0] - pts[0][0]) > 180) {
          // ring encircles a pole (Antarctica): close it along the pole edge
          const pole = latSum < 0 ? -90 : 90;
          pts.push([pts[pts.length - 1][0], pole], [pts[0][0], pole]);
        }
        for (const k of [-360, 0, 360]) {
          pts.forEach(([L, lat], i) => {
            const x = ((L + k + 180) / 360) * W, y = ((90 - lat) / 180) * H;
            if (i) g.lineTo(x, y); else g.moveTo(x, y);
          });
          g.closePath();
        }
      }
    }
  }
  g.fill('evenodd');
  if (!canBlur) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tgt, 0, 0, w, h);
  }
  return cv;
}

function bake(renderer, frag, uniforms, w, h, defines = {}) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    depthBuffer: false,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  });
  const mat = new THREE.ShaderMaterial({
    vertexShader: BAKE_VS,
    fragmentShader: GLSL_COMMON + frag,
    uniforms,
    defines,
    depthTest: false,
    depthWrite: false,
  });
  const geo = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const sc = new THREE.Scene();
  sc.add(mesh);
  renderer.setRenderTarget(rt);
  renderer.render(sc, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
  renderer.setRenderTarget(null);
  mat.dispose();
  geo.dispose();
  return rt;
}

function makeStars(count, G, GC) {
  const rnd = mulberry32(1977);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const seed = new Float32Array(count);
  const e2 = new THREE.Vector3().crossVectors(G, GC);
  const d = new THREE.Vector3();
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(TAU * rnd());
  const temps = [
    [0.72, 0.82, 1.0],
    [0.86, 0.91, 1.0],
    [1.0, 0.98, 0.95],
    [1.0, 0.9, 0.76],
    [1.0, 0.78, 0.56],
  ];
  for (let i = 0; i < count; i++) {
    const band = rnd() < 0.4;
    if (band) {
      const lon = rnd() * TAU, lat = gauss() * 0.11;
      d.copy(GC).multiplyScalar(Math.cos(lat) * Math.cos(lon))
        .addScaledVector(e2, Math.cos(lat) * Math.sin(lon))
        .addScaledVector(G, Math.sin(lat));
    } else {
      const z = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - z * z);
      d.set(s * Math.cos(a), z, s * Math.sin(a));
    }
    d.normalize().toArray(pos, i * 3);
    const f = Math.pow(rnd(), band ? 11 : 8); // power law: few bright, many faint
    size[i] = 1.6 + 4.2 * Math.pow(f, 0.5);
    const I = 0.16 + 1.5 * Math.pow(f, 0.8);
    const t = temps[Math.min(4, Math.floor(Math.pow(rnd(), 1.3) * 5))];
    col[i * 3] = t[0] * I;
    col[i * 3 + 1] = t[1] * I;
    col[i * 3 + 2] = t[2] * I;
    seed[i] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  return geo;
}

// ------------------------------------------------------------- scene ----

export async function createScene(canvas, { quality = 'high', reducedMotion = false } = {}) {
  const high = quality !== 'low';
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: high,
      alpha: false,
      powerPreference: 'high-performance',
    });
  } catch (err) {
    throw new Error(`WebGL unavailable: ${err && err.message}`);
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 1);
  const maxPR = Math.min(window.devicePixelRatio || 1, high ? 1.75 : 1.25);
  const minPR = high ? 1.0 : 0.75;
  let pr = maxPR;
  renderer.setPixelRatio(pr);

  // ---- fixed world layout ------------------------------------------------
  const Y = new THREE.Vector3(0, 1, 0);
  const ORIGIN = new THREE.Vector3();
  const S = new THREE.Vector3(0.86, 0.18, -0.47).normalize(); // toward the sun
  const Yp = Y.clone().addScaledVector(S, -S.y).normalize();
  const Zp = new THREE.Vector3().crossVectors(S, Yp).normalize();
  const MOON_HAT = S.clone().multiplyScalar(-Math.cos(40 * DEG)).addScaledVector(Yp, Math.sin(40 * DEG)).normalize();
  const MOON_POS = MOON_HAT.clone().multiplyScalar(MOON_DIST);

  // hero sub-point U0 (~25 N) where the sun sits SUN_EL below the local horizon
  const E = Math.PI / 2 - SUN_EL;
  const cosPsi = clamp((Math.sin(25 * DEG) - Math.cos(E) * S.y) / (Math.sin(E) * Yp.y), -1, 1);
  const psi = Math.acos(cosPsi);
  const U0 = S.clone().multiplyScalar(Math.cos(E))
    .add(Yp.clone().multiplyScalar(Math.cos(psi)).addScaledVector(Zp, Math.sin(psi)).multiplyScalar(Math.sin(E)))
    .normalize();
  const H0 = S.clone().addScaledVector(U0, -S.dot(U0)).normalize(); // sunward horizontal
  const RH = new THREE.Vector3().crossVectors(H0, U0);
  const F0 = H0.clone().multiplyScalar(Math.cos(SUN_AZ)).addScaledVector(RH, -Math.sin(SUN_AZ)).normalize();
  const INTRO_AXIS = new THREE.Vector3().crossVectors(U0, H0).normalize();

  // Milky Way plane, chosen so the band crosses the L2 view diagonally
  const V4 = S.clone().multiplyScalar(-0.45).addScaledVector(Zp, 0.9).addScaledVector(Yp, 0.15).normalize();
  const R4 = new THREE.Vector3().crossVectors(V4, Y).normalize();
  const U4 = new THREE.Vector3().crossVectors(R4, V4).normalize();
  const G = U4.clone().multiplyScalar(Math.cos(35 * DEG)).addScaledVector(R4, Math.sin(35 * DEG)).normalize();
  const bandDir = new THREE.Vector3().crossVectors(G, V4).normalize();
  const GC = V4.clone().multiplyScalar(Math.cos(28 * DEG)).addScaledVector(bandDir, Math.sin(28 * DEG)).normalize();

  // ---- textures (baked once) -----------------------------------------------
  const landCanvas = await makeLandCanvas(high ? 2048 : 1024, high ? 1024 : 512);
  const landTex = new THREE.CanvasTexture(landCanvas);
  landTex.wrapS = THREE.RepeatWrapping;
  landTex.minFilter = THREE.LinearFilter;
  landTex.generateMipmaps = false;
  const earthRT = bake(renderer, EARTH_BAKE_FS, { uMask: { value: landTex } }, high ? 4096 : 2048, high ? 2048 : 1024);
  earthRT.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  landTex.dispose();
  const moonRT = bake(renderer, MOON_BAKE_FS, {}, high ? 2048 : 1024, high ? 1024 : 512, { OCT: high ? 4 : 3 });
  const skyRT = bake(renderer, SKY_BAKE_FS, { uG: { value: G }, uGC: { value: GC } }, high ? 2048 : 1024, high ? 1024 : 512);

  // ---- scene graph ---------------------------------------------------------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 24),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VS,
      fragmentShader: GLSL_COMMON + SKY_FS,
      uniforms: { uTex: { value: skyRT.texture }, uGain: { value: 0.03 } },
      side: THREE.BackSide,
      depthWrite: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -2;
  scene.add(sky);

  const starMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VS,
    fragmentShader: STAR_FS,
    uniforms: {
      uPR: { value: pr },
      uTime: { value: 0 },
      uStretch: { value: 0 },
      uGain: { value: 1 },
      uTwinkle: { value: reducedMotion ? 0 : 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(makeStars(high ? 6000 : 2200, G, GC), starMat);
  stars.frustumCulled = false;
  stars.renderOrder = -1;
  scene.add(stars);

  const earthGroup = new THREE.Group();
  scene.add(earthGroup);
  const earthMat = new THREE.ShaderMaterial({
    vertexShader: SURFACE_VS,
    fragmentShader: GLSL_COMMON + EARTH_FS,
    uniforms: {
      uTex: { value: earthRT.texture },
      uSun: { value: S },
      uSunObj: { value: new THREE.Vector3() },
      uCam: { value: new THREE.Vector3() },
      uCloudRot: { value: 0 },
      uDetail: { value: 0 },
      uLights: { value: 1.3 },
    },
    defines: high ? { DETAIL: 1 } : {},
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, high ? 384 : 160, high ? 192 : 80), earthMat);
  earthGroup.add(earth);

  const atmoUniforms = {
    uCam: { value: new THREE.Vector3() },
    uSun: { value: S },
    uBetaR: { value: new THREE.Vector3(5.8, 13.5, 33.1).multiplyScalar(1.9) },
    uOzone: { value: new THREE.Vector3(2.4, 6.8, 0.3) }, // ozone (Chappuis band) keeps twilight skies blue
    uBetaM: { value: 8.0 },
    uHr: { value: 0.0055 },
    uHm: { value: 0.002 },
    uIntensity: { value: 5.0 },
    uTwilight: { value: 0 },
  };
  const atmoMaterial = (side) => new THREE.ShaderMaterial({
    vertexShader: ATMO_VS,
    fragmentShader: GLSL_COMMON + ATMO_FS,
    uniforms: atmoUniforms,
    defines: { STEPS: high ? 12 : 6 },
    side,
    transparent: true,
    depthWrite: false,
    depthTest: side === THREE.FrontSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const atmoGeo = new THREE.SphereGeometry(ATMO_GEO_R, 160, 80);
  // outside: front faces with depth test (Moon can sit in front); inside: back faces, no depth test
  const atmoOut = new THREE.Mesh(atmoGeo, atmoMaterial(THREE.FrontSide));
  const atmoIn = new THREE.Mesh(atmoGeo, atmoMaterial(THREE.BackSide));
  atmoOut.renderOrder = atmoIn.renderOrder = 2;
  scene.add(atmoOut, atmoIn);

  const moonMat = new THREE.ShaderMaterial({
    vertexShader: SURFACE_VS,
    fragmentShader: GLSL_COMMON + MOON_FS,
    uniforms: {
      uTex: { value: moonRT.texture },
      uSun: { value: S },
      uCam: { value: new THREE.Vector3() },
      uEarthDir: { value: MOON_POS.clone().negate().normalize() },
      uEarthshine: { value: 0.14 },
    },
  });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, high ? 128 : 64, high ? 64 : 32), moonMat);
  moon.position.copy(MOON_POS);
  scene.add(moon);

  // ISS marker + orbit ring (children of the rotating Earth, same geographic frame)
  const issMat = new THREE.ShaderMaterial({
    vertexShader: POINT_VS,
    fragmentShader: ISS_FS,
    uniforms: { uSize: { value: 22 }, uPR: { value: pr }, uTime: { value: 0 }, uAmt: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const issGeo = new THREE.BufferGeometry();
  issGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const iss = new THREE.Points(issGeo, issMat);
  iss.renderOrder = 4;
  iss.frustumCulled = false;
  iss.visible = false;
  earthGroup.add(iss);

  const RING_N = 360;
  const ringPos = new Float32Array(RING_N * 3);
  const ringT = new Float32Array(RING_N);
  for (let i = 0; i < RING_N; i++) {
    const a = (i / RING_N) * TAU;
    ringPos.set([Math.cos(a) * ISS_R, 0, -Math.sin(a) * ISS_R], i * 3);
    ringT[i] = i / RING_N;
  }
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
  ringGeo.setAttribute('aT', new THREE.BufferAttribute(ringT, 1));
  const ringMat = new THREE.ShaderMaterial({
    vertexShader: RING_VS,
    fragmentShader: RING_FS,
    uniforms: { uPhase: { value: 0 }, uAmt: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.LineLoop(ringGeo, ringMat);
  ring.renderOrder = 3;
  ring.visible = false;
  earthGroup.add(ring);

  const sunUniforms = {
    uSun: { value: S },
    uCam: { value: new THREE.Vector3() },
    uRight: { value: new THREE.Vector3() },
    uUp: { value: new THREE.Vector3() },
    uHalf: { value: new THREE.Vector2(1.0, 0.55) },
    uVis: { value: 1 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uCore: { value: 0.0062 },
  };
  const sun = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: SUN_VS,
      fragmentShader: SUN_FS,
      uniforms: sunUniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sun.frustumCulled = false;
  sun.renderOrder = 6;
  scene.add(sun);

  const dotMat = new THREE.ShaderMaterial({
    vertexShader: POINT_VS,
    fragmentShader: DOT_FS,
    uniforms: { uSize: { value: 10 }, uPR: { value: pr }, uTime: { value: 0 }, uAmt: { value: 0 } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dot = new THREE.Points(issGeo, dotMat); // shares the single-vertex geometry at the origin
  dot.frustumCulled = false;
  dot.renderOrder = 5;
  scene.add(dot);

  const beamUniforms = {
    uDot: { value: new THREE.Vector2() },
    uDir: { value: new THREE.Vector2(0.6, 0.8) },
    uScale: { value: 1 },
    uAmt: { value: 0 },
  };
  const beam = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: BEAM_VS,
      fragmentShader: GLSL_COMMON + BEAM_FS,
      uniforms: beamUniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  beam.frustumCulled = false;
  beam.renderOrder = 7;
  scene.add(beam);

  // Earth spin: start with ~75E under the hero sub-point (night lights of South Asia)
  const spin0 = Math.atan2(U0.x, U0.z) - 75 * DEG;
  let spin = 0;

  // ---- camera keyframes ----------------------------------------------------
  const _m = new THREE.Matrix4();
  const lookQuat = (eye, target, up, out = new THREE.Quaternion()) => out.setFromRotationMatrix(_m.lookAt(eye, target, up));

  // camera at C looking at A; direction dirB appears at screen angle phi (view tan-plane)
  function orient2(C, A, dirB, phi) {
    const f = A.clone().sub(C).normalize();
    const back = f.clone().negate();
    const e1 = dirB.clone().addScaledVector(f, -dirB.dot(f)).normalize();
    const e2 = new THREE.Vector3().crossVectors(back, e1);
    const right = e1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(e2, -Math.sin(phi));
    const up = e1.clone().multiplyScalar(Math.sin(phi)).addScaledVector(e2, Math.cos(phi));
    return new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(right, up, back));
  }
  const rotAbout = (v, axis, ang) => v.clone().applyAxisAngle(axis, ang);
  const fovFor = (fov, aspect) => 2 * Math.atan(Math.tan((fov * DEG) / 2) * (aspect < 1 ? Math.pow(1 / aspect, 0.5) : 1)) / DEG;
  const mk = (pos, q, fov, sx, sy, target = null) => ({
    pos, q, fov, sx, sy, target,
    up: new THREE.Vector3(0, 1, 0).applyQuaternion(q),
    dir: pos.clone().normalize(),
    lr: Math.log(pos.length()),
  });

  let poses = [];
  let heroPose = null;
  function buildPoses(aspect) {
    const tall = 1 - smooth(0.75, 1.0, aspect);
    const pick = (w, t) => [lerp(w[0], t[0], tall), lerp(w[1], t[1], tall)];
    const tans = (fov) => {
      const tv = Math.tan((fov * DEG) / 2);
      return [tv * aspect, tv];
    };

    // 0 hero: looking along the limb toward the rising sun
    const f0 = fovFor(50, aspect);
    const dip = Math.acos(1 / (1 + HERO_ALT));
    const c0 = U0.clone().multiplyScalar(1 + HERO_ALT);
    const fw0 = F0.clone().multiplyScalar(Math.cos(dip)).addScaledVector(U0, -Math.sin(dip));
    const s0 = pick([0, -0.24], [0, -0.3]);
    const limb = c0.clone().addScaledVector(fw0, Math.sqrt((1 + HERO_ALT) ** 2 - 1));
    heroPose = mk(c0, lookQuat(c0, limb, U0), f0, s0[0], s0[1], limb);

    // 1 GEO: full disc on the right, lit from the left
    const f1 = fovFor(40, aspect);
    const [th1, tv1] = tans(f1);
    const s1 = pick([0.36, 0.0], [0, -0.3]);
    const d1 = Math.max(Math.sqrt(1 + 1 / (0.55 * tv1) ** 2), Math.sqrt(1 + 1 / (0.8 * th1) ** 2));
    const az1 = Math.atan2(S.x, S.z) + 55 * DEG, el1 = 6 * DEG;
    const c1 = new THREE.Vector3(Math.cos(el1) * Math.sin(az1), Math.sin(el1), Math.cos(el1) * Math.cos(az1)).multiplyScalar(d1);
    const p1 = mk(c1, lookQuat(c1, ORIGIN, Y), f1, s1[0], s1[1], ORIGIN);

    // 2 cislunar: small Earth lower-left, Moon far upper-right
    const f2 = fovFor(40, aspect);
    const [th2, tv2] = tans(f2);
    const a2 = pick([-0.56, -0.5], [-0.42, -0.58]);
    const b2 = pick([0.6, 0.52], [0.45, 0.62]);
    const d2 = Math.sqrt(1 + 1 / (0.12 * tv2) ** 2);
    const dx2 = (b2[0] - a2[0]) * th2, dy2 = (b2[1] - a2[1]) * tv2;
    const sep2 = Math.atan(Math.hypot(dx2, dy2));
    const angE2 = Math.PI - sep2 - Math.asin((d2 * Math.sin(sep2)) / MOON_DIST);
    const P = S.clone().addScaledVector(MOON_HAT, -S.dot(MOON_HAT)).normalize();
    const base2 = MOON_HAT.clone().multiplyScalar(Math.cos(angE2)).addScaledVector(P, Math.sin(angE2));
    let p2 = null, best = Infinity;
    for (let k = 0; k < 36; k++) {
      // pick the cone position whose framing keeps the horizon closest to world-up
      const D = rotAbout(base2, MOON_HAT, (k / 36) * TAU);
      const C = D.clone().multiplyScalar(d2);
      const q = orient2(C, ORIGIN, MOON_POS.clone().sub(C).normalize(), Math.atan2(dy2, dx2));
      const up = Y.clone().applyQuaternion(q);
      const cost = 1 - up.dot(Y) + 0.3 * D.angleTo(c1.clone().normalize()) + (D.dot(S) < 0.2 ? 5 : 0); // prefer the day side
      if (cost < best) { best = cost; p2 = mk(C, q, f2, a2[0], a2[1], ORIGIN); }
    }

    // 3 Moon flyby: Moon large lower-right, Earth a crescent behind it, sun beyond Earth
    const f3 = fovFor(40, aspect);
    const [th3, tv3] = tans(f3);
    const a3 = pick([0.44, -0.42], [0.22, -0.5]);
    const b3 = pick([0.27, 0.6], [-0.12, 0.52]);
    const dM = MOON_R * Math.max(Math.sqrt(1 + 1 / (0.74 * tv3) ** 2), Math.sqrt(1 + 1 / (0.95 * th3) ** 2));
    const dx3 = (b3[0] - a3[0]) * th3, dy3 = (b3[1] - a3[1]) * tv3;
    const sep3 = Math.atan(Math.hypot(dx3, dy3));
    const ang3 = sep3 + Math.asin((dM * Math.sin(sep3)) / MOON_DIST);
    const u3 = MOON_HAT.clone().multiplyScalar(Math.cos(ang3)).addScaledVector(P, Math.sin(ang3));
    const c3 = MOON_POS.clone().addScaledVector(u3, dM);
    const p3 = mk(c3, orient2(c3, MOON_POS, c3.clone().negate().normalize(), Math.atan2(dy3, dx3)), f3, a3[0], a3[1], MOON_POS);

    // 4 L2: deep space, looking away from Sun and Earth into the Milky Way
    const c4 = S.clone().multiplyScalar(-235);
    const p4 = mk(c4, lookQuat(c4, c4.clone().add(V4), Y), fovFor(45, aspect), 0, 0);

    // 5 Pale Blue Dot: Earth tiny, sun just off-frame (upper right) 30 deg away
    const f5 = fovFor(34, aspect);
    const a5 = pick([0.26, 0.16], [0, 0.4]);
    const phi5 = lerp(50, 72, tall) * DEG;
    const Q = Zp.clone().multiplyScalar(Math.cos(phi5)).addScaledVector(Yp, Math.sin(phi5)).negate();
    const c5 = S.clone().multiplyScalar(Math.cos(30 * DEG)).addScaledVector(Q, Math.sin(30 * DEG)).normalize().multiplyScalar(-1500);
    const p5 = mk(c5, orient2(c5, ORIGIN, S, phi5), f5, a5[0], a5[1]);

    poses = [heroPose, p1, p2, p3, p4, p5];
  }

  // ---- runtime state -------------------------------------------------------
  let tTarget = 0, tCur = 0, intro = 1, shake = 0, velRaw = 0, velS = 0;
  const ptr = new THREE.Vector2(), ptrS = new THREE.Vector2();
  let time = 0, issSet = false, journeySet = false;
  const prevIss = new THREE.Vector3();

  const pose = { pos: new THREE.Vector3(), q: new THREE.Quaternion(), fov: 50, sx: 0, sy: 0 };
  const poseB = { pos: new THREE.Vector3(), q: new THREE.Quaternion(), fov: 50, sx: 0, sy: 0 };
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  const _e = new THREE.Euler(0, 0, 0, 'YXZ');

  function journeyPose(t, out) {
    const i = Math.min(4, Math.floor(t));
    const e = smoother(0.18, 0.82, t - i);
    const A = poses[i], B = poses[i + 1];
    // position: slerp direction about Earth, lerp log-radius (never cuts through the planet)
    const cosw = clamp(A.dir.dot(B.dir), -1, 1);
    const w = Math.acos(cosw);
    if (w < 1e-4) out.pos.copy(A.dir);
    else {
      const sw = Math.sin(w);
      out.pos.copy(A.dir).multiplyScalar(Math.sin((1 - e) * w) / sw).addScaledVector(B.dir, Math.sin(e * w) / sw);
    }
    out.pos.multiplyScalar(Math.exp(lerp(A.lr, B.lr, e)));
    if (A.target && B.target) {
      // both ends frame a body: interpolate what we look at, so it stays in shot
      _v1.lerpVectors(A.target, B.target, i === 2 ? smoother(0, 0.55, e) : e); // en route to the Moon, look at it early
      _v2.lerpVectors(A.up, B.up, e).normalize();
      lookQuat(out.pos, _v1, _v2, out.q);
    } else out.q.slerpQuaternions(A.q, B.q, e);
    out.fov = lerp(A.fov, B.fov, e);
    out.sx = lerp(A.sx, B.sx, e);
    out.sy = lerp(A.sy, B.sy, e);
  }

  function introPose(p, out) {
    const climb = 1 - Math.pow(1 - p, 1.4);
    const h = INTRO_ALT * Math.pow(HERO_ALT / INTRO_ALT, climb);
    const beta = INTRO_ARC * (1 - smoother(0.1, 1.0, p)); // sun crests the limb near p 0.85
    _q1.setFromAxisAngle(INTRO_AXIS, beta);
    const U = _v1.copy(U0).applyQuaternion(_q1);
    const F = _v2.copy(F0).applyQuaternion(_q1);
    const ang = Math.acos(1 / (1 + h)) - (1 - p) * (1 - p) * 3 * DEG;
    out.pos.copy(U).multiplyScalar(1 + h);
    _v3.copy(F).multiplyScalar(Math.cos(ang)).addScaledVector(U, -Math.sin(ang)).add(out.pos);
    lookQuat(out.pos, _v3, U, out.q);
    const k = smoother(0, 1, p);
    out.fov = lerp(heroPose.fov + 6, heroPose.fov, k);
    out.sx = heroPose.sx;
    out.sy = lerp(heroPose.sy - 0.18, heroPose.sy, k);
  }

  // ---- ISS -----------------------------------------------------------------
  const geoVec = (lat, lon, r, out) => {
    const la = lat * DEG, lo = lon * DEG;
    return out.set(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)).multiplyScalar(r);
  };
  function setIss(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const P = geoVec(lat, lon, 1, new THREE.Vector3());
    const inc = 51.6 * DEG;
    const rho = Math.max(1e-6, Math.hypot(P.x, P.z));
    const base = Math.atan2(P.z, P.x);
    const dphi = Math.acos(clamp((-Math.cos(inc) * P.y) / (Math.sin(inc) * rho), -1, 1));
    const normal = (phi) => new THREE.Vector3(Math.sin(inc) * Math.cos(phi), Math.cos(inc), Math.sin(inc) * Math.sin(phi));
    const n1 = normal(base + dphi), n2 = normal(base - dphi);
    // pick the plane matching the direction of travel (prograde velocity = N x P)
    const vel = issSet && prevIss.angleTo(P) < 0.2 && prevIss.distanceTo(P) > 1e-6 ? P.clone().sub(prevIss) : new THREE.Vector3(0, 1, 0);
    const v1 = new THREE.Vector3().crossVectors(n1, P).dot(vel);
    const v2 = new THREE.Vector3().crossVectors(n2, P).dot(vel);
    const N = v1 >= v2 ? n1 : n2;
    ring.quaternion.setFromUnitVectors(Y, N);
    const local = P.clone().applyQuaternion(ring.quaternion.clone().invert());
    ringMat.uniforms.uPhase.value = ((Math.atan2(-local.z, local.x) / TAU) % 1 + 1) % 1;
    iss.position.copy(P).multiplyScalar(ISS_R);
    prevIss.copy(P);
    issSet = true;
  }

  // ---- size ----------------------------------------------------------------
  let cssW = 1, cssH = 1;
  function resize() {
    cssW = canvas.clientWidth || window.innerWidth;
    cssH = canvas.clientHeight || window.innerHeight;
    renderer.setPixelRatio(pr);
    renderer.setSize(cssW, cssH, false);
    camera.aspect = cssW / cssH;
    buildPoses(camera.aspect);
    starMat.uniforms.uPR.value = issMat.uniforms.uPR.value = dotMat.uniforms.uPR.value = pr;
  }

  // ---- per-frame update ----------------------------------------------------
  const ndc = new THREE.Vector3();
  const camFwd = new THREE.Vector3(), camRight = new THREE.Vector3(), camUp = new THREE.Vector3();

  function update(dt) {
    time += dt;
    tCur += (tTarget - tCur) * (1 - Math.exp(-dt * 5.0)); // ~0.08 per frame at 60fps
    if (Math.abs(tTarget - tCur) < 1e-4) tCur = tTarget;
    velRaw *= Math.exp(-dt * 4); // decays if the caller stops reporting
    const vk = 1 - Math.exp(-dt * (Math.abs(velRaw) > velS ? 10 : 3));
    velS += (Math.abs(velRaw) - velS) * vk;
    ptrS.lerp(ptr, 1 - Math.exp(-dt * 3));

    journeyPose(tCur, pose);
    if (intro < 1) {
      introPose(intro, poseB);
      const w = smooth(0.9, 1.0, intro); // hand over to the journey without a jump
      poseB.pos.lerp(pose.pos, w);
      poseB.q.slerp(pose.q, w);
      pose.pos.copy(poseB.pos);
      pose.q.copy(poseB.q);
      pose.fov = lerp(poseB.fov, pose.fov, w);
      pose.sx = lerp(poseB.sx, pose.sx, w);
      pose.sy = lerp(poseB.sy, pose.sy, w);
    }

    // drift, pointer parallax, launch shake (all small local rotations)
    const drift = reducedMotion ? 0 : 1;
    const w4 = 1 - Math.min(1, Math.abs(tCur - 4));
    let yaw = (Math.sin(time * 0.05) * 0.25 + Math.sin(time * 0.021) * 1.4 * w4) * DEG * drift;
    let pitch = (Math.sin(time * 0.037 + 1.3) * 0.18 + Math.sin(time * 0.017) * 0.8 * w4) * DEG * drift;
    let roll = 0;
    yaw += -ptrS.x * 1.5 * DEG;
    pitch += ptrS.y * 1.0 * DEG;
    if (shake > 0 && !reducedMotion) {
      const s = shake * DEG;
      yaw += s * 0.45 * (Math.sin(time * 71.3) + Math.sin(time * 43.7 + 1.1)) * 0.5;
      pitch += s * 0.45 * (Math.sin(time * 67.1 + 2.3) + Math.sin(time * 39.9)) * 0.5;
      roll += s * 0.25 * Math.sin(time * 53.3 + 0.7);
    }
    _e.set(pitch, yaw, roll);
    _q2.setFromEuler(_e);
    camera.position.copy(pose.pos);
    camera.quaternion.copy(pose.q).multiply(_q2);

    const kick = reducedMotion ? 0 : 8 * clamp(velS / 45, 0, 1);
    camera.fov = pose.fov + kick;
    const dE = camera.position.length();
    const dMoon = camera.position.distanceTo(MOON_POS);
    camera.near = clamp(Math.min((dE - 1) * 0.4, (dMoon - MOON_R) * 0.4), 0.0002, 20);
    camera.far = Math.max(dE + 2, dMoon + 1) * 1.2;
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[8] = -pose.sx; // lens shift
    camera.projectionMatrix.elements[9] = -pose.sy;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.updateMatrixWorld();
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    camUp.setFromMatrixColumn(camera.matrixWorld, 1);
    camFwd.setFromMatrixColumn(camera.matrixWorld, 2).negate();

    // Earth
    if (!reducedMotion) spin += dt * SPIN_RATE;
    earthGroup.rotation.y = spin0 + spin;
    earthGroup.updateMatrixWorld();
    _q1.copy(earthGroup.quaternion).invert();
    earthMat.uniforms.uSunObj.value.copy(S).applyQuaternion(_q1);
    earthMat.uniforms.uCam.value.copy(camera.position);
    earthMat.uniforms.uCloudRot.value = reducedMotion ? 0 : time * 0.0004;
    earthMat.uniforms.uDetail.value = 1 - smooth(0.12, 0.5, dE - 1);
    atmoUniforms.uCam.value.copy(camera.position);
    atmoUniforms.uTwilight.value = 1 - smooth(0.004, 0.035, dE - 1);
    const inside = dE < 1.2; // back faces near/inside the shell so near-plane clipping never opens holes
    atmoIn.visible = inside;
    atmoOut.visible = !inside;
    earth.visible = dE < 3000;

    moon.visible = dMoon < 600;
    moonMat.uniforms.uCam.value.copy(camera.position);

    // stars & Milky Way: dim inside the bright lower atmosphere and at the Pale Blue Dot
    const alt = dE - 1;
    const airDim = smooth(0.0, 0.06, alt);
    const w5 = smooth(4.3, 5.0, tCur);
    starMat.uniforms.uGain.value = (0.2 + 0.8 * airDim) * lerp(1, 0.5, w5);
    starMat.uniforms.uTime.value = time;
    starMat.uniforms.uStretch.value = reducedMotion ? 0 : clamp(velS / 40, 0, 1);
    sky.material.uniforms.uGain.value = 0.03 * (0.15 + 0.85 * airDim) * lerp(0.4, 1.0, w4) * lerp(1, 0.6, w5);

    // sun: glare dims as the sun nears the limb, reddens through the air
    const b = camera.position.dot(S);
    const imp = b < 0 ? Math.sqrt(Math.max(camera.position.lengthSq() - b * b, 0)) : 10;
    const vis = smooth(0.998, 1.03, imp);
    const ext = (k) => Math.exp(-k * 7 * Math.exp(-Math.max(imp - 1, 0) / 0.007));
    sunUniforms.uTint.value.set(ext(0.3), ext(0.85), ext(2.0)).multiplyScalar(1 / Math.max(ext(0.3), 1e-3));
    sunUniforms.uVis.value = vis * lerp(1, 0.45, w5);
    sunUniforms.uCam.value.copy(camera.position);
    sunUniforms.uRight.value.copy(camRight);
    sunUniforms.uUp.value.copy(camUp);
    sun.visible = camFwd.dot(S) > Math.cos(80 * DEG);

    // ISS
    const issAmt = smooth(40, 10, dE) * (issSet ? 1 : 0);
    iss.visible = issAmt > 0.001;
    ring.visible = iss.visible;
    issMat.uniforms.uAmt.value = issAmt;
    issMat.uniforms.uTime.value = time;
    ringMat.uniforms.uAmt.value = issAmt * smooth(1.6, 3.5, dE);

    // Pale Blue Dot + sunbeam
    dotMat.uniforms.uAmt.value = smooth(4.35, 4.95, tCur);
    dotMat.uniforms.uTime.value = reducedMotion ? 0 : time;
    dot.visible = dotMat.uniforms.uAmt.value > 0.001;
    beamUniforms.uAmt.value = smooth(4.5, 5.0, tCur);
    beam.visible = beamUniforms.uAmt.value > 0.001;
    if (beam.visible) {
      const bw = renderer.domElement.width, bh = renderer.domElement.height;
      ndc.set(0, 0, 0).project(camera);
      const dx = (ndc.x + 1) * 0.5 * bw, dy = (ndc.y + 1) * 0.5 * bh;
      beamUniforms.uDot.value.set(dx, dy);
      _v1.copy(camera.position).addScaledVector(S, 1000).project(camera);
      const sx = (_v1.x + 1) * 0.5 * bw - dx, sy = (_v1.y + 1) * 0.5 * bh - dy;
      const len = Math.hypot(sx, sy);
      if (len > 1e-3 && camFwd.dot(S) > 0) beamUniforms.uDir.value.set(sx / len, sy / len);
      beamUniforms.uScale.value = bh;
    }
  }

  // ---- loop ----------------------------------------------------------------
  let raf = 0, last = 0, acc = 0, frames = 0, disposed = false;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    update(dt);
    renderer.render(scene, camera);
    // adaptive resolution: back off when frames run long
    if (dt > 0 && dt < 0.1) {
      acc += dt;
      if (++frames >= 60) {
        if (acc / frames > 0.024 && pr > minPR) {
          pr = Math.max(minPR, pr - 0.25);
          resize();
        }
        acc = 0;
        frames = 0;
      }
    }
  }
  function start() {
    if (raf || disposed) return;
    last = performance.now();
    acc = frames = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVis);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
  if (ro) ro.observe(canvas);
  else window.addEventListener('resize', resize);

  resize();
  update(0);
  // compile every program up front (hidden objects included) so later stages never hitch
  const hidden = [];
  scene.traverse((o) => {
    if (!o.visible) { hidden.push(o); o.visible = true; }
  });
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
  hidden.forEach((o) => (o.visible = false));
  update(0);
  renderer.render(scene, camera);
  if (!document.hidden) start();

  return {
    setJourney(t) {
      if (!Number.isFinite(t)) return;
      tTarget = clamp(t, 0, 5);
      if (!journeySet) tCur = tTarget; // first call snaps (page restored mid-scroll)
      journeySet = true;
    },
    setIntro(p) {
      if (Number.isFinite(p)) intro = clamp(p, 0, 1);
    },
    setShake(a) {
      shake = reducedMotion ? 0 : clamp(a || 0, 0, 1);
    },
    setVelocity(v) {
      if (!reducedMotion && Number.isFinite(v)) velRaw = v;
    },
    setPointer(x, y) {
      if (Number.isFinite(x) && Number.isFinite(y)) ptr.set(clamp(x, -1, 1), clamp(y, -1, 1));
    },
    setIss,
    project(name) {
      if (name !== 'earth') return null;
      _v2.set(0, 0, 0).applyMatrix4(camera.matrixWorldInverse);
      ndc.set(0, 0, 0).project(camera);
      return {
        x: ((ndc.x + 1) / 2) * cssW,
        y: ((1 - ndc.y) / 2) * cssH,
        visible: _v2.z < 0 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1,
      };
    },
    resize,
    dispose() {
      disposed = true;
      stop();
      document.removeEventListener('visibilitychange', onVis);
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', resize);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      earthRT.dispose();
      moonRT.dispose();
      skyRT.dispose();
      renderer.dispose();
    },
  };
}
