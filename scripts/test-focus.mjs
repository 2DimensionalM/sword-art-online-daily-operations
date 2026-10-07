import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { eligibleFocusTasks, focusClock, focusDayStats, focusDuration } from '../app/lib/focus-model.ts';

const task = (id, taskType = '📚 学业', status = 'inProgress') => ({ id, index: 1, title: `任务 ${id}`, description: '', status, taskType, startedAt: '2026-09-27T09:00:00.000Z', completedAt: '', dueAt: '', priority: 'medium', location: '家', recurrence: 'none', seriesId: '', manualOrder: null, isRecurrenceTemplate: false });

test('eligibility excludes work, pending, completed and recurrence templates', () => {
  const tasks = [task('a'), task('b', '🎓 证书'), task('c', '💼 工作'), task('d', '📚 学业', 'pending'), task('e', '📚 学业', 'completed'), { ...task('f'), isRecurrenceTemplate: true }, task('g', '工作学习'), task('h', '🎯 复习'), task('i', '学习'), task('j', '复习计划'), task('k', '阅读学习')];
  assert.deepEqual(eligibleFocusTasks(tasks).map((item) => item.id), ['a', 'b', 'h', 'i']);
});

test('day statistics split midnight, count shared time once, and count distraction events', () => {
  const start = new Date(2026, 8, 26, 23, 50).getTime();
  const end = new Date(2026, 8, 27, 0, 10).getTime();
  const session = { startedAt: new Date(start).toISOString(), focusEndedAt: new Date(end).toISOString(), tasks: [task('a'), task('b')], drifts: [{ at: new Date(start + 60000).toISOString() }] };
  assert.equal(focusDuration(session, end + 3600000), 1200000);
  assert.equal(focusDayStats([session], new Date(start), end).total, 600000);
  assert.equal(focusDayStats([session], new Date(end), end).total, 600000);
  assert.equal(focusDayStats([session], new Date(start), end).drifts, 1);
  assert.equal('returns' in focusDayStats([session], new Date(start), end), false);
  assert.equal(focusClock(3600000), '60:00');
  assert.equal(focusClock(-1), '00:00');
});

test('focus API preserves planner data, validates transitions, deduplicates retries and survives restart', { timeout: 20000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sao-focus-test-'));
  const databasePath = join(directory, 'focus.sqlite');
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['scripts/local-db-server.mjs'], { env: { ...process.env, SAO_DB_PATH: databasePath, SAO_DB_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', (chunk) => { output += chunk; const match = output.match(/SQLite API: (http:\/\/127\.0\.0\.1:\d+)/); if (match) resolve(match[1]); });
      child.on('error', reject); child.on('exit', (code) => reject(new Error(`API exited ${code}`)));
    });
  }
  async function stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
  async function request(path, method = 'GET', body) {
    const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  }
  let state;
  let serial = 0;
  async function command(action, fields = {}) {
    const result = await request('/v1/focus', 'POST', { requestId: `c-${++serial}`, expectedRevision: state.revision, action, sessionId: state.sessions.find((session) => !session.endedAt)?.id, ...fields });
    if (result.status === 200) state = result.body;
    return result;
  }
  try {
    await start();
    const tasks = [task('a'), task('b', '🎓 证书'), task('work', '💼 工作'), task('pending', '📚 学业', 'pending')];
    let planner = (await request('/v1/state', 'PUT', { expectedRevision: 0, tasks, settings: {}, theme: 'day', migrationSource: 'focus-fixture' })).body;
    state = (await request('/v1/focus')).body;
    assert.equal(state.revision, 0);
    assert.deepEqual(state.eligibleTasks.map((task) => task.id), ['a', 'b']);
    for (const taskIds of [[], ['work'], ['pending'], ['missing'], ['a', 'a']]) assert.equal((await command('start', { taskIds })).status, 400);
    assert.equal((await command('settings', { minimumMinutes: 0, breakMinutes: 3 })).status, 400);
    assert.equal((await command('settings', { minimumMinutes: 2, breakMinutes: 1 })).status, 200);
    const beforeStart = state.revision;
    const started = await command('start', { taskIds: ['a', 'b'] });
    assert.equal(started.status, 200);
    const sessionId = state.sessions[0].id;
    assert.equal(state.sessions[0].tasks.length, 2);
    assert.equal(state.sessions[0].minimumMinutes, 2);
    assert.equal(state.sessions[0].breakMinutes, 1);
    assert.equal((await command('start', { taskIds: ['a'] })).status, 400);
    assert.equal((await request('/v1/focus', 'POST', { requestId: 'stale', expectedRevision: beforeStart, action: 'start', taskIds: ['a'] })).status, 409);
    assert.equal((await command('recover')).status, 400);
    await command('drift');
    const driftRequestId = `c-${serial}`;
    const driftRevision = state.revision;
    const retried = await request('/v1/focus', 'POST', { requestId: driftRequestId, expectedRevision: 0, action: 'drift', sessionId });
    assert.equal(retried.body.revision, driftRevision);
    assert.equal(retried.body.sessions[0].drifts.length, 1);
    assert.deepEqual(Object.keys(state.sessions[0].drifts[0]), ['at']);
    assert.equal((await command('recover')).status, 400);
    await command('drift');
    await stop();
    const legacyDb = new DatabaseSync(databasePath);
    const legacyRow = legacyDb.prepare('SELECT id, payload_json FROM focus_sessions WHERE id = ?').get(sessionId);
    const legacySession = JSON.parse(legacyRow.payload_json);
    legacySession.drifts[0].returnedAt = new Date().toISOString();
    legacyDb.prepare('UPDATE focus_sessions SET payload_json = ? WHERE id = ?').run(JSON.stringify(legacySession), sessionId);
    legacyDb.prepare("DELETE FROM app_meta WHERE key = 'schema-focus-drift-only-v1'").run();
    legacyDb.close();
    const revisionBeforeMigration = state.revision;
    await start();
    const restored = (await request('/v1/focus')).body;
    assert.equal(restored.sessions[0].drifts.length, 2);
    assert.ok(restored.sessions[0].drifts.every((drift) => Object.keys(drift).length === 1 && typeof drift.at === 'string'));
    assert.equal(restored.revision, revisionBeforeMigration + 1);
    state = restored;
    await command('break');
    const focusEndedAt = state.sessions[0].focusEndedAt;
    assert.ok(focusEndedAt);
    assert.equal((await command('drift')).status, 400);
    await command('settings', { minimumMinutes: 12, breakMinutes: 5 });
    assert.equal(state.sessions[0].minimumMinutes, 2);
    await command('resume', { taskIds: ['b'] });
    assert.equal(state.sessions.length, 2);
    assert.equal(state.sessions[0].minimumMinutes, 12);
    assert.equal(state.sessions[0].breakMinutes, 5);
    assert.equal(state.sessions[1].focusEndedAt, focusEndedAt);
    assert.ok(state.sessions[1].endedAt);
    await command('finish');
    assert.equal(state.sessions.filter((session) => !session.endedAt).length, 0);
    assert.equal((await command('finish')).status, 400);
    assert.deepEqual((await request('/v1/state')).body, planner);
    // Exact task mutation boundaries, including multi-task sessions and a closed frontend.
    await command('start', { taskIds: ['a', 'b'] });
    assert.equal((await command('deleteSession', { targetSessionId: state.sessions[0].id })).status, 400);
    planner = (await request('/v1/state', 'PUT', { expectedRevision: planner.revision, tasks: tasks.map((item) => item.id === 'a' ? { ...item, status: 'completed', completedAt: new Date().toISOString() } : item), settings: {}, theme: 'day' })).body;
    state = (await request('/v1/focus')).body;
    assert.equal(state.sessions[0].phase, 'focus');
    assert.equal(state.sessions[0].tasks[0].finalStatus, 'completed');
    assert.equal(state.sessions[0].tasks[0].unlinkedAt, planner.updatedAt);
    assert.equal(state.sessions[0].tasks[1].unlinkedAt, undefined);
    planner = (await request('/v1/state', 'PUT', { expectedRevision: planner.revision, tasks: planner.tasks.map((item) => item.id === 'b' ? { ...item, status: 'pending' } : item), settings: {}, theme: 'day' })).body;
    state = (await request('/v1/focus')).body;
    assert.equal(state.sessions[0].phase, 'ended');
    assert.equal(state.sessions[0].focusEndedAt, planner.updatedAt);
    assert.equal(state.sessions[0].endReason, 'tasks-inactive');
    const removedId = state.sessions[0].id;
    const deleted = await command('deleteSession', { targetSessionId: removedId });
    assert.equal(deleted.status, 200);
    assert.equal(state.sessions.some((session) => session.id === removedId), false);
    await stop(); await start();
    assert.equal((await request('/v1/focus')).body.sessions.some((session) => session.id === removedId), false);
    assert.deepEqual((await request('/v1/state')).body, planner);

    // Space presence is scoped, revision-independent and never resumes after exit.
    planner = (await request('/v1/state', 'PUT', { expectedRevision: planner.revision, tasks, settings: {}, theme: 'day' })).body;
    state = (await request('/v1/focus')).body;
    assert.equal((await command('start', { taskIds: ['a', 'b'], spaceId: 'room-a' })).status, 400);
    assert.equal((await command('start', { taskIds: ['a'], spaceId: 'room-a' })).status, 200);
    let roomId = state.sessions[0].id;
    assert.ok(state.sessions[0].leaseUntil);
    assert.equal((await command('drift')).status, 400);
    assert.equal((await command('drift', { spaceId: 'room-a' })).status, 200);
    const presence = (spaceId, leave = false) => request('/v1/focus/presence', 'POST', { spaceId, leave });
    assert.equal((await presence('other-room', true)).body.sessions[0].endedAt, null);
    const ping = await presence('room-a');
    assert.equal(ping.body.revision, state.revision);
    assert.ok(Date.parse(ping.body.sessions[0].leaseUntil) > Date.parse(ping.body.serverNow));
    assert.equal((await command('break', { spaceId: 'room-a' })).status, 200);
    const breakEnd = state.sessions[0].focusEndedAt;
    assert.equal((await command('resume', { taskIds: ['a'], spaceId: 'other-room' })).status, 400);
    assert.equal((await command('resume', { taskIds: ['b'], spaceId: 'room-a' })).status, 400);
    assert.equal((await command('resume', { taskIds: ['a'], spaceId: 'room-a' })).status, 200);
    assert.equal(state.sessions[0].spaceId, 'room-a');
    assert.equal(state.sessions[1].focusEndedAt, breakEnd);
    assert.equal(state.sessions[1].phase, 'ended');
    const completedRound = state.sessions[0].id;
    assert.equal((await command('finish', { spaceId: 'room-a' })).status, 200);
    assert.ok(state.sessions.find((item) => item.id === completedRound).endedAt);
    assert.equal((await command('start', { taskIds: ['a'], spaceId: 'room-a' })).status, 200);
    assert.equal(state.sessions[0].spaceId, 'room-a');
    assert.notEqual(state.sessions[0].id, completedRound);
    roomId = state.sessions[0].id;
    await command('settings', { minimumMinutes: 8, breakMinutes: 3 });
    state = (await presence('room-a', true)).body;
    const stopped = state.sessions.find((item) => item.id === roomId);
    assert.equal(stopped.endReason, 'space-exit');
    assert.equal(stopped.focusEndedAt, stopped.endedAt);
    assert.equal((await presence('room-a', true)).body.revision, state.revision);
    assert.equal((await presence('room-a')).body.sessions.find((item) => item.id === roomId).endedAt, stopped.endedAt);
    assert.equal((await command('start', { taskIds: ['a'], spaceId: 'room-a' })).status, 400);
    await presence('cancel-before-start', true);
    assert.equal((await command('start', { taskIds: ['a'], spaceId: 'cancel-before-start' })).status, 400);
    await command('start', { taskIds: ['a'], spaceId: 'expired-room' });
    const expiryId = state.sessions[0].id;
    const liveDb = new DatabaseSync(databasePath);
    const expiring = JSON.parse(liveDb.prepare('SELECT payload_json FROM focus_sessions WHERE id = ?').get(expiryId).payload_json);
    expiring.leaseUntil = '2000-01-01T00:00:00.000Z';
    liveDb.prepare('UPDATE focus_sessions SET payload_json = ? WHERE id = ?').run(JSON.stringify(expiring), expiryId);
    liveDb.close();
    state = (await request('/v1/focus')).body;
    assert.equal(state.sessions[0].endReason, 'space-disconnected');
    assert.equal(state.sessions[0].focusEndedAt, expiring.lastSeenAt);
    assert.equal(state.sessions[0].phase, 'ended');
    await stop(); await start();
    state = (await request('/v1/focus')).body;
    assert.ok(state.sessions.every((item) => item.endedAt));
    assert.deepEqual((await request('/v1/state')).body, planner);

    planner = (await request('/v1/state', 'PUT', { expectedRevision: planner.revision, tasks: [], settings: {}, theme: 'day' })).body;
    const afterDeletion = (await request('/v1/focus')).body;
    assert.deepEqual(afterDeletion.sessions, state.sessions);
    assert.deepEqual(afterDeletion.eligibleTasks, []);
    assert.equal((await command('start', { taskIds: ['a'] })).status, 400);
    assert.equal((await fetch(`${base}/v1/focus`, { headers: { Origin: 'https://example.com' } })).status, 403);
    const db = new DatabaseSync(databasePath, { readOnly: true });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM migration_backups WHERE source = 'schema-focus-drift-only-v1'").get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM migration_backups').get().n, 2);
    db.close();
  } finally {
    if (child && child.exitCode === null) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
