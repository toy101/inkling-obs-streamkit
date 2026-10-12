# inkling-obs-streamkit

[English](./README.md) | 日本語

Splatoon 大会配信用の自作 OBS ツールキット。OBS の **カスタムブラウザドック**（配信者が操作するパネル）と **ブラウザソース**（配信に映るオーバーレイ）を、1 つの Vite アプリと 1 つの Elysia API で提供する。

流れは次のとおり。

1. 配信者が Dock で大会・左右のチーム・次のルール／ステージ・アクセントカラー1色を選ぶ。
2. **Overlayへ反映**を押すと、選択IDと表示用カラーだけを`BroadcastChannel`で Overlay へ送る。再読み込み後も復元できるよう、同じ値を`localStorage`にも保存する。
3. Overlay が変更を検知し、API から最新の対戦データを取得して4画面のループを描画する。

Dock・Overlay・Debug が同じアプリに同居しているため、OBS を起動しなくてもブラウザだけでオーバーレイを作り込める。

## 必要なもの

- [Bun](https://bun.sh) — 1.4.2 で開発している。Bun 1.3.1 では Elysia のインストール時に peer dependency の解決に失敗したため、インストールが壊れる場合は `bun upgrade` する。
- Cloudflare アカウントと D1 データベース — `API_DATA_SOURCE=d1` のときだけ必要。既定値は JSON 参照。
- OBS Studio — 実際に配信へ載せるときだけ必要。普段の開発は Debug ビューで行う。

## 始め方

```bash
bun install
cp apps/api/.env.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local
bun dev
```

リポジトリのルートで実行する。2つの `.env.local` はGitの追跡対象外。D1 の認証情報は API プロセスだけに置き、ブラウザが必要とする `VITE_API_URL` だけを公開する。

API は既定で `apps/api/src/data/` 以下のプレイヤー・大会 JSON を直接読むため、データモデルを調整している間は DB セットアップ不要。アプリ起動前の準備スクリプトは、不足している実行時アセットだけをダウンロードする。ブキ・ルール・ステージの各カタログは `apps/api/src/data/`、ステージ紹介のビネット画像は `apps/web/public/` へ配置し、既存ファイルがあればCDNへ再リクエストしない。ローカルのソースファイルを変更すると、BunのwatchモードがAPIを再読み込みする。

開発時のデータソースは、リポジトリのルートから Bun のコマンドで選べる。

```bash
bun run dev:json  # Web :5173 + Bun API :3000。現在の JSON を直接参照
bun run dev:d1    # Web :5173 + API Worker :8787。ローカル D1 を参照
```

`dev:d1` は [Wrangler のローカル D1](https://developers.cloudflare.com/d1/best-practices/local-development/)を使う。起動前に `apps/api/src/db/migrations/` の未適用分を実行し、初回だけ現在の `players.json`・`tournaments.json` を開発データとして投入する。D1 の状態は `apps/api/.data/wrangler/` に保存し、再起動や JSON ファイルの編集では上書きしない。ローカル D1 を意図的に作り直す場合は、API と Web を停止してからこのディレクトリを削除する。マイグレーションと初期投入だけを行う場合は `bun run db:setup:local` を使う。ローカル D1 はリモート D1 と分離され、これらのコマンドは `--local` を明示している。API Worker は起動時に `CATALOG_URL` の HTTPS カタログへアクセスするため、CDN への接続は必要。

<http://localhost:5173/?view=debug> を開き、左のパネルで対戦情報を選んで **Overlayへ反映** を押すと、右のオーバーレイプレビューが更新される。

## ビュー

1 つの Vite アプリを `view` クエリパラメータで切り替える。ルーターは使っていない。

| ビュー | URL | 役割 |
| --- | --- | --- |
| Dock | `http://localhost:5173/?view=dock` | 操作パネル。オーバーレイの表示対象を選ぶ。 |
| Overlay | `http://localhost:5173/?view=overlay` | 配信に映る 1920 × 1080 のページ。 |
| Debug | `http://localhost:5173/?view=debug` | Dock と、実際の Overlay ページを縮小表示したプレビュー。 |

`view` を付けずに開いた場合は、指定できる値を表示するだけ。

## OBS の設定

| 用途 | URL | サイズ |
| --- | --- | --- |
| カスタムブラウザドック | `http://localhost:5173/?view=dock` | 任意 |
| ブラウザソース | `http://localhost:5173/?view=overlay` | 幅 1920 / 高さ 1080 |

プレビューと OBS を見比べるときは Chrome のページズームを 100% にし、ブラウザソースへ追加の CSS を指定しない。別 OS のフォントや Chromium のバージョンによる描画差は、サイズを固定しただけでは保証できない。

## オーバーレイのプレビュー（Debug ビュー）

- Overlay の描画サイズは常に **1920 × 1080 px（16:9）**。
- Debug は実際の `?view=overlay` を同じサイズの iframe に読み込み、外側の wrapper に `transform: scale()` を掛けるだけで縮小する。viewport、`rem`、メディアクエリの条件も本番ページと揃う。
- 倍率は「全体に合わせる」または 25 / 50 / 75 / 100% を選択できる。自動倍率は最大 100%。手動倍率で収まらない場合はプレビュー内をスクロールする。
- ツールバーから、対戦カード・各チーム詳細・次戦ルール／ステージを iframe プレビューへ即時表示できる。この操作は Debug 専用で、OBS の Browser Source 表示は変えない。
- ツールバーに描画サイズ・比率・現在の倍率・縮小後の表示サイズを表示する。
- オーバーレイの背後の市松模様は透過確認用で、配信には含まれない。
- Dock と iframe の選択同期には、OBS の Dock とブラウザソースの間と同じく、同一 origin の `BroadcastChannel` を使う。`localStorage` はページ読み込み時に最新の選択を復元するためだけに使う。
- iframe は固定の `?view=overlay` だけを読み込み、上記の同一 origin の同期経路を必要とするため、意図的に同一 origin にしている。Debug 用メッセージも親 window・origin・payload を検証してから使う。同一 origin は信頼境界であり、sandbox による隔離ではない。
- Vite の開発・プレビューサーバーは Debug からの同一 origin 埋め込みだけを許可し、他 origin からの埋め込みを拒否する。同じヘッダーを `apps/web/public/_headers` から Worker の静的アセットにも設定する。ローカル API は `127.0.0.1` だけで待ち受け、CORS の許可元は `CORS_ALLOWED_ORIGINS` で指定する。

## ディレクトリ構成

```text
.
├── apps/
│   ├── web/    Vite + React + TypeScript。Dock / Overlay / Debug。
│   └── api/    Bun または Worker 上の Elysia。ローカル JSON、D1 接続、マイグレーション、初期データ。
├── packages/   共通ドメイン型用の予約枠（現時点では空）
└── cspell.json
```

## コマンド

| コマンド | 内容 |
| --- | --- |
| `bun dev` | web と API を並列起動する。 |
| `bun run dev:apps` | web と API を並列起動する。 |
| `bun run --filter web dev` | 片方のワークスペースだけ起動する（`api` も同様）。 |
| `bun run --filter web lint` | ESLint。lint 設定があるのは web のみ。 |
| `bun run --filter web build` | `tsc -b && vite build`。唯一の型チェック経路。 |
| `bun run dev:json` | JSON 参照の Bun API と Web を起動する。 |
| `bun run dev:d1` | ローカル D1 を準備し、API Worker と Web を起動する。 |
| `bun run db:setup:local` | ローカル D1 に未適用のマイグレーションと初回データを投入する。 |
| `bun run openapi:build` | APIを起動せず、実行時データも読み込まずに、`dist/openapi/` 以下へ静的な Scalar ビューアーと `openapi.yaml` を生成する。 |
| `bun run db:migrate` | 設定した D1 に未適用の SQL マイグレーションを実行する。 |
| `D1_SEED_DEVELOPMENT_DATA=1 bun run db:setup` | マイグレーションを実行し、JSON の開発データを一度だけ投入する。 |
| `bun run spellcheck` | リポジトリ全体を cspell で検査する。辞書は `cspell.json`。 |

## Web E2E・ビジュアル回帰テスト

`apps/web/e2e/` の Chromium Playwright suite は、API・画像・動画をローカルfixtureで固定する。Overlayのviewportは1920 × 1080に固定し、カルーセルの動きを止めたうえで、4つのvisual baselineをGitで管理する。

```bash
bun run --filter web test:e2e
```

意図したデザイン変更でbaselineを更新するときは、ローカルの描画結果を確認してから明示的に更新する。

```bash
bun run --filter web test:e2e -- --update-snapshots
```

コミット前に `apps/web/e2e/visual-regression.spec.ts-snapshots/` 以下の変更されたPNGを確認する。baselineはGitHub ActionsのUbuntu上のChromiumと同じ `chromium-linux` project（`*-chromium-linux.png`）だけを正とする。macOSやWindowsで生成したplatform別PNGは正規baselineにせず、更新は同じLinux Chromium環境で行う。Pull Requestの `web-smoke` workflow はテスト失敗時に `apps/web/test-results/` のactual screenshot、diff、traceと、Git管理しているexpected baselineをartifactとして保存する。このブラウザ検証はOBS CEFとの完全なピクセル一致を保証しない。OBS実機確認は別ゲートで行う。

Pull Request では、クリーンな checkout 上で `quality` チェックを実行する。Bun 1.4.2 と frozen lockfile を使い、Git管理外の実行時パスには決定的なfixtureを用意してから、API の型チェック、web の lint、web の build、spellcheck を順に検査する。追跡対象の TypeScript アダプターとスキーマ SQL を使うため、`.env.local`、ローカル DB、CDN、イカクロ API には依存しない。

## APIリファレンス

Elysiaのルートスキーマから`@elysia/openapi`でOpenAPI文書を生成する。API変更時は専用のGitHub Pagesワークフローが文書を再生成し、静的なScalarビューアーを <https://toy101.github.io/inkling-obs-streamkit/> へ公開する。元のYAMLは <https://toy101.github.io/inkling-obs-streamkit/openapi.yaml> から直接確認できる。どちらの閲覧にもAPIの起動は不要。

リポジトリ設定では、GitHub Pagesの公開元に **GitHub Actions** を指定する必要がある。生成時は実行されないデータソースのスタブでスキーマ専用のappを組み立てるため、ローカルJSONを読み込まず、D1、カタログCDN、イカクロAPIにも接続しない。

## 仕組み

**型は API から web へ流れる。** `apps/api/src/index.ts` が `type App = typeof app` を export し、`apps/web/src/lib/api.ts` がそこから Eden Treaty クライアントを組み立てる。web はワークスペースを越えて API のソースの型を import しているので、ルートを変えるとフロント側の型が即座に変わる。リクエストは直接の `fetch` ではなく、`api.overlay.matchup.get()` などの型付き呼び出しを通す。

**Dock が渡すのは選択IDと表示設定だけ。** API のレスポンスを BroadcastChannel で送ったり `localStorage` に保存したりせず、Overlay が API から取り直すことで、backend をデータの正本に保つ。`apps/web/src/lib/overlay-state.ts` は変更を `BroadcastChannel` で送り、`localStorage` には最新の選択だけを保存する。保存するのは、Dock と Overlay が再読み込みや OBS の再起動の後に選択を復元するためである。ステージ紹介のような一度きりのイベントは保存しないので、再起動しても再生されない。OBS でも Debug（Overlay は iframe）でも Dock と Overlay は別ページなので、どちらも同じ経路で届く。

**描画サイズは定数。** `apps/web/src/lib/overlay-canvas.ts` が 1920 × 1080 を持ち、Overlay と Debug のプレビューがそこを参照する。

## データソース

既定の `API_DATA_SOURCE=json` では、次の編集可能なファイルを直接読む。

- `apps/api/src/data/players.json`
- `apps/api/src/data/tournaments.json`

Elysia のルートとレスポンススキーマはどちらのモードでも同じ。モデルが固まっていない間は JSON をすぐ編集でき、web 側を保存方式へ依存させずに済む。

D1 を使うには Cloudflare でデータベースを作成し、Git 管理外の `apps/api/.env.local` に `API_DATA_SOURCE=d1`、`CLOUDFLARE_ACCOUNT_ID`、`D1_DATABASE_ID`、`CLOUDFLARE_API_TOKEN` を設定する。API の読み込みには D1 Read、マイグレーションやデータ投入には D1 Write 権限が必要。API は D1 の HTTP query API を呼び出し、トークンはブラウザへ渡さない。web と API を localhost で動かしても D1 はリモートにある。

SQL マイグレーションは `apps/api/src/db/migrations/` に置く。空の D1 を作成した後とスキーマ変更時に `bun run db:migrate` を実行する。現在の JSON 開発データを空の D1 に投入する場合は、代わりに `D1_SEED_DEVELOPMENT_DATA=1 bun run db:setup` を実行する。seed のバージョンを記録して2回目以降は DB を上書きしないため、初回投入後に JSON を編集しても D1 には反映されない。

**`API_DATA_SOURCE` を切り替えるだけでは既存の Turso データは移らない。** 元の SQLite データベース全体を SQL にエクスポートし、D1 が要求する `BEGIN TRANSACTION` と `COMMIT` の行を除いてから、*空の新規 D1* へ `wrangler d1 execute <DATABASE_NAME> --remote --file=<DUMP.sql>` でインポートする。全体の dump なら `schema_migrations` と `seed_history` も含まれるため、移行先で先に `db:migrate` や `db:setup` を実行しない。切替前に各テーブルの件数を比較し、確認が済むまでは元の Turso データを残す。dump は Git 管理外に保管する。詳細は [Cloudflare のインポート手順](https://developers.cloudflare.com/d1/best-practices/import-export-data/) を参照。

ローカルの Bun API は、マイグレーション・seed コマンドを含め、`d1` モードでは引き続き D1 HTTP query API を使う。API Worker はリクエスト時に `DB` D1 バインディングを使い、Cloudflare API トークンを必要としない。Cloudflare も [REST API は主に管理用途向け](https://developers.cloudflare.com/d1/tutorials/build-an-api-to-access-d1/) としている。

## Web と API を別々の Cloudflare Worker に配置する準備

`apps/api/src/worker.ts` は Bun 版と同じ Elysia のルート・レスポンス型を、[Elysia の実験的 Cloudflare アダプター](https://elysiajs.com/integrations/cloudflare-worker)で動かす入口。`apps/api/wrangler.local.toml` はローカル開発専用で、デプロイには使わない。`apps/web/wrangler.toml.example` は Vite の成果物を静的配信し、`apps/api/wrangler.toml.example` は既存の D1 をバインドする本番向け設定例。配置前にそれぞれ `wrangler.toml` へコピーし、プレースホルダーを置き換える。JSON 開発コマンドは Wrangler を使わない。

1. 上記の手順で D1 を作成または移行し、API の Wrangler 設定へ**既存の**データベース名と ID を記入する。API Worker は `DB` バインディングを使用する。`CLOUDFLARE_API_TOKEN` が必要なのは、別プロセスの Bun マイグレーション・seed コマンドとローカル Bun の `d1` モードだけ。
2. API 設定の `CATALOG_URL` と `IKACLO_API_ORIGIN` を設定し、`CORS_ALLOWED_ORIGINS` に最終的な Web Worker の origin を指定する。scheme を含む正確な origin が必要。複数ある場合はカンマで区切る。
3. `apps/api/` から `bunx wrangler deploy --config wrangler.toml` で API を配置する。Web のビルド**前**に、例えば `apps/web/.env.production` の `VITE_API_URL` を API Worker の URL に設定する。リポジトリのルートで `bun run --filter web build` を実行し、`apps/web/` から `bunx wrangler deploy --config wrangler.toml` で Web を配置する。
4. 配置後の Debug と Overlay を開いて API 通信・CORS を確認し、OBS ブラウザソースも別途確認する。`BroadcastChannel` と `localStorage` のため、Dock・Debug・Overlay は同じ **Web** origin に置く。API は別 origin でよい。

API Worker は起動した isolate ごとに `CATALOG_URL` から3つのカタログを一度取得・検証し、メモリに保持する。取得失敗時は初期化中のリクエストに HTTP 503 を返し、次のリクエストで再試行する。このためコールドスタート時の可用性は CDN に依存する。Bun API は従来どおり Git 管理外のローカルカタログを読む。Vite の `_headers` は Cloudflare の静的アセットへ同一 origin iframe とセキュリティヘッダーを引き継ぐ。開発・プレビューサーバーでは引き続き `vite.config.ts` を使う。

## 実行時カタログ

ブキ・ルール・ステージの各マスターは、CDN上のJSON配列として公開している。

- [`weapons.json`](https://inkling-obs-streamkit.toy101-mov.org/weapons.json)
- [`rules.json`](https://inkling-obs-streamkit.toy101-mov.org/rules.json)
- [`stages.json`](https://inkling-obs-streamkit.toy101-mov.org/stages.json)

ブキマスターはSplatoon 3のブキ173件を収録し、項目はイカクロAPIのIDと原文の日本語名だけ。

```json
{ "id": "236", "name": "スプラシューター" }
```

ルールは `id`、日本語の `name`、英語の `en`、`description`、ステージは `id`、日本語の `name`、英語の `en` を持つ。Bun API起動前に `scripts/prepare-runtime-assets.ts` が `apps/api/src/data/` 以下の3ファイルを確認する。不足しているファイルだけを `CATALOG_URL` で設定したCDNのベースURLから取得し、既存ファイルがあればリクエストしない。保存前にContent-Type、UTF-8 JSON配列、ファイルサイズを検証する。その後、Bun APIはローカルファイルを再度検証して1回だけ読み込み、表示順を保つ配列とID索引をメモリへ保持する。ダウンロードまたは検証に失敗した場合は、不完全なデータを配信せず起動を失敗させる。

ローカルの [`apps/api/src/data/`](./apps/api/src/data/) にある `weapons.json`、`rules.json`、`stages.json` は実行時入力で、Gitの追跡対象外。更新時はリモートカタログを公開し、対象のローカルファイルだけを削除してAPIを再起動する。準備スクリプトが不足ファイルを再度ダウンロードする。CIではCDNを使わず、`scripts/prepare-ci-fixtures.ts` が品質チェック前にこのGit管理外のパスへ決定的な小さなfixtureを書き込む。

ブキ画像は `/overlay/matchup` の読み込み時にまとめて解決する。その対戦で使う数値のブキIDを重複排除し、`IKACLO_API_ORIGIN` で設定したHTTPS originから返されたブキ情報と画像URLを検証する。各IDへのリクエストはAPIプロセスの存続中に最大1回で、同時に複数の対戦取得が走った場合は処理中のリクエストを共有し、以後のOverlay再読み込みや対戦変更ではキャッシュ済みの結果を再利用する。失敗結果も保持するためポーリングや自動再試行は行わず、APIを再起動するとキャッシュは消える。ブラウザはカルーセル4画面をすべてマウントしたまま、ブキ画像要素だけを段階的に有効化する。初期表示では次の画面であるTeam A分だけを読み込み、Team Aが表示された時点でTeam B分を表示の8秒前から読み込む。一度有効化した画像はマウントしたままなので、スライド切替でブキ詳細を再取得したり読み込み済み画像を再マウントしたりしない。Dockでアクセントカラーだけを変えた場合も、対戦データは再取得しない。

各カタログは `API_DATA_SOURCE` から独立している。SQL には選択したブキIDと表示順だけを保存し、ブキ・ルール・ステージのマスターテーブルや外部カタログへの外部キーを持たない。JSON/D1 のどちらのモードでも同じメモリ上のID索引からカタログ項目を解決し、画面は Elysia API 経由で取得する。

## 現時点の制約

- 認証と更新用エンドポイントは未実装。開発データは JSON を編集するか、D1 モードでは API 外から管理する。
- 認証は未実装。Worker の設定は例示段階で、本番配置と実際の D1 接続は未確認。Elysia の Cloudflare アダプターは実験的な機能。

## 参考

- [obs-streamkit-demo](https://github.com/toy101/obs-streamkit-demo)
- [OBS 向けツールの開発記事（Zenn）](https://zenn.dev/odan/articles/d48ae9cbf265fd)
