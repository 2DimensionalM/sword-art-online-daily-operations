# Local data architecture

## Source of truth

The planner uses `data/sword-art-online.sqlite` as its only authoritative data store. Browser `localStorage` is not used after the one-time import. The SQLite file is intentionally ignored by Git because it contains personal data.

`npm run dev` and `npm run start` launch two local processes together:

1. The SQLite API at `http://127.0.0.1:43110`.
2. The Vinext web application at `http://localhost:1998`.

The API accepts requests only from HTTP origins on `localhost` or `127.0.0.1`. It is not intended to be exposed to a network or deployed as written.

## Schema

- `tasks`: one row per task. Frequently queried fields are relational columns; `payload_json` preserves the complete application record for forwards-compatible reads.
- `planner_settings`: the current task-type, location, and default-selection configuration.
- `app_meta`: database initialization, theme, revision, and update timestamp.
- `migration_backups`: immutable JSON snapshots captured during an explicit browser-storage import.
- `deadline_events`: immutable audit events captured when an existing deadline on a Must task is changed or cleared. Initial deadline assignment is not a change.
- `task_deletion_events`: immutable task snapshots captured when a persisted non-template task disappears from a successful state write. These records power cancellation statistics; deletion history from before this table existed cannot be reconstructed.
- `task_time_events`: immutable task-time audit events for `started_at`, `due_at`, and `completed_at`. New non-template tasks record non-empty initial values; subsequent assignments, edits, and clears record both the old and new value.

Writes replace the complete planner state inside one `BEGIN IMMEDIATE` transaction. A monotonically increasing revision rejects stale writes from another tab. WAL mode and `synchronous = FULL` are enabled for local durability.

Deadline events are detected inside that same transaction by comparing the previously stored task with the incoming task. Historical changes made before this pipeline existed cannot be reconstructed and are intentionally not backfilled.

Task deletions are detected in the same transaction by comparing persisted task ids with the incoming state. Recurrence templates are excluded because removing a scheduling rule is not the same event as cancelling one generated mission.

Task-time events are captured in the same transaction as the planner state write, so the audit record and task value cannot diverge. They are intentionally not backfilled. Query all events with `GET /v1/task-time-events`, filter one task with `GET /v1/task-time-events?taskId=<id>`, or inspect the `task_time_events` table directly. The web application does not display this audit trail.

## One-time browser migration

On the first database-backed load on a new local origin:

1. The client asks SQLite whether it is initialized.
2. If it is empty, it reads the existing `sao-planner-*` keys from that exact browser origin.
3. It writes the normalized tasks, settings, and theme to SQLite and stores a raw migration backup.
4. Only after the database confirms the transaction does the client remove the old `localStorage` keys.
5. Every later load reads SQLite only, regardless of browser or frontend port.

The historical import in this workspace came from `http://localhost:3001`. After initialization, changing the frontend port does not change application data because every origin reads the same SQLite API. Abandoned browser storage such as `http://localhost:3000` is never read and cannot overwrite SQLite.

## Operations

```sh
# Development: database + hot-reload web app
npm run dev

# Production-like local use
npm run build
npm run start

# Create a consistent SQLite backup while the app is running
npm run db:backup

# Recover historical browser data from the browser profile that created it
npm run recover:legacy -- --port 3001
```

Stop either combined mode with `Ctrl+C`; the launcher shuts down both processes. Backups are written to `backups/` and are ignored by Git.

The recovery command temporarily serves a page on the requested historical port. Open it in the same browser profile that created the tasks. It saves a permission-restricted JSON copy in ignored `recovery/` and never clears the old keys unless the user explicitly presses the clear button.

## Future Dashboard integration

Dashboard code should consume the local API or a future repository/service layer, never reach into browser storage. If remote or multi-device access becomes necessary, preserve this state contract and migrate the storage adapter to D1 or another hosted SQL database. Authentication is required before exposing any state API beyond localhost.

## Signal Room / 心愿放送室

`goals` stores `id`, `task_type`, `title`, `description`, and `due_date` (a local calendar date, `YYYY-MM-DD`). `personal_messages` stores `id`, `mood`, `title`, `description`, and `message_date` in the same date format. These additive tables are independent of tasks and do not generate missions or alter recurrence.

`GET /v1/signals` returns `{ revision, goals, messages }`. `PUT /v1/signals` takes `{ expectedRevision, goals, messages }` and commits both collections atomically. `app_meta.signals_revision` guards concurrent edits separately from the planner revision. Invalid input returns 400 without mutation; stale writes return 409 with the current state. The editor keeps the draft and requires the user to review the latest list before retrying. The client refreshes on window focus / visibility return. Network failures leave drafts intact.

The Signal Room is the only editor. The homepage goal radar and fixed broadcast ticker derive read-only content from the same loaded state. Ticker visibility is a session-only UI preference in `sessionStorage`; neither goals nor messages use browser storage. Hover/focus and an explicit pause control stop the ticker, and reduced-motion users get a manually scrollable static feed.

The initial 22 messages were transcribed from the user-provided Notion screenshot, imported explicitly into this local database, and recorded under `notion-personal-messages-screenshot-2026-09-18` in `migration_backups`. Personal content and the import source remain in ignored `recovery/`; application startup never seeds them. No screenshot goals were imported. A consistent backup was taken before the migration. Code checkout alone does not ship personal messages to other installations.

Run `node --test scripts/test-signals.mjs` to validate against an isolated temporary database and OS-assigned loopback port, including restart persistence, validation, conflict rejection, deleted-entry persistence and planner/migration-audit preservation.
