import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHECKER_MESSAGES,
  checkAnswer,
  normalizeFraction,
  normalizeUnicodeMinus,
  parseNumeric,
  parseRationalValue,
} from "../assets/js/answer-checkers.js";

const result = (problem, answer) => checkAnswer(problem, answer);

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stageNames = ["middle", "high"];

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function serializeComponent(value) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return `${value.numerator}/${value.denominator}`;
  }
  return String(value);
}

/** Turn a content answer into one of the learner-facing forms supported by the checker. */
function serializeAnswer(problem) {
  switch (problem.type) {
    case "choice":
      return String(problem.answer);
    case "rational":
      return serializeComponent(problem.answer);
    case "orderedPair":
    case "vector":
      return `(${problem.answer.map(serializeComponent).join(",")})`;
    case "unorderedSet":
      return problem.answer.map(serializeComponent).join(",");
    case "number":
    case "integer":
      return String(problem.answer);
    default:
      throw new Error(`직렬화할 수 없는 문제 유형: ${problem.type}`);
  }
}

test("choice answers compare trimmed choice IDs", () => {
  assert.deepEqual(result({ type: "choice", answer: "A" }, " A "), {
    correct: true,
    normalized: "A",
  });
  assert.equal(result({ type: "choice", answer: "A" }, "B").correct, false);
  assert.equal(result({ type: "choice", answer: "A" }, "").message, CHECKER_MESSAGES.blank);
  assert.equal(result({ type: "choice", answer: "A" }, 1).message, CHECKER_MESSAGES.format);
});

test("integer and number answers accept finite numeric strings and separators", () => {
  assert.deepEqual(result({ type: "integer", answer: 1234 }, " 1,234 "), {
    correct: true,
    normalized: 1234,
  });
  assert.equal(result({ type: "integer", answer: -2 }, "−2").correct, true);
  assert.equal(result({ type: "integer", answer: 2 }, "2.0").correct, true);
  assert.equal(result({ type: "integer", answer: 2 }, "2.5").message, CHECKER_MESSAGES.format);
  assert.equal(result({ type: "number", answer: 0.3 }, "0.3000000005").correct, true);
  assert.equal(result({ type: "number", answer: 0.3 }, "0.300000002").correct, false);
  assert.equal(result({ type: "number", answer: 1 }, "Infinity").message, CHECKER_MESSAGES.format);
  assert.equal(result({ type: "number", answer: 1 }, "NaN").message, CHECKER_MESSAGES.format);
  assert.equal(result({ type: "number", answer: 0 }, "−0").normalized, 0);
  assert.equal(Object.is(result({ type: "number", answer: 0 }, "−0").normalized, -0), false);
});

test("number tolerance can be configured and invalid configuration is a problem error", () => {
  assert.equal(result({ type: "number", answer: 10, tolerance: 0.1 }, "10.09").correct, true);
  assert.equal(result({ type: "number", answer: 10, tolerance: 0.1 }, "10.11").correct, false);
  assert.equal(result({ type: "number", answer: 10, tolerance: 0 }, "10.0000000001").correct, false);
  assert.equal(result({ type: "number", answer: 10, tolerance: -1 }, "10").message, CHECKER_MESSAGES.problem);
  assert.equal(result({ type: "number", answer: 10, tolerance: Infinity }, "10").message, CHECKER_MESSAGES.problem);
});

test("rational answers reduce fractions and accept decimal or integer notation", () => {
  const problem = { type: "rational", answer: { numerator: -3, denominator: 4 } };
  assert.deepEqual(result(problem, "-6/8"), {
    correct: true,
    normalized: { numerator: -3, denominator: 4 },
  });
  assert.equal(result({ type: "rational", answer: { numerator: 3, denominator: 4 } }, "0.75").correct, true);
  assert.equal(result({ type: "rational", answer: { numerator: 2, denominator: 1 } }, 2).correct, true);
  assert.equal(result({ type: "rational", answer: { numerator: 1, denominator: 3 } }, "0.3333333333").correct, true);
  assert.equal(result({ type: "rational", answer: { numerator: 1, denominator: 0 } }, "0").message, CHECKER_MESSAGES.problem);
  assert.equal(result(problem, "3/").message, CHECKER_MESSAGES.format);
  assert.equal(result(problem, "1/0").message, CHECKER_MESSAGES.format);
  assert.equal(result(problem, "").message, CHECKER_MESSAGES.blank);
});

test("ordered pairs and vectors parse supported delimiters and preserve order", () => {
  const pair = { type: "orderedPair", answer: [1, -2] };
  assert.deepEqual(result(pair, "(1, -2)"), { correct: true, normalized: [1, -2] });
  assert.equal(result(pair, "1,−2").correct, true);
  assert.equal(result(pair, "<1, -2>").correct, true);
  assert.equal(result(pair, "(-2, 1)").correct, false);
  assert.deepEqual(result({ type: "vector", answer: [0.5, -0.75, 2] }, "1/2, −3/4, 2"), {
    correct: true,
    normalized: [0.5, -0.75, 2],
  });
  assert.equal(result(pair, "(1, -2, 3)").message, CHECKER_MESSAGES.format);
  assert.equal(result(pair, "(1, -2").message, CHECKER_MESSAGES.format);
  assert.equal(result(pair, "(1, nope)").message, CHECKER_MESSAGES.format);
});

test("unordered numeric sets ignore order and duplicate entries", () => {
  const problem = { type: "unorderedSet", answer: [3, 4] };
  assert.deepEqual(result(problem, "4, 3, 3"), { correct: true, normalized: [3, 4] });
  assert.equal(result(problem, "3, 5").correct, false);
  assert.equal(result({ type: "unorderedSet", answer: [0.5] }, "1/2, 0.5").correct, true);
  assert.equal(result(problem, "3,").message, CHECKER_MESSAGES.format);
  assert.equal(result(problem, " ").message, CHECKER_MESSAGES.blank);
});

test("malformed problem records are distinct from learner input errors", () => {
  assert.equal(result({ type: "not-a-type", answer: 1 }, "1").message, CHECKER_MESSAGES.problem);
  assert.equal(result({ type: "number" }, "1").message, CHECKER_MESSAGES.problem);
  assert.equal(result({ type: "integer", answer: 1.5 }, "1").message, CHECKER_MESSAGES.problem);
  assert.equal(result(null, "1").message, CHECKER_MESSAGES.problem);
  assert.equal(result({ type: "number", answer: 1 }, "").message, CHECKER_MESSAGES.blank);
  assert.equal(result({ type: "number", answer: 1 }, null).message, CHECKER_MESSAGES.blank);
  assert.equal(result({ type: "number", answer: 1 }, undefined).message, CHECKER_MESSAGES.blank);
});

test("low-level helpers normalize minus signs, zeros, and fractions", () => {
  assert.equal(normalizeUnicodeMinus("−1.5"), "-1.5");
  assert.equal(parseNumeric(" 1,000.25 ").value, 1000.25);
  assert.equal(parseNumeric("1+2").ok, false);
  assert.deepEqual(normalizeFraction(-6, -8), { numerator: 3n, denominator: 4n });
  assert.deepEqual(parseRationalValue("0.75").value, { numerator: 3n, denominator: 4n });
  assert.equal(parseRationalValue("1/0").ok, false);
});

test("all manifest problems accept a serialized form of their own answer", async () => {
  let problemCount = 0;
  const countsByType = new Map();

  for (const stage of stageNames) {
    const manifestPath = join(projectRoot, "content", stage, "manifest.json");
    const manifest = await readJson(manifestPath);
    assert.ok(Array.isArray(manifest.units), `${stage} manifest의 units가 배열이어야 합니다.`);

    for (const relativeUnitPath of manifest.units) {
      const unitPath = join(projectRoot, "content", stage, relativeUnitPath);
      const unit = await readJson(unitPath);
      assert.ok(Array.isArray(unit.problems), `${unitPath}: problems가 배열이어야 합니다.`);

      for (const problem of unit.problems) {
        const rawAnswer = serializeAnswer(problem);
        const checked = checkAnswer(problem, rawAnswer);
        assert.equal(
          checked.correct,
          true,
          `${unit.id}/${problem.id}: ${problem.type} 답안 ${JSON.stringify(rawAnswer)}가 정답으로 판정되어야 합니다.`,
        );
        problemCount += 1;
        countsByType.set(problem.type, (countsByType.get(problem.type) || 0) + 1);
      }
    }
  }

  assert.ok(problemCount > 0, "manifest에서 문제를 하나 이상 읽어야 합니다.");
  assert.ok(countsByType.has("choice"), "choice 문항을 통합 검증해야 합니다.");
  assert.ok(countsByType.has("rational"), "rational 문항을 통합 검증해야 합니다.");
  assert.ok(countsByType.has("unorderedSet"), "unorderedSet 문항을 통합 검증해야 합니다.");
});
