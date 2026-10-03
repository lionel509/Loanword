import test from "node:test";
import assert from "node:assert/strict";
import { nextDripAt, shouldFire, pickDrip, nextLabel } from "../.testbuild/drip.mjs";

const card = (id) => ({ id, unit: 1, order: 0, script: "zh", form: id, meaning: id, swap: [] });
const S = (due, fresh, waitUntil = 0) => ({ due: due.map(card), fresh: fresh.map(card), waitUntil });

test("nextDripAt", () => {
  assert.equal(nextDripAt(0, 30, 75, 0), 1_800_000);
  assert.equal(nextDripAt(0, 30, 75, 0.9999), 4_500_000);
  assert.equal(nextDripAt(0, 75, 30, 0), 1_800_000);
  assert.equal(nextDripAt(1000, 5, 5, 0.5), 1000 + 300_000);
});

test("shouldFire", () => {
  const base = { focused: true, lastKeyAt: 0, paused: false, done: false, claimFree: true, nextAt: 1000 };
  assert.equal(shouldFire(base, 20_000, 10), true);
  for (const flip of [{ focused: false }, { paused: true }, { done: true }, { claimFree: false }, { nextAt: 20_001 }, { lastKeyAt: 10_001 }]) {
    assert.equal(shouldFire({ ...base, ...flip }, 20_000, 10), false, JSON.stringify(flip));
  }
  assert.equal(shouldFire({ ...base, lastKeyAt: 10_000 }, 20_000, 10), true);
});

test("pickDrip", () => {
  const ids = (q) => q.map((i) => [i.card.id, i.kind]);
  assert.deepEqual(ids(pickDrip(S(["d1", "d2", "d3", "d4"], ["f1", "f2"]), 3)), [["d1", "recall"], ["d2", "recall"], ["d3", "recall"]]);
  assert.deepEqual(ids(pickDrip(S(["d1"], ["f1", "f2"]), 3)), [["d1", "recall"], ["f1", "meet"]]);
  assert.deepEqual(ids(pickDrip(S([], ["f1"]), 3)), [["f1", "meet"]]);
  assert.deepEqual(pickDrip(S([], []), 3), []);
  const all = pickDrip(S(["d1", "d2", "d3", "d4"], ["f1", "f2"]), Infinity);
  assert.equal(all.length, 5);
  assert.deepEqual(ids(all).at(-1), ["f1", "meet"]);
});

test("nextLabel", () => {
  const now = 1_000_000_000;
  const s = S(["x"], []);
  assert.equal(nextLabel(s, now + 22.5 * 60e3, now), "next ~23 min");
  assert.equal(nextLabel(s, now, now), "next now");
  assert.equal(nextLabel(s, now - 1, now), "next now");
  assert.equal(nextLabel(s, now + 60e3, now), "next ~1 min");
  assert.equal(nextLabel(S([], [], now + 40 * 60e3), now + 20 * 60e3, now), "next ~40 min");
  assert.equal(nextLabel(S(["x"], [], now + 40 * 60e3), now + 20 * 60e3, now), "next ~20 min");
});
