import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeHtml, jsonForScript } from "./html.js";

test("escapeHtml escapes all HTML-significant characters", () => {
  assert.equal(
    escapeHtml(`<script>alert("x" & 'y')</script>`),
    "&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39;)&lt;/script&gt;",
  );
});

test("escapeHtml leaves plain text untouched", () => {
  assert.equal(escapeHtml("週末キャンパー向けの新規サービス"), "週末キャンパー向けの新規サービス");
});

test("jsonForScript neutralizes an embedded </script> sequence", () => {
  const malicious = "</script><script>alert(1)</script>";
  const serialized = jsonForScript(malicious);
  assert.ok(!serialized.includes("</script>"), "must not contain a literal </script>");
  assert.equal(JSON.parse(serialized.replace(/\\u003C/g, "<")), malicious);
});

test("jsonForScript round-trips plain values through JSON.parse", () => {
  const value = { a: 1, b: ["x", "y"] };
  assert.deepEqual(JSON.parse(jsonForScript(value)), value);
});
