import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDir, "..");
const contentRoot = join(projectRoot, "content");
const rootManifestPaths = [
  join(contentRoot, "middle", "manifest.json"),
  join(contentRoot, "high", "manifest.json"),
];
const expectedHighSubmanifests = ["core", "ap", "ib", "post-ap"]
  .map((directory) => join(contentRoot, "high", directory, "manifest.json"));
const supportedTypes = new Set([
  "choice",
  "integer",
  "number",
  "rational",
  "orderedPair",
  "vector",
  "unorderedSet",
]);
const frameworks = new Set(["CCSS-M", "College Board AP", "IB DP", "Dual Enrollment"]);
const levels = new Set(["Core", "Honors", "AP", "IB SL", "IB HL", "Post-AP"]);

function displayPath(path) {
  return relative(projectRoot, path).split(sep).join("/");
}

function manifestEntryPath(entry, source, field, index) {
  const value = typeof entry === "string"
    ? entry
    : entry && typeof entry === "object"
      ? entry.path || entry.file || entry.href || entry.url
      : "";
  assert.equal(typeof value, "string", `${displayPath(source)}: ${field}[${index}] 경로는 문자열이어야 합니다.`);
  assert.ok(value.trim(), `${displayPath(source)}: ${field}[${index}] 경로가 비어 있습니다.`);
  assert.ok(!isAbsolute(value), `${displayPath(source)}: ${field}[${index}]는 상대 경로여야 합니다: ${value}`);
  return value;
}

function resolveInsideContent(source, entry, field, index) {
  const resolved = resolve(dirname(source), manifestEntryPath(entry, source, field, index));
  const fromRoot = relative(contentRoot, resolved);
  assert.ok(
    fromRoot && fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot),
    `${displayPath(source)}: ${field}[${index}]가 content/ 밖을 가리킵니다: ${entry}`,
  );
  return resolved;
}

async function readJson(path, kind = "JSON") {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    assert.fail(`${displayPath(path)}: ${kind} 파일을 읽을 수 없습니다 (${error.code || error.message}).`);
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    assert.fail(`${displayPath(path)}: 올바른 JSON이 아닙니다 (${error.message}).`);
  }
}

async function loadAllUnits() {
  const units = [];
  const manifests = [];
  const visitedManifests = new Set();
  const activeManifests = [];
  const visitedUnits = new Set();

  async function visitManifest(manifestPath) {
    const cycleIndex = activeManifests.indexOf(manifestPath);
    if (cycleIndex !== -1) {
      const cycle = [...activeManifests.slice(cycleIndex), manifestPath].map(displayPath).join(" -> ");
      assert.fail(`manifest 순환 참조: ${cycle}`);
    }
    if (visitedManifests.has(manifestPath)) return;

    activeManifests.push(manifestPath);
    const manifest = await readJson(manifestPath, "manifest");
    assert.equal(manifest?.schemaVersion, 1, `${displayPath(manifestPath)}: schemaVersion은 1이어야 합니다.`);
    for (const field of ["units", "manifests"]) {
      if (manifest[field] !== undefined) {
        assert.ok(Array.isArray(manifest[field]), `${displayPath(manifestPath)}: ${field} 배열이 필요합니다.`);
      }
    }
    assert.ok(
      Array.isArray(manifest.units) || Array.isArray(manifest.manifests),
      `${displayPath(manifestPath)}: units 또는 manifests 배열이 필요합니다.`,
    );
    manifests.push(manifestPath);

    for (const [index, entry] of (manifest.units || []).entries()) {
      const unitPath = resolveInsideContent(manifestPath, entry, "units", index);
      if (visitedUnits.has(unitPath)) continue;
      visitedUnits.add(unitPath);
      units.push({ path: unitPath, data: await readJson(unitPath, "단원") });
    }
    for (const [index, entry] of (manifest.manifests || []).entries()) {
      await visitManifest(resolveInsideContent(manifestPath, entry, "manifests", index));
    }

    activeManifests.pop();
    visitedManifests.add(manifestPath);
  }

  for (const manifestPath of rootManifestPaths) await visitManifest(manifestPath);
  return { units, manifests };
}

function assertStringArray(unit, path, field, { nonempty = false, https = false } = {}) {
  const label = `${unit.id || displayPath(path)}: ${field}`;
  assert.ok(Array.isArray(unit[field]), `${label}는 문자열 배열이어야 합니다.`);
  if (nonempty) assert.ok(unit[field].length > 0, `${label}에는 하나 이상의 값이 필요합니다.`);
  unit[field].forEach((value, index) => {
    assert.equal(typeof value, "string", `${label}[${index}]는 문자열이어야 합니다.`);
    assert.ok(value.trim(), `${label}[${index}]가 비어 있습니다.`);
    if (https) {
      assert.doesNotThrow(() => {
        const url = new URL(value);
        if (url.protocol !== "https:") throw new Error("https가 아님");
      }, `${label}[${index}]는 유효한 https URL이어야 합니다: ${value}`);
    }
  });
}

function countUnits(units, predicate) {
  return units.filter(({ data }) => predicate(data)).length;
}

function assertMinimum(units, label, minimum, predicate) {
  const actual = countUnits(units, predicate);
  assert.ok(actual >= minimum, `${label}: 최소 ${minimum}개 단원이 필요하지만 ${actual}개입니다.`);
}

test("recursive manifests expose every required curriculum collection", async () => {
  const { units, manifests } = await loadAllUnits();
  const loaded = new Set(manifests);
  for (const path of expectedHighSubmanifests) {
    assert.ok(loaded.has(path), `content/high/manifest.json이 ${displayPath(path)}을 재귀 포함해야 합니다.`);
  }
  assert.ok(units.length > 0, "재귀 manifest에서 학습 단원을 하나도 찾지 못했습니다.");
});

test("all learning units satisfy the shared content and metadata contract", async () => {
  const { units } = await loadAllUnits();
  const ids = new Set();
  const problemIds = new Set();

  for (const { path, data: unit } of units) {
    const location = displayPath(path);
    assert.equal(unit.schemaVersion, 1, `${location}: schemaVersion은 1이어야 합니다.`);
    assert.match(unit.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${location}: unit id는 kebab-case여야 합니다.`);
    assert.ok(!ids.has(unit.id), `${location}: 중복 단원 ID ${unit.id}`);
    ids.add(unit.id);
    assert.ok(["middle", "high"].includes(unit.stage), `${unit.id}: stage는 middle 또는 high여야 합니다.`);
    for (const field of ["title", "grade", "course", "domain", "description"]) {
      assert.equal(typeof unit[field], "string", `${unit.id}: ${field}는 문자열이어야 합니다.`);
      assert.ok(unit[field].trim(), `${unit.id}: ${field}가 비어 있습니다.`);
    }
    assert.ok(frameworks.has(unit.framework), `${unit.id}: 허용되지 않은 framework ${unit.framework}`);
    assert.ok(levels.has(unit.level), `${unit.id}: 허용되지 않은 level ${unit.level}`);
    assertStringArray(unit, path, "standards", { nonempty: true });
    assertStringArray(unit, path, "pathways");
    assertStringArray(unit, path, "sources", { https: true });
    assertStringArray(unit, path, "aliases");
    assert.ok(Number.isFinite(unit.estimatedMinutes) && unit.estimatedMinutes > 0, `${unit.id}: estimatedMinutes는 양수여야 합니다.`);
    assert.ok(Array.isArray(unit.prerequisites), `${unit.id}: prerequisites 배열이 필요합니다.`);
    assert.ok(unit.prerequisites.length <= 5, `${unit.id}: 직접 선수개념은 최대 5개입니다.`);
    assertStringArray(unit, path, "prerequisites");
    assert.ok(Array.isArray(unit.objectives) && unit.objectives.length >= 2, `${unit.id}: objectives는 2개 이상이어야 합니다.`);
    assert.ok(Array.isArray(unit.theory) && unit.theory.length >= 4, `${unit.id}: theory 블록은 4개 이상이어야 합니다.`);
    assert.ok(Array.isArray(unit.problems) && unit.problems.length >= 6, `${unit.id}: problems는 6개 이상이어야 합니다.`);

    for (const problem of unit.problems) {
      assert.match(problem.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${unit.id}: problem id는 kebab-case여야 합니다.`);
      assert.ok(!problemIds.has(problem.id), `${unit.id}: 중복 문제 ID ${problem.id}`);
      problemIds.add(problem.id);
      assert.ok(supportedTypes.has(problem.type), `${problem.id}: 지원하지 않는 문제 유형 ${problem.type}`);
      assert.equal(typeof problem.prompt, "string", `${problem.id}: prompt는 문자열이어야 합니다.`);
      assert.ok(problem.prompt.trim(), `${problem.id}: prompt가 비어 있습니다.`);
      assert.ok(Object.hasOwn(problem, "answer"), `${problem.id}: answer가 필요합니다.`);
      assert.ok(Array.isArray(problem.hints) && problem.hints.length >= 2, `${problem.id}: hints는 2개 이상이어야 합니다.`);
      assert.equal(typeof problem.explanation, "string", `${problem.id}: explanation은 문자열이어야 합니다.`);
      assert.ok(problem.explanation.trim(), `${problem.id}: explanation이 비어 있습니다.`);
      if (problem.type === "choice") {
        assert.ok(Array.isArray(problem.choices) && problem.choices.length >= 2, `${problem.id}: choices는 2개 이상이어야 합니다.`);
        const choiceIds = new Set(problem.choices.map((choice) => choice.id));
        assert.ok(choiceIds.has(String(problem.answer)), `${problem.id}: 선택지에 정답 ${problem.answer}이 없습니다.`);
      }
    }
  }

  for (const { data: unit } of units) {
    for (const prerequisite of unit.prerequisites) {
      assert.ok(ids.has(prerequisite), `${unit.id}: 없는 선수개념 ${prerequisite}`);
      assert.notEqual(prerequisite, unit.id, `${unit.id}: 자기 자신을 선수개념으로 참조합니다.`);
    }
  }
});

test("the prerequisite graph is acyclic", async () => {
  const { units } = await loadAllUnits();
  const graph = new Map(units.map(({ data }) => [data.id, data.prerequisites]));
  const visiting = [];
  const visited = new Set();

  function visit(id) {
    if (visited.has(id)) return;
    const cycleIndex = visiting.indexOf(id);
    assert.equal(cycleIndex, -1, `선수개념 순환 발견: ${[...visiting.slice(cycleIndex), id].join(" -> ")}`);
    visiting.push(id);
    for (const prerequisite of graph.get(id) ?? []) visit(prerequisite);
    visiting.pop();
    visited.add(id);
  }

  for (const id of graph.keys()) visit(id);
});

test("the U.S. middle, high-school, AP, IB, and post-AP course coverage is complete", async () => {
  const { units } = await loadAllUnits();
  for (const grade of [6, 7, 8]) {
    assertMinimum(
      units,
      `Middle School Grade ${grade}`,
      5,
      (unit) => unit.stage === "middle" && new RegExp(`(?:^|\\D)${grade}(?:\\D|$)`).test(unit.grade),
    );
  }

  for (const course of ["Algebra I", "Geometry", "Algebra II", "Precalculus"]) {
    assertMinimum(
      units,
      `High School Core ${course}`,
      1,
      (unit) => unit.course === course && unit.framework === "CCSS-M" && ["Core", "Honors"].includes(unit.level),
    );
  }

  const apMinimums = new Map([
    ["AP Precalculus", 4],
    ["AP Calculus AB", 8],
    ["AP Calculus BC", 2],
    // College Board's revised AP Statistics framework starts in 2026-27
    // and groups the course into five units (rather than the former nine).
    ["AP Statistics", 5],
  ]);
  for (const [course, minimum] of apMinimums) {
    assertMinimum(
      units,
      `${course}${course === "AP Statistics" ? " (2026-27 5-unit framework)" : ""}`,
      minimum,
      (unit) => unit.course === course && unit.framework === "College Board AP" && unit.level === "AP",
    );
  }

  for (const course of ["IB Mathematics: Analysis and Approaches", "IB Mathematics: Applications and Interpretation"]) {
    for (const level of ["IB SL", "IB HL"]) {
      assertMinimum(
        units,
        `${course} ${level}`,
        5,
        (unit) => unit.course === course && unit.framework === "IB DP" && unit.level === level,
      );
    }
  }

  for (const course of ["Multivariable Calculus", "Linear Algebra", "Differential Equations", "Discrete Mathematics"]) {
    assertMinimum(
      units,
      `Post-AP ${course}`,
      4,
      (unit) => unit.course === course && unit.framework === "Dual Enrollment" && unit.level === "Post-AP",
    );
  }
});
