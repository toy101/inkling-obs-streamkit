# inkling-obs-streamkit

[English](./README.md) | 日本語

Splatoon 大会配信用の自作 OBS ツールキット。OBS の **カスタムブラウザドック**（配信者が操作するパネル）と **ブラウザソース**（配信に映るオーバーレイ）を、1 つの Vite アプリと 1 つの Elysia API で提供する。

流れは次のとおり。

1. 配信者が Dock で大会・左右のチーム・次のルール／ステージ・アクセントカラー1色を選ぶ。
2. **Overlayへ反映**を押すと、選択IDと表示用カラーだけを`localStorage`へ書く。
3. Overlay が変更を検知し、API から最新の対戦データを取得して4画面のループを描画する。

Dock・Overlay・Debug が同じアプリに同居しているため、OBS を起動しなくてもブラウザだけでオーバーレイを作り込める。

## 必要なもの

- [Bun](https://bun.sh) — 1.4.2 で開発している。Bun 1.3.1 では Elysia のインストール時に peer dependency の解決に失敗したため、インストールが壊れる場合は `bun upgrade` する。
- [Turso CLI](https://docs.turso.tech/cli/installation) と `sqld` — `bun dev` で任意利用の永続ローカル DB を起動するために使う。API の既定値は JSON 参照。
- OBS Studio — 実際に配信へ載せるときだけ必要。普段の開発は Debug ビューで行う。

## 始め方

```bash
bun install
cp apps/api/.env.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local
bun dev
```

リポジトリのルートで実行する。2つの `.env.local` はGitの追跡対象外。将来のTurso認証情報を含むAPI専用の値はViteへ渡さず、ブラウザが必要とする `VITE_API_URL` だけを公開する。

API は既定で `apps/api/src/data/` 以下のプレイヤー・大会 JSON を直接読むため、データモデルを調整している間は DB セットアップ不要。アプリ起動前の準備スクリプトは、不足している実行時アセットだけをダウンロードする。ブキ・ルール・ステージの各カタログは `apps/api/src/data/`、ステージ紹介のビネット画像は `apps/web/public/` へ配置し、既存ファイルがあればCDNへ再リクエストしない。ローカルのソースファイルを変更すると、BunのwatchモードがAPIを再読み込みする。

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
- Dock と iframe の選択同期には、同一 origin の `localStorage` と `storage` イベントを使う。
- iframe は固定の `?view=overlay` だけを読み込み、上記のストレージ経路を必要とするため、意図的に同一 origin にしている。Debug 用メッセージも親 window・origin・payload を検証してから使う。同一 origin は信頼境界であり、sandbox による隔離ではない。
- Vite の開発・プレビューサーバーは Debug からの同一 origin 埋め込みだけを許可し、他 origin からの埋め込みを拒否する。API は `127.0.0.1` だけで待ち受け、CORS は `apps/api/src/app.ts` に列挙したローカル Web origin だけを許可する。

## ディレクトリ構成

```text
.
├── apps/
│   ├── web/    Vite + React + TypeScript。Dock / Overlay / Debug。
│   └── api/    Bun 上の Elysia。JSON データと任意利用の Turso 接続、マイグレーション、初期データ。
├── packages/   共通ドメイン型用の予約枠（現時点では空）
└── cspell.json
```

## コマンド

| コマンド | 内容 |
| --- | --- |
| `bun dev` | ローカル Turso、web、API を並列起動する。 |
| `bun run dev:apps` | web と API だけを起動する。既定の JSON 参照中はこれでもよい。 |
| `bun run --filter web dev` | 片方のワークスペースだけ起動する（`api` も同様）。 |
| `bun run --filter web lint` | ESLint。lint 設定があるのは web のみ。 |
| `bun run --filter web build` | `tsc -b && vite build`。唯一の型チェック経路。 |
| `bun run openapi:build` | APIを起動せず、実行時データも読み込まずに、`dist/openapi/` 以下へ静的な Scalar ビューアーと `openapi.yaml` を生成する。 |
| `bun run db:dev` | 永続化するローカル Turso だけを `127.0.0.1:8080` で起動する。 |
| `bun run db:setup` | Turso 利用時に未適用のマイグレーションを実行し、開発データを一度だけ投入する。 |
| `bun run db:migrate` | 開発データを投入せず、未適用の SQL マイグレーションだけを実行する。 |
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

リポジトリ設定では、GitHub Pagesの公開元に **GitHub Actions** を指定する必要がある。生成時は実行されないデータソースのスタブでスキーマ専用のappを組み立てるため、ローカルJSONを読み込まず、Turso、カタログCDN、イカクロAPIにも接続しない。

## 仕組み

**型は API から web へ流れる。** `apps/api/src/index.ts` が `type App = typeof app` を export し、`apps/web/src/lib/api.ts` がそこから Eden Treaty クライアントを組み立てる。web はワークスペースを越えて API のソースの型を import しているので、ルートを変えるとフロント側の型が即座に変わる。リクエストは直接の `fetch` ではなく、`api.overlay.matchup.get()` などの型付き呼び出しを通す。

**Dock が渡すのは選択IDと表示設定だけ。** API のレスポンスを `localStorage` に保存せず、Overlay が API から取り直すことで、backend をデータの正本に保つ。`apps/web/src/lib/overlay-state.ts` は `storage` イベント（OBS では Dock と Overlay が別 window）とモジュールレベルの listener（Debug では両方が同一 window）を併用する。どちらも欠かせない。

**描画サイズは定数。** `apps/web/src/lib/overlay-canvas.ts` が 1920 × 1080 を持ち、Overlay と Debug のプレビューがそこを参照する。

## データソース

既定の `API_DATA_SOURCE=json` では、次の編集可能なファイルを直接読む。

- `apps/api/src/data/players.json`
- `apps/api/src/data/tournaments.json`

Elysia のルートとレスポンススキーマはどちらのモードでも同じ。モデルが固まっていない間は JSON をすぐ編集でき、web 側を保存方式へ依存させずに済む。

Turso の実装は公式の `@libsql/client` を使う形で残している。ローカル DB を使う場合は `apps/api/.env.local` に `API_DATA_SOURCE=turso` を設定し、`bun dev` で各サービスを起動してから、初回だけ別ターミナルで `bun run db:setup` を実行する。ローカルサーバーは `TURSO_DATABASE_URL` から待受先を読み取る。DB ファイルは `apps/api/.data/` 以下に置かれ、Git の追跡対象から外れる。

SQL マイグレーションは `apps/api/src/db/migrations/` に置く。`bun run db:setup` は各マイグレーションを一度だけ適用し、プレイヤーと大会の開発データをローカル JSON から投入する。seed のバージョンを記録して2回目以降は DB を上書きしないため、初回投入後に JSON を編集しても既存の Turso DB には反映されない。

将来 Turso Cloud へ接続するときは、Git 管理外の `apps/api/.env.local` に `API_DATA_SOURCE=turso`、`TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN` を設定する。認証情報は API プロセスだけが保持し、Vite アプリには公開しない。ローカル用の `db:dev` はローカルHTTP URLだけを受け付けるため、Cloud利用時は `bun run dev:apps` を使う。

## 実行時カタログ

ブキ・ルール・ステージの各マスターは、CDN上のJSON配列として公開している。

- [`weapons.json`](https://inkling-obs-streamkit.toy101-mov.org/weapons.json)
- [`rules.json`](https://inkling-obs-streamkit.toy101-mov.org/rules.json)
- [`stages.json`](https://inkling-obs-streamkit.toy101-mov.org/stages.json)

ブキマスターはSplatoon 3のブキ173件を収録し、項目はイカクロAPIのIDと原文の日本語名だけ。

```json
{ "id": "236", "name": "スプラシューター" }
```

ルールは `id`、日本語の `name`、英語の `en`、`description`、ステージは `id`、日本語の `name`、英語の `en` を持つ。API起動前に `scripts/prepare-runtime-assets.ts` が `apps/api/src/data/` 以下の3ファイルを確認する。不足しているファイルだけを `CATALOG_URL` で設定したCDNのベースURLから取得し、既存ファイルがあればリクエストしない。保存前にContent-Type、UTF-8 JSON配列、ファイルサイズを検証する。その後、APIはローカルファイルを再度検証して1回だけ読み込み、表示順を保つ配列とID索引をメモリへ保持する。ダウンロードまたは検証に失敗した場合は、不完全なデータを配信せず起動を失敗させる。

ローカルの [`apps/api/src/data/`](./apps/api/src/data/) にある `weapons.json`、`rules.json`、`stages.json` は実行時入力で、Gitの追跡対象外。更新時はリモートカタログを公開し、対象のローカルファイルだけを削除してAPIを再起動する。準備スクリプトが不足ファイルを再度ダウンロードする。CIではCDNを使わず、`scripts/prepare-ci-fixtures.ts` が品質チェック前にこのGit管理外のパスへ決定的な小さなfixtureを書き込む。

ブキ画像は `/overlay/matchup` の読み込み時にまとめて解決する。その対戦で使う数値のブキIDを重複排除し、`IKACLO_API_ORIGIN` で設定したHTTPS originから返されたブキ情報と画像URLを検証する。各IDへのリクエストはAPIプロセスの存続中に最大1回で、同時に複数の対戦取得が走った場合は処理中のリクエストを共有し、以後のOverlay再読み込みや対戦変更ではキャッシュ済みの結果を再利用する。失敗結果も保持するためポーリングや自動再試行は行わず、APIを再起動するとキャッシュは消える。ブラウザはカルーセル4画面をすべてマウントしたまま、ブキ画像要素だけを段階的に有効化する。初期表示では次の画面であるTeam A分だけを読み込み、Team Aが表示された時点でTeam B分を表示の8秒前から読み込む。一度有効化した画像はマウントしたままなので、スライド切替でブキ詳細を再取得したり読み込み済み画像を再マウントしたりしない。Dockでアクセントカラーだけを変えた場合も、対戦データは再取得しない。

各カタログは `API_DATA_SOURCE` から独立している。SQL には選択したブキIDと表示順だけを保存し、ブキ・ルール・ステージのマスターテーブルや外部カタログへの外部キーは持たない。JSON/Turso のどちらのモードでも同じメモリ上のID索引からカタログ項目を解決し、画面は従来どおりローカル Elysia API 経由で取得する。

## 現時点の制約

- 認証と更新用エンドポイントは未実装。開発データは JSON を編集するか、Turso モードでは API 外から管理する。
- 認証と本番デプロイ経路はなく、すべて `localhost` 前提。将来静的ファイルを本番配信する場合は、`apps/web/vite.config.ts` のセキュリティヘッダーを配信サーバー側でも設定する必要がある。Vite のビルド成果物だけでは HTTP レスポンスヘッダーは引き継がれない。

## 参考

- [obs-streamkit-demo](https://github.com/toy101/obs-streamkit-demo)
- [OBS 向けツールの開発記事（Zenn）](https://zenn.dev/odan/articles/d48ae9cbf265fd)
