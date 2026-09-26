import assert from 'node:assert/strict';
import test from 'node:test';
import {
  belowTaskIdsAfterReorder,
  belowTaskIdsFromDividerIndex,
  pendingDividerBelowTaskIdsFromRaw,
  releasePendingDividerTask,
  resolvePendingDividerIndex,
} from '../app/lib/pending-divider.ts';

test('a newly prepended pending task stays above the tasks the divider already kept visible', () => {
  const pending = ['A', 'B', 'C', 'D', 'E'];
  const below = belowTaskIdsFromDividerIndex(pending, 3);
  const withNewTask = ['F', ...pending];
  assert.deepEqual(below, ['D', 'E']);
  assert.equal(resolvePendingDividerIndex(withNewTask, below), 4);
  assert.deepEqual(withNewTask.slice(0, 4), ['F', 'A', 'B', 'C']);
});

test('removing a task above the divider does not pull a hidden task up', () => {
  const below = ['D', 'E'];
  const pending = ['A', 'B', 'C', 'D', 'E'].filter((id) => id !== 'C');
  assert.equal(resolvePendingDividerIndex(pending, below), 2);
  assert.deepEqual(pending.slice(0, 2), ['A', 'B']);
});

test('removing the first hidden task keeps the divider above the remaining hidden tasks', () => {
  const below = ['D', 'E'];
  const pending = ['A', 'B', 'C', 'E'];
  assert.equal(resolvePendingDividerIndex(pending, below), 3);
});

test('a task that returns to the top of pending leaves the hidden set', () => {
  const below = releasePendingDividerTask(['D', 'E'], 'D');
  const pending = ['D', 'A', 'B', 'C', 'E'];
  assert.deepEqual(below, ['E']);
  assert.equal(resolvePendingDividerIndex(pending, below), 4);
});

test('legacy numeric thresholds convert into the tasks below that position', () => {
  const pending = ['A', 'B', 'C', 'D'];
  const below = pendingDividerBelowTaskIdsFromRaw({ pendingDividerIndex: 2, pendingDividerCollapsed: true }, pending);
  assert.deepEqual(below, ['C', 'D']);
  assert.equal(resolvePendingDividerIndex(['NEW', ...pending], below), 3);
});

test('an explicit divider task list wins over a leftover numeric threshold', () => {
  const below = pendingDividerBelowTaskIdsFromRaw({ pendingDividerBelowTaskIds: ['E'], pendingDividerIndex: 1 }, ['A', 'B', 'E']);
  assert.deepEqual(below, ['E']);
});

test('reordering keeps every unmoved task on its original side of the divider', () => {
  const before = ['A', 'B', 'C', 'D', 'E'];
  const below = ['D', 'E'];
  const movedToTop = ['D', 'A', 'B', 'C', 'E'];
  const nextBelow = belowTaskIdsAfterReorder(before, below, movedToTop, 'D');
  assert.deepEqual(nextBelow, ['E']);
  assert.equal(resolvePendingDividerIndex(movedToTop, nextBelow), 4);

  const movedToEnd = ['B', 'C', 'D', 'E', 'A'];
  const hiddenEnd = belowTaskIdsAfterReorder(before, below, movedToEnd, 'A');
  assert.deepEqual(hiddenEnd, ['D', 'E', 'A']);
  assert.equal(resolvePendingDividerIndex(movedToEnd, hiddenEnd), 2);
});
