import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidThemeName, parseThemeDefinition } from "./themes.js";

function validRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "example-service",
    description: "サンプルテーマ",
    axes: [
      { key: "novelty", label: "新規性", scale: 5 },
      { key: "clarity", label: "具体性", scale: 5 },
    ],
    seed_policy: {
      near_terms_prompt: "近い用語を出して",
      far_terms_prompt: "遠い用語を出して",
    },
    evaluation_notes: "注意事項",
    ...overrides,
  };
}

test("parses a valid theme definition", () => {
  const theme = parseThemeDefinition("test", validRaw());
  assert.equal(theme.name, "example-service");
  assert.equal(theme.axes.length, 2);
  assert.equal(theme.seedPolicy.nearTermsPrompt, "近い用語を出して");
  assert.equal(theme.seedPolicy.farTermsPrompt, "遠い用語を出して");
  assert.equal(theme.evaluationNotes, "注意事項");
});

test("evaluation_notes is optional and defaults to null", () => {
  const raw = validRaw();
  delete raw.evaluation_notes;
  const theme = parseThemeDefinition("test", raw);
  assert.equal(theme.evaluationNotes, null);
});

test("rejects a name containing path separators", () => {
  assert.throws(() => parseThemeDefinition("test", validRaw({ name: "../../etc/passwd" })));
});

test("rejects a name with a dot", () => {
  assert.throws(() => parseThemeDefinition("test", validRaw({ name: "foo.bar" })));
});

test("rejects duplicate axis keys", () => {
  const raw = validRaw({
    axes: [
      { key: "novelty", label: "新規性", scale: 5 },
      { key: "novelty", label: "重複", scale: 5 },
    ],
  });
  assert.throws(() => parseThemeDefinition("test", raw));
});

test("rejects an axis scale below 2", () => {
  const raw = validRaw({ axes: [{ key: "novelty", label: "新規性", scale: 1 }] });
  assert.throws(() => parseThemeDefinition("test", raw));
});

test("rejects a missing seed_policy field", () => {
  const raw = validRaw({ seed_policy: { near_terms_prompt: "近い用語を出して" } });
  assert.throws(() => parseThemeDefinition("test", raw));
});

test("isValidThemeName accepts alphanumeric/hyphen/underscore only", () => {
  assert.equal(isValidThemeName("example-service"), true);
  assert.equal(isValidThemeName("example_service_2"), true);
  assert.equal(isValidThemeName("../../etc/passwd"), false);
  assert.equal(isValidThemeName("foo.bar"), false);
  assert.equal(isValidThemeName(""), false);
});
