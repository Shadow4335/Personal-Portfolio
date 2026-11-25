import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, altKm, speed, fmtAlt, CALLOUTS, BOOT, SPOOL } from '../src/film.js';

test('altitude and speed only ever go up, and hit the marks on the ladder', () => {
  let a = -1, v = -1;
  for (let t = 0; t <= T.end; t += 0.05) {
    assert.ok(altKm(t) >= a && speed(t) >= v, `t=${t.toFixed(2)}`);
    a = altKm(t); v = speed(t);
  }
  assert.equal(altKm(T.rotate), 0); // wheels on the runway until rotate
  assert.equal(altKm(T.space), 100); // Kármán line exactly when the banner shows
  assert.equal(speed(T.roll), 0);
});

test('beats are in order and land in the right chapter', () => {
  assert.ok(BOOT.every(([at], i) => i === 0 || at > BOOT[i - 1][0]) && BOOT.at(-1)[0] < SPOOL && SPOOL < T.roll);
  assert.ok(CALLOUTS.every(([at], i) => at > T.roll && at < T.space && (i === 0 || at > CALLOUTS[i - 1][0])));
});

test('altitude readout switches from metres to kilometres', () => {
  assert.equal(fmtAlt(0), '0 M');
  assert.equal(fmtAlt(0.5), '500 M');
  assert.equal(fmtAlt(11), '11.0 KM');
  assert.equal(fmtAlt(408), '408 KM');
});
