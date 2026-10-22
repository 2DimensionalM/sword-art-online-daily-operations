# Local development

Start with the [README quick start](../README.md#run-locally). The normal workflow is `npm ci`, `npm run dev`, and `npm run check` before review.

## Checks

| Check | Coverage |
| --- | --- |
| `npm run design:check` | Source-level wordmark, shared shell, and moodboard manifest contract |
| `npm run lint` | Design harness and ESLint |
| `npm run typecheck` | Strict TypeScript validation |
| `npm test` | All `scripts/test-*.mjs` suites using Node's test runner |
| `npm run build` | Vinext client, RSC, and SSR production bundles |

Tests import TypeScript helpers using Node's experimental type-stripping flag so they also run on the minimum supported Node.js version. SQLite and type-stripping warnings on that version are expected. API fixtures use temporary databases and dynamic loopback ports; they never need the personal database or a running frontend.

For UI changes, review desktop and narrow/mobile layouts. Exercise affected task creation, status transitions, recurrence, settings, theme switching, and reload persistence. The automated suite does not cover all browser interactions.

## Troubleshooting

### Unsupported Node.js or missing `node:sqlite`

Run `node --version` and use Node.js 22.13 or newer. If you use nvm, run `nvm install` and `nvm use` from the repository root, then `npm ci`.

### A server is already running or a port is occupied

The default ports are 1998 for the frontend and 43110 for the API. Stop the existing launcher with `Ctrl+C` in its terminal before starting another complete stack. Vinext also reports an existing development instance rather than starting a second one in the same checkout.

`SAO_WEB_PORT=2000 npm run dev` changes the frontend port. Browser API clients still use port 43110; changing the frontend origin does not select another database. Do not change only the API port for normal application use.

### The interface reports a storage connection error

Start the full stack with `npm run dev`, rather than `dev:web` alone. Check the launcher terminal and `http://127.0.0.1:43110/health`. Avoid deleting the database as a troubleshooting step. A stale-write conflict means another client changed the data; review the latest state before retrying.

### Preserve data before database changes

Run `npm run db:backup`. This creates a consistent copy in ignored `backups/`, including when the application is running. Keep a separate copy of important backups outside the checkout. Do not copy only the live `.sqlite` file while writes are active because committed changes may still be in its WAL file.

### Recover tasks from an older browser origin

Run `npm run recover:legacy -- --port <old-port>` and open the recovery page using the browser profile that originally stored the data. The historical frontend must be stopped so the port is free. Recovery writes an ignored export and never clears keys automatically; it does not overwrite the current SQLite database. See the [migration contract](DATA_ARCHITECTURE.md#one-time-browser-migration).

### Private design references are unavailable

Public checkouts intentionally omit the internal moodboard PNGs. The design harness accepts a complete set or no images and always checks the tracked manifest and source rules. Read the style guide and moodboard notes; do not add replacement copyrighted reference assets to the repository.
