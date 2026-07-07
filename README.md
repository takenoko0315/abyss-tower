# 深淵の塔 (Abyss Tower)

装備を拾い、ビルドを組み、どこまで潜れるかを競うローグライクRPG。React + Vite製。

**プレイはこちら** → https://takenoko0315.github.io/abyss-tower/

## 開発コマンド

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー起動 (http://localhost:5173) |
| `npm run lint` | 静的検査 (oxlint、未定義変数の検出込み) |
| `npm test` | データ整合性テスト (vitest) |
| `npm run check` | lint + test + build を一括実行 (コミット前の確認用) |
| `npm run build` | 本番ビルド (dist/) |

## デプロイ

`main`ブランチに`git push`すると、GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) が自動でビルドしてGitHub Pagesに公開する。手動デプロイは不要。反映まで約1分。

## ファイル構成

```
src/
├── AbyssTower.jsx   … ゲーム本体 (画面・戦闘ロジック・ラン中の可変状態)
└── game/
    ├── data.js      … 静的データ定義 (敵・スキル・レリック・祝福・ゾーン・世界など)
    ├── data.test.js … データ整合性テスト (参照切れ・キー重複の検出)
    ├── sfx.js       … 効果音 (Web Audio APIで合成)
    ├── storage.js   … セーブデータ永続化 (window.storage / localStorage)
    └── utils.js     … 汎用ヘルパー (乱数・装備ステータス計算)
```

### コンテンツを追加するとき

敵・スキル・レリック・祝福・ゾーン・世界モディファイアなどの追加は [src/game/data.js](src/game/data.js) のテーブルに行を足すだけでよい。追加後に `npm test` を実行すると、参照切れ(存在しないギミック名を指した等)やキーの重複を自動検出できる。

戦闘ロジックや新しい効果フック(データに新しいプロパティを追加してロジック側で読む場合)は [src/AbyssTower.jsx](src/AbyssTower.jsx) 側の変更が必要。

## 経緯

このゲームはClaude.aiのアーティファクトとして生まれた単一JSXファイル(`abyss-tower-v36.jsx`)が原型。現在はこのリポジトリが唯一の開発場所で、元ファイルはVer.38時点のスナップショットとして凍結されている。
