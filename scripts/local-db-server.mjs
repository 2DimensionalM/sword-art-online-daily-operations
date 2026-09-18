import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const workspace = process.cwd();
const databasePath = resolve(workspace, process.env.SAO_DB_PATH || 'data/sword-art-online.sqlite');
const port = Number(process.env.SAO_DB_PORT || 43110);
const host = '127.0.0.1';

mkdirSync(dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = FULL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS planner_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    task_index INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'inProgress', 'completed')),
    task_type TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    due_at TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('must', 'high', 'medium', 'low')),
    location TEXT NOT NULL,
    recurrence TEXT NOT NULL CHECK (recurrence IN ('none', 'daily', 'weekdays', 'weekly')),
    series_id TEXT NOT NULL,
    manual_order INTEGER,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS migration_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    imported_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sleep_records (
    id TEXT PRIMARY KEY,
    sleep_started_at TEXT NOT NULL,
    wake_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (wake_at > sleep_started_at)
  );

  CREATE TABLE IF NOT EXISTS deadline_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    changed_at TEXT NOT NULL,
    old_due_at TEXT NOT NULL,
    new_due_at TEXT NOT NULL,
    priority_at_change TEXT NOT NULL CHECK (priority_at_change IN ('must', 'high', 'medium', 'low'))
  );

  CREATE TABLE IF NOT EXISTS task_deletion_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    deleted_at TEXT NOT NULL,
    title TEXT NOT NULL,
    task_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'inProgress', 'completed')),
    started_at TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    due_at TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('must', 'high', 'medium', 'low')),
    payload_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS task_time_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    changed_at TEXT NOT NULL,
    field_name TEXT NOT NULL CHECK (field_name IN ('started_at', 'due_at', 'completed_at')),
    old_value TEXT NOT NULL,
    new_value TEXT NOT NULL,
    change_kind TEXT NOT NULL CHECK (change_kind IN ('initial', 'updated')),
    task_title TEXT NOT NULL,
    task_status TEXT NOT NULL CHECK (task_status IN ('pending', 'inProgress', 'completed'))
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_status_manual_order
  ON tasks(status, manual_order);

  CREATE INDEX IF NOT EXISTS idx_tasks_due_at
  ON tasks(due_at)
  WHERE due_at != '';

  CREATE INDEX IF NOT EXISTS idx_sleep_records_wake_at
  ON sleep_records(wake_at DESC);

  CREATE INDEX IF NOT EXISTS idx_deadline_events_task_changed_at
  ON deadline_events(task_id, changed_at DESC);

  CREATE INDEX IF NOT EXISTS idx_task_deletion_events_deleted_at
  ON task_deletion_events(deleted_at DESC);

  CREATE INDEX IF NOT EXISTS idx_task_time_events_task_changed_at
  ON task_time_events(task_id, changed_at DESC, id DESC);
`);
// Additive signal-room migration; planner state and its revision remain independent.
db.exec(`
  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY, task_type TEXT NOT NULL, title TEXT NOT NULL,
    description TEXT NOT NULL, due_date TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS personal_messages (
    id TEXT PRIMARY KEY, mood TEXT NOT NULL, title TEXT NOT NULL,
    description TEXT NOT NULL, message_date TEXT NOT NULL
  );
`);
db.exec('PRAGMA optimize');

const readMeta = db.prepare('SELECT value FROM app_meta WHERE key = ?');
const writeMeta = db.prepare(`
  INSERT INTO app_meta (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);
const readTasks = db.prepare('SELECT payload_json FROM tasks ORDER BY task_index ASC');
const deleteTasks = db.prepare('DELETE FROM tasks');
const insertTask = db.prepare(`
  INSERT INTO tasks (
    id, task_index, title, description, status, task_type, started_at,
    completed_at, due_at, priority, location, recurrence, series_id,
    manual_order, payload_json, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const readSettings = db.prepare('SELECT value_json FROM planner_settings WHERE id = 1');
const writeSettings = db.prepare(`
  INSERT INTO planner_settings (id, value_json, updated_at) VALUES (1, ?, ?)
  ON CONFLICT(id) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
`);
const writeBackup = db.prepare(`
  INSERT INTO migration_backups (source, payload_json, imported_at) VALUES (?, ?, ?)
`);
const readSleepRecords = db.prepare('SELECT id, sleep_started_at, wake_at, created_at, updated_at FROM sleep_records ORDER BY wake_at DESC');
const insertSleepRecord = db.prepare(`
  INSERT INTO sleep_records (id, sleep_started_at, wake_at, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
`);
const deleteSleepRecord = db.prepare('DELETE FROM sleep_records WHERE id = ?');
const readDeadlineEvents = db.prepare(`
  SELECT id, task_id, changed_at, old_due_at, new_due_at, priority_at_change
  FROM deadline_events
  ORDER BY changed_at DESC, id DESC
`);
const insertDeadlineEvent = db.prepare(`
  INSERT INTO deadline_events (task_id, changed_at, old_due_at, new_due_at, priority_at_change)
  VALUES (?, ?, ?, ?, ?)
`);
const readTaskDeletionEvents = db.prepare(`
  SELECT id, task_id, deleted_at, title, task_type, status, started_at, completed_at, due_at, priority
  FROM task_deletion_events
  ORDER BY deleted_at DESC, id DESC
`);
const insertTaskDeletionEvent = db.prepare(`
  INSERT INTO task_deletion_events (
    task_id, deleted_at, title, task_type, status, started_at,
    completed_at, due_at, priority, payload_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const readTaskDeletionEventByTaskId = db.prepare('SELECT id FROM task_deletion_events WHERE task_id = ? LIMIT 1');
const deleteTaskDeletionEvent = db.prepare('DELETE FROM task_deletion_events WHERE id = ?');
const readTaskTimeEvents = db.prepare(`
  SELECT id, task_id, changed_at, field_name, old_value, new_value, change_kind, task_title, task_status
  FROM task_time_events
  ORDER BY changed_at DESC, id DESC
`);
const readTaskTimeEventsByTaskId = db.prepare(`
  SELECT id, task_id, changed_at, field_name, old_value, new_value, change_kind, task_title, task_status
  FROM task_time_events
  WHERE task_id = ?
  ORDER BY changed_at DESC, id DESC
`);
const insertTaskTimeEvent = db.prepare(`
  INSERT INTO task_time_events (
    task_id, changed_at, field_name, old_value, new_value,
    change_kind, task_title, task_status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const TASK_TIME_FIELDS = [
  ['started_at', 'startedAt'],
  ['due_at', 'dueAt'],
  ['completed_at', 'completedAt'],
];

function recordTaskDeletionEvent(task, deletedAt = new Date().toISOString()) {
  if (!task || typeof task !== 'object') throw new Error('Task deletion payload must be an object');
  const taskId = String(task.id ?? task.taskId ?? '');
  if (!taskId) throw new Error('Task deletion id is required');
  if (task.isRecurrenceTemplate || readTaskDeletionEventByTaskId.get(taskId)) return false;
  if (!['pending', 'inProgress', 'completed'].includes(task.status)) throw new Error('Invalid deleted task status');
  if (!['must', 'high', 'medium', 'low'].includes(task.priority)) throw new Error('Invalid deleted task priority');
  insertTaskDeletionEvent.run(
    taskId,
    deletedAt,
    String(task.title ?? ''),
    String(task.taskType ?? ''),
    task.status,
    String(task.startedAt ?? ''),
    String(task.completedAt ?? ''),
    String(task.dueAt ?? ''),
    task.priority,
    JSON.stringify(task),
  );
  return true;
}

function getMeta(key, fallback) {
  return readMeta.get(key)?.value ?? fallback;
}

function getState() {
  const settingsRow = readSettings.get();
  return {
    initialized: getMeta('initialized', 'false') === 'true',
    revision: Number(getMeta('revision', '0')),
    tasks: readTasks.all().map((row) => JSON.parse(row.payload_json)),
    settings: settingsRow ? JSON.parse(settingsRow.value_json) : null,
    theme: getMeta('theme', 'day'),
    updatedAt: getMeta('updated_at', ''),
  };
}

function assertState(value) {
  if (!value || typeof value !== 'object') throw new Error('State payload must be an object');
  if (!Array.isArray(value.tasks)) throw new Error('State tasks must be an array');
  if (!value.settings || typeof value.settings !== 'object' || Array.isArray(value.settings)) throw new Error('State settings must be an object');
  if (value.theme !== 'day' && value.theme !== 'night') throw new Error('State theme must be day or night');

  const ids = new Set();
  for (const task of value.tasks) {
    if (!task || typeof task !== 'object' || typeof task.id !== 'string' || !task.id) throw new Error('Every task must have a non-empty id');
    if (ids.has(task.id)) throw new Error(`Duplicate task id: ${task.id}`);
    ids.add(task.id);
    if (!['pending', 'inProgress', 'completed'].includes(task.status)) throw new Error(`Invalid task status: ${task.status}`);
    if (!['must', 'high', 'medium', 'low'].includes(task.priority)) throw new Error(`Invalid task priority: ${task.priority}`);
    if (!['none', 'daily', 'weekdays', 'weekly'].includes(task.recurrence)) throw new Error(`Invalid task recurrence: ${task.recurrence}`);
  }
}

function saveState(payload) {
  assertState(payload);
  const currentRevision = Number(getMeta('revision', '0'));
  const expectedRevision = Number(payload.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision !== currentRevision) {
    return { conflict: true, state: getState() };
  }

  const now = new Date().toISOString();
  const wasInitialized = getMeta('initialized', 'false') === 'true';
  const previousTasks = new Map(readTasks.all().map((row) => {
    const task = JSON.parse(row.payload_json);
    return [task.id, task];
  }));
  db.exec('BEGIN IMMEDIATE');
  try {
    if (payload.migrationSource) {
      writeBackup.run(String(payload.migrationSource), JSON.stringify({
        tasks: payload.tasks,
        settings: payload.settings,
        theme: payload.theme,
      }), now);
    }

    if (wasInitialized) {
      const incomingTaskIds = new Set(payload.tasks.map((task) => task.id));
      for (const previous of previousTasks.values()) {
        if (!incomingTaskIds.has(previous.id) && !previous.isRecurrenceTemplate) {
          recordTaskDeletionEvent(previous, now);
        }
      }
      for (const task of payload.tasks) {
        const previous = previousTasks.get(task.id);
        const oldDueAt = String(previous?.dueAt ?? '');
        const newDueAt = String(task.dueAt ?? '');
        if (previous && !task.isRecurrenceTemplate && (previous.priority === 'must' || task.priority === 'must') && oldDueAt && oldDueAt !== newDueAt) {
          insertDeadlineEvent.run(task.id, now, oldDueAt, newDueAt, task.priority);
        }
        if (!task.isRecurrenceTemplate) {
          for (const [fieldName, propertyName] of TASK_TIME_FIELDS) {
            const oldValue = String(previous?.[propertyName] ?? '');
            const newValue = String(task[propertyName] ?? '');
            if ((previous && oldValue !== newValue) || (!previous && newValue)) {
              insertTaskTimeEvent.run(
                task.id,
                now,
                fieldName,
                oldValue,
                newValue,
                previous ? 'updated' : 'initial',
                String(task.title ?? ''),
                task.status,
              );
            }
          }
        }
      }
    }

    deleteTasks.run();
    for (const task of payload.tasks) {
      insertTask.run(
        task.id,
        Number(task.index) || 0,
        String(task.title ?? ''),
        String(task.description ?? ''),
        task.status,
        String(task.taskType ?? ''),
        String(task.startedAt ?? ''),
        String(task.completedAt ?? ''),
        String(task.dueAt ?? ''),
        task.priority,
        String(task.location ?? ''),
        task.recurrence,
        String(task.seriesId ?? task.id),
        task.manualOrder === null || task.manualOrder === undefined ? null : Number(task.manualOrder),
        JSON.stringify(task),
        now,
      );
    }

    writeSettings.run(JSON.stringify(payload.settings), now);
    writeMeta.run('theme', payload.theme);
    writeMeta.run('initialized', 'true');
    writeMeta.run('revision', String(currentRevision + 1));
    writeMeta.run('updated_at', now);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { conflict: false, state: getState() };
}

function getSleepRecords() {
  return readSleepRecords.all().map((record) => ({
    id: record.id,
    sleepStartedAt: record.sleep_started_at,
    wakeAt: record.wake_at,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  }));
}

function getDeadlineEvents() {
  return readDeadlineEvents.all().map((event) => ({
    id: Number(event.id),
    taskId: event.task_id,
    changedAt: event.changed_at,
    oldDueAt: event.old_due_at,
    newDueAt: event.new_due_at,
    priorityAtChange: event.priority_at_change,
  }));
}

function getTaskDeletionEvents() {
  return readTaskDeletionEvents.all().map((event) => ({
    id: Number(event.id),
    taskId: event.task_id,
    deletedAt: event.deleted_at,
    title: event.title,
    taskType: event.task_type,
    status: event.status,
    startedAt: event.started_at,
    completedAt: event.completed_at,
    dueAt: event.due_at,
    priority: event.priority,
  }));
}

function getTaskTimeEvents(taskId = '') {
  const events = taskId ? readTaskTimeEventsByTaskId.all(taskId) : readTaskTimeEvents.all();
  return events.map((event) => ({
    id: Number(event.id),
    taskId: event.task_id,
    changedAt: event.changed_at,
    fieldName: event.field_name,
    oldValue: event.old_value,
    newValue: event.new_value,
    changeKind: event.change_kind,
    taskTitle: event.task_title,
    taskStatus: event.task_status,
  }));
}

function createSleepRecord(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Sleep record payload must be an object');
  const id = typeof payload.id === 'string' && payload.id ? payload.id : crypto.randomUUID();
  const sleepStartedAt = typeof payload.sleepStartedAt === 'string' ? payload.sleepStartedAt : '';
  const wakeAt = typeof payload.wakeAt === 'string' ? payload.wakeAt : '';
  const start = new Date(sleepStartedAt);
  const wake = new Date(wakeAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(wake.getTime()) || wake <= start) {
    throw new Error('Wake time must be later than sleep time');
  }
  const now = new Date().toISOString();
  insertSleepRecord.run(id, start.toISOString(), wake.toISOString(), now, now);
  return getSleepRecords();
}

function getSignals() {
  return {
    revision: Number(getMeta('signals_revision', '0')),
    goals: db.prepare('SELECT id, task_type AS taskType, title, description, due_date AS date FROM goals ORDER BY due_date, rowid').all(),
    messages: db.prepare('SELECT id, mood, title, description, message_date AS date FROM personal_messages ORDER BY message_date DESC, rowid DESC').all(),
  };
}

function assertSignals(payload) {
  if (!payload || !Array.isArray(payload.goals) || !Array.isArray(payload.messages)) throw new Error('目标与寄语格式无效');
  for (const [records, field] of [[payload.goals, 'taskType'], [payload.messages, 'mood']]) {
    if (records.length > 5000) throw new Error('条目数量过多');
    const ids = new Set();
    for (const record of records) {
      if (!record || typeof record.id !== 'string' || !record.id || record.id.length > 100 || ids.has(record.id)) throw new Error('条目 ID 无效或重复');
      ids.add(record.id);
      for (const [key, max] of [['title', 200], ['description', 10000], [field, 100]]) {
        if (typeof record[key] !== 'string' || record[key].length > max || (key !== 'description' && !record[key].trim())) throw new Error('标题、类型或心情不能为空，且不能超出长度限制');
      }
      if (typeof record.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.date) || !Number.isFinite(Date.parse(record.date)) || new Date(record.date).toISOString().slice(0, 10) !== record.date) throw new Error('请选择有效日期');
    }
  }
}

function saveSignals(payload) {
  assertSignals(payload);
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = getSignals();
    if (payload.expectedRevision !== current.revision) {
      db.exec('ROLLBACK');
      return { conflict: true, state: current };
    }
    db.exec('DELETE FROM goals; DELETE FROM personal_messages;');
    const goal = db.prepare('INSERT INTO goals VALUES (?, ?, ?, ?, ?)');
    const message = db.prepare('INSERT INTO personal_messages VALUES (?, ?, ?, ?, ?)');
    for (const item of payload.goals) goal.run(item.id, item.taskType.trim(), item.title.trim(), item.description, item.date);
    for (const item of payload.messages) message.run(item.id, item.mood.trim(), item.title.trim(), item.description, item.date);
    writeMeta.run('signals_revision', String(current.revision + 1));
    db.exec('COMMIT');
    return { conflict: false, state: getSignals() };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

function sendJson(response, status, value, origin = '') {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin || '*' : 'null',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, PUT, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 2_000_000) throw new Error('Request body is too large');
  }
  return JSON.parse(body || '{}');
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin || '';
  if (!isAllowedOrigin(origin)) return sendJson(response, 403, { error: 'Origin is not allowed' }, origin);
  if (request.method === 'OPTIONS') return sendJson(response, 204, {}, origin);

  try {
    if (request.method === 'GET' && request.url === '/health') {
      return sendJson(response, 200, { ok: true }, origin);
    }
    if (request.method === 'GET' && request.url === '/v1/signals') {
      return sendJson(response, 200, getSignals(), origin);
    }
    if (request.method === 'PUT' && request.url === '/v1/signals') {
      const result = saveSignals(await readJson(request));
      return sendJson(response, result.conflict ? 409 : 200, result.state, origin);
    }
    if (request.method === 'GET' && request.url === '/v1/state') {
      return sendJson(response, 200, getState(), origin);
    }
    if (request.method === 'GET' && request.url === '/v1/sleep-records') {
      return sendJson(response, 200, getSleepRecords(), origin);
    }
    if (request.method === 'GET' && request.url === '/v1/deadline-events') {
      return sendJson(response, 200, getDeadlineEvents(), origin);
    }
    if (request.method === 'GET' && request.url === '/v1/task-deletions') {
      return sendJson(response, 200, getTaskDeletionEvents(), origin);
    }
    if (request.method === 'GET' && request.url?.startsWith('/v1/task-time-events')) {
      const requestUrl = new URL(request.url, `http://${host}:${port}`);
      if (requestUrl.pathname === '/v1/task-time-events') {
        return sendJson(response, 200, getTaskTimeEvents(requestUrl.searchParams.get('taskId') || ''), origin);
      }
    }
    if (request.method === 'POST' && request.url === '/v1/task-deletions') {
      recordTaskDeletionEvent(await readJson(request));
      return sendJson(response, 201, getTaskDeletionEvents(), origin);
    }
    if (request.method === 'DELETE' && request.url?.startsWith('/v1/task-deletions/')) {
      const id = Number(decodeURIComponent(request.url.slice('/v1/task-deletions/'.length)));
      if (!Number.isInteger(id) || id <= 0) return sendJson(response, 400, { error: 'Task deletion event id is required' }, origin);
      deleteTaskDeletionEvent.run(id);
      return sendJson(response, 200, getTaskDeletionEvents(), origin);
    }
    if (request.method === 'POST' && request.url === '/v1/sleep-records') {
      return sendJson(response, 201, createSleepRecord(await readJson(request)), origin);
    }
    if (request.method === 'DELETE' && request.url?.startsWith('/v1/sleep-records/')) {
      const id = decodeURIComponent(request.url.slice('/v1/sleep-records/'.length));
      if (!id) return sendJson(response, 400, { error: 'Sleep record id is required' }, origin);
      deleteSleepRecord.run(id);
      return sendJson(response, 200, getSleepRecords(), origin);
    }
    if (request.method === 'PUT' && request.url === '/v1/state') {
      const result = saveState(await readJson(request));
      return sendJson(response, result.conflict ? 409 : 200, result.state, origin);
    }
    return sendJson(response, 404, { error: 'Not found' }, origin);
  } catch (error) {
    console.error(error);
    return sendJson(response, 400, { error: error instanceof Error ? error.message : 'Unknown database error' }, origin);
  }
});

server.listen(port, host, () => {
  console.log(`SQLite API: http://${host}:${server.address().port}`);
  console.log(`SQLite file: ${databasePath}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
