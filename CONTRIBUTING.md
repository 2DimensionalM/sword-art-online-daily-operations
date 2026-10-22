# Contributing

Bug reports and focused improvements are welcome. Use the issue templates to describe a reproducible problem or a concrete workflow.

## Development workflow

1. Use Node.js 22.13 or newer and install dependencies with `npm ci`.
2. Create a branch for a focused change.
3. Start the complete local stack with `npm run dev`.
4. Preserve the SQLite and visual-design contracts.
5. Run `npm run check` before opening a pull request. This runs the design harness, ESLint, TypeScript, all Node tests, and a production build.
6. For UI changes, review affected desktop and narrow/mobile flows, including reload persistence when relevant.

See [local development](docs/DEVELOPMENT.md) for check coverage and troubleshooting, and [architecture](docs/ARCHITECTURE.md) for module boundaries and design tradeoffs.

## Code conventions

Use TypeScript with strict checking, two-space indentation, single quotes, and semicolons. Keep browser-only APIs inside client components or effects. Prefer focused components and pure helpers when extending the main page. Preserve Chinese UI copy and established English labels.

Keep SQLite access in `scripts/local-db-server.mjs` and browser transport in `app/lib`. Schema changes require data-preserving migrations; preserve the `migration_backups` audit record. Add or update tests for changed business rules or API behavior. Do not edit generated output.

## Data safety

- Never commit personal files from `data/`, `backups/`, or `recovery/`.
- Run `npm run db:backup` before database schema or migration work.
- Do not add browser storage as an authoritative fallback.
- Keep the local data API bound to `127.0.0.1`. Network access requires authentication and an explicit architecture review.

## Visual changes

Read [the style guide](docs/STYLE_GUIDE.md) and [moodboard notes](docs/moodboard/p4g/README.md) before changing the brand lockup or global art direction. Private reference PNGs are intentionally excluded from the public repository; the tracked manifest records their evidence boundary. The design harness accepts a complete local reference set or no images and must not be weakened to pass a change.

## Pull requests

Explain the problem and final behavior, data impact, and validation performed. Include screenshots when they help review a UI change; use fictional task data and exclude copyrighted reference artwork. Keep unrelated cleanup separate.
