# inkling-obs-streamkit

English | [日本語](./README.ja.md)

A self-built OBS toolkit for Splatoon tournament streams. It pairs an OBS **Custom Browser Dock** (the operator panel) with a **Browser Source** (the overlay that goes on air), both served from a single Vite app backed by one Elysia API.

The flow is:

1. The operator picks a tournament, two teams, the next rule/stage, and one accent color in the Dock.
2. Pressing **Overlayへ反映** sends only those selection IDs and the presentation color to the Overlay through a `BroadcastChannel`, and saves the same values to `localStorage` so they survive a reload.
3. The Overlay picks up the change, fetches the current matchup from the API, and renders its four-slide loop.

Because the Dock, the Overlay and a Debug view all live in the same app, the overlay can be built and checked in a browser without launching OBS.

The Dock's **Position display** button immediately shows or hides player positions on both team detail slides. Hiding positions keeps the weapon lists in the same place. The setting is saved with the current selection and restored after a reload; existing saved selections default to showing positions.

## Requirements

- [Bun](https://bun.sh) — developed on 1.4.2. Bun 1.3.1 failed to resolve a peer dependency while installing Elysia, so run `bun upgrade` if installation breaks.
- A Cloudflare account and a D1 database are needed only when using `API_DATA_SOURCE=d1`. JSON remains the default.
- OBS Studio — only needed to actually put the overlay on air. Day-to-day development happens in the Debug view.

## Getting started

```bash
bun install
cp apps/api/.env.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local
bun dev
```

Run these commands at the repository root. The two `.env.local` files are ignored by Git. D1 credentials stay in the API process and outside Vite; `VITE_API_URL` is intentionally public because the browser needs it.

The API reads player and tournament JSON under `apps/api/src/data/` by default, so database setup is unnecessary while the data model is being adjusted. Before the apps start, a preparation script downloads any missing runtime assets: the weapon, rule and stage catalogs go under `apps/api/src/data/`, while the stage-reveal vignette goes under `apps/web/public/`. Existing files are kept without another CDN request. Bun's watch mode reloads the API after local source files change.

Choose the development data source from the repository root with Bun:

```bash
bun run dev:json  # Web :5173 + Bun API :3000, reading the current JSON files
bun run dev:d1    # Web :5173 + API Worker :8787, reading local D1
```

`dev:d1` uses [Wrangler's local D1](https://developers.cloudflare.com/d1/best-practices/local-development/). Before starting, it applies pending migrations from `apps/api/src/db/migrations/` and inserts the current `players.json` and `tournaments.json` development data once. D1 state is persisted under `apps/api/.data/wrangler/`; restarts and later JSON edits do not overwrite it. To intentionally recreate the local database, stop both apps and remove that directory. Run `bun run db:setup:local` to perform only the migration and initial import. These commands explicitly use `--local`, keeping this database separate from remote D1. The API Worker still needs network access to the HTTPS catalogs at `CATALOG_URL` during initialization.

Then open <http://localhost:5173/?view=debug>, choose a matchup in the left panel, press **Overlayへ反映**, and the overlay preview on the right updates.

## Views

One Vite app switches views by the `view` query parameter. There is no router.

| View | URL | Purpose |
| --- | --- | --- |
| Dock | `http://localhost:5173/?view=dock` | Operator panel. Chooses what the overlay shows. |
| Overlay | `http://localhost:5173/?view=overlay` | The 1920 × 1080 page that goes on air. |
| Debug | `http://localhost:5173/?view=debug` | Dock plus a scaled preview of the real overlay page. |

Opening the site without `view` just prints the accepted values.

## Admin app

`apps/admin` is a local management app for creating and updating tournaments, tournament teams, and participants. Edit tournament names and statuses, team order, up to four roster names and linked participants, and participant icons, positions, and up to four weapons. Roster entries can have a registered name without a linked participant. Team status is automatically draft with fewer than four members and confirmed with four. Select hidden to retain the roster and participant data while excluding the team from Dock and Overlay. Restoring a hidden team recalculates its status from the roster size. Admin can edit every status; Dock and Overlay only display confirmed teams.

1. Run `cp apps/admin/.env.example apps/admin/.env.local`.
2. Set a sufficiently long random `ADMIN_API_TOKEN` in `apps/api/.env.local` (for example, generate one with `bun -e 'console.log(crypto.randomUUID())'`).
3. Run `bun run dev:admin:local` to start the local D1 API Worker, Web, and Admin.
4. Open `http://127.0.0.1:5174`, confirm that local D1 is displayed, and connect with the same admin token.

```bash
bun run dev:admin:local       # Local D1: API :8787 / Web :5173 / Admin :5174
bun run dev:admin:production  # Production D1: local API Worker :3000 / Web :5173 / Admin :5174
```

Apply the additional migrations to an existing D1 database before using team statuses. Local `dev:admin:local` applies them automatically at startup. For production, stop the API, run `bun run db:migrate:production`, then restart it. Migration 009 adds the status column and 010 derives existing statuses from roster counts. Tournaments, teams, participants, and rosters are preserved. The legacy `roster_locked_at` column remains for compatibility and is no longer used by the app. Legacy JSON data is also normalized using roster counts.

Production uses Wrangler OAuth and a D1 binding: Admin → local API Worker → production D1. This permits writes without deploying the API code to Cloudflare or manually creating a Cloudflare API token. Run these commands from the repository root.

1. If legacy HTTP authentication or account settings exist, remove or comment out `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, API key/email, and their `CF_` aliases in `apps/api/.env.local`, and `unset` them in the shell before signing in. Run `bun install`, then `bun run cf:login` to sign in through the browser and `bun run cf:whoami` to confirm the account.
2. On first setup, run `cp apps/api/wrangler.production.example.toml apps/api/wrangler.production.toml`. Replace `account_id` and the `database_name` and `database_id` under `env.production.d1_databases` with the production values. Keep `remote = true`. Leave the local-only `wrangler.local.toml` unchanged.
3. Set `CATALOG_URL`, `IKACLO_API_ORIGIN`, and `ADMIN_API_TOKEN` in `apps/api/.env.local`. Reuse the catalog URL and image origin already configured for the app. The admin token is separate from Cloudflare authentication and is used to connect Admin. Remove legacy HTTP credentials such as `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and their `CF_` aliases from `.env.local` and the shell environment. Production commands stop before connecting when these OAuth overrides remain configured.
4. Run `bun run db:check:production` to inspect the database and migration history, then `bun run db:migrate:production` to apply pending migrations. The latter changes the production database.
5. Run `bun run dev:admin:production`. It generates `apps/api/.dev.vars.production` and starts the local API Worker through Wrangler. Startup does not apply migrations or import development data.
6. Open `http://127.0.0.1:5174`, confirm that production D1 is displayed, and connect with `ADMIN_API_TOKEN`. Register participants, a tournament, and its teams. A roster with four members becomes confirmed. Inspect the saved rows in the Cloudflare D1 Console as well.

`db:migrate:production` records migration history in Wrangler's standard `d1_migrations` table. When legacy `schema_migrations` exists, it validates known applied filenames and transfers only the history metadata. Existing application tables without history or unknown migrations stop automatic application. The actual configuration and generated secrets remain outside Git.

The connection target is fixed by `VITE_ADMIN_TARGET` at startup. `dev:admin:local` selects local D1 and `dev:admin:production` selects production D1; the UI displays the current environment and API URL. Configure the endpoints with `VITE_LOCAL_API_URL` and `VITE_PRODUCTION_API_URL`. Restart with the corresponding command to change environments. The UI compares the startup target with `/admin/status` and allows saves only after the environment matches. Disconnecting clears credentials, loaded data, and edits.

The admin token stays in browser memory; Cloudflare credentials stay in the API process. Never put tokens in `VITE_` variables. The API checks Bearer authentication and `ADMIN_ALLOWED_ORIGINS`, and rejects management operations when no token is configured or JSON mode is active. A public API Worker also rejects management operations unless explicitly configured with an admin token.

Saved data goes into the same D1 tables used by the existing Web API and Overlay. Reload an already open Dock / Overlay page to fetch updated data. Existing `bun dev`, `dev:json`, and `dev:d1` commands still start only Web and API.

```bash
bun run --filter admin lint
bun run --filter admin build
bun run --filter admin test:e2e
```

## OBS setup

| Use | URL | Size |
| --- | --- | --- |
| Custom Browser Dock | `http://localhost:5173/?view=dock` | any |
| Browser Source | `http://localhost:5173/?view=overlay` | width 1920 / height 1080 |

Keep Chrome's page zoom at 100% when comparing the preview against OBS, and do not add custom CSS to the browser source. A fixed canvas size alone does not guarantee identical rendering across operating systems or Chromium versions — fonts in particular.

## Overlay preview (Debug view)

- The overlay always renders at **1920 × 1080 px (16:9)**.
- Debug loads the real `?view=overlay` page in an iframe of exactly that size and shrinks it only with `transform: scale()` on the wrapper. Viewport, `rem` and media query conditions therefore match the production page.
- Zoom is either "fit" or 25 / 50 / 75 / 100%. Auto fit never scales above 100%. When a manual zoom does not fit, the preview area scrolls.
- The toolbar switches the iframe preview to the matchup or either team detail. “ステージ・ルール紹介” plays the reveal transition, then loops the background video with the applied rule and stage displayed. Select another scene button to stop the preview. These controls are Debug-only and do not alter the OBS Browser Source.
- Expand “紹介テキストを上書き” to select a rule and stage from dropdowns using the same catalogs as the Dock. Their names and description update immediately during playback while the same video keeps playing. Choose “再生開始時のルール／ステージ” to restore either original selection, or “元の表示に戻す” to reset both. Overrides affect only the Debug reveal preview and are not saved.
- The toolbar reports canvas size, aspect ratio, current scale and the scaled display size.
- The checkerboard behind the overlay exists to verify transparency; it is not part of the stream.
- The Dock and the iframe stay in sync through a same-origin `BroadcastChannel`, the same path the Dock and the Browser Source use in OBS. `localStorage` only restores the latest selection when a page loads.
- The iframe is intentionally same-origin because it loads only the fixed `?view=overlay` page and needs that same-origin sync path. Debug messages also verify the parent window, origin and payload before use. Same-origin is a trust boundary, not sandbox isolation.
- Vite's development and preview servers allow same-origin framing for Debug but reject framing by other origins. The same headers are carried to Worker static assets by `apps/web/public/_headers`. The local API listens only on `127.0.0.1`; its CORS origins come from `CORS_ALLOWED_ORIGINS`.

## Project structure

```text
.
├── apps/
│   ├── web/    Vite + React + TypeScript. Dock / Overlay / Debug.
│   ├── admin/  Local tournament, team, and participant management UI.
│   └── api/    Elysia on Bun or a Worker. JSON locally, D1 for Worker, migrations and seed data.
├── packages/   reserved for shared domain types (empty for now)
└── cspell.json
```

## Commands

| Command | What it does |
| --- | --- |
| `bun dev` | Runs the web app and API in parallel. |
| `bun run dev:apps` | Runs the web app and API in parallel. |
| `bun run --filter web dev` | Runs one workspace alone (`api` works the same way). |
| `bun run --filter web lint` | Web ESLint; use `--filter admin lint` for Admin. |
| `bun run --filter web build` | `tsc -b && vite build`. The only type-check path. |
| `bun run dev:json` | Starts the Bun API and Web with JSON data. |
| `bun run dev:d1` | Prepares local D1, then starts the API Worker and Web. |
| `bun run db:setup:local` | Applies pending migrations and initial data to local D1. |
| `bun run openapi:build` | Generates the static Scalar viewer and `openapi.yaml` under `dist/openapi/` without starting the API or loading runtime data. |
| `bun run cf:login` / `bun run cf:whoami` | Sign in through Wrangler and inspect the Cloudflare account. |
| `bun run db:check:production` | Read-only inspection of the production D1 target, tables, and migration history. |
| `bun run db:migrate:production` / `bun run db:migrate` | Apply pending migrations through Wrangler to the configured production D1. |
| `D1_SEED_DEVELOPMENT_DATA=1 bun run db:setup` | Applies migrations and inserts JSON development data once into the configured D1 database. |
| `bun run spellcheck` | cspell across the repository. The dictionary lives in `cspell.json`. |

## Web end-to-end and visual regression tests

The Chromium Playwright suite in `apps/web/e2e/` uses local API, image and video fixtures. It fixes the overlay viewport at 1920 × 1080, disables carousel motion, and stores the four visual baselines in Git:

```bash
bun run --filter web test:e2e
```

When an intentional design change is made, review the rendered result locally and update the baselines explicitly:

```bash
bun run --filter web test:e2e -- --update-snapshots
```

Inspect the changed PNG files under `apps/web/e2e/visual-regression.spec.ts-snapshots/` before committing them. Baselines are intentionally managed for the `chromium-linux` project (`*-chromium-linux.png`), matching the Ubuntu Chromium environment in GitHub Actions. Baseline generation on macOS or Windows is not canonical; use the same Linux Chromium environment and do not commit platform-specific files generated on another OS. The `web-smoke` pull request workflow uploads actual screenshots, diffs and traces from `apps/web/test-results/` together with the tracked expected baselines when a test fails. These browser checks do not claim pixel-perfect equivalence with OBS CEF; that remains a separate manual gate.

Pull requests run the `quality` check on a clean checkout. It uses Bun 1.4.2, installs with the frozen lockfile, prepares deterministic fixtures inside the ignored runtime paths, and runs the API type check, Web and Admin lint/build, and spellcheck. `admin-smoke` verifies management create/update flows and environment checks using a mock API. The tracked TypeScript adapters and schema SQL make these checks independent of `.env.local`, the local database, the CDN and the Ikaclo API.

## API reference

The Elysia route schemas generate an OpenAPI document through `@elysia/openapi`. A dedicated GitHub Pages workflow rebuilds the document on API changes and publishes a static Scalar viewer at <https://toy101.github.io/inkling-obs-streamkit/>. The source YAML is available at <https://toy101.github.io/inkling-obs-streamkit/openapi.yaml>. The API does not need to be running to view either file.

GitHub Pages must use **GitHub Actions** as its publishing source in the repository settings. The generator builds a schema-only app with non-executable data-source stubs, so it does not load local JSON or contact D1, the catalog CDN or the Ikaclo API.

## How it works

**Types flow from the API into the web app.** `apps/api/src/index.ts` exports `type App = typeof app`, and `apps/web/src/lib/api.ts` builds an Eden Treaty client from it. The web app imports the API's source types across the workspace, so changing a route immediately changes the types on the front end. Requests go through typed calls such as `api.overlay.matchup.get()` rather than direct `fetch` calls.

**The Dock only hands over selection IDs and presentation settings.** API responses are never sent over the channel or stored in `localStorage`; the Overlay fetches the data again from the API, which keeps the backend the single source of truth. `apps/web/src/lib/overlay-state.ts` sends changes over a `BroadcastChannel` and keeps only the latest selection in `localStorage`, so the Dock and the Overlay can restore it after a reload or an OBS restart. One-off events such as the stage reveal are never stored, so a restart does not replay them. The Dock and the Overlay are separate pages both in OBS and in the Debug view, where the Overlay is an iframe, so both setups use the same path.

**The canvas size is a constant.** `apps/web/src/lib/overlay-canvas.ts` holds 1920 × 1080, and both the Overlay and the Debug preview read it from there.

## Data sources

The default `API_DATA_SOURCE=json` mode reads these editable files directly:

- `apps/api/src/data/players.json`
- `apps/api/src/data/tournaments.json`

The Elysia routes and their response schemas stay the same in both modes. This keeps JSON editing fast while the model is unsettled and avoids coupling the web app to the storage choice.

Use `dev:d1` or `dev:admin:local` for local D1, and the `dev:admin:production` setup above for production writes. Both use the API Worker's `DB` binding. The production target is configured in the ignored `apps/api/wrangler.production.toml`, with authentication handled by Wrangler.

SQL migrations live in `apps/api/src/db/migrations/`. Run `bun run db:migrate` once after creating an empty D1 database and after each schema change. To populate an empty database with the current JSON development data, run `D1_SEED_DEVELOPMENT_DATA=1 bun run db:setup` instead. The seed records its version and preserves existing rows on later runs; editing JSON afterward does not update D1.

Existing Turso rows are **not** copied by changing `API_DATA_SOURCE`. Export the complete source SQLite database to SQL, remove its `BEGIN TRANSACTION` and `COMMIT` lines as required by D1, and import that SQL into a *new empty* D1 database with `wrangler d1 execute <DATABASE_NAME> --remote --file=<DUMP.sql>`. Importing the complete dump carries `schema_migrations` and `seed_history`; do not run `db:migrate` or `db:setup` first against the destination. Compare table row counts before switching the API. Keep the dump outside Git and retain the Turso source until the D1 data has been checked. See [Cloudflare's import guide](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

The legacy Bun API `API_DATA_SOURCE=d1` adapter remains as a separate HTTP query API path requiring `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID`, and `CLOUDFLARE_API_TOKEN`. The current production Admin, migration, and seed commands use Wrangler instead.

## Separate Cloudflare Workers (prepared, not deployed)

`apps/api/src/worker.ts` uses the same Elysia routes and response types as the Bun entry, with the [experimental Elysia Cloudflare adapter](https://elysiajs.com/integrations/cloudflare-worker). `apps/api/wrangler.local.toml` is for local development only and must not be deployed. `apps/web/wrangler.toml.example` serves the Vite output as static assets; `apps/api/wrangler.toml.example` binds an existing D1 database for deployment. Copy each example to `wrangler.toml` and replace all placeholders before deployment. JSON development does not invoke Wrangler.

1. Create or migrate the D1 database as described above. Put its **existing** database ID and name into the API Wrangler config. The API Worker uses `DB`. Specify the same D1 database in the local production Admin and public API configurations. Leave `ADMIN_API_TOKEN` unset on the public API; manage data through the local API.
2. Set the API config's `CATALOG_URL` and `IKACLO_API_ORIGIN`, and set `CORS_ALLOWED_ORIGINS` to the final Web Worker origin. The Web origin must be exact, including scheme; list multiple origins separated by commas if needed.
3. Deploy the API from `apps/api/` with `bunx wrangler@4.136.3 deploy --config wrangler.toml`. Set `VITE_API_URL` to that API Worker URL **before** building the Web app, for example in `apps/web/.env.production`. Then run `bun run --filter web build` at the repository root and deploy from `apps/web/` with `bunx wrangler@4.136.3 deploy --config wrangler.toml`.
4. Open the deployed Debug and Overlay views, check API requests and CORS, and verify the OBS Browser Source separately. Dock, Debug and Overlay must remain on the same **Web** origin for `BroadcastChannel` and `localStorage` to work; the API can have another origin.

The API Worker fetches the three catalogs from `CATALOG_URL` once per Worker isolate, validates them, and retains them in memory. A failed fetch returns HTTP 503 during initialization and is retried on a later request. Its catalog availability therefore depends on the CDN during a cold start. The Bun API continues to read the ignored local catalog files. The Vite `_headers` file preserves same-origin iframe and security headers for Cloudflare static assets; Vite's dev/preview server still uses `vite.config.ts`.

## Runtime catalogs

Weapon, rule and stage catalogs are published as JSON arrays on the CDN:

- [`weapons.json`](https://inkling-obs-streamkit.toy101-mov.org/weapons.json)
- [`rules.json`](https://inkling-obs-streamkit.toy101-mov.org/rules.json)
- [`stages.json`](https://inkling-obs-streamkit.toy101-mov.org/stages.json)

The weapon catalog contains 173 Splatoon 3 weapons, with only the Ikaclo API ID and the original Japanese name:

```json
{ "id": "236", "name": "スプラシューター" }
```

Rules contain `id`, Japanese `name`, English `en` and `description`; stages contain `id`, Japanese `name` and English `en`. Before the Bun API starts, `scripts/prepare-runtime-assets.ts` checks for all three files under `apps/api/src/data/`. It downloads only missing files from the CDN base URL configured by `CATALOG_URL`; existing files cause no request. The download validates the content type, UTF-8 JSON array and size before writing the file. The Bun API then validates and loads those local files exactly once before it starts listening, retaining each ordered list and its ID index in memory. If downloading or validation fails, startup fails instead of serving incomplete data.

The local `weapons.json`, `rules.json` and `stages.json` under [`apps/api/src/data/`](./apps/api/src/data/) are runtime inputs and remain outside Git. To update one, publish the remote catalog, remove only the corresponding local file, and restart the API. The preparation script downloads the missing file again. CI does not use the CDN: `scripts/prepare-ci-fixtures.ts` writes small deterministic fixtures into these ignored paths before the quality checks.

Weapon images are resolved together when `/overlay/matchup` loads. The API collects the distinct numeric weapon IDs in that matchup and calls the HTTPS origin configured by `IKACLO_API_ORIGIN`, validating both the weapon and returned image URL. Each ID is requested at most once during the lifetime of the API process: concurrent matchups share the same in-flight request, and later Overlay reloads or matchup changes reuse its cached result. Failed lookups are cached too, so there is no polling or automatic retry; restarting the API clears the cache. The browser keeps all four carousel slides mounted, but activates weapon image elements progressively: Team A, the next slide, loads initially, and Team B starts loading when Team A becomes active, one full slide interval before it is shown. Once activated, images remain mounted, so changing slides does not refetch weapon details or remount loaded images. Changing only the Dock accent color also does not reload matchup data.

The catalogs are independent of `API_DATA_SOURCE`. SQL stores selected weapon IDs and their display order, but it has no weapon, rule or stage master tables and no foreign key to an external catalog. Both JSON and D1 modes resolve catalog IDs through the same in-memory indexes, and the UI reads them through the Elysia API.

## Current limitations

- Authentication and write endpoints are not implemented yet; development data is edited in JSON, or managed outside the API when D1 mode is selected.
- Authentication is not implemented. The Worker configurations are examples; they have not been deployed or checked against a live D1 database. Elysia's Cloudflare adapter is experimental.

## References

- [obs-streamkit-demo](https://github.com/toy101/obs-streamkit-demo)
- [OBS 向けツールの開発記事 (Zenn)](https://zenn.dev/odan/articles/d48ae9cbf265fd)
