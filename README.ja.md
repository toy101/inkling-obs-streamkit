# inkling-obs-streamkit

[English](./README.md) | 日本語

Splatoon 大会配信用の自作 OBS ツールキット。OBS の **カスタムブラウザドック**（配信者が操作するパネル）と **ブラウザソース**（配信に映るオーバーレイ）を、1 つの Vite アプリと 1 つの Elysia API で提供する。

流れは次のとおり。

1. 配信者が Dock で表示対象を選ぶ。
2. Dock は選択された ID だけを `localStorage` に書く。
3. Overlay が変更を検知し、API から最新データを取得して描画する。

Dock・Overlay・Debug が同じアプリに同居しているため、OBS を起動しなくてもブラウザだけでオーバーレイを作り込める。

## 必要なもの

- [Bun](https://bun.sh) — 1.4.2 で開発している。Bun 1.3.1 では Elysia のインストール時に peer dependency の解決に失敗したため、インストールが壊れる場合は `bun upgrade` する。
- OBS Studio — 実際に配信へ載せるときだけ必要。普段の開発は Debug ビューで行う。

## 始め方

```bash
bun install   # リポジトリのルートで実行する。lockfile はルートの bun.lock 1 つ
bun dev       # web(:5173) と API(:3000) を並列起動する
```

<http://localhost:5173/?view=debug> を開き、左のパネルでプレイヤーを選ぶと、右のオーバーレイプレビューが更新される。

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
- ツールバーに描画サイズ・比率・現在の倍率・縮小後の表示サイズを表示する。
- オーバーレイの背後の市松模様は透過確認用で、配信には含まれない。
- Dock と iframe の選択同期には、同一 origin の `localStorage` と `storage` イベントを使う。

## ディレクトリ構成

```text
.
├── apps/
│   ├── web/    Vite + React + TypeScript。Dock / Overlay / Debug。
│   └── api/    Bun 上の Elysia。プレイヤーデータ。
├── packages/   共通ドメイン型用の予約枠（現時点では空）
└── cspell.json
```

## コマンド

| コマンド | 内容 |
| --- | --- |
| `bun dev` | web と API を並列起動する。 |
| `bun run --filter web dev` | 片方のワークスペースだけ起動する（`api` も同様）。 |
| `bun run --filter web lint` | ESLint。lint 設定があるのは web のみ。 |
| `bun run --filter web build` | `tsc -b && vite build`。唯一の型チェック経路。 |
| `bun run spellcheck` | リポジトリ全体を cspell で検査する。辞書は `cspell.json`。 |

テストはまだない。

## 仕組み

**型は API から web へ流れる。** `apps/api/src/index.ts` が `type App = typeof app` を export し、`apps/web/src/lib/api.ts` がそこから Eden Treaty クライアントを組み立てる。web はワークスペースを越えて API のソースの型を import しているので、ルートを変えるとフロント側の型が即座に変わる。リクエストは `fetch` ではなく `api.players.get()` を通す。

**Dock が渡すのは ID だけ。** API のレスポンスを `localStorage` に保存せず、Overlay が API から取り直すことで、backend をデータの正本に保つ。`apps/web/src/lib/overlay-state.ts` は `storage` イベント（OBS では Dock と Overlay が別 window）とモジュールレベルの listener（Debug では両方が同一 window）を併用する。どちらも欠かせない。

**描画サイズは定数。** `apps/web/src/lib/overlay-canvas.ts` が 1920 × 1080 を持ち、Overlay と Debug のプレビューがそこを参照する。

## 現時点の制約

- プレイヤーデータは `apps/api/src/index.ts` 内のインメモリ配列で、データベースはない。
- API のポート（3000）とクライアントの接続先 URL はハードコードされている。
- テスト・認証・本番ビルド／デプロイ経路のいずれもなく、すべて `localhost` 前提。

## 参考

- [obs-streamkit-demo](https://github.com/toy101/obs-streamkit-demo)
- [OBS 向けツールの開発記事（Zenn）](https://zenn.dev/odan/articles/d48ae9cbf265fd)
