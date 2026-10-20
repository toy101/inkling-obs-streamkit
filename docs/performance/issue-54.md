# Issue #54: スライドの key 固定

2026-10-20 JST。比較元は `d50c794`、比較先は本 PR の実装。

## 条件

- production build、Playwright 同梱 Chromium headless、1920×1080、DPR 1、スロットリングなし。
- 同一 origin の等倍 iframe に実際の Overlay を表示。Debug の起動時 autoplay 同期は含めない。
- 各条件を新しいブラウザで3回測定。HTTP キャッシュを無効にし、API・画像・動画を同じローカル fixture に固定。
- `prefers-reduced-motion: reduce` で背景・フェードの継続アニメーションを止め、切替に伴う処理を比較。
- 長名条件は日本語・英字の長い名前20要素。実データ条件はローカル JSON のチーム名2件・選手名8件を使用し、画像などは fixture のまま。実名は出力しない。
- 起動は名前20要素、フォント、3フレームの完了まで。切替は `[0,1,2,0]` を3周、同一スライド再選択3回と通常切替9回を含む。
- DOM の新規挿入数は MutationObserver で計数する。React の render 回数や effect 回数を mount 数と呼ばない。

## 結果

表は3回の算術平均。Layout/Task は CDP Performance の差分、RasterTask は trace 全 worker の duration 合計。

| データ・場面 | 名前 DOM 新規生成 | スライド DOM 新規生成 | 名前の幅読取り | Observer 新規生成 | Layout 件数 | Layout 時間 ms | Task 時間 ms | RasterTask 件数 / 時間 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 長名・起動 前→後 | 20→20 | 3→3 | 520→520 | 20→20 | 518.7→518.7 | 38.93→40.75 | 90.03→93.41 | 122.0 / 175.24 → 165.0 / 233.11 |
| 長名・切替 前→後 | 150→0 | 21→0 | 3900→0 | 150→0 | 3861→9 | 166.88→0.70 | 246.41→22.81 | 413.0 / 412.17 → 318.0 / 346.56 |
| 実名・起動 前→後 | 20→20 | 3→3 | 40→40 | 20→20 | 7.7→7.7 | 9.51→9.06 | 79.15→76.53 | 158.0 / 226.64 → 158.3 / 221.55 |
| 実名・切替 前→後 | 150→0 | 21→0 | 300→0 | 150→0 | 12→9 | 5.71→0.72 | 39.48→21.38 | 390.0 / 406.51 → 318.0 / 346.00 |

各回の値と計測条件は [JSON](issue-54-results.json) を参照。

key 固定によって切替時の再生成と名前の計測を省けた。起動時の計測は減っていない。RasterTask と起動時間は初回描画、描画キャッシュ、OS のスケジューリングにも左右されるため、単一指標から一般的な削減率を主張しない。Task 時間はブラウザのメインスレッド処理時間であり、プロセス全体の CPU 使用率ではない。

## 再計測

```bash
VITE_API_URL=http://127.0.0.1:3000 bun run --filter web build
bun run --cwd apps/web vite preview --host 127.0.0.1 --port 4173 --strictPort
# 別ターミナル
bun run apps/web/performance/measure-overlay-performance.ts /tmp/overlay-long.json long
OVERLAY_PERF_PLAYERS=/path/to/players.json OVERLAY_PERF_TOURNAMENTS=/path/to/tournaments.json bun run apps/web/performance/measure-overlay-performance.ts /tmp/overlay-real.json real
```

比較するリビジョンごとに同じ手順でビルドと preview の再起動を行う。計測スクリプトは比較前後で同じものを使う。JSON と trace の要約には実名を含めず、生の trace も保存しない。

## 動作確認と制約

- `carousel-identity.spec.ts` の2件で通常切替・同じスライドの再選択時の DOM 保持と fade 再始動、武器画像の失敗後再試行・URL 変更後の表示を確認。
- 関連する既存27件で名前の全文表示、ステージ紹介前後の表示位置・autoplay 保持、動画再生・失敗・待機解除を確認。
- 成功した画像は保持し、武器画像の失敗状態だけを URL と再選択の世代で判定する。大会・チーム変更による `carouselSelectionKey` の初期化は維持。
- 通常モーションでの演出は E2E で別途確認。性能値は軽量な画像 fixture を使った Chrome の結果であり、本番素材・OBS/CEF 実機の負荷を示さない。
