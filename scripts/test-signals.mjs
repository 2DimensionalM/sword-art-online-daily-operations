import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

test('signal persistence, validation, stale-write rejection and planner isolation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sao-signals-'));
  const databasePath = join(directory, 'test.sqlite');
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['scripts/local-db-server.mjs'], { env: { ...process.env, SAO_DB_PATH: databasePath, SAO_DB_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    // Port 0 is selected by the OS, then reported by the API.
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/SQLite API: (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) resolve(match[1]);
      });
      child.on('error', reject);
      child.on('exit', (code) => reject(new Error(`API exited: ${code}`)));
    });
  }
  async function stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
  async function request(path, method = 'GET', body) {
    const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  }
  try {
    await start();
    const planner = await request('/v1/state', 'PUT', { expectedRevision: 0, tasks: [], settings: { username: 'test' }, theme: 'night', migrationSource: 'test-source' });
    assert.equal(planner.status, 200);
    assert.deepEqual((await request('/v1/signals')).body, { revision: 0, goals: [], messages: [] });
    const goal = { id: 'g1', taskType: '学习', title: '测试目标', description: '多行\n描述', date: '2026-12-31' };
    const message = { id: 'm1', mood: '🙂', title: '测试寄语', description: '<script>text only</script>', date: '2026-09-18' };
    let payload = { expectedRevision: 0, goals: [goal], messages: [message] };
    let saved = await request('/v1/signals', 'PUT', payload);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.revision, 1);
    assert.equal((await request('/v1/signals', 'PUT', payload)).status, 409);
    assert.equal((await request('/v1/signals', 'PUT', { ...payload, expectedRevision: 1, goals: [{ ...goal, date: '2026-02-30' }] })).status, 400);
    assert.equal((await request('/v1/signals', 'PUT', { ...payload, expectedRevision: 1, goals: [{ ...goal, title: ' ' }] })).status, 400);
    assert.equal((await request('/v1/signals', 'PUT', { ...payload, expectedRevision: 1, messages: [message, message] })).status, 400);
    assert.deepEqual((await request('/v1/signals')).body, saved.body);
    payload = { expectedRevision: 1, goals: [{ ...goal, title: '已修改' }], messages: [{ ...message, mood: '坚定' }] };
    saved = await request('/v1/signals', 'PUT', payload);
    assert.equal(saved.status, 200);
    await stop(); await start();
    assert.deepEqual((await request('/v1/signals')).body, saved.body);
    assert.deepEqual((await request('/v1/state')).body, planner.body);
    const denied = await fetch(`${base}/v1/signals`, { headers: { Origin: 'https://example.com' } });
    assert.equal(denied.status, 403);
    assert.equal((await request('/v1/signals', 'PUT', { expectedRevision: 2, goals: [], messages: [] })).status, 200);
    await stop(); await start();
    assert.deepEqual((await request('/v1/signals')).body, { revision: 3, goals: [], messages: [] });
    const db = new DatabaseSync(databasePath, { readOnly: true });
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM migration_backups').get().count, 1);
    db.close();
  } finally {
    if (child && child.exitCode === null) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
