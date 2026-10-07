# Local data architecture

## Source of truth

The planner uses `data/sword-art-online.sqlite` as its only authoritative data store. Browser `localStorage` is not used after the one-time import. The SQLite file is intentionally ignored by Git because it contains personal data.

`npm run dev` and `npm run start` launch two local processes together:

1. The SQLite API at `http://127.0.0.1:43110`.
2. The Vinext web application at `http://localhost:1998`.

The API accepts requests only from HTTP origins on `localhost` or `127.0.0.1`. It is not intended to be exposed to a network or deployed as written.

## Schema

- `tasks`: one row per task. Frequently queried fields are relational columns; `payload_json` preserves the complete application record for forwards-compatible reads.
- `planner_settings`: the current task-type, location, default-selection, recurrence-order, and Pending-divider configuration. The divider stores the ids of the Pending tasks below it, plus its collapsed state; it is not represented as a task row. New Pending tasks and tasks that return to the column stay above that boundary, so existing tasks do not cross it when the list grows or shrinks. It is applied only in Custom sort mode, while other sort modes temporarily ignore it without deleting it. Settings that still store the older numeric threshold are converted from the Pending custom order saved in the same record.
- `app_meta`: database initialization, theme, revision, and update timestamp.
- `migration_backups`: immutable JSON snapshots captured during an explicit browser-storage import.
- `deadline_events`: immutable audit events captured when an existing deadline on a Must task is changed or cleared. Initial deadline assignment is not a change.
- `task_deletion_events`: immutable task snapshots captured when a persisted non-template task disappears from a successful state write. These records power cancellation statistics; deletion history from before this table existed cannot be reconstructed.
- `task_time_events`: immutable task-time audit events for `started_at`, `due_at`, and `completed_at`. New non-template tasks record non-empty initial values; subsequent assignments, edits, and clears record both the old and new value.
- `sleep_records`: one sleep window per local calendar date of its wake time. The browser checks before submission, and the loopback API checks again before inserting; a duplicate date returns an error without changing existing records. The NIGHT LOG asks for confirmation before deletion.

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

`goals` stores `id`, `task_type`, `title`, `description`, `due_date`, and `completed_date`. Both dates use the local `YYYY-MM-DD` format; an empty `completed_date` means the goal is active. The additive `schema-goals-completed-date-v1` migration snapshots legacy goal rows in `migration_backups` before adding the completion column, and existing goals remain active. `personal_messages` stores `id`, `mood`, `title`, `description`, and `message_date` in the same date format. These tables are independent of tasks and do not generate missions or alter recurrence.

`GET /v1/signals` returns `{ revision, goals, messages }`. `PUT /v1/signals` takes `{ expectedRevision, goals, messages }` and commits both collections atomically. `app_meta.signals_revision` guards concurrent edits separately from the planner revision. Invalid input returns 400 without mutation; stale writes return 409 with the current state. The editor keeps the draft and requires the user to review the latest list before retrying. The client refreshes on window focus / visibility return. Network failures leave drafts intact.

The Signal Room is the only editor. Completing a goal records its completion date; restoring it clears that date. Completed goals sort after active goals and can be hidden in the room. The homepage goal radar and the goal portion of the fixed broadcast ticker only derive active goals from the same loaded state. Ticker visibility is a session-only UI preference in `sessionStorage`; neither goals nor messages use browser storage. Hover/focus and an explicit pause control stop the ticker, and reduced-motion users get a manually scrollable static feed.

The initial 22 messages were transcribed from the user-provided Notion screenshot, imported explicitly into this local database, and recorded under `notion-personal-messages-screenshot-2026-09-18` in `migration_backups`. Personal content and the import source remain in ignored `recovery/`; application startup never seeds them. No screenshot goals were imported. A consistent backup was taken before the migration. Code checkout alone does not ship personal messages to other installations.

Run `node --test scripts/test-signals.mjs` to validate against an isolated temporary database and OS-assigned loopback port, including restart persistence, validation, conflict rejection, deleted-entry persistence and planner/migration-audit preservation.

## LOCKIN CHANNEL / 专注频道

`focus_control` owns an independent revision and integer 1–180 minute minimum/rest settings (defaults 8/3). `focus_sessions` stores one focus interval followed by an optional break, with server timestamps, captured settings, immutable task id/title/type snapshots, and one-tap distraction events in `payload_json`. Each distraction stores only its event time; there is no return state or return timestamp. A partial unique index permits only one unfinished session. The `schema-focus-drift-only-v1` migration backs up legacy focus payloads in `migration_backups`, removes `returnedAt` from live session data, and leaves planner data untouched. Snapshot links deliberately have no cascading task foreign key: completing, renaming or deleting a task preserves the historical association.

`GET /v1/focus` returns settings, sessions, current eligible tasks, revision and server time. `POST /v1/focus` accepts idempotent revision-checked commands. The Daily Ops entry starts one selected task with a unique `spaceId`; the native full-screen modal makes the rest of the application inert. Only non-template IN PROGRESS tasks whose normalized type is 学业/学习, 复习, or 证书 can enter. “学业” is the existing learning category. Substring matches such as 工作学习 or 复习计划 do not grant access. Both client and API enforce this restriction. No task is completed or otherwise edited from inside the space.

Space sessions add `spaceId`, `lastSeenAt` and `leaseUntil` to their existing JSON payload; no schema or historical-record rewrite is needed. `POST /v1/focus/presence` accepts `{ spaceId, leave }`. A heartbeat every five seconds renews a twenty-second lease. Explicit exit commits the stop before restoring app interaction and is scoped to the owning space, independent of concurrent revisions. Repeated exit is idempotent. A pagehide beacon stops on reload/navigation/close; a cancellation marker prevents a delayed start request from restarting an exited space. If the browser crashes, the API expires the lease at the last confirmed presence timestamp, never counting the disconnected tail. Expiry is checked on focus reads/commands and by a five-second server sweep, including after restart. A failed heartbeat freezes the displayed clock until confirmation. A leased space cannot be controlled by a command from another space.

The legacy start/resume/break contract remains readable and supported for compatibility; the UI exposes no separate timer page or break phase. Entering a new space closes any unleased legacy active session in the same transaction, preserving it in history. Another live leased space blocks entry. Exiting never changes the task's planner status. Planner writes still reconcile active task links atomically: a task leaving eligibility receives `unlinkedAt` and `finalStatus`, and the last departure ends the session with `endReason: tasks-inactive`.

Time measures elapsed wall-clock time, including self-reported distractions. The minimum is a gentle milestone without forced interruption. The space offers a manual break that freezes focus duration and counts down the captured rest setting; it never forces an automatic restart. Continuing closes the previous interval and starts a new one for the same task and owning space. “结束本轮” uses the existing finish command to save/stop the interval while keeping the planner inert; “再开一轮” creates a new session under the same space token. Explicit exit remains a separate stop-and-return action. Historical records retain task snapshots, durations, and distraction timestamps even after task deletion. The archive, search, date filters and independent focus/rest minute settings render directly in the FIND YOUR FLOW section at the bottom of DESIGN; both settings save atomically through the existing settings command and are captured for the next session. Only record removal has a confirmation dialog. Daily Ops contains only mission-card entries. The Today/seven-day dashboard UI has been removed; no focus metric is added to the homepage. No browser storage is used for focus data.

Run `node --test scripts/test-focus.mjs` for isolated API/restart/conflict/idempotency/data-preservation checks, exact eligibility, task-status reconciliation, scoped presence, revision-independent exits, cancelled starts, lease expiry and historical deletion.

The room's day/night illustration uses browser-local computer hours (07:00–18:59 day), independent of server-clock correction for session durations and independent of app theme. Weather is manually selected from clear/cloudy/overcast/drizzle/storm/snow/blizzard, starting clear per entry; it is simulated. These transient presentation values do not enter SQLite or browser storage, require no location access and do not alter historical focus records.
