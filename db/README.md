# db

SQLiteスキーマ・DBアダプタ層(`adapter.ts`、better-sqlite3を隔離)・CLIスクリプト群。

- `schema.ts`: `themes` / `ideas` / `evaluations` のテーブル定義(`CREATE TABLE IF NOT EXISTS`)
- `adapter.ts`: 薄いDBアダプタ。CRUD・レビューカード取得・フィルタ条件の組み立てを担う。テストは `:memory:` SQLiteで実施(`adapter.test.ts`)
- `sync-themes.ts`: `themes/*.yaml` を読み、DBの `themes` テーブルへupsertする(`npm run db:sync-themes`)
- `import.ts`: 生成されたJSONLをDBへ取り込む。同一IDは自動スキップ(`npm run db:import`)
- `prune.ts`: 指定バッチの未評価案を削除する(`npm run db:prune -- --unevaluated-only`。現時点でサポートするのはこのモードのみ)
