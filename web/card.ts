import type { ReviewCard, Verdict } from "../db/adapter.js";
import { escapeHtml } from "./html.js";

export const VERDICT_LABEL: Record<Verdict, string> = {
  keep: "採用",
  drop: "見送り",
  maybe: "保留",
};

export function verdictBadge(prefix: string, verdict: Verdict | null): string {
  if (!verdict) return "";
  return `<span class="badge">${escapeHtml(prefix)}: ${VERDICT_LABEL[verdict]}</span>`;
}

export function renderCardFragment(
  theme: string,
  filterValue: string,
  card: ReviewCard | null,
): string {
  if (!card) {
    return `<div class="empty">これ以上、条件に合う案はありません。</div>`;
  }

  const detailHref = `/${encodeURIComponent(theme)}/ideas/${encodeURIComponent(card.id)}?filter=${encodeURIComponent(filterValue)}`;

  return `
    <div class="card" id="card-${escapeHtml(card.id)}" data-idea-id="${escapeHtml(card.id)}">
      <div>${verdictBadge("AI", card.aiVerdict)}${verdictBadge("あなた", card.humanVerdict)}</div>
      <h2>${escapeHtml(card.title)}</h2>
      <div class="body">${escapeHtml(card.body)}</div>
      <div class="body seed-terms">
        種用語: ${card.seedTerms.map(escapeHtml).join("・")}
      </div>
    </div>
    <div class="actions">
      <button type="button" class="btn-drop" onclick="sakinSwipe('drop')">見送り</button>
      <a class="button btn-detail" href="${detailHref}">詳細</a>
      <button type="button" class="btn-keep" onclick="sakinSwipe('keep')">採用</button>
    </div>
  `;
}
