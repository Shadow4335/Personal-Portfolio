import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moonPhase } from '../src/sky.js';

test('known full moon (25 Jan 2024 17:54 UTC) is nearly fully lit', () => {
  const m = moonPhase(new Date(Date.UTC(2024, 0, 25, 17, 54)));
  assert.equal(m.name, 'full moon');
  assert.ok(m.lit > 0.98, `lit=${m.lit}`);
});

test('known new moon (11 Jan 2024 11:57 UTC) is nearly dark', () => {
  const m = moonPhase(new Date(Date.UTC(2024, 0, 11, 11, 57)));
  assert.equal(m.name, 'new moon');
  assert.ok(m.lit < 0.02, `lit=${m.lit}`);
});

test('first quarter (17 Feb 2024 15:01 UTC) is about half lit', () => {
  const m = moonPhase(new Date(Date.UTC(2024, 1, 17, 15, 1)));
  assert.equal(m.name, 'first quarter');
  assert.ok(Math.abs(m.lit - 0.5) < 0.1, `lit=${m.lit}`);
});
