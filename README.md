# inkling-obs-streamkit

English | [日本語](./README.ja.md)

A self-built OBS toolkit for Splatoon tournament streams. It pairs an OBS **Custom Browser Dock** (the operator panel) with a **Browser Source** (the overlay that goes on air), both served from a single Vite app backed by one Elysia API.

The flow is:

1. The operator picks what to show in the Dock.
2. The Dock writes only the selected ID to `localStorage`.
3. The Overlay picks up the change, fetches the current data from the API, and renders it.

Because the Dock, the Overlay and a Debug view all live in the same app, the overlay can be built and checked in a browser without launching OBS.

## Requirements

- [Bun](https://bun.sh) — developed on 1.4.2. Bun 1.3.1 failed to resolve a peer dependency while installing Elysia, so run `bun upgrade` if installation breaks.
- OBS Studio — only needed to actually put the overlay on air. Day-to-day development happens in the Debug view.

## Getting started

```bash
bun install   # run at the repository root; there is a single bun.lock
bun dev       # starts the web app (:5173) and the API (:3000) in parallel
```

Then open <http://localhost:5173/?view=debug>, pick a player in the left panel, and the overlay preview on the right updates.

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
- The toolbar reports canvas size, aspect ratio, current scale and the scaled display size.
- The checkerboard behind the overlay exists to verify transparency; it is not part of the stream.
- The Dock and the iframe stay in sync through same-origin `localStorage` and `storage` events.

## Project structure

```text
.
├── apps/
│   ├── web/    Vite + React + TypeScript. Dock / Overlay / Debug.
│   └── api/    Elysia on Bun. Player data.
├── packages/   reserved for shared domain types (empty for now)
└── cspell.json
```

## Commands

| Command | What it does |
| --- | --- |
| `bun dev` | Runs the web app and the API in parallel. |
| `bun run --filter web dev` | Runs one workspace alone (`api` works the same way). |
| `bun run --filter web lint` | ESLint. Only the web app has a lint setup. |
| `bun run --filter web build` | `tsc -b && vite build`. The only type-check path. |
| `bun run spellcheck` | cspell across the repository. The dictionary lives in `cspell.json`. |

There are no tests yet.

## How it works

**Types flow from the API into the web app.** `apps/api/src/index.ts` exports `type App = typeof app`, and `apps/web/src/lib/api.ts` builds an Eden Treaty client from it. The web app imports the API's source types across the workspace, so changing a route immediately changes the types on the front end. Requests go through `api.players.get()` rather than `fetch`.

**The Dock only hands over an ID.** API responses are never stored in `localStorage`; the Overlay fetches the data again from the API, which keeps the backend the single source of truth. `apps/web/src/lib/overlay-state.ts` combines `storage` events (in OBS the Dock and the Overlay are separate windows) with module-level listeners (in the Debug view both live in one window). Both paths are required.

**The canvas size is a constant.** `apps/web/src/lib/overlay-canvas.ts` holds 1920 × 1080, and both the Overlay and the Debug preview read it from there.

## Current limitations

- Player data is an in-memory array in `apps/api/src/index.ts`; there is no database.
- The API port (3000) and the client's base URL are hardcoded.
- No tests, no authentication, and no production build or deployment path — everything assumes `localhost`.

## References

- [obs-streamkit-demo](https://github.com/toy101/obs-streamkit-demo)
- [OBS 向けツールの開発記事 (Zenn)](https://zenn.dev/odan/articles/d48ae9cbf265fd)
