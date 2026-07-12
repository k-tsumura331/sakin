# evaluator

未評価の案をテーマの axes と evaluation_notes からプロンプトを組み立てて採点し、evaluations に書き戻すバッチ(`evaluate.ts`、`npm run evaluate`)。

- 実行前に対象件数(anthropic-apiバックエンド時は概算コストも)を表示する
- デフォルトは100件まで。全件処理は `--all` を明示指定
- `SAKIN_DRY_RUN=1` でLLM呼び出しをモックに差し替えて動作確認できる
- 利用枠エラー・レート制限を検知すると進捗を保存してその場で停止する。同じコマンドを再実行すれば続きから再開する
