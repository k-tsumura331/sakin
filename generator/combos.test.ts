import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCombos, pickCombo } from "./combos.js";

test("buildCombos produces every near×far pair exactly once", () => {
  const near = ["n1", "n2", "n3"];
  const far = ["f1", "f2"];
  const combos = buildCombos(near, far, "some-batch");
  assert.equal(combos.length, near.length * far.length);
  const asSet = new Set(combos.map(([n, f]) => `${n}|${f}`));
  assert.equal(asSet.size, combos.length, "no duplicate pairs");
  for (const n of near) {
    for (const f of far) {
      assert.ok(asSet.has(`${n}|${f}`), `missing pair ${n}/${f}`);
    }
  }
});

test("buildCombos is deterministic for the same seed", () => {
  const near = ["n1", "n2", "n3", "n4"];
  const far = ["f1", "f2", "f3"];
  const first = buildCombos(near, far, "batch-01");
  const second = buildCombos(near, far, "batch-01");
  assert.deepEqual(second, first);
});

test("buildCombos differs across seeds (order, not membership)", () => {
  const near = ["n1", "n2", "n3", "n4"];
  const far = ["f1", "f2", "f3"];
  const a = buildCombos(near, far, "batch-a");
  const b = buildCombos(near, far, "batch-b");
  assert.notDeepEqual(a, b);
});

test("pickCombo wraps around via modulo once the index exceeds the combo count", () => {
  const combos = buildCombos(["n1"], ["f1", "f2"], "wrap-seed");
  assert.equal(combos.length, 2);
  assert.deepEqual(pickCombo(combos, 0), combos[0]);
  assert.deepEqual(pickCombo(combos, 2), combos[0]);
  assert.deepEqual(pickCombo(combos, 3), combos[1]);
});
