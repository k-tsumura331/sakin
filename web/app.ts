import { join } from "node:path";
import { Hono } from "hono";
import { ulid } from "ulid";
import { resolveHumanEvaluator, sakinPaths } from "../config/env.js";
import { isValidThemeName, loadThemeFile } from "../config/themes.js";
import { openDb, type Verdict } from "../db/adapter.js";
import { renderCardFragment } from "./card.js";
import { filterToQueryValue, parseFilterFromQuery } from "./filters.js";
import { escapeHtml } from "./html.js";
import { renderDetailPage, renderSwipePage, renderThemePicker } from "./pages.js";
import { createRateLimiter } from "./rate-limit.js";

// Backstop against a runaway client/script hammering the two mutating
// routes, not per-user fairness (see web/rate-limit.ts). One shared
// instance so both routes draw from the same budget/window.
const writeRateLimiter = createRateLimiter({ windowMs: 60_000, max: 300 });

const VALID_VERDICTS: Verdict[] = ["keep", "drop", "maybe"];

function isVerdict(value: unknown): value is Verdict {
  return typeof value === "string" && (VALID_VERDICTS as string[]).includes(value);
}

export function createApp() {
  const app = new Hono();
  const paths = sakinPaths();
  const humanEvaluator = resolveHumanEvaluator();

  // Theme names become filesystem paths (SAKIN_HOME/themes/<name>.yaml) and
  // are embedded in rendered HTML/JS, so every :theme route rejects
  // anything that doesn't match the same safe charset enforced when a
  // theme is loaded (config/themes.ts) — before it ever touches a path or
  // a template.
  app.use("/:theme/*", async (c, next) => {
    if (!isValidThemeName(c.req.param("theme"))) {
      return c.text("Invalid theme name", 400);
    }
    await next();
  });

  app.get("/", async (c) => {
    const db = await openDb(paths.dbFile);
    try {
      await db.migrate();
      const themes = await db.listThemes(humanEvaluator);
      return c.html(renderThemePicker(themes));
    } finally {
      await db.close();
    }
  });

  app.get("/:theme", async (c) => {
    const themeName = c.req.param("theme");
    if (!isValidThemeName(themeName)) {
      return c.text("Invalid theme name", 400);
    }
    const filter = parseFilterFromQuery(c.req.query("filter"));
    const filterValue = filterToQueryValue(filter);

    const db = await openDb(paths.dbFile);
    try {
      await db.migrate();
      const card = await db.getNextIdeaForReview(themeName, filter, humanEvaluator, null);
      const cardHtml = renderCardFragment(themeName, filterValue, card);
      return c.html(renderSwipePage(themeName, filterValue, cardHtml));
    } finally {
      await db.close();
    }
  });

  app.get("/:theme/card", async (c) => {
    const themeName = c.req.param("theme");
    const filter = parseFilterFromQuery(c.req.query("filter"));
    const filterValue = filterToQueryValue(filter);
    const after = c.req.query("after") ?? null;

    const db = await openDb(paths.dbFile);
    try {
      await db.migrate();
      const card = await db.getNextIdeaForReview(themeName, filter, humanEvaluator, after);
      return c.html(renderCardFragment(themeName, filterValue, card));
    } finally {
      await db.close();
    }
  });

  app.post("/:theme/ideas/:id/verdict", writeRateLimiter, async (c) => {
    const themeName = c.req.param("theme");
    const ideaId = c.req.param("id");
    const filter = parseFilterFromQuery(c.req.query("filter"));
    const filterValue = filterToQueryValue(filter);

    const body = (await c.req.json().catch(() => null)) as { verdict?: unknown } | null;
    if (!body || !isVerdict(body.verdict)) {
      return c.text("Invalid verdict", 400);
    }

    const db = await openDb(paths.dbFile);
    try {
      await db.migrate();
      if (!(await db.ideaExists(themeName, ideaId))) {
        return c.text("Not found", 404);
      }
      await db.insertEvaluation({
        id: ulid(),
        ideaId,
        evaluator: humanEvaluator,
        scores: {},
        verdict: body.verdict,
        comment: null,
        createdAt: new Date().toISOString(),
      });
      const next = await db.getNextIdeaForReview(themeName, filter, humanEvaluator, ideaId);
      return c.html(renderCardFragment(themeName, filterValue, next));
    } finally {
      await db.close();
    }
  });

  app.get("/:theme/ideas/:id", async (c) => {
    const themeName = c.req.param("theme");
    const ideaId = c.req.param("id");
    const filter = parseFilterFromQuery(c.req.query("filter"));
    const filterValue = filterToQueryValue(filter);

    const theme = loadThemeFile(join(paths.themesDir, `${themeName}.yaml`));
    const db = await openDb(paths.dbFile);
    try {
      await db.migrate();
      const card = await db.getReviewCard(themeName, ideaId, humanEvaluator);
      if (!card) {
        return c.text("Not found", 404);
      }
      return c.html(renderDetailPage(theme, filterValue, card));
    } finally {
      await db.close();
    }
  });

  app.post("/:theme/ideas/:id/evaluate", writeRateLimiter, async (c) => {
    const themeName = c.req.param("theme");
    const ideaId = c.req.param("id");
    const filter = parseFilterFromQuery(c.req.query("filter"));
    const filterValue = filterToQueryValue(filter);

    const theme = loadThemeFile(join(paths.themesDir, `${themeName}.yaml`));
    const form = await c.req.parseBody();

    const scores: Record<string, number> = {};
    for (const axis of theme.axes) {
      const raw = form[`axis_${axis.key}`];
      const value = Number(raw);
      if (typeof raw !== "string" || !Number.isInteger(value) || value < 1 || value > axis.scale) {
        return c.text(`Invalid score for axis "${axis.key}"`, 400);
      }
      scores[axis.key] = value;
    }

    const verdict = form.verdict;
    if (!isVerdict(verdict)) {
      return c.text("Invalid verdict", 400);
    }
    const comment =
      typeof form.comment === "string" && form.comment.length > 0 ? form.comment : null;

    const db = await openDb(paths.dbFile);
    try {
      await db.migrate();
      if (!(await db.ideaExists(themeName, ideaId))) {
        return c.text("Not found", 404);
      }
      await db.insertEvaluation({
        id: ulid(),
        ideaId,
        evaluator: humanEvaluator,
        scores,
        verdict,
        comment,
        createdAt: new Date().toISOString(),
      });
    } finally {
      await db.close();
    }

    return c.redirect(
      `/${encodeURIComponent(themeName)}?filter=${encodeURIComponent(filterValue)}`,
    );
  });

  app.notFound((c) => c.html(`<p>${escapeHtml("Not found")}</p>`, 404));

  // Without this, an unexpected exception (e.g. a malformed theme YAML, a
  // DB error) falls through to Hono's default handler, which echoes the raw
  // error message/stack to the client. This tool has no auth, so keep
  // internals server-side and log them instead.
  app.onError((err, c) => {
    console.error(err);
    return c.text("Internal error", 500);
  });

  return app;
}
