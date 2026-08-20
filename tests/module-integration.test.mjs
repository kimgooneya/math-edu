import test from "node:test";
import assert from "node:assert/strict";
import { parseRoute, routeToHash } from "../assets/js/router.js";
import {
  clearContentCache,
  loadAllContent,
  MANIFEST_PATHS,
} from "../assets/js/content-loader.js";

function validUnit(id, title = id) {
  return {
    id,
    title,
    framework: "CCSS-M",
    level: "Core",
    standards: ["CCSS.MATH.CONTENT.6.RP.A.1"],
    pathways: [],
    sources: ["https://corestandards.org/mathematics-standards/"],
    aliases: [],
    theory: [],
    problems: [],
  };
}

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
  const middleUnit = validUnit("middle-test", "중등 테스트");
  const highUnit = validUnit("high-test", "고등 테스트");

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

test("content loader recursively resolves submanifests and de-duplicates shared references", async () => {
  const originalFetch = globalThis.fetch;
  const requests = new Map();
  const unit = validUnit("nested-test", "재귀 테스트");

  globalThis.fetch = async (url) => {
    const path = String(url);
    requests.set(path, (requests.get(path) || 0) + 1);
    let value;
    if (path === MANIFEST_PATHS[0]) {
      value = { manifests: ["shared/manifest.json", { path: "shared/manifest.json" }] };
    } else if (path === MANIFEST_PATHS[1]) {
      value = { manifests: ["../middle/shared/manifest.json"] };
    } else if (path === "http://localhost/content/middle/shared/manifest.json") {
      value = { units: ["../nested-test.json", "../nested-test.json"] };
    } else if (path === "http://localhost/content/middle/nested-test.json") {
      value = unit;
    } else {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => value };
  };

  try {
    clearContentCache();
    const loaded = await loadAllContent({ force: true });
    assert.deepEqual(loaded.units.map(({ id }) => id), ["nested-test"]);
    assert.equal(loaded.manifests.length, 3, "두 root와 공유 submanifest를 각각 한 번 기록해야 합니다.");
    assert.equal(requests.get("http://localhost/content/middle/shared/manifest.json"), 1);
    assert.equal(requests.get("http://localhost/content/middle/nested-test.json"), 1);
  } finally {
    clearContentCache();
    globalThis.fetch = originalFetch;
  }
});

test("content loader rejects a recursive manifest cycle with the traversal path", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = String(url);
    let value;
    if (path === MANIFEST_PATHS[0]) value = { manifests: ["cycle/a.json"] };
    else if (path === "http://localhost/content/middle/cycle/a.json") value = { manifests: ["b.json"] };
    else if (path === "http://localhost/content/middle/cycle/b.json") value = { manifests: ["a.json"] };
    else return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => value };
  };

  try {
    clearContentCache();
    await assert.rejects(
      loadAllContent({ force: true }),
      (error) => /manifest 순환 참조/.test(error.message)
        && /cycle\/a\.json/.test(error.message)
        && /cycle\/b\.json/.test(error.message),
    );
  } finally {
    clearContentCache();
    globalThis.fetch = originalFetch;
  }
});

test("content loader reports malformed and unreachable submanifests", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    clearContentCache();
    globalThis.fetch = originalFetch;
  });

  await t.test("malformed manifests field", async () => {
    globalThis.fetch = async (url) => {
      const path = String(url);
      const value = path === MANIFEST_PATHS[0] ? { manifests: "child.json" } : { units: [] };
      return { ok: true, status: 200, json: async () => value };
    };
    clearContentCache();
    await assert.rejects(loadAllContent({ force: true }), /manifest의 manifests는 배열이어야 합니다/);
  });

  await t.test("unreachable nested manifest", async () => {
    globalThis.fetch = async (url) => {
      const path = String(url);
      if (path === MANIFEST_PATHS[0]) {
        return { ok: true, status: 200, json: async () => ({ manifests: ["missing.json"] }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
    clearContentCache();
    await assert.rejects(
      loadAllContent({ force: true }),
      (error) => /콘텐츠 요청에 실패했습니다 \(404\)/.test(error.message)
        && /content\/middle\/missing\.json/.test(error.source),
    );
  });

  await t.test("network failure keeps the requested source", async () => {
    globalThis.fetch = async (url) => {
      if (String(url) === MANIFEST_PATHS[0]) throw new TypeError("fetch failed");
      return { ok: true, status: 200, json: async () => ({ units: [] }) };
    };
    clearContentCache();
    await assert.rejects(
      loadAllContent({ force: true }),
      (error) => /네트워크 오류/.test(error.message) && error.source === MANIFEST_PATHS[0],
    );
  });

  await t.test("missing response is reported without dereferencing it", async () => {
    globalThis.fetch = async () => undefined;
    clearContentCache();
    await assert.rejects(
      loadAllContent({ force: true }),
      (error) => /상태 불명/.test(error.message) && error.source === MANIFEST_PATHS[0],
    );
  });
});
