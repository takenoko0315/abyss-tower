# 戦闘サンドボックス

開発サーバーを `npm run dev` で起動し、`?combatSandbox=1` を付けて開く。タイトル画面の「戦闘サンドボックス」から、敵、階層、クラス、祝福・契約、装備プリセット、HP、seed、敵の行動段階と予告を指定して直接戦闘を開始できる。

サンドボックスは `import.meta.env.DEV` と明示URLフラグの両方が必要で、本番bundleにはUI・APIを含めない。メタ報酬、図鑑、最高到達階、localStorageは更新しない。勝敗後は同じ設定とseedで再戦できる。

E2Eでは、開発ビルド、`window.__abyssTestFast = true`、URLフラグの3条件が揃った場合だけ `window.__abyssE2E.startSandboxCombat(config)` を公開する。
