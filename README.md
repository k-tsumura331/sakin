# sakin

Mass-generate ideas on a narrow theme with cheap AI models, triage them with AI scoring, and swipe-review the survivors on your phone. Human and AI evaluations are stored separately and independently filterable. Named after 砂金 (gold panning).

安価なAIに特定テーマの案を大量生成させ、AI一次評価と人間のスワイプ評価で選別する仕組み。

## 目的

- 狭く定義したテーマ(例: 架空テーマ「週末キャンパー向けの新規サービス」)に対し、種用語の組み合わせから数千件規模の案を機械的に生成する
- AIによる一次採点で母集団を絞り、人間は上位2〜3割だけを高速レビュー(スワイプ)する
- 人間評価とAI評価を別レコードとして保存し、「AIと人間で評価が割れた案」のような横断フィルタを可能にする

## 設計方針

- **テーマは狭く、広がりは種用語で確保する**。近い用語と遠い用語を混ぜた組み合わせが案の多様性の源泉
- **案と評価を分離する**。evaluations の `evaluator` フィールド(`ai:model名` / `human:名前`)で評価主体を区別
- **評価軸はテーマごとの設定として持つ**。DBスキーマには焼き込まず、`scores_json` + テーマ側の軸定義で吸収
- **選別の正は verdict(keep/drop/maybe)**。全テーマ共通で、軸定義に依存しない。「AI高評価」= AIの最新評価が keep
- **コードとデータを物理的に分離する**。実テーマ定義・生成データ・SQLite本体はリポジトリ外のデータディレクトリ(`SAKIN_HOME`)に置く。リポジトリにはサンプルのみ
- **生成とDBは疎結合**。生成側はJSONLを吐くだけ。プロンプト改良後の再生成・再取り込みが容易
- **DBアクセスは薄いアダプタ層に隔離**。将来のCloudflare Workers + D1への載せ替え(UIのみ。バッチ処理はローカルCLIのまま)を見据える
- **LLM呼び出しも薄い層に隔離**。デフォルトは Claude Code CLI(サブスクリプション利用枠)、設定で Anthropic API に切り替え可能
- 主要な設計判断は `docs/decisions.md` に「決定・理由・却下した代替案」を記録する

## データモデル

単一のSQLiteデータベースに全テーマを格納する(`theme_name` 列で区別)。

- `themes`: テーマ定義のキャッシュ。正はYAMLで、起動時にupsertされる
- `ideas`: id, theme_name, seed_terms, title, body, model, batch, created_at
- `evaluations`: idea_id, evaluator, scores_json, verdict(keep/drop/maybe), comment, created_at
  - verdict は全テーマ共通。スコア=合理的採点、verdict=直感、と役割を分ける
  - 同一 (idea_id, evaluator) の再評価は新規レコードとし、最新(created_at、同時刻なら id)を有効とする

## 評価軸(サンプルテーマの初期設定)

共通軸: novelty(新規性) / clarity(具体性)
テーマ固有軸: pain(課題の切実さ) / feasibility(実現性) / monetization(収益筋)

各5段階。AI採点プロンプトは軸定義から自動生成する。軸はテーマYAMLで自由に定義でき、変更してもスキーマ変更は不要。

## 構成

```
.
├── themes/          # サンプルテーマYAMLのみ。実テーマは SAKIN_HOME 配下
├── generator/       # 種用語生成 → 組み合わせ → 案生成(JSONL出力)
├── db/              # SQLiteスキーマ、importスクリプト
├── evaluator/       # AI一次評価バッチ(未評価の案を採点して書き戻す)
├── llm/             # LLM呼び出し層(claude CLI / Anthropic API バックエンド)
└── web/             # スワイプ評価UI(Mac mini + Tailscale経由でスマホから利用)
```

## パイプラインの流れ

1. テーマ定義(`SAKIN_HOME/themes/`) — 評価軸と種用語の方針を記述
2. 種用語の大量生成(近い用語+遠い用語)
3. 用語の組み合わせから案を大量生成 → JSONL
4. SQLiteへimport(バッチ単位。作り直すときは旧バッチの未評価分をpruneして入れ替え)
5. AI一次評価バッチを実行(実行前に対象件数を表示、`--limit` で上限指定)
6. スマホからスワイプUIでレビュー(フィルタ: AI高評価のみ / 人間未評価のみ / 評価が割れた案)

## 想定規模

1テーマあたり数千件。人間の全件レビューは想定せず、AI一次評価による絞り込みを前提とする。

## セキュリティ / 公開ポリシー

- 実テーマ・生成データ・DBは `SAKIN_HOME`(デフォルト `~/sakin-data`)に置き、リポジトリには一切含めない。`.gitignore` は二重の保険
- Web UIは認証を持たない。bindアドレスはデフォルトで Tailscale インターフェース(検出できなければ 127.0.0.1)に限定する

## デプロイ

Mac mini + launchd での起動を想定。`deploy/com.sakin.web.plist.example` をひな形として使う(パス・環境変数は要編集)。デプロイ自動化はフェーズ1のスコープ外。

## 開発フロー

- mainへの直pushはしない。ブランチ(`feature/`, `fix/`, `docs/`, `chore/`, `refactor/`, `test/` + kebab-case)を切ってPRを作成し、CI(typecheck)を通してからスクワッシュマージする
- PRタイトルはConventional Commits形式(`feat(db): ideasテーブルを追加` 等)。スクワッシュマージ時にそのままコミットメッセージになる
- 詳細と理由は `docs/decisions.md` を参照

## License

MIT
