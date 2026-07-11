# sakin

Mass-generate ideas on a narrow theme with cheap AI models, triage them with AI scoring, and swipe-review the survivors on your phone. Human and AI evaluations are stored separately and independently filterable. Named after 砂金 (gold panning).

安価なAIに特定テーマの案を大量生成させ、AI一次評価と人間のスワイプ評価で選別する仕組み。

## 目的

- 狭く定義したテーマ(例: 架空テーマ「週末キャンパー向けの新規サービス」)に対し、種用語の組み合わせから数千件規模の案を機械的に生成する
- AIによる一次採点で母集団を絞り、人間は上位2〜3割だけを高速レビュー(スワイプ)する
- 人間評価とAI評価を別レコードとして保存し、「AIと人間で評価が割れた案」のような横断フィルタを可能にする

## セットアップ

```sh
npm install
npm run build
cp .env.example .env   # 値を編集
```

主要な環境変数(詳細は `.env.example` を参照):

| 変数 | 説明 |
|---|---|
| `SAKIN_HOME` | 実テーマ・生成データ・DB本体の置き場所(デフォルト `~/sakin-data`)。リポジトリには含めない |
| `SAKIN_LLM_BACKEND` | `claude-cli`(デフォルト、サブスクリプション利用枠) か `anthropic-api` |
| `SAKIN_HUMAN_NAME` | Web UIでの人間評価の記録名(`evaluations.evaluator = human:<この値>`)。web起動に必須 |
| `SAKIN_DRY_RUN` | `1` にするとLLM呼び出しをモック応答に差し替える(動作確認用、実課金・実利用枠を消費しない) |
| `SAKIN_BIND_ADDRESS` | Web UIのbindアドレス。未設定ならTailscaleインターフェースを自動検出、見つからなければ `127.0.0.1` |

## テーマを定義する

`SAKIN_HOME/themes/<テーマ名>.yaml` として配置する(サンプルは `themes/example.yaml`)。

```yaml
name: example-service
description: "サンプル: 架空テーマ「週末キャンパー向けの新規サービス」"
axes:
  - { key: novelty, label: 新規性, scale: 5 }
  - { key: clarity, label: 具体性, scale: 5 }
  - { key: pain, label: 課題の切実さ, scale: 5 }
  - { key: feasibility, label: 実現性, scale: 5 }
  - { key: monetization, label: 収益筋, scale: 5 }
seed_policy:
  near_terms_prompt: テーマに直接関連する用語を出す指示文
  far_terms_prompt: テーマから遠い分野の用語を出す指示文
evaluation_notes: |
  AI採点時の追加指示(例: 法規制に抵触しそうな案は feasibility を1点にする)
```

- `axes` はテーマごとに自由に定義できる(キー・ラベル・段階数)。AI採点プロンプトは軸定義から自動生成される
- `name` はファイル名と一致させ、英数字・ハイフン・アンダースコアのみ使用可能
- ファイル名以外(`name.yaml`)は `.gitignore` で除外される。テーマ名は `[a-zA-Z0-9_-]+` のみ

## 使い方(パイプライン)

```sh
# 1. テーマをDBに同期
npm run db:sync-themes

# 2. 案を生成(種用語生成 → 組み合わせ → 案生成)。途中で止まっても再実行で続きから再開する
npm run generate -- --theme example-service --batch 2026-07-11-01 --count 1000

# 3. 生成したJSONLをDBへ取り込む(同一IDは自動スキップ、複数回実行しても安全)
npm run db:import -- ~/sakin-data/jsonl/2026-07-11-01.jsonl

# 4. AI一次評価を実行(デフォルトは100件ずつ。全件処理は --all)
npm run evaluate -- --theme example-service --limit 200
npm run evaluate -- --theme example-service --all

# 5. Web UIを起動し、スマホ(Tailscale経由)からスワイプでレビュー
npm run web
```

- 生成・評価は実行前に対象件数(anthropic-apiバックエンド時は概算コストも)を表示する
- APIの利用枠エラー・レート制限が発生した場合、その場で停止し進捗を保存する。同じコマンドを再実行すれば続きから再開する
- プロンプトを改良して再生成したい場合は、旧バッチの未評価分を削除してから入れ替える:
  ```sh
  npm run db:prune -- --theme example-service --batch 2026-07-11-01 --unevaluated-only
  ```
  (評価済みの案は消えない)

## Web UIのフィルタ

- **AI高評価のみ**: AIの最新評価が keep の案
- **人間未評価のみ**: まだ自分が評価していない案
- **AIと人間で評価が割れた案**: AIと自分の最新verdictが一致しない案
- **verdict別**: 自分の過去の評価(keep/drop/maybe)で絞り込み

カードは右スワイプ(または「採用」ボタン)= keep、左スワイプ(または「見送り」ボタン)= drop。タップで詳細画面を開くと、評価軸ごとのスライダーとコメント欄で詳細な評価を記録できる(スワイプでの簡易評価を上書きする再評価として扱われる)。

## 想定規模

1テーマあたり数千件。人間の全件レビューは想定せず、AI一次評価による絞り込みを前提とする。

## セキュリティ / 公開ポリシー

- 実テーマ・生成データ・DBは `SAKIN_HOME`(デフォルト `~/sakin-data`)に置き、リポジトリには一切含めない。`.gitignore` は二重の保険
- Web UIは認証を持たない。Tailscaleネットワーク内での利用を前提とし、bindアドレスはデフォルトで Tailscale インターフェース(検出できなければ 127.0.0.1)に限定する。自宅LAN全体に晒したい場合のみ `SAKIN_BIND_ADDRESS` を明示的に設定すること

## デプロイ

Mac mini + launchd での起動を想定。`deploy/com.sakin.web.plist.example` をひな形として使う(パス・環境変数は要編集)。

## 開発に参加する

コードに変更を加える場合は [CONTRIBUTING.md](CONTRIBUTING.md) を参照(アーキテクチャ、開発環境セットアップ、ブランチ運用など)。設計判断の記録は [docs/decisions.md](docs/decisions.md)。

## License

MIT
