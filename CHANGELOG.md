# Changelog

このプロジェクトは [Keep a Changelog](https://keepachangelog.com/ja/1.0.0/) の形式に沿って変更点を記録する。バージョンはまだタグ付けしていない(`package.json` の `0.1.0` は暫定)ため、リリースが発生し次第セクションを分割する。

## Unreleased

### Added

- `db/import.ts`・`db/prune.ts`・`db/sync-themes.ts`、`llm/claude-cli.ts`・`llm/anthropic-api.ts`、`web/app.ts` のルーティングに自動テストを追加
- `db.ideaExists()`(テーマ+idea IDでの存在確認)
- Web UIの書き込みルート(`verdict`/`evaluate`)向けの簡易レート制限ミドルウェア(`web/rate-limit.ts`)
- `.githooks/pre-commit`(typecheck/lint/testをコミット前に実行。`git config core.hooksPath .githooks` で有効化)

### Changed

- `npm test` を `node --test "dist/**/*.test.js"` に変更(Node 22でディレクトリ引数指定が壊れる環境があったための修正)
- Web UIの書き込みルートで、対象の案が存在しない場合にFK制約エラー(500)ではなく404を返すように変更
- Honoアプリに `onError` ハンドラを追加し、未処理例外の内部情報がレスポンスに漏れないようにした
- 各サブディレクトリの README(`config` / `db` / `evaluator` / `generator` / `llm` / `web`)を「フェーズ1で実装する」という古い記述から実装内容の説明に更新
- `CONTRIBUTING.md` にリクエストフロー(生成・評価バッチ、Web UIのレビューフロー)の説明を追加
