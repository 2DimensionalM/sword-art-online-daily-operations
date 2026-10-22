# Architecture

## Runtime boundaries

The browser renders a single-page React application. Vinext implements the Next.js App Router APIs on Vite, with the Cloudflare Vite plugin providing the local worker runtime. The worker does not own application data: browser clients communicate directly with a separate Node.js process bound to `127.0.0.1:43110`.

`scripts/run-local-app.mjs` starts the database service, waits for its health check, and starts the web process. It stops both children on shutdown. The normal frontend origin is `http://localhost:1998`.

| Layer | Entry points | Responsibility |
| --- | --- | --- |
| Application | `app/page.tsx` | Task state, recurrence, view navigation, and planner interactions |
| Feature UI | `app/components/` | Dashboard, signals, focus space, history, and supporting controls |
| Browser transport | `app/lib/*-store.ts` | Typed HTTP requests to the local API |
| Pure models | `app/lib/focus-model.ts`, `pending-divider.ts`, `study-atmosphere.ts` | Timing, ordering, eligibility, and presentation calculations |
| Persistence | `scripts/local-db-server.mjs` | Validation, SQLite migrations, transactions, audit events, and conflict handling |
| Presentation | `app/design-tokens.css`, feature styles, `app/brand.css` | Shared tokens, responsive layouts, motion, and wordmark geometry |

## State and consistency

The planner reads and writes complete task/settings snapshots. Each write supplies the revision it was based on. A stale revision returns HTTP 409 with the current state rather than silently overwriting newer data. Task changes and their audit events commit in one SQLite transaction.

Signals have a separate revision and atomic goals/messages writes. Focus uses revision-checked commands, request identifiers for retry deduplication, and an ownership token for presence and exit. Historical focus records capture task snapshots so later renames or deletions do not rewrite history.

SQLite uses WAL mode and `synchronous = FULL`. Schema migrations preserve existing data and record backups where required. The [data contract](DATA_ARCHITECTURE.md) describes the tables and lifecycle rules.

Browser storage is not a second database. The guarded legacy import reads `localStorage` only when SQLite is uninitialized and removes imported keys only after confirmation from the API. `sessionStorage` retains navigation and temporary UI choices. Study weather stays in component state.

## Design choices and limits

- **Local ownership:** A file-backed database makes backups and inspection straightforward and avoids account or service setup. The tradeoff is no multi-device synchronization or shared workspace.
- **Snapshot writes:** A single transaction keeps planner state and audit events consistent. It also means clients must handle conflicts, and very large task collections would warrant a more granular persistence interface.
- **Separate Node API:** SQLite remains outside the worker runtime and UI components. The API has no authentication and is intentionally limited to loopback; public hosting requires a separate architecture decision.
- **Vinext:** The project uses App Router conventions with Vite tooling. Vinext is beta, so framework compatibility is a dependency constraint rather than a guarantee.
- **Source design checks:** The harness catches violations of the wordmark and shared-shell contract. It does not evaluate rendered accessibility, screenshot similarity, or layout quality; browser review remains necessary.

## Validation boundaries

`npm run check` runs ESLint, the source design harness, strict TypeScript checking, Node tests, and a production build. API tests create temporary SQLite databases, request an OS-selected port, exercise persistence and conflicts, restart the service, and clean up their fixtures. The suite does not provide full end-to-end browser coverage or certify every recurrence rule.

New feature work should keep SQLite access in the API, transport in `app/lib`, and extract focused components or pure helpers when extending the large main page.
