import test from "node:test";
import assert from "node:assert/strict";
import { fnv1a, seeded } from "../.testbuild/hash.mjs";

test("fnv1a known vectors", () => {
  assert.equal(fnv1a(""), 0x811c9dc5);
  assert.equal(fnv1a("a"), 0xe40c292c);
  assert.notEqual(fnv1a("ab"), fnv1a("ba"));
});

test("seeded is deterministic and in [0,1)", () => {
  const a = seeded(7), b = seeded(7);
  for (let i = 0; i < 5; i++) {
    const x = a(), y = b();
    assert.equal(x, y);
    assert.ok(x >= 0 && x < 1);
  }
});
