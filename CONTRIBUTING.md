# Contributing

sakin の開発に参加する人向けのドキュメント。利用者向けの情報(セットアップ・使い方)は [README.md](README.md) を参照。

## アーキテクチャ概要

### 設計方針

- **テーマは狭く、広がりは種用語で確保する**。近い用語と遠い用語を混ぜた組み合わせが案の多様性の源泉
- **案と評価を分離する**。evaluations の `evaluator` フィールド(`ai:model名` / `human:名前`)で評価主体を区別
- **評価軸はテーマごとの設定として持つ**。DBスキーマには焼き込まず、`scores_json` + テーマ側の軸定義で吸収
- **選別の正は verdict(keep/drop/maybe)**。全テーマ共通で、軸定義に依存しない。「AI高評価」= AIの最新評価が keep
- **コードとデータを物理的に分離する**。実テーマ定義・生成データ・SQLite本体はリポジトリ外のデータディレクトリ(`SAKIN_HOME`)に置く。リポジトリにはサンプルのみ
- **生成とDBは疎結合**。生成側はJSONLを吐くだけ。プロンプト改良後の再生成・再取り込みが容易
- **DBアクセスは薄いアダプタ層に隔離**。将来のCloudflare Workers + D1への載せ替え(UIのみ。バッチ処理はローカルCLIのまま)を見据える
- **LLM呼び出しも薄い層に隔離**。デフォルトは Claude Code CLI(サブスクリプション利用枠)、設定で Anthropic API に切り替え可能

各決定の理由・却下した代替案は [docs/decisions.md](docs/decisions.md) に記録している。新しく重要な設計判断をしたら、そこに追記すること。

### ディレクトリ構成

```
.
├── config/          # SAKIN_HOME解決、テーマYAMLローダー/バリデータ、環境変数解決
├── db/              # SQLiteスキーマ、DBアダプタ、import/pruneスクリプト
├── llm/             # LLM呼び出し層(claude-cli / anthropic-api バックエンド、DRY_RUN)
├── generator/       # 種用語生成 → 組み合わせ → 案生成(JSONL出力)
├── evaluator/       # AI一次評価バッチ(未評価の案を採点して書き戻す)
├── web/             # スワイプ評価UI(Hono、SSR)
├── themes/          # サンプルテーマYAMLのみ。実テーマは SAKIN_HOME 配下
├── deploy/          # launchd plistサンプル
└── docs/            # decisions.md(設計判断の記録)
```

各ディレクトリには簡単な説明を書いた README.md がある。

### リクエストフロー

**生成・評価バッチ(CLI)**

```
generator/generate.ts --theme <name> --batch <name> --count <N>
  → config/themes.ts でテーマYAMLを読み込み
  → llm/ 経由で近い/遠い種用語を生成(初回のみ、以降は<batch>.seed-terms.jsonを再利用)
  → generator/combos.ts で全組み合わせを決定的にシャッフル
  → 組み合わせごとに案をLLM生成 → SAKIN_HOME/jsonl/<batch>.jsonl に1行ずつ追記

db/import.ts <path>
  → JSONLを読み、db/adapter.ts 経由でideasテーブルにinsert(同一IDはskip)

evaluator/evaluate.ts --theme <name>
  → ideasテーブルから対象evaluatorで未評価の案を取得
  → テーマのaxes/evaluation_notesからプロンプトを組み立ててLLM採点
  → evaluationsテーブルにevaluator="ai:<model>"として書き戻す
```

いずれも `LlmQuotaExceededError` を検知した時点で処理を止め、進捗(JSONL/DB)を保存する。同じコマンドを再実行すれば続きから再開する。

**Web UIのレビューフロー**

```
GET  /:theme                    → 現在のフィルタに合う最初の案をカードとして表示
GET  /:theme/card                → 次の案のカードフラグメントのみ返す(次送り用)
POST /:theme/ideas/:id/verdict   → 簡易評価(keep/drop)を記録し、次のカードを返す
GET  /:theme/ideas/:id           → 詳細画面(軸ごとのスライダー・コメント欄)
POST /:theme/ideas/:id/evaluate  → 詳細評価(軸スコア・verdict・コメント)を記録しリダイレクト
```

`/:theme/*` 配下の全ルートは、テーマ名がファイル名・URLパスの両方に使われるため、ミドルウェアで文字種チェック(`config/themes.ts` の `isValidThemeName`)を通してからハンドラに入る。書き込み系の2ルート(`verdict` / `evaluate`)は対象の案が存在するかを `db.ideaExists` で確認してから評価を記録し(存在しなければ404)、runaway なクライアント/スクリプトからの連打に対するバックストップとして簡易なレート制限(`web/rate-limit.ts`)を掛けている。

### データモデル

単一のSQLiteデータベースに全テーマを格納する(`theme_name` 列で区別)。

- `themes`: テーマ定義のキャッシュ。正はYAMLで、起動時に `db/sync-themes.ts` が upsert する
- `ideas`: id(ULID), theme_name, seed_terms_json, title, body, model, batch, created_at
- `evaluations`: id, idea_id, evaluator, scores_json, verdict(keep/drop/maybe), comment, created_at
  - verdict は全テーマ共通。スコア=合理的採点、verdict=直感、と役割を分ける
  - 同一 (idea_id, evaluator) の再評価は新規レコードとし、最新(created_at、同時刻なら id)を有効とする
  - 「AI」= evaluator が `ai:` で始まる評価、「人間」= `human:<SAKIN_HUMAN_NAME>` と一致する評価(`db/adapter.ts` の `getNextIdeaForReview` / `getReviewCard` を参照)

## 開発環境セットアップ

```sh
npm install
npm run typecheck   # 型チェックのみ
npm run lint        # Biome(lint + format チェック)
npm run lint:fix    # Biomeの自動修正を適用
npm test            # ビルド後 node --test dist で全テスト実行
npm run build       # dist/ へコンパイル
```

コード変更後は、コミット前に `typecheck` / `lint` / `test` を通すこと。CIも同じ3ジョブを実行し、mainへのマージ条件になっている。`git config core.hooksPath .githooks` を実行しておくと、コミット前にこの3つが自動で走る(`.githooks/pre-commit`。新規依存を増やしたくないので husky 等は使わず素のgit hookで済ませている)。

### テスト方針

- テストランナーは Node.js 標準の `node:test` / `node:assert`(追加の依存なし、このプロジェクトの「依存は最小限に」という方針に合わせている)
- テストファイルは対象コードと同じディレクトリに `*.test.ts` として置く(例: `db/adapter.test.ts`)。ビルド後 `dist/` 配下に生成され、`npm test`(`node --test "dist/**/*.test.js"`)が検出する
- 優先してテストを書く対象: バリデーションロジック(`config/themes.ts`)、DB層の複雑なクエリ(`db/adapter.ts`、`:memory:`/一時ファイルSQLiteで実施)、決定的アルゴリズム(`generator/combos.ts`)、リトライ処理(`llm/json.ts`)、セキュリティ修正の回帰防止(`web/html.ts` のエスケープ処理など)
- 外部プロセス・ネットワークに依存するコードも、実体を薄いスタブ/モックに差し替えて検証している: `llm/claude-cli.ts` はPATH上にダミーの `claude` 実行ファイルを立てて、`llm/anthropic-api.ts` は `globalThis.fetch` を差し替えて(SDKはカスタムfetch未指定時グローバルfetchにフォールバックする)、それぞれ本物の spawn/HTTP 経路を通す
- `web/app.ts` のルーティングは Hono の `app.request()` で一時SQLiteファイル+一時テーマディレクトリに対して統合テストする(`web/app.test.ts`)
- 実際にLLM API/CLIへ本物のリクエストを送る経路(generator/evaluatorのCLI全体を通しでの実行)は自動テスト化しておらず、`SAKIN_DRY_RUN=1` での手動確認に留めている。将来的に拡充する余地がある

### リント方針

- [Biome](https://biomejs.dev/)(`biome.json`)を使用。lintとフォーマットを1ツールで兼ねる。ルールセットは `recommended` プリセット
- インデントはスペース2、行幅100、クォートはダブルクォートに統一(`biome.json` の `formatter` / `javascript.formatter` 設定)
- ルール除外が必要な場合は `biome.json` の `overrides` にコメント付きで記録すること(なぜそのルールを外すのか理由を残す)

## 開発フロー

- mainへの直pushはしない。ブランチ(`feature/`, `fix/`, `docs/`, `chore/`, `refactor/`, `test/` + kebab-case)を切ってPRを作成し、CI(typecheck・lint・test)を通してからスクワッシュマージする
- PRタイトルはConventional Commits形式(`feat(db): ideasテーブルを追加` 等)。スクワッシュマージ時にそのままコミットメッセージになる
- mainブランチは保護されており、CI通過とPR経由のマージが必須(オーナーも例外なし)
- 詳細と理由は [docs/decisions.md](docs/decisions.md) を参照
