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
npm run lint        # ESLint(typescript-eslint, 型情報あり)
npm test            # ビルド後 node --test dist で全テスト実行
npm run build       # dist/ へコンパイル
```

コード変更後は、コミット前に `typecheck` / `lint` / `test` を通すこと。CIも同じ3ジョブを実行し、mainへのマージ条件になっている。

### テスト方針

- テストランナーは Node.js 標準の `node:test` / `node:assert`(追加の依存なし、このプロジェクトの「依存は最小限に」という方針に合わせている)
- テストファイルは対象コードと同じディレクトリに `*.test.ts` として置く(例: `db/adapter.test.ts`)。ビルド後 `dist/` 配下に生成され、`node --test dist` が再帰的に検出する
- 優先してテストを書く対象: バリデーションロジック(`config/themes.ts`)、DB層の複雑なクエリ(`db/adapter.ts`、`:memory:` SQLiteで実施)、決定的アルゴリズム(`generator/combos.ts`)、リトライ処理(`llm/json.ts`)、セキュリティ修正の回帰防止(`web/html.ts` のエスケープ処理など)
- 実際にLLMを呼ぶ経路(generator/evaluatorのCLI全体、web層のE2E)は自動テスト化しておらず、`SAKIN_DRY_RUN=1` での手動確認に留めている。将来的に拡充する余地がある

### リント方針

- ESLint flat config(`eslint.config.js`)、`typescript-eslint` の `recommendedTypeChecked` プリセットを使用(型情報を使った検査)
- 意図的なルール除外はコメント付きでファイル単位のオーバーライドとして記録している(例: `db/adapter.ts` と `llm/dry-run.ts` は非同期の外形を持たせるためあえて `await` を使わない設計。理由は `docs/decisions.md` を参照)。新しく例外を追加する場合も、なぜそのルールを外すのかをコメントで残すこと

## 開発フロー

- mainへの直pushはしない。ブランチ(`feature/`, `fix/`, `docs/`, `chore/`, `refactor/`, `test/` + kebab-case)を切ってPRを作成し、CI(typecheck・lint・test)を通してからスクワッシュマージする
- PRタイトルはConventional Commits形式(`feat(db): ideasテーブルを追加` 等)。スクワッシュマージ時にそのままコミットメッセージになる
- mainブランチは保護されており、CI通過とPR経由のマージが必須(オーナーも例外なし)
- 詳細と理由は [docs/decisions.md](docs/decisions.md) を参照
