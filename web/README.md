# web

スマホ前提のスワイプ評価UI。Hono + サーバーサイドレンダリング(素のJS、SPAフレームワークなし)。

- `server.ts`: `@hono/node-server` でHTTPサーバーを起動するエントリポイント(`npm run web`)。bindアドレスはTailscaleインターフェースを自動検出(見つからなければ127.0.0.1)
- `app.ts`: ルーティング本体。テーマ名は起動時と同じ文字種チェックを経てからパス・テンプレートに渡す(パストラバーサル・XSS対策)
- `pages.ts` / `card.ts`: ページ全体・カードフラグメントのHTML生成、スワイプ操作のクライアントスクリプト
- `filters.ts`: レビュー用フィルタ(AI高評価のみ/人間未評価のみ/評価が割れた案/verdict別)のクエリパラメータ変換
- `html.ts`: HTMLエスケープと `<script>` 埋め込み用JSONエスケープのユーティリティ
- 認証は持たない。Tailscaleネットワーク内での利用を前提とする(詳細は `docs/decisions.md`)
