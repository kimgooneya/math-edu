import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDir, "..");
const contentRoot = join(projectRoot, "content");
const manifestPaths = [
  join(contentRoot, "middle", "manifest.json"),
  join(contentRoot, "high", "manifest.json"),
];
const supportedTypes = new Set([
  "choice",
  "integer",
  "number",
  "rational",
  "orderedPair",
  "vector",
  "unorderedSet",
]);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function loadAllUnits() {
  const units = [];
  for (const manifestPath of manifestPaths) {
    const manifest = await readJson(manifestPath);
    assert.equal(manifest.schemaVersion, 1, `${manifestPath}: schemaVersion`);
    assert.ok(Array.isArray(manifest.units), `${manifestPath}: units 배열 필요`);
    for (const relativePath of manifest.units) {
      assert.equal(typeof relativePath, "string");
      assert.ok(!relativePath.includes(".."), `${relativePath}: 상위 경로 금지`);
      const unitPath = join(dirname(manifestPath), relativePath);
      units.push({ path: unitPath, data: await readJson(unitPath) });
    }
  }
  return units;
}

test("all learning units satisfy the shared content contract", async () => {
  const units = await loadAllUnits();
  assert.ok(units.length >= 12, "초기 릴리스는 중등 6개와 고등 6개 이상이어야 합니다.");

  const ids = new Set();
  const problemIds = new Set();
  for (const { path, data: unit } of units) {
    assert.equal(unit.schemaVersion, 1, `${path}: schemaVersion`);
    assert.match(unit.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${path}: unit id`);
    assert.ok(!ids.has(unit.id), `${unit.id}: 중복 단원 ID`);
    ids.add(unit.id);
    assert.ok(["middle", "high"].includes(unit.stage), `${unit.id}: stage`);
    for (const field of ["title", "grade", "course", "domain", "description"]) {
      assert.equal(typeof unit[field], "string", `${unit.id}: ${field}`);
      assert.ok(unit[field].trim(), `${unit.id}: ${field} 비어 있음`);
    }
    assert.ok(Number.isFinite(unit.estimatedMinutes) && unit.estimatedMinutes > 0);
    assert.ok(Array.isArray(unit.prerequisites), `${unit.id}: prerequisites`);
    assert.ok(Array.isArray(unit.objectives) && unit.objectives.length >= 2);
    assert.ok(Array.isArray(unit.theory) && unit.theory.length >= 4);
    assert.ok(Array.isArray(unit.problems) && unit.problems.length >= 6);

    for (const problem of unit.problems) {
      assert.match(problem.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.ok(!problemIds.has(problem.id), `${problem.id}: 중복 문제 ID`);
      problemIds.add(problem.id);
      assert.ok(supportedTypes.has(problem.type), `${problem.id}: 지원하지 않는 문제 유형`);
      assert.equal(typeof problem.prompt, "string", `${problem.id}: prompt`);
      assert.ok(Object.hasOwn(problem, "answer"), `${problem.id}: answer`);
      assert.ok(Array.isArray(problem.hints) && problem.hints.length >= 2, `${problem.id}: hints`);
      assert.equal(typeof problem.explanation, "string", `${problem.id}: explanation`);
      if (problem.type === "choice") {
        assert.ok(Array.isArray(problem.choices) && problem.choices.length >= 2);
        const choiceIds = new Set(problem.choices.map((choice) => choice.id));
        assert.ok(choiceIds.has(String(problem.answer)), `${problem.id}: 선택지에 정답 없음`);
      }
    }
  }

  for (const { data: unit } of units) {
    for (const prerequisite of unit.prerequisites) {
      assert.ok(ids.has(prerequisite), `${unit.id}: 없는 선수개념 ${prerequisite}`);
      assert.notEqual(prerequisite, unit.id, `${unit.id}: 자기 자신을 선수개념으로 참조`);
    }
  }
});

test("the prerequisite graph is acyclic", async () => {
  const units = await loadAllUnits();
  const graph = new Map(units.map(({ data }) => [data.id, data.prerequisites]));
  const visiting = new Set();
  const visited = new Set();

  function visit(id) {
    if (visited.has(id)) return;
    assert.ok(!visiting.has(id), `선수개념 순환 발견: ${id}`);
    visiting.add(id);
    for (const prerequisite of graph.get(id) ?? []) visit(prerequisite);
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of graph.keys()) visit(id);
});
