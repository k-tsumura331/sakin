import assert from "node:assert/strict";
import { test } from "node:test";
import { FILTER_OPTIONS, filterToQueryValue, parseFilterFromQuery } from "./filters.js";

test("every FILTER_OPTIONS value round-trips through parse/toQueryValue", () => {
  for (const option of FILTER_OPTIONS) {
    const filter = parseFilterFromQuery(option.value);
    assert.equal(filterToQueryValue(filter), option.value, `mismatch for ${option.value}`);
  }
});

test("unknown filter value defaults to ai-keep", () => {
  assert.deepEqual(parseFilterFromQuery("something-bogus"), { type: "ai-keep" });
  assert.deepEqual(parseFilterFromQuery("</script><script>alert(1)</script>"), { type: "ai-keep" });
});

test("undefined filter value defaults to ai-keep", () => {
  assert.deepEqual(parseFilterFromQuery(undefined), { type: "ai-keep" });
});

test("human-verdict with an invalid verdict falls back to ai-keep", () => {
  assert.deepEqual(parseFilterFromQuery("human-verdict:bogus"), { type: "ai-keep" });
});
