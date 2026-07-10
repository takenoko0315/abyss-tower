# 深淵の塔 — 開発ガイド

React + Vite製のローグライクRPG。UIテキストは日本語。
本番: https://takenoko0315.github.io/abyss-tower/ (GitHub Pages、リポジトリ takenoko0315/abyss-tower)

## 作業サイクル

1. 編集する — コンテンツ追加は `src/game/data.js`、ロジック・UIは `src/AbyssTower.jsx`
2. `npm run check` — lint + データ整合性テスト + ビルドを一括実行
3. ブラウザで見た目・挙動が変わる変更のみ、previewでスモークテスト
4. **バランスに影響する変更(敵・スキル・レリック・祝福・難易度カーブ等)の前後比較は `npm run balance -- --runs=500` を実行し、出力の要約をコミットメッセージに含める**(下記「バランス計測」参照。160ランはボス単位・クラス単位の比較には解像度不足で、同一コードのバッチ間で10F死亡が±9件ブレた実績がある。動作確認だけのスモークテストなら既定の160ランで良い)
5. `git push` — GitHub Actionsが自動でlint+test+build+デプロイ(約1分)
   - gh CLIを使う時はBashで `export PATH="$PATH:/c/Program Files/GitHub CLI"` が必要

## 構成

- `src/AbyssTower.jsx` — 画面・戦闘ロジック・ラン中の可変状態。ラン開始時に `ACTIVE_DIFF` / `ACTIVE_MOD` / `ACTIVE_ZONE` / `ACTIVE_ASCENSION_FX` 等のモジュール変数を書き換え、ロジック各所がそれを読む設計
- `src/game/data.js` — 静的テーブル(敵・ボス・スキル・レリック・祝福・出自・世界モディファイア・ゾーン・深淵の彼方・イベント以外)。行を足すだけで追加できる
- `src/game/data.test.js` — 参照切れ(存在しないギミック名等)・キー重複の自動検出。テーブルを増やしたらここにも検査を足す
- `src/game/sfx.js` — 効果音(Web Audio合成)。`bgm.js` — BGM再生(`public/bgm/`のmp3、初回のユーザー操作で自動再生開始)。`storage.js` — セーブ(localStorage/window.storage)。`utils.js` — 汎用ヘルパー
- イベント(？？？部屋)だけは `AbyssTower.jsx` 内の `EVENTS` 配列にある(コンポーネントのstateを使うため)。追加時は `chooseRoom` の抽選リストにもキーを足すこと

## 慣習・注意

- 新しい効果の実装パターン: データに新プロパティを足し、`AbyssTower.jsx` 側の該当箇所(`genEnemy` / `totalStats` / `enterFloor` / `chooseRoom` / `enemyTurn` / `performAttack` 等)で読む
- タイトル画面の「Ver.XX — 変更概要」を機能追加のたびに上げる
- セーブデータはlocalStorageキー `abyss-meta` (souls / buys / best / codex / muted)
- 関数名に `use` 接頭辞を付けない(Reactフックとlintに誤検出される。過去に useSkill → castSkill と改名済み)
- 表示用ステータス名は `STAT_LABELS`、%表示するキーは `PCT_KEYS` に登録が必要
- **コンポーネント本体でトップレベル`await`を含むコード(useEffectの直書き含む)を追加する時、その中で参照する`const`/`function`が定義済みか必ず確認する。** 後方で定義された`const`を先に参照するとTDZ(`Cannot access 'X' before initialization`)で本番同様に画面が真っ白になる。`npm run build`は通ってしまう(構文エラーではなく実行時エラーのため)ので、ビルド確認だけでは検出できない。JSXを触った後は必ずブラウザで実際に起動確認すること(3回踏んだ実績あり: addLog, EVENTS)

## 開発用チートAPI (devサーバー限定・本番には入らない)

コンソールまたは preview_eval から `window.abyss.*` を呼ぶ:

- `abyss.gold(n)` — ゴールド+n(既定500)
- `abyss.souls(n)` — 深淵の魂+n(既定500)
- `abyss.heal()` — HP全回復
- `abyss.oneHp()` — 現在の敵のHPを1に(状態異常の「衰弱」とは無関係、旧名`weaken()`)
- `abyss.jump(f)` — f階に移動(ボス・深層のテストに)
- `abyss.best(n)` — 最高到達階を書き換え(深淵の彼方の解禁条件=20階クリアの確認に)
- `abyss.status(type, turns, dmg)` — 現在の敵に状態異常を直接付与(poison/burn/bleed/freeze/stun/weakenのテストに。weakenのdmgは減衰%、poison/bleedは継続ダメージ量)

## バランス計測(自動プレイテスト)

`npm run balance -- --runs=160 --diff=ノーマル` — jsdom + React Testing Libraryでゲームを実際にボタン操作させ、平均到達階・クリア率・ボス階死亡率・契約(キーストーン)別到達階などを集計する。既定は160(スモーク用途)。**バランス変更の前後比較には `--runs=500` を使うこと**(160ランはボス単位・クラス単位の比較には解像度不足)。

- 実体: `scripts/balance-worker-core.mjs`(jsdom上でAbyssTowerを実際にクリックして1ランプレイする本体) を `scripts/balance-bot.mjs`(オーケストレーター)がesbuildで事前バンドルし、CPUコア数ぶんの子プロセスに分けて並列実行する
  - jsdomのimportだけで1プロセスあたり約1.7秒かかり、これは並列化しても短縮できない下限(既知の制約)。160ランは目安1〜2分で終わる。速さそのものは目的ではなく「気軽に何度も回せること」が目的
- ボットの行動方針(過去の実績あるポリシーを踏襲、変更する場合は `balance-worker-core.mjs` の `actOnce` を編集):
  戦闘は大技/連攻を85%で防御・HP45%未満で回復薬・スキルは使えれば60%で使用、それ以外は攻撃。分岐路はHP50%未満なら焚き火優先。選択画面(クラス・型・祝福・出自・ゾーン・パーク等)はランダム。戦利品は70%で装備、未鑑定は50%で賭け装備
- 画面判定はDOM文言のscrapingではなく、`AbyssTower.jsx`がdevのみ公開する `window.__abyssDebug`(scene/player/enemy/pathOptions等の生の状態)を読む。新しいシーンを追加したら、この公開オブジェクト(コンポーネント本体の`if (import.meta.env.DEV) { window.__abyssDebug = {...} }`のブロック)にも必要なstateを足すこと。ここも上記TDZ注意の対象(定義済みの変数しか入れられない)
- `--workers=N` で並列数を指定可能(既定はCPUコア数)
- `--class=assassin/warrior/vampire/mage` でクラス固定のランができる(クラス格差の診断時、n=ラン数がそのクラスに全振りされるためブレが小さくなる)
- `--policy=standard/aggressive` で行動方針を切り替え可能(既定standard=上記の防御多用方針。aggressive=防御しない・大技/連攻の予告時はスキル優先→攻撃。潜在能力とbot相性の切り分けに使う)
- 出力の「クラス別 死亡階分布」で、クラスごとにどの階で死んでいるかを見られる
- `--blessing=ks_xxx` で祝福選択画面の契約(キーストーン)を固定できる(祝福は3択中1枠が契約確定という仕様を利用し、選択肢に指定キーが出ないランは`window.__abyssDebug.blessingChoices`で判定してリロール=作り直す。クラスとの矛盾組み合わせ(`KEYSTONE_EXCLUDE`)がある契約ほどリロールが増えるため実行時間が伸びる)。`--blessing=none` は契約を避けて通常祝福から選ぶ(契約なし基準の計測用)

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
