import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getIss, GET } from '../api/iss.js';

// Swap global fetch for one test; `routes` maps a URL fragment to a JSON body or an Error.
function mockFetch(t, routes) {
  const real = globalThis.fetch;
  t.after(() => { globalThis.fetch = real; });
  globalThis.fetch = async (url) => {
    const hit = Object.keys(routes).find((k) => url.includes(k));
    const v = routes[hit];
    if (!hit || v instanceof Error) throw v || new Error('offline');
    return new Response(JSON.stringify(v));
  };
}

test('maps wheretheiss fields', async (t) => {
  mockFetch(t, { wheretheiss: { latitude: 12.5, longitude: -45.25, altitude: 418.2, velocity: 27580.1, visibility: 'eclipsed' } });
  assert.deepEqual(await getIss(), { lat: 12.5, lon: -45.25, alt: 418.2, vel: 27580.1, sun: 'eclipsed' });
});

test('falls back to open-notify and turns its strings into numbers', async (t) => {
  mockFetch(t, { wheretheiss: new Error('TLS reset'), 'open-notify': { iss_position: { latitude: '-16.2984', longitude: '129.9399' }, message: 'success' } });
  assert.deepEqual(await getIss(), { lat: -16.2984, lon: 129.9399, alt: null, vel: null, sun: null });
});

test('GET answers 502 when both sources are down', async (t) => {
  mockFetch(t, {});
  const r = await GET();
  assert.equal(r.status, 502);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});
