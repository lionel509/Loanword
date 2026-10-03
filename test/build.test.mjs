import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { DEFAULT_SETTINGS } from "../.testbuild/settings.mjs";

test("main.js is built", () => {
  assert.ok(existsSync("main.js"));
});

test("no personal path in the bundle or the defaults", () => {
  const js = readFileSync("main.js", "utf8");
  const def = JSON.stringify(DEFAULT_SETTINGS);
  for (const s of [js, def]) {
    assert.ok(!s.includes("lionelweng"));
    assert.ok(!s.includes("/Users/"));
  }
});
