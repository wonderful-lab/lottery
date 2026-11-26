# ドキドキ抽選マシーン

ブラウザだけで完結するスロット抽選アプリ。候補者リストを入れて「抽選する！」を押すと、パチンコ・パチスロ風の演出つきスロットが回って1人が選ばれる。

- **サーバー不要**：静的ファイルだけで動く。GitHub Pages / Cloudflare Pages にそのまま置ける
- **TypeScript**：実行時の依存関係はゼロ。開発依存は `typescript` のみ
- **音も演出も内製**：効果音は Web Audio で合成（音声ファイルなし）、紙吹雪は canvas 描画
- **公平な抽選**：当選者は `crypto.getRandomValues()` の棄却サンプリングで決める

## 使い方

1. 候補者リストに人名やIDをカンマ区切り（改行でもOK）で入力する
2. 「抽選する！」を押すとスロット画面へ遷移し、高速回転が始まる
3. STOP ボタンを押す（押さなくても6秒で自動停止）→ 減速 → SUPER REACH（リール回転中に金の扉が先行して閉まる）→ 扉が開いて当選確定
4. 結果画面で「結果をコピー」「もう一度抽選」「当選者を除いて再抽選」「一覧に戻る」が選べる

同じ名前を複数回入れると、その分だけ当たりやすくなる（くじの枚数が増えるイメージ）。当選履歴はセッション中だけ保持される。

演出は5段階レベル（1 静か 〜 5 MAX）の切り替えがある。音量・電球の点滅速度・リーチの長さ・紙吹雪の量・振動/フラッシュがまとめて連動し、入力画面とスロット画面で同期する。`prefers-reduced-motion` が有効な環境では演出が自動で抑えられる。

演出の見どころ：期待度カラーの昇格（青→緑→赤→金→虹）、レーザービーム、紙吹雪の5発重ね撃ちとサイドキャノン連射・花火・星スパークル、星マスコット5体の隊列走行と飛翔、当選者名のスクランブル表示、WINNER → BIG WIN → MEGA WIN → JACKPOT の段階アナウンス。

## ローカルで動かす

```sh
npm install
npm run dev   # ビルドして http://localhost:4173 で配信
```

`npm run build` だけだと `dist/` に成果物（`index.html` / `main.js` / `style.css`）が出る。ESモジュールのため `file://` で直接開くと動かないので、必ず HTTP 経由で開くこと。

## 公開する

### GitHub Pages

1. このリポジトリを GitHub に作る（空のリポジトリでOK）
2. Settings → Pages → Build and deployment → Source を **GitHub Actions** にする
3. `main` へ push すると `.github/workflows/pages.yml` が `dist/` をビルドして公開する

### Cloudflare Pages

1. Cloudflare Pages でこのリポジトリを接続する
2. Build command: `npm run build`、Build output directory: `dist`

## 構成

```
public/
  index.html   画面のマークアップ（2画面：入力 / スロット）
  style.css    見た目すべて（スペース版からそのまま移植）
src/
  main.ts      画面遷移と抽選フロー（回転→減速→リーチ→確定）
  sound.ts     Web Audio で合成する効果音
  confetti.ts  紙吹雪・火花・花火・星・サイドキャノン（canvas）
  parse.ts     候補者リストのパース
  random.ts    crypto.getRandomValues() による公平な乱数
scripts/
  copy-public.mjs  ビルド時に public/ を dist/ へコピー
  serve.mjs        依存ゼロの開発用サーバー
```

## メモ

- スペースで作った単一HTML版（最新版）を、挙動を変えずに TypeScript + 分割ファイルへ移植したもの
- フォントは Google Fonts（Russo One / Noto Sans JP / M PLUS Rounded 1c）を CDN から読む。オフラインでもシステムフォントで表示される
