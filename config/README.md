# config

環境変数の解決(`env.ts`: `SAKIN_HOME`、LLMバックエンド、モデルエイリアス、bindアドレスの自動検出など)と、テーマYAMLのローダー/バリデータ(`themes.ts`)。

- `env.ts`: `SAKIN_HOME` 配下のパス解決、`SAKIN_LLM_BACKEND` / `SAKIN_DRY_RUN` / `SAKIN_HUMAN_NAME` などの環境変数を型付きで解決する。Tailscaleインターフェースの自動検出(`detectTailscaleAddress`)もここにある
- `themes.ts`: `themes/*.yaml` をパースして `ThemeDefinition` に変換する。テーマ名の文字種チェック(`isValidThemeName`)はファイル名・URLパスの両方で使われる境界防御
