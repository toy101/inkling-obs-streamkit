# inkling-obs-streamkit

English | [日本語](./README.ja.md)

A self-built OBS toolkit for Splatoon tournament streams. It pairs an OBS **Custom Browser Dock** (the operator panel) with a **Browser Source** (the overlay that goes on air), both served from a single Vite app backed by one Elysia API.

The flow is:

1. The operator picks a tournament, two teams, the next rule/stage, and one accent color in the Dock.
2. Pressing **Overlayへ反映** writes only those selection IDs and the presentation color to `localStorage`.
3. The Overlay picks up the change, fetches the current matchup from the API, and renders its four-slide loop.

Because the Dock, the Overlay and a Debug view all live in the same app, the overlay can be built and checked in a browser without launching OBS.

## Requirements

- [Bun](https://bun.sh) — developed on 1.4.2. Bun 1.3.1 failed to resolve a peer dependency while installing Elysia, so run `bun upgrade` if installation breaks.
- [Turso CLI](https://docs.turso.tech/cli/installation) and `sqld` — used by `bun dev` to run the optional persistent local database. The API reads JSON by default.
- OBS Studio — only needed to actually put the overlay on air. Day-to-day development happens in the Debug view.

## Getting started

```bash
bun install
cp apps/api/.env.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local
bun dev
```

Run these commands at the repository root. The two `.env.local` files are ignored by Git. API-only values, including future Turso credentials, stay outside Vite; `VITE_API_URL` is intentionally public because the browser needs it.

The API reads player and tournament JSON under `apps/api/src/data/` by default, so database setup is unnecessary while the data model is being adjusted. Before the apps start, a preparation script downloads any missing runtime assets: the weapon, rule and stage catalogs go under `apps/api/src/data/`, while the stage-reveal vignette goes under `apps/web/public/`. Existing files are kept without another CDN request. Bun's watch mode reloads the API after local source files change.

Then open <http://localhost:5173/?view=debug>, choose a matchup in the left panel, press **Overlayへ反映**, and the overlay preview on the right updates.

## Views

One Vite app switches views by the `view` query parameter. There is no router.

| View | URL | Purpose |
| --- | --- | --- |
| Dock | `http://localhost:5173/?view=dock` | Operator panel. Chooses what the overlay shows. |
| Overlay | `http://localhost:5173/?view=overlay` | The 1920 × 1080 page that goes on air. |
| Debug | `http://localhost:5173/?view=debug` | Dock plus a scaled preview of the real overlay page. |

Opening the site without `view` just prints the accepted values.

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
- The toolbar can immediately switch the iframe preview to the matchup, either team detail, or next-match rule/stage slide. This is Debug-only and does not alter the OBS Browser Source.
- The toolbar reports canvas size, aspect ratio, current scale and the scaled display size.
- The checkerboard behind the overlay exists to verify transparency; it is not part of the stream.
- The Dock and the iframe stay in sync through same-origin `localStorage` and `storage` events.
- The iframe is intentionally same-origin because it loads only the fixed `?view=overlay` page and needs that storage channel. Debug messages also verify the parent window, origin and payload before use. Same-origin is a trust boundary, not sandbox isolation.
- Vite's development and preview servers allow same-origin framing for Debug but reject framing by other origins. The API listens only on `127.0.0.1`, and CORS allows only the local web origins listed in `apps/api/src/app.ts`.

## Project structure

```text
.
├── apps/
│   ├── web/    Vite + React + TypeScript. Dock / Overlay / Debug.
│   └── api/    Elysia on Bun. JSON data plus optional Turso access, migrations and seed data.
├── packages/   reserved for shared domain types (empty for now)
└── cspell.json
```

## Commands

| Command | What it does |
| --- | --- |
| `bun dev` | Runs local Turso, the web app and the API in parallel. |
| `bun run dev:apps` | Runs only the web app and API; useful while the default JSON source is selected. |
| `bun run --filter web dev` | Runs one workspace alone (`api` works the same way). |
| `bun run --filter web lint` | ESLint. Only the web app has a lint setup. |
| `bun run --filter web build` | `tsc -b && vite build`. The only type-check path. |
| `bun run openapi:build` | Generates the static Scalar viewer and `openapi.yaml` under `dist/openapi/` without starting the API or loading runtime data. |
| `bun run db:dev` | Runs only the persistent local Turso server on `127.0.0.1:8080`. |
| `bun run db:setup` | Applies pending migrations and inserts development data once for Turso mode. |
| `bun run db:migrate` | Applies pending SQL migrations without seeding data. |
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

Pull requests run the `quality` check on a clean checkout. It uses Bun 1.4.2, installs with the frozen lockfile, prepares deterministic fixtures inside the ignored runtime paths, and runs the API type check, web lint, web build and spellcheck. The tracked TypeScript adapters and schema SQL make this check independent of `.env.local`, the local database, the CDN and the Ikaclo API.

## API reference

The Elysia route schemas generate an OpenAPI document through `@elysia/openapi`. A dedicated GitHub Pages workflow rebuilds the document on API changes and publishes a static Scalar viewer at <https://toy101.github.io/inkling-obs-streamkit/>. The source YAML is available at <https://toy101.github.io/inkling-obs-streamkit/openapi.yaml>. The API does not need to be running to view either file.

GitHub Pages must use **GitHub Actions** as its publishing source in the repository settings. The generator builds a schema-only app with non-executable data-source stubs, so it does not load local JSON or contact Turso, the catalog CDN or the Ikaclo API.

## How it works

**Types flow from the API into the web app.** `apps/api/src/index.ts` exports `type App = typeof app`, and `apps/web/src/lib/api.ts` builds an Eden Treaty client from it. The web app imports the API's source types across the workspace, so changing a route immediately changes the types on the front end. Requests go through typed calls such as `api.overlay.matchup.get()` rather than direct `fetch` calls.

**The Dock only hands over selection IDs and presentation settings.** API responses are never stored in `localStorage`; the Overlay fetches the data again from the API, which keeps the backend the single source of truth. `apps/web/src/lib/overlay-state.ts` combines `storage` events (in OBS the Dock and the Overlay are separate windows) with module-level listeners (in the Debug view both live in one window). Both paths are required.

**The canvas size is a constant.** `apps/web/src/lib/overlay-canvas.ts` holds 1920 × 1080, and both the Overlay and the Debug preview read it from there.

## Data sources

The default `API_DATA_SOURCE=json` mode reads these editable files directly:

- `apps/api/src/data/players.json`
- `apps/api/src/data/tournaments.json`

The Elysia routes and their response schemas stay the same in both modes. This keeps JSON editing fast while the model is unsettled and avoids coupling the web app to the storage choice.

The Turso implementation remains available through the official `@libsql/client`. To use the local database, set `API_DATA_SOURCE=turso` in `apps/api/.env.local`, start the services with `bun dev`, then run `bun run db:setup` in another terminal on the first run. The local server reads its address from `TURSO_DATABASE_URL`; its files live under `apps/api/.data/` and are ignored by Git.

SQL migrations live in `apps/api/src/db/migrations/`. `bun run db:setup` applies each migration once and seeds player and tournament development data from the local JSON files. The seed records its version and preserves the database on later runs, so editing JSON after the first seed does not update an existing Turso database.

To connect to Turso Cloud later, set `API_DATA_SOURCE=turso`, `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the ignored `apps/api/.env.local` file. Credentials stay in the API process and are never exposed to the Vite app. Use `bun run dev:apps` because the local `db:dev` command accepts local HTTP URLs only.

## Runtime catalogs

Weapon, rule and stage catalogs are published as JSON arrays on the CDN:

- [`weapons.json`](https://inkling-obs-streamkit.toy101-mov.org/weapons.json)
- [`rules.json`](https://inkling-obs-streamkit.toy101-mov.org/rules.json)
- [`stages.json`](https://inkling-obs-streamkit.toy101-mov.org/stages.json)

The weapon catalog contains 173 Splatoon 3 weapons, with only the Ikaclo API ID and the original Japanese name:

```json
{ "id": "236", "name": "スプラシューター" }
```

Rules contain `id`, Japanese `name`, English `en` and `description`; stages contain `id`, Japanese `name` and English `en`. Before the API starts, `scripts/prepare-runtime-assets.ts` checks for all three files under `apps/api/src/data/`. It downloads only missing files from the CDN base URL configured by `CATALOG_URL`; existing files cause no request. The download validates the content type, UTF-8 JSON array and size before writing the file. The API then validates and loads those local files exactly once before it starts listening, retaining each ordered list and its ID index in memory. If downloading or validation fails, startup fails instead of serving incomplete data.

The local `weapons.json`, `rules.json` and `stages.json` under [`apps/api/src/data/`](./apps/api/src/data/) are runtime inputs and remain outside Git. To update one, publish the remote catalog, remove only the corresponding local file, and restart the API. The preparation script downloads the missing file again. CI does not use the CDN: `scripts/prepare-ci-fixtures.ts` writes small deterministic fixtures into these ignored paths before the quality checks.

Weapon images are resolved together when `/overlay/matchup` loads. The API collects the distinct numeric weapon IDs in that matchup and calls the HTTPS origin configured by `IKACLO_API_ORIGIN`, validating both the weapon and returned image URL. Each ID is requested at most once during the lifetime of the API process: concurrent matchups share the same in-flight request, and later Overlay reloads or matchup changes reuse its cached result. Failed lookups are cached too, so there is no polling or automatic retry; restarting the API clears the cache. The browser keeps all four carousel slides mounted, but activates weapon image elements progressively: Team A, the next slide, loads initially, and Team B starts loading when Team A becomes active, one full slide interval before it is shown. Once activated, images remain mounted, so changing slides does not refetch weapon details or remount loaded images. Changing only the Dock accent color also does not reload matchup data.

The catalogs are independent of `API_DATA_SOURCE`. SQL stores selected weapon IDs and their display order, but it has no weapon, rule or stage master tables and no foreign key to an external catalog. Both JSON and Turso modes resolve catalog IDs through the same in-memory indexes, and the UI continues to read them through the local Elysia API.

## Current limitations

- Authentication and write endpoints are not implemented yet; development data is edited in JSON, or managed outside the API when Turso mode is selected.
- No authentication and no production deployment path — everything assumes `localhost`. A future static production server must reproduce the security headers configured in `apps/web/vite.config.ts`; Vite build output does not carry HTTP response headers by itself.

## References

- [obs-streamkit-demo](https://github.com/toy101/obs-streamkit-demo)
- [OBS 向けツールの開発記事 (Zenn)](https://zenn.dev/odan/articles/d48ae9cbf265fd)
