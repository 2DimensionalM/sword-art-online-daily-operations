# Project previews

These images show the application with fictional task data in a temporary SQLite database. They contain no personal tasks, imported messages, recovery exports, or internal moodboard artwork.

| Image | View |
| --- | --- |
| `daily-operations.png` | Desktop mission board with Pending, In Progress, and Completed tasks |
| `life-command.png` | Desktop progress dashboard |
| `lockin-channel.png` | Task-linked focus space with the project's generated study artwork |

Captured in Chromium with a fresh browser context, reduced motion, and a 1440-pixel viewport. The UI is the application itself, not a concept mockup. Dates and timers reflect the capture session; the dataset is illustrative.

## Refreshing previews

1. Use a new temporary database via `SAO_DB_PATH` and an OS-assigned API port (`SAO_DB_PORT=0`). Never seed or reset the personal database for screenshots.
2. Insert fictional tasks using `PUT /v1/state` and set a neutral display name, such as `PLAYER ONE`.
3. Use an isolated browser context. Redirect **all** browser requests for `http://127.0.0.1:43110/**` to the temporary API, including writes and presence beacons. Block service workers. Do not allow failed requests to fall through to a personal API instance.
4. Capture the relevant views once fonts and assets have loaded. Review the images for private content, clipping, and unfinished transitions before replacing the files.
5. Close the browser and stop the temporary API. The preview tooling and browser packages need not be added as application dependencies.

See [study artwork provenance](../artwork/lockin-penthouse.md) for the composited room assets. Private reference images are not part of these previews.
