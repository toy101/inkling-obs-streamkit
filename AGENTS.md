# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## プロジェクト概要

Splatoon 大会配信用の自作 OBS ツールキット。OBS の **Custom Browser Dock**（配信者が操作するパネル）と **Browser Source**（配信に映るオーバーレイ）を、1 つの Vite アプリ + 1 つの Elysia API で提供する Bun workspace モノレポ。

## コマンド

パッケージマネージャ / ランタイムは Bun。npm・yarn・pnpm・node・ts-node は使わない。

```bash
bun install                      # ルートで実行。lockfile はルートの bun.lock 1 つ
bun dev                          # Turso(:8080)、web(:5173)、api(:3000) を並列起動
bun run dev:apps                 # JSON参照時にweb(:5173)、api(:3000)だけを起動
bun run --filter web dev         # 片方だけ起動したいとき
bun run --filter api dev
bun run db:dev                   # ローカル Turso(:8080)だけを起動
bun run db:setup                 # DBマイグレーションと開発データ投入
bun run db:migrate               # 未適用のDBマイグレーションだけを実行
bun run --filter web lint        # ESLint。lint 設定があるのは web のみ
bun run --filter web build       # tsc -b && vite build（唯一の型チェック経路）
bun run spellcheck               # cspell。設定と辞書は cspell.json
```

固有名詞で spellcheck が落ちたら `cspell.json` の `words` に追加する（未知語だけを一覧するなら `bunx cspell lint . --words-only --unique`）。cspell は .gitignore 対象とドット始まりのファイルを検査しないので、`.github/**` などを対象に含めたい場合は glob の明示が必要。

テストは未整備。`apps/api` の `test` script は `bun create elysia` の placeholder で常に exit 1 する。テストを追加する場合は `bun test`（jest / vitest は使わない）。

動作確認用 URL:

| 用途 | URL |
| --- | --- |
| 開発時のプレビュー | `http://localhost:5173/?view=debug` |
| OBS カスタムブラウザドック | `http://localhost:5173/?view=dock` |
| OBS ブラウザソース（1920×1080） | `http://localhost:5173/?view=overlay` |

## アーキテクチャ

### 1 アプリ 3 ビュー

`apps/web/src/App.tsx` が `?view=` クエリパラメータで Dock / Overlay / Debug を分岐する。ルーターは使わず、別アプリ・別バンドルにも分けない（同一 origin で localStorage を共有することが前提のため）。

`main.tsx` は同じ値を `document.documentElement.dataset.view` にも複製する。CSS 側は `html[data-view="overlay"]` で分岐できる（`index.css`）。ビューを追加するときは App.tsx の switch と dataset 依存 CSS の両方を確認する。

### 型は API から web へ直接流れる（Eden Treaty）

- `apps/api/src/index.ts` が `export type App = typeof app` と `export type Player` を公開する。
- `apps/web/src/lib/api.ts` が `treaty<App>("http://localhost:3000")` を作る。Eden Treaty 2 の `treaty` を使い、旧 `edenTreaty` は使わない。
- web は workspace 境界を越えて相対パス `../../../api/src` から型を import する。パッケージ名やエイリアスは介さない。**API のルートやレスポンス型を変えると web 側の型が即座に変わる**ので、片方だけ直して終わりにしない。
- HTTP は `fetch` ではなく `api.players.get()` / `api.players({ id }).get()` を使う。戻り値は `{ data, error }` 形式。

### Dock → Overlay の状態同期

同期経路は `apps/web/src/lib/overlay-state.ts` のみ。localStorage key は `inkling:overlay-selection`。

- **渡すのは選択IDと表示設定だけ。API レスポンスを localStorage に保存しない。** 現在のpayloadは大会、アルファ／ブラボーチーム、ルール、ステージの各IDとアクセントカラー。Overlay は受け取った ID で API を再取得する（backend がデータの正本）。表示対象が増えても「ID と表示モードを渡し、Overlay が取得する」構造を保つ。
- `storage` イベントは変更した window 自身では発火しない。そのためモジュールレベルの listener Set を併用している。OBS では Dock と Overlay が別 window なので `storage` イベントが効き、Debug では両方が同一 window なので listener が効く。**どちらか一方だけにすると Debug か OBS のどちらかが壊れる。**

### Overlay のサイズ規約

- `apps/web/src/lib/overlay-canvas.ts` の `OVERLAY_WIDTH` / `OVERLAY_HEIGHT`（1920×1080）が唯一の正。Overlay と Debug の両方がここを参照する。
- Debug は Overlay コンポーネントを import せず、実際の `?view=overlay` を等倍の iframe で読み込み、**外側の wrapper にだけ `transform: scale()` を掛ける**。これで viewport・rem・メディアクエリの条件が本番ページと一致する。Overlay の内部をスケールしたり、Debug 用に別レンダリングしたりしない。
- `html, body, #root` は `background: transparent`。OBS Browser Source の透過に必要なので、ルート要素に不透明な背景を入れない。

### API

Elysia + `@elysia/cors`。web(:5173) と api(:3000) は別 origin なので CORS プラグインは必須。ポート 3000 は `apps/api/src/index.ts` に、接続先 URL は `apps/web/src/lib/api.ts` にハードコードされている。

プレイヤーと大会の既定データソースは `apps/api/src/data/` の `players.json` と `tournaments.json`。`API_DATA_SOURCE=turso` のときだけ `@libsql/client` を通じて Turso から取得する。ブキ・ルール・ステージの各マスターはこの切替から独立し、API起動前に不足しているJSONだけを `CATALOG_URL` から `apps/api/src/data/` へダウンロードする。既存ファイルは再取得しない。APIはローカルの3ファイルを起動時に1回だけ検証し、配列とID索引をメモリへ保持する。SQLには選択したブキIDだけを保存し、ブキ・ルール・ステージのマスターテーブルやカタログへの外部キーは持たない。開発時は `apps/api/src/db/client.ts` の既定値により、`127.0.0.1:8080` のローカル Turso へ接続する。追跡対象のスキーマ SQL は `apps/api/src/db/schema/`、初期データ投入は `apps/api/src/db/seed.ts` が担当する。ローカル DB は `apps/api/.data/` に保存し、Git へ追加しない。

## 規約と落とし穴

- Bun の組み込み API を優先する: `bun:sqlite` / `Bun.sql` / `Bun.redis` / 組み込み `WebSocket` / `Bun.file` / `Bun.$`。better-sqlite3・pg・postgres.js・ioredis・ws・express・execa は追加しない。`.env` は Bun が自動で読むので dotenv 不要。
- **ただし `apps/web` は Vite アプリ**。Bun の HTML import や `Bun.serve` によるフロント配信には置き換えない。この点だけは Bun の一般則より優先する。
- TypeScript は strict のまま通す。`any` と安易な `undefined` は避ける。`apps/web/tsconfig.app.json` は `noUnusedLocals` / `noUnusedParameters` に加えて `verbatimModuleSyntax`（型のみの import は `import type` 必須）と `erasableSyntaxOnly`（enum・コンストラクタの parameter properties は不可）が有効。
- ルートの `index.ts` は `bun init` の残骸でエントリポイントではない。
- README は英語の `README.md` と日本語の `README.ja.md` の 2 枚構成で、内容は同じ。片方だけ更新しない。
- `packages/` は空。将来の共通ドメイン型（player / team / match / stage など）用の予約枠で、API レスポンス型の共有目的で作る必要はない（Eden が推論するため）。
- `apps/web/src/App.css` と `src/assets/*` は Vite テンプレートの残骸で、どこからも import されていない。
- `agent_plan/`（.gitignore 済み）に設計の背景と今後の拡張方針をまとめた引き継ぎメモがある。判断の根拠を辿るときはここが最も詳しい。
