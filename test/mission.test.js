import { test } from 'node:test';
import assert from 'node:assert/strict';
import { met, telemetry, clock, LIFT, CUTOFF, SEP, CALLOUTS } from '../src/film.js';

test('mission clock is zero at liftoff and matches the callouts', () => {
  assert.equal(met(LIFT), 0);
  assert.equal(met(5.55), 12);   // TOWER CLEARED
  assert.equal(met(6.2), 83);    // MAX-Q
  assert.equal(met(CUTOFF), 161);
  assert.equal(met(SEP), 162);
  assert.ok(CALLOUTS.every(([at], i) => i === 0 || at > CALLOUTS[i - 1][0]), 'callouts in order');
});

test('clock formats both sides of liftoff', () => {
  assert.equal(clock(-3), 'T−00:00:03');
  assert.equal(clock(0), 'T+00:00:00');
  assert.equal(clock(161), 'T+00:02:41');
});

test('telemetry follows the ascent table and interpolates between rows', () => {
  assert.equal(telemetry(83).km, 13.4);
  assert.equal(telemetry(0).kmh, 0);
  const mid = telemetry(140.5).km; // halfway between 120 s (30 km) and 161 s (67 km)
  assert.ok(Math.abs(mid - 48.5) < 0.01, `mid=${mid}`);
});
