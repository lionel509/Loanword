import test from "node:test";
import assert from "node:assert/strict";
import { fnv1a } from "../.testbuild/hash.mjs";

test("fnv1a known vectors", () => {
  assert.equal(fnv1a(""), 0x811c9dc5);
  assert.equal(fnv1a("a"), 0xe40c292c);
  assert.notEqual(fnv1a("ab"), fnv1a("ba"));
});
