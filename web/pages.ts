import type { ThemeDefinition } from "../config/themes.js";
import type { ReviewCard, ThemeSummary, Verdict } from "../db/adapter.js";
import { VERDICT_LABEL, verdictBadge } from "./card.js";
import { FILTER_OPTIONS } from "./filters.js";
import { escapeHtml, jsonForScript, layout } from "./html.js";

function clientScript(theme: string, filterValue: string): string {
  return `
    <script>
      const SAKIN_THEME = ${jsonForScript(theme)};
      const SAKIN_FILTER = ${jsonForScript(filterValue)};

      async function sakinSwipe(verdict) {
        const container = document.getElementById("card-slot");
        const cardEl = container.querySelector(".card");
        if (!cardEl) return;
        const ideaId = cardEl.dataset.ideaId;
        const url = "/" + encodeURIComponent(SAKIN_THEME) + "/ideas/" + encodeURIComponent(ideaId) +
          "/verdict?filter=" + encodeURIComponent(SAKIN_FILTER);
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verdict }),
        });
        container.innerHTML = await res.text();
        attachDrag();
      }

      function onFilterChange(select) {
        window.location.href = "/" + encodeURIComponent(SAKIN_THEME) + "?filter=" + encodeURIComponent(select.value);
      }

      function attachDrag() {
        const card = document.querySelector(".card");
        if (!card) return;
        let startX = 0, currentX = 0, dragging = false;
        const threshold = 80;

        function onDown(e) {
          dragging = true;
          startX = e.touches ? e.touches[0].clientX : e.clientX;
          card.style.transition = "none";
        }
        function onMove(e) {
          if (!dragging) return;
          currentX = (e.touches ? e.touches[0].clientX : e.clientX) - startX;
          card.style.transform = "translateX(" + currentX + "px) rotate(" + currentX / 20 + "deg)";
        }
        function onUp() {
          if (!dragging) return;
          dragging = false;
          card.style.transition = "transform 0.2s";
          if (currentX > threshold) {
            card.style.transform = "translateX(600px) rotate(20deg)";
            setTimeout(() => sakinSwipe("keep"), 150);
          } else if (currentX < -threshold) {
            card.style.transform = "translateX(-600px) rotate(-20deg)";
            setTimeout(() => sakinSwipe("drop"), 150);
          } else {
            card.style.transform = "translateX(0) rotate(0)";
          }
          currentX = 0;
        }

        card.addEventListener("pointerdown", onDown);
        card.addEventListener("pointermove", onMove);
        card.addEventListener("pointerup", onUp);
        card.addEventListener("pointercancel", onUp);
      }
      attachDrag();
    </script>
  `;
}

export function renderSwipePage(
  theme: string,
  filterValue: string,
  initialCardHtml: string,
): string {
  const optionsHtml = FILTER_OPTIONS.map(
    (opt) =>
      `<option value="${escapeHtml(opt.value)}" ${opt.value === filterValue ? "selected" : ""}>${escapeHtml(opt.label)}</option>`,
  ).join("");

  return layout(
    `sakin - ${theme}`,
    `
    <h1>${escapeHtml(theme)}</h1>
    <select onchange="onFilterChange(this)">${optionsHtml}</select>
    <div id="card-slot">${initialCardHtml}</div>
    ${clientScript(theme, filterValue)}
  `,
  );
}

export function renderDetailPage(
  theme: ThemeDefinition,
  filterValue: string,
  card: ReviewCard,
): string {
  const axisRows = theme.axes
    .map((axis) => {
      const current = card.humanScores?.[axis.key] ?? Math.ceil(axis.scale / 2);
      return `
        <div class="axis-row">
          <label for="axis-${axis.key}"><span>${escapeHtml(axis.label)}</span><span id="axis-${axis.key}-value">${current}</span></label>
          <input type="range" id="axis-${axis.key}" name="axis_${axis.key}" min="1" max="${axis.scale}" value="${current}"
            oninput="document.getElementById('axis-${axis.key}-value').textContent = this.value">
        </div>
      `;
    })
    .join("");

  const verdicts: Verdict[] = ["keep", "maybe", "drop"];
  const verdictChoices = verdicts
    .map((v) => {
      const checked = card.humanVerdict ? card.humanVerdict === v : v === "maybe";
      return `<label><input type="radio" name="verdict" value="${v}" ${checked ? "checked" : ""}> ${VERDICT_LABEL[v]}</label>`;
    })
    .join("");

  const backHref = `/${encodeURIComponent(theme.name)}?filter=${encodeURIComponent(filterValue)}`;
  const actionHref = `/${encodeURIComponent(theme.name)}/ideas/${encodeURIComponent(card.id)}/evaluate?filter=${encodeURIComponent(filterValue)}`;

  return layout(
    `詳細 - ${card.title}`,
    `
    <a href="${backHref}">← 戻る</a>
    <div class="card">
      <div>${verdictBadge("AI", card.aiVerdict)}${verdictBadge("あなた", card.humanVerdict)}</div>
      <h2>${escapeHtml(card.title)}</h2>
      <div class="body">${escapeHtml(card.body)}</div>
      <div class="body seed-terms">
        種用語: ${card.seedTerms.map(escapeHtml).join("・")}
      </div>
    </div>
    <form class="detail-form" method="post" action="${actionHref}">
      ${axisRows}
      <div class="verdict-choice">${verdictChoices}</div>
      <textarea name="comment" rows="3" placeholder="コメント(任意)">${escapeHtml(card.humanComment ?? "")}</textarea>
      <div class="actions"><button type="submit" class="btn-keep">保存</button></div>
    </form>
  `,
  );
}

export function renderThemePicker(themes: ThemeSummary[]): string {
  if (themes.length === 0) {
    return layout(
      "sakin",
      `<div class="empty">テーマがまだ登録されていません。db:sync-themes を実行してください。</div>`,
    );
  }
  const items = themes
    .map(
      (t) => `
      <li>
        <a href="/${encodeURIComponent(t.name)}">${escapeHtml(t.name)} — ${escapeHtml(t.description)}</a>
        <div class="theme-stats">案 ${t.ideaCount}件 / AI高評価 ${t.aiKeepCount}件 / 自分の評価済み ${t.humanEvaluatedCount}件</div>
      </li>
    `,
    )
    .join("");
  return layout("sakin", `<h1>テーマを選択</h1><ul class="theme-list">${items}</ul>`);
}
