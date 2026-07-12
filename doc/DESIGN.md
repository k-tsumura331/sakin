# DESIGN.md

sakin の UI スタイルガイド。スタイルはほぼ全て [`web/html.ts`](../web/html.ts) の `BASE_STYLE` 定数1箇所に集約されており、Bootstrap 等の外部 UI フレームワークや SCSS 変数、ViewComponent のような仕組みは使っていない。新しいスタイルを追加する場合もこのファイルに追記する。

## Overview

- スマホでの片手操作(スワイプ評価)を前提としたシンプルな SSR ページ
- Hono + テンプレート文字列でHTMLを生成し、`<style>${BASE_STYLE}</style>` を `layout()` (`web/html.ts`) から全ページに埋め込む
- ライト/ダークモードは `prefers-color-scheme` メディアクエリのみで切り替え(JS によるテーマ切り替えはない)

## Colors

意味色は「見送り(赤)」「詳細(グレー)」「採用(緑)」の3系統のみ。

| 用途 | ライト | ダーク |
|---|---|---|
| body background | `#f5f5f5` | `#16181c` |
| body text | `#1a1a1a` | `#eaeaea` |
| card background | `#ffffff` | `#24272e` |
| card border(ダークのみ) | なし | `1px solid #33363d` |
| badge background | `#eee` | `#3a3d44` |
| input border | `#ccc`(共通) | `#ccc`(共通、ダーク専用の上書きなし) |
| btn-drop(見送り) | bg `#ffe0e0` / text `#8a1f1f` | bg `#4a2222` / text `#ffb3b3` |
| btn-detail(詳細) | bg `#eee` / text `#333` | bg `#33363d` / text `#eaeaea` |
| btn-keep(採用) | bg `#dff5df` / text `#1f5f2a` | bg `#234a2a` / text `#b3f5bc` |

- `:root { color-scheme: light dark; }` を指定し、`@media (prefers-color-scheme: dark)` ブロックで各要素の上書きを追記する形式
- リンク色は `a { color: inherit; }` で本文色に統一

## Typography

- フォント: `-apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif`
- `h1`: `font-size: 1.1rem`
- `.card h2`: `font-size: 1.15rem`
- `.card .body`: `line-height: 1.5`, `white-space: pre-wrap`
- `.card .seed-terms`(`.body`と併用): `font-size: 0.85rem`, `opacity: 0.6`, `margin-top: 0.5rem`
- `.badge`: `font-size: 0.75rem`
- `.axis-row label`: `font-size: 0.9rem`
- select / textarea / input[type="text"]: `font-size: 1rem`

## Layout

- `body`: `padding: 1rem`, `margin: 0`
- `.card`, `.actions`, `form.detail-form`: `max-width: 480px`、`margin: 1rem auto` でセンタリング
- `.actions`: `display: flex; gap: 0.5rem;` でボタンを横並び等幅(`flex: 1`)配置
- `.verdict-choice`: `display: flex; gap: 0.5rem;` でラジオラベルを等幅配置
- `.axis-row`: `margin: 0.75rem 0`、ラベルは `display: flex; justify-content: space-between;` でラベルと現在値を両端揃え

## Elevation

- `.card` のみ影を持つ: ライトモード `box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1)`
- ダークモードでは影を使わず、代わりに `border: 1px solid #33363d` で境界を表現(暗背景での影は視認性が低いため)
- カード以外の要素に影は使わない

## Shapes(角丸)

- `.card`: `border-radius: 1rem`
- `.actions button` / `.actions a.button`: `border-radius: 0.75rem`
- select / textarea / input[type="text"] / `.verdict-choice label`: `border-radius: 0.5rem`
- `.badge`: `border-radius: 999px`(ピル型)

## Components

### カード(`.card`)
案の内容を表示する主要コンポーネント(`web/card.ts` の `renderCardFragment`、`web/pages.ts` の詳細ページで使用)。バッジ、タイトル(`h2`)、本文(`.body`)、種用語を含む。`touch-action: pan-y;` によりスワイプ操作中の縦スクロールと横ドラッグを両立させている。

### バッジ(`.badge`)
AI評価・人間評価を示す小さなピル型ラベル。`web/card.ts` の `verdictBadge()` が `"AI: 採用"` のような文字列で生成する。

### アクションボタン(`.actions`)
`.btn-drop` / `.btn-detail` / `.btn-keep` の3種。`.btn-drop`・`.btn-keep` は `<button>`、`.btn-detail` は `<a class="button">` だが同じスタイルクラス構造(`.actions button, .actions a.button`)で統一している。押下フィードバックとして `:active` 時に `transform: scale(0.96)` と `opacity: 0.8` を適用する。

### 詳細フォーム(`form.detail-form`)
評価軸ごとのスライダー(`.axis-row`、`<input type="range">`)、採用/保留/見送りのラジオ選択(`.verdict-choice`)、コメント欄(`textarea`)からなる(`web/pages.ts` の `renderDetailPage`)。

### スワイプ操作
CSSではなく `web/pages.ts` の `attachDrag()`(素の DOM API + `pointerdown/move/up`)で実装。閾値 `80px` を超えるドラッグで `translateX(600px)` / `translateX(-600px)` にアニメーションしてから採用/見送りを確定する。

### テーマ一覧(`.theme-list`)
テーマ数によらず常にトップページ(`/`)で表示される。各テーマ名・説明の下に `.theme-stats`(`.seed-terms` と同系統の控えめなテキスト)で案件数・AI高評価件数・自分の評価済み件数を表示する(`web/pages.ts` の `renderThemePicker`)。

## Do's and Don'ts

- 新しいスタイルは `BASE_STYLE`(`web/html.ts`)に追記する。別ファイルや別の置き場所を作らない
- インラインの `style="..."` 属性は使わず、クラスとして `BASE_STYLE` に定義する
- 意味色は「見送り(赤)」「詳細(グレー)」「採用(緑)」の3色運用を維持する
- ダーク対応が必要な色は `@media (prefers-color-scheme: dark)` ブロックに追記する(JSによるテーマ切り替えは導入しない)
