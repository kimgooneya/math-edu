import test from "node:test";
import assert from "node:assert/strict";
import { parseRoute, routeToHash } from "../assets/js/router.js";
import {
  clearContentCache,
  loadAllContent,
  MANIFEST_PATHS,
} from "../assets/js/content-loader.js";

test("all app modules resolve their shared imports", async () => {
  const app = await import("../assets/js/app.js");
  assert.equal(typeof app.initApp, "function");
  assert.equal(typeof app.getAppState, "function");
});

test("hash routes round-trip and reject unknown paths", () => {
  assert.deepEqual(parseRoute("#/"), { name: "home", path: "#/" });
  assert.equal(parseRoute("#/catalog").name, "catalog");
  assert.equal(parseRoute("#/progress").name, "progress");
  assert.deepEqual(parseRoute("#/learn/high-plane-vectors"), {
    name: "learn",
    unitId: "high-plane-vectors",
    path: "#/learn/high-plane-vectors",
  });
  assert.equal(parseRoute("#/unknown").name, "not-found");
  assert.equal(routeToHash("learn", "한글 id"), "#/learn/%ED%95%9C%EA%B8%80%20id");
});

test("content loader resolves unit paths relative to each manifest", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  const middleUnit = { id: "middle-test", title: "중등 테스트", theory: [], problems: [] };
  const highUnit = { id: "high-test", title: "고등 테스트", theory: [], problems: [] };

  globalThis.fetch = async (url) => {
    const path = String(url);
    requested.push(path);
    let value;
    if (path === MANIFEST_PATHS[0]) value = { units: ["middle-test.json"] };
    else if (path === MANIFEST_PATHS[1]) value = { units: ["high-test.json"] };
    else if (path.endsWith("/content/middle/middle-test.json")) value = middleUnit;
    else if (path.endsWith("/content/high/high-test.json")) value = highUnit;
    else return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => value };
  };

  try {
    clearContentCache();
    const loaded = await loadAllContent({ force: true });
    assert.deepEqual(loaded.units.map((unit) => unit.id), ["middle-test", "high-test"]);
    assert.equal(loaded.byId.get("high-test"), highUnit);
    assert.ok(requested.some((path) => path === "http://localhost/content/middle/middle-test.json"));
    assert.ok(requested.some((path) => path === "http://localhost/content/high/high-test.json"));
  } finally {
    clearContentCache();
    globalThis.fetch = originalFetch;
  }
});
