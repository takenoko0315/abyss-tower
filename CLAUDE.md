# 深淵の塔 — 開発ガイド

React + Vite製のローグライクRPG。UIテキストは日本語。
本番: https://takenoko0315.github.io/abyss-tower/ (GitHub Pages、リポジトリ takenoko0315/abyss-tower)

## 作業サイクル

1. 編集する — コンテンツ追加は `src/game/data.js`、ロジック・UIは `src/AbyssTower.jsx`
2. `npm run check` — lint + データ整合性テスト + ビルドを一括実行
3. ブラウザで見た目・挙動が変わる変更のみ、previewでスモークテスト
4. `git push` — GitHub Actionsが自動でlint+test+build+デプロイ(約1分)
   - gh CLIを使う時はBashで `export PATH="$PATH:/c/Program Files/GitHub CLI"` が必要

## 構成

- `src/AbyssTower.jsx` — 画面・戦闘ロジック・ラン中の可変状態。ラン開始時に `ACTIVE_DIFF` / `ACTIVE_MOD` / `ACTIVE_ZONE` / `ACTIVE_ASCENSION_FX` 等のモジュール変数を書き換え、ロジック各所がそれを読む設計
- `src/game/data.js` — 静的テーブル(敵・ボス・スキル・レリック・祝福・出自・世界モディファイア・ゾーン・深淵の彼方・イベント以外)。行を足すだけで追加できる
- `src/game/data.test.js` — 参照切れ(存在しないギミック名等)・キー重複の自動検出。テーブルを増やしたらここにも検査を足す
- `src/game/sfx.js` — 効果音(Web Audio合成)。`storage.js` — セーブ(localStorage/window.storage)。`utils.js` — 汎用ヘルパー
- イベント(？？？部屋)だけは `AbyssTower.jsx` 内の `EVENTS` 配列にある(コンポーネントのstateを使うため)。追加時は `chooseRoom` の抽選リストにもキーを足すこと

## 慣習・注意

- 新しい効果の実装パターン: データに新プロパティを足し、`AbyssTower.jsx` 側の該当箇所(`genEnemy` / `totalStats` / `enterFloor` / `chooseRoom` / `enemyTurn` / `performAttack` 等)で読む
- タイトル画面の「Ver.XX — 変更概要」を機能追加のたびに上げる
- セーブデータはlocalStorageキー `abyss-meta` (souls / buys / best / codex / muted)
- 関数名に `use` 接頭辞を付けない(Reactフックとlintに誤検出される。過去に useSkill → castSkill と改名済み)
- 表示用ステータス名は `STAT_LABELS`、%表示するキーは `PCT_KEYS` に登録が必要

## 開発用チートAPI (devサーバー限定・本番には入らない)

コンソールまたは preview_eval から `window.abyss.*` を呼ぶ:

- `abyss.gold(n)` — ゴールド+n(既定500)
- `abyss.souls(n)` — 深淵の魂+n(既定500)
- `abyss.heal()` — HP全回復
- `abyss.weaken()` — 現在の敵のHPを1に
- `abyss.jump(f)` — f階に移動(ボス・深層のテストに)
- `abyss.best(n)` — 最高到達階を書き換え(深淵の彼方の解禁条件=20階クリアの確認に)

## ブラウザテストの作法

クリック操作の連続は、1回の `preview_eval` に async IIFE でまとめて実行する(1クリック=1コマンドにすると極端に遅い。ユーザーからの指摘済み)。パターン:

```js
(async function(){
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const click = async (text) => { /* textContentで探して .click() して await sleep(120) */ };
  await click('挑戦する'); await click('戦士'); /* ... */
  return '検証結果の文字列';
})()
```
