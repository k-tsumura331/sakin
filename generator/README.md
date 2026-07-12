# generator

種用語生成 → 組み合わせ → 案生成(JSONL出力)のCLI(`generate.ts`、`npm run generate`)。仕様は `docs/decisions.md` とプロジェクトルートの README を参照。

- `combos.ts`: near/far種用語の全組み合わせを、バッチ名をシードに決定的にシャッフルする(`buildCombos` / `pickCombo`)。再実行時に同じ順序を再現できるため、途中終了からの再開が可能
- 種用語(近い/遠い)は初回生成時に `<batch>.seed-terms.json` としてキャッシュし、再実行時は再利用する
- 出力済み行数から再開位置を判定するため、途中で止まっても再実行で続きから生成できる
- 利用枠エラー・レート制限を検知すると進捗を保存してその場で停止する
