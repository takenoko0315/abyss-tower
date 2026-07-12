# テスト実行手順

## 通常チェック

```powershell
npm run check
```

lint、Vitest、production buildを順番に実行する。

E2Eはブラウザの導入・Viteサーバー起動を伴い通常チェックを重くするため、`npm run check` には含めず、下記の専用コマンドで実行する。Vitest側でも `e2e/**` を明示的に除外し、Playwrightのテストを誤収集しないよう分離している。

## Ver.51 契約E2E監査

初回のみChromiumをインストールする。

```powershell
npx playwright install chromium
```

1回実行:

```powershell
npm run test:e2e
```

フレーク確認として全テストを3回ずつ連続実行:

```powershell
npm run test:e2e:repeat
```

Playwrightは専用のVite開発サーバーを自動起動し、終了時に停止する。テストは `window.__abyssTestFast === true` の開発ビルドだけで公開される `window.__abyssE2E` を使ってHP・敵・乱数条件を固定し、実際のUIボタンと戦闘処理を監査する。通常の開発プレイとproduction buildにはこのAPIを公開しない。

CIではChromiumを導入してから同じコマンドを実行する。CI時はworkerを1つに固定し、`test.only` を禁止する。失敗時は `test-results/` にtraceとスクリーンショットが保存される。

### 自動監査の対象

- 狂血: 最大HP時の常時+10%、失HPによる表示・実ダメージ上昇、回復後の倍率低下
- 収集家: 開始レリック1個、行動後に再抽選されないこと、最大HP-12%、通常上限6
- 錬金: 手動・自動回復量80%、各回復後の次攻撃だけ2倍

### 人間確認が残る項目

- 複数の画面幅・実機での表示崩れ
- ダメージポップや回復演出の見た目・タイミング
- 長時間プレイ時の体感バランス
