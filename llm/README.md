# llm

LLM呼び出し層。`claude-cli`(デフォルト、サブスクリプション利用枠)と `anthropic-api` の2バックエンドを共通インターフェース(`LlmClient`)の背後に隔離する。

- `index.ts`: `createLlmClient()` が環境変数(`SAKIN_LLM_BACKEND` / `SAKIN_DRY_RUN`)を見てバックエンドを選択する
- `claude-cli.ts`: `claude -p` を子プロセス実行するバックエンド。終了コード非0の出力から利用枠超過/レート制限を検出し `LlmQuotaExceededError` を投げる
- `anthropic-api.ts`: Anthropic API直叩きのバックエンド。SDKの `RateLimitError` / 課金エラーを `LlmQuotaExceededError` にマッピングする
- `dry-run.ts`: `SAKIN_DRY_RUN=1` 時に使われるモックバックエンド。役割(generate/evaluate)ごとのそれらしい応答を返す
- `json.ts`: LLM応答からJSONを抽出・パース・バリデートし、失敗時はリトライする(`completeJson`)
- `pricing.ts`: 既知モデルのおおまかなコスト概算(`estimateCostUsd`)。未知モデルは概算不可として `null` を返す
