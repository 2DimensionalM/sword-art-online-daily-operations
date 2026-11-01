import assert from 'node:assert/strict';
import test from 'node:test';

const DAY_MS = 24 * 60 * 60_000;

function countCalendarDays(start, end) {
  const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((utcEnd - utcStart) / DAY_MS);
}

function elapsedCalendarDays(period, now) {
  const totalDays = Math.max(1, countCalendarDays(period.start, period.end));
  if (+now >= +period.end) return totalDays;
  if (+now < +period.start) return 1;
  const currentDays = countCalendarDays(period.start, new Date(now.getFullYear(), now.getMonth(), now.getDate())) + 1;
  return Math.max(1, Math.min(totalDays, currentDays));
}

test('October with European DST fallback counts exactly 31 calendar days', () => {
  const octStart = new Date(2026, 9, 1);
  const octEnd = new Date(2026, 10, 1);
  assert.equal(countCalendarDays(octStart, octEnd), 31);

  // Even when now is in November (past period), elapsed days for October must be exactly 31
  const novNow = new Date(2026, 10, 1, 15, 58);
  assert.equal(elapsedCalendarDays({ start: octStart, end: octEnd }, novNow), 31);
});

test('elapsed calendar days correctly counts days during month progression', () => {
  const octStart = new Date(2026, 9, 1);
  const octEnd = new Date(2026, 10, 1);
  const period = { start: octStart, end: octEnd };

  // First day of month
  assert.equal(elapsedCalendarDays(period, new Date(2026, 9, 1, 9, 0)), 1);

  // Mid month (Oct 15)
  assert.equal(elapsedCalendarDays(period, new Date(2026, 9, 15, 14, 0)), 15);

  // Last day of month
  assert.equal(elapsedCalendarDays(period, new Date(2026, 9, 31, 23, 59)), 31);

  // Future period
  assert.equal(elapsedCalendarDays(period, new Date(2026, 8, 20)), 1);
});

test('day cursor iteration across DST transitions stays at 00:00:00 midnight', () => {
  const cursor = new Date(2026, 9, 24);
  const dates = [];
  for (let i = 0; i < 5; i++) {
    dates.push({
      date: cursor.getDate(),
      hours: cursor.getHours(),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  assert.deepEqual(dates, [
    { date: 24, hours: 0 },
    { date: 25, hours: 0 },
    { date: 26, hours: 0 },
    { date: 27, hours: 0 },
    { date: 28, hours: 0 },
  ]);
});
