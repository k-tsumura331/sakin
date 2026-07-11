import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parse } from "yaml";

export interface ThemeAxis {
  key: string;
  label: string;
  scale: number;
}

export interface ThemeDefinition {
  name: string;
  description: string;
  axes: ThemeAxis[];
  seedPolicy: {
    nearTermsPrompt: string;
    farTermsPrompt: string;
  };
  evaluationNotes: string | null;
}

// Theme names become filenames (SAKIN_HOME/themes/<name>.yaml) and URL path
// segments (web/:theme), so they're restricted to a safe, boring charset —
// this also rules out path traversal ("..", "/") by construction.
export const THEME_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function isValidThemeName(name: string): boolean {
  return THEME_NAME_PATTERN.test(name);
}

function fail(source: string, message: string): never {
  throw new Error(`Invalid theme definition (${source}): ${message}`);
}

function parseAxis(source: string, raw: unknown, index: number): ThemeAxis {
  if (typeof raw !== "object" || raw === null) {
    fail(source, `axes[${index}] must be an object`);
  }
  const { key, label, scale } = raw as Record<string, unknown>;
  if (typeof key !== "string" || key.length === 0) {
    fail(source, `axes[${index}].key must be a non-empty string`);
  }
  if (typeof label !== "string" || label.length === 0) {
    fail(source, `axes[${index}].label must be a non-empty string`);
  }
  if (typeof scale !== "number" || !Number.isInteger(scale) || scale < 2) {
    fail(source, `axes[${index}].scale must be an integer >= 2`);
  }
  return { key, label, scale };
}

export function parseThemeDefinition(source: string, raw: unknown): ThemeDefinition {
  if (typeof raw !== "object" || raw === null) {
    fail(source, "root must be a mapping");
  }
  const doc = raw as Record<string, unknown>;

  const { name, description, axes, seed_policy, evaluation_notes } = doc;

  if (typeof name !== "string" || name.length === 0) {
    fail(source, "name must be a non-empty string");
  }
  if (!isValidThemeName(name)) {
    fail(source, `name must match ${THEME_NAME_PATTERN} (got "${name}")`);
  }
  if (typeof description !== "string" || description.length === 0) {
    fail(source, "description must be a non-empty string");
  }
  if (!Array.isArray(axes) || axes.length === 0) {
    fail(source, "axes must be a non-empty array");
  }

  const parsedAxes = axes.map((axis, i) => parseAxis(source, axis, i));
  const seenKeys = new Set<string>();
  for (const axis of parsedAxes) {
    if (seenKeys.has(axis.key)) {
      fail(source, `duplicate axis key "${axis.key}"`);
    }
    seenKeys.add(axis.key);
  }

  if (typeof seed_policy !== "object" || seed_policy === null) {
    fail(source, "seed_policy must be an object");
  }
  const { near_terms_prompt, far_terms_prompt } = seed_policy as Record<string, unknown>;
  if (typeof near_terms_prompt !== "string" || near_terms_prompt.length === 0) {
    fail(source, "seed_policy.near_terms_prompt must be a non-empty string");
  }
  if (typeof far_terms_prompt !== "string" || far_terms_prompt.length === 0) {
    fail(source, "seed_policy.far_terms_prompt must be a non-empty string");
  }

  if (evaluation_notes !== undefined && typeof evaluation_notes !== "string") {
    fail(source, "evaluation_notes must be a string when present");
  }

  return {
    name,
    description,
    axes: parsedAxes,
    seedPolicy: {
      nearTermsPrompt: near_terms_prompt,
      farTermsPrompt: far_terms_prompt,
    },
    evaluationNotes: evaluation_notes ?? null,
  };
}

export function loadThemeFile(path: string): ThemeDefinition {
  const raw: unknown = parse(readFileSync(path, "utf8"));
  const theme = parseThemeDefinition(path, raw);
  const expectedFile = `${theme.name}.yaml`;
  if (basename(path) !== expectedFile) {
    fail(path, `file name must match theme name (expected "${expectedFile}")`);
  }
  return theme;
}

export function loadThemesDir(dir: string): ThemeDefinition[] {
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".yaml"))
    .map((entry) => loadThemeFile(join(dir, entry)));
}
