import assert from 'node:assert/strict';
import test from 'node:test';
import { studyPeriodAt } from '../app/lib/study-atmosphere.ts';

test('the scene switches at computer-local 07:00 and 19:00, including midnight', () => {
  for (const [hour, minute, expected] of [[0, 0, 'night'], [6, 59, 'night'], [7, 0, 'day'], [18, 59, 'day'], [19, 0, 'night'], [23, 59, 'night']]) {
    assert.equal(studyPeriodAt(new Date(2026, 9, 7, hour, minute)), expected);
  }
});
