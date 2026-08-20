/**
 * Answer normalisation and checking for the static maths lessons.
 *
 * The checker deliberately accepts a small, explicit input language.  In
 * particular, this module never evaluates an expression supplied by a
 * learner: an answer is either a number, a fraction, or a tuple/set of those
 * values.
 */

export const DEFAULT_TOLERANCE = 1e-9;

export const CHECKER_MESSAGES = Object.freeze({
  blank: "답을 입력해 주세요.",
  format: "답안 형식이 올바르지 않습니다.",
  problem: "문제 설정 오류입니다.",
  incorrect: "정답이 아닙니다.",
});

const SUPPORTED_TYPES = new Set([
  "choice",
  "integer",
  "number",
  "rational",
  "orderedPair",
  "vector",
  "unorderedSet",
]);

// A comma is accepted only as a thousands separator.  This prevents a
// malformed value such as "1,2" from silently turning into 12.
const NUMERIC_PATTERN = /^[+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return isRecord(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeZero(value) {
  return Object.is(value, -0) ? 0 : value;
}

/** Replace the mathematical minus sign with the ASCII form understood by the parser. */
export function normalizeUnicodeMinus(value) {
  return typeof value === "string" ? value.replaceAll("−", "-") : value;
}

function issue(kind) {
  return { ok: false, issue: kind };
}

function issueMessage(kind) {
  return kind === "blank" ? CHECKER_MESSAGES.blank : CHECKER_MESSAGES.format;
}

function ok(value, normalized = value) {
  return { ok: true, value, normalized };
}

/**
 * Parse a finite decimal/scientific number without accepting JavaScript-only
 * values such as Infinity, NaN, hex literals, or arithmetic expressions.
 */
export function parseNumeric(value) {
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? ok(normalizeZero(value), normalizeZero(value))
      : issue("format");
  }

  if (typeof value !== "string") return issue("format");
  const text = normalizeUnicodeMinus(value).trim();
  if (text.length === 0) return issue("blank");
  if (!NUMERIC_PATTERN.test(text)) return issue("format");

  const numericText = text.replaceAll(",", "");
  const number = Number(numericText);
  if (!Number.isFinite(number)) return issue("format");
  return ok(normalizeZero(number), numericText);
}

function parseInteger(value) {
  // Integer answers use the same decimal grammar as number answers, then
  // require an integral value.  Thus both "2" and the harmlessly explicit
  // "2.0" are accepted, while "2.5" remains a shape error.
  const parsed = parseNumeric(value);
  if (!parsed.ok) return parsed;
  if (!Number.isInteger(parsed.value)) return issue("format");
  return ok(normalizeZero(parsed.value), parsed.normalized);
}

function gcd(a, b) {
  let left = a < 0n ? -a : a;
  let right = b < 0n ? -b : b;
  while (right !== 0n) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  return left;
}

/** Return a reduced fraction whose denominator is always positive. */
export function normalizeFraction(numerator, denominator) {
  let n;
  let d;
  try {
    n = typeof numerator === "bigint" ? numerator : BigInt(numerator);
    d = typeof denominator === "bigint" ? denominator : BigInt(denominator);
  } catch {
    return null;
  }
  if (d === 0n) return null;
  if (n === 0n) return { numerator: 0n, denominator: 1n };
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const divisor = gcd(n, d);
  return { numerator: n / divisor, denominator: d / divisor };
}

function fractionFromDecimalText(text) {
  const normalized = normalizeUnicodeMinus(text);
  const exponentParts = normalized.split(/[eE]/);
  if (exponentParts.length > 2) return null;

  const mantissa = exponentParts[0];
  const exponent = exponentParts.length === 2 ? Number(exponentParts[1]) : 0;
  if (!Number.isSafeInteger(exponent)) return null;

  let sign = 1n;
  let unsigned = mantissa;
  if (unsigned.startsWith("+")) unsigned = unsigned.slice(1);
  else if (unsigned.startsWith("-")) {
    sign = -1n;
    unsigned = unsigned.slice(1);
  }

  const dot = unsigned.indexOf(".");
  const whole = dot < 0 ? unsigned : unsigned.slice(0, dot);
  const decimal = dot < 0 ? "" : unsigned.slice(dot + 1);
  const digits = `${whole}${decimal}`;
  if (!/^\d+$/.test(digits)) return null;

  // Avoid allocating an unexpectedly enormous BigInt for an otherwise
  // harmless malformed/hostile answer.  Number() has already rejected
  // overflow in parseNumeric, but underflowed values can still be finite.
  const scale = decimal.length - exponent;
  if (Math.abs(scale) > 10000) {
    if (/^0+$/.test(digits)) return { numerator: 0n, denominator: 1n };
    return null;
  }

  let numerator;
  let denominator;
  try {
    numerator = sign * BigInt(digits);
    if (scale >= 0) {
      denominator = 10n ** BigInt(scale);
    } else {
      numerator *= 10n ** BigInt(-scale);
      denominator = 1n;
    }
  } catch {
    return null;
  }
  return normalizeFraction(numerator, denominator);
}

function fractionFromNumeric(value) {
  const parsed = parseNumeric(value);
  if (!parsed.ok) return parsed;
  const text = typeof value === "number" ? String(parsed.value) : parsed.normalized;
  const fraction = fractionFromDecimalText(text);
  return fraction ? ok(fraction, fraction) : issue("format");
}

function fractionFromInteger(value) {
  const parsed = parseInteger(value);
  if (!parsed.ok) return parsed;
  const fraction = fractionFromDecimalText(parsed.normalized);
  if (!fraction || fraction.denominator !== 1n) return issue("format");
  return ok(fraction, fraction);
}

function parseFractionText(value) {
  const text = normalizeUnicodeMinus(value).trim();
  const slashCount = [...text].filter((character) => character === "/").length;
  if (slashCount !== 1) return issue("format");
  const [numeratorText, denominatorText] = text.split("/");
  const numerator = fractionFromInteger(numeratorText);
  const denominator = fractionFromInteger(denominatorText);
  if (!numerator.ok || !denominator.ok || denominator.value.numerator === 0n) {
    return issue("format");
  }
  const fraction = normalizeFraction(numerator.value.numerator, denominator.value.numerator);
  return fraction ? ok(fraction, fraction) : issue("format");
}

/** Parse an answer component as an exact rational value. */
export function parseRationalValue(value) {
  if (typeof value === "string") {
    const text = normalizeUnicodeMinus(value).trim();
    if (text.length === 0) return issue("blank");
    return text.includes("/") ? parseFractionText(text) : fractionFromNumeric(text);
  }
  if (typeof value === "number") return fractionFromNumeric(value);
  return issue("format");
}

function fractionToNumber(fraction) {
  const value = Number(fraction.numerator) / Number(fraction.denominator);
  return normalizeZero(value);
}

function fractionToPublic(fraction) {
  const numerator = Number(fraction.numerator);
  const denominator = Number(fraction.denominator);
  if (Number.isSafeInteger(numerator) && Number.isSafeInteger(denominator)) {
    return { numerator, denominator };
  }
  return {
    numerator: fraction.numerator.toString(),
    denominator: fraction.denominator.toString(),
  };
}

function fractionCompare(left, right) {
  const cross = left.numerator * right.denominator - right.numerator * left.denominator;
  return cross < 0n ? -1 : cross > 0n ? 1 : 0;
}

function withinTolerance(left, right, tolerance) {
  const difference = Math.abs(left - right);
  if (!Number.isFinite(difference)) return false;
  if (tolerance === 0) return difference === 0;
  // The small ULP allowance makes the mathematical boundary (for example,
  // 1 + 1e-9) stable despite the binary representation of decimal literals.
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return difference <= tolerance + Number.EPSILON * scale * 4;
}

function fractionEquals(left, right, tolerance) {
  if (fractionCompare(left, right) === 0) return true;
  if (tolerance === 0) return false;
  return withinTolerance(fractionToNumber(left), fractionToNumber(right), tolerance);
}

function parseConfigNumber(value) {
  const parsed = parseNumeric(value);
  if (!parsed.ok) return null;
  return parsed.value;
}

function parseTolerance(problem) {
  if (!hasOwn(problem, "tolerance") || problem.tolerance === undefined) {
    return { ok: true, value: DEFAULT_TOLERANCE };
  }
  const tolerance = parseConfigNumber(problem.tolerance);
  if (tolerance === null || tolerance < 0) return { ok: false };
  return { ok: true, value: tolerance };
}

function parseExpectedRational(answer) {
  if (!isRecord(answer) || !hasOwn(answer, "numerator") || !hasOwn(answer, "denominator")) {
    return null;
  }
  const numerator = parseConfigNumber(answer.numerator);
  const denominator = parseConfigNumber(answer.denominator);
  if (
    numerator === null ||
    denominator === null ||
    !Number.isInteger(numerator) ||
    !Number.isInteger(denominator) ||
    denominator === 0
  ) {
    return null;
  }
  return normalizeFraction(numerator, denominator);
}

function parseExpectedValue(value) {
  if (isRecord(value)) {
    return parseExpectedRational(value);
  }
  const parsed = parseRationalValue(value);
  return parsed.ok ? parsed.value : null;
}

function parseExpectedVector(answer) {
  if (!Array.isArray(answer) || ![2, 3].includes(answer.length)) return null;
  const values = answer.map(parseExpectedValue);
  return values.every(Boolean) ? values : null;
}

function uniqueFractions(values, tolerance) {
  const unique = [];
  for (const value of values) {
    if (!unique.some((existing) => fractionEquals(existing, value, tolerance))) {
      unique.push(value);
    }
  }
  unique.sort(fractionCompare);
  return unique;
}

function prepareProblem(problem) {
  if (!isRecord(problem) || typeof problem.type !== "string" || !SUPPORTED_TYPES.has(problem.type)) {
    return null;
  }
  if (!hasOwn(problem, "answer")) return null;

  const tolerance = parseTolerance(problem);
  if (!tolerance.ok) return null;

  switch (problem.type) {
    case "choice": {
      if (typeof problem.answer !== "string" || problem.answer.trim() === "") return null;
      return { type: problem.type, answer: problem.answer.trim(), tolerance: tolerance.value };
    }
    case "integer": {
      const answer = parseConfigNumber(problem.answer);
      if (answer === null || !Number.isInteger(answer)) return null;
      return { type: problem.type, answer: normalizeZero(answer), tolerance: tolerance.value };
    }
    case "number": {
      const answer = parseConfigNumber(problem.answer);
      if (answer === null) return null;
      return { type: problem.type, answer: normalizeZero(answer), tolerance: tolerance.value };
    }
    case "rational": {
      const answer = parseExpectedRational(problem.answer);
      if (!answer) return null;
      return { type: problem.type, answer, tolerance: tolerance.value };
    }
    case "orderedPair":
    case "vector": {
      const answer = parseExpectedVector(problem.answer);
      if (!answer) return null;
      return { type: problem.type, answer, tolerance: tolerance.value };
    }
    case "unorderedSet": {
      if (!Array.isArray(problem.answer)) return null;
      const values = problem.answer.map(parseExpectedValue);
      if (values.some((value) => !value)) return null;
      return {
        type: problem.type,
        answer: uniqueFractions(values, tolerance.value),
        tolerance: tolerance.value,
      };
    }
    default:
      return null;
  }
}

function parseTuple(value) {
  if (typeof value !== "string") return issue("format");
  const text = normalizeUnicodeMinus(value).trim();
  if (text.length === 0) return issue("blank");

  let inner = text;
  const first = text[0];
  const last = text[text.length - 1];
  if (first === "(" || first === "<") {
    const expectedLast = first === "(" ? ")" : ">";
    if (last !== expectedLast) return issue("format");
    inner = text.slice(1, -1).trim();
  } else if (first === ")" || first === ">" || last === "(" || last === "<") {
    return issue("format");
  }

  if (inner.length === 0) return issue("format");
  const pieces = inner.split(",");
  if (![2, 3].includes(pieces.length)) return issue("format");
  const values = [];
  for (const piece of pieces) {
    const parsed = parseRationalValue(piece);
    if (!parsed.ok) return issue("format");
    values.push(parsed.value);
  }
  return ok(values, values.map(fractionToNumber));
}

function parseSet(value) {
  if (typeof value !== "string") return issue("format");
  const text = normalizeUnicodeMinus(value).trim();
  if (text.length === 0) return issue("blank");
  const pieces = text.split(",");
  if (pieces.some((piece) => piece.trim() === "")) return issue("format");
  const values = [];
  for (const piece of pieces) {
    const parsed = parseRationalValue(piece);
    if (!parsed.ok) return issue("format");
    values.push(parsed.value);
  }
  return ok(values, values);
}

function parseAnswer(type, rawAnswer) {
  switch (type) {
    case "choice": {
      if (typeof rawAnswer !== "string") return issue("format");
      const value = normalizeUnicodeMinus(rawAnswer).trim();
      if (value.length === 0) return issue("blank");
      return ok(value, value);
    }
    case "integer": {
      const parsed = parseInteger(rawAnswer);
      if (!parsed.ok) return parsed;
      return ok(parsed.value, normalizeZero(parsed.value));
    }
    case "number": {
      const parsed = parseNumeric(rawAnswer);
      if (!parsed.ok) return parsed;
      return ok(parsed.value, normalizeZero(parsed.value));
    }
    case "rational":
      return parseRationalValue(rawAnswer);
    case "orderedPair":
    case "vector":
      return parseTuple(rawAnswer);
    case "unorderedSet":
      return parseSet(rawAnswer);
    default:
      return issue("format");
  }
}

function compareAnswer(prepared, parsed) {
  const tolerance = prepared.tolerance;
  switch (prepared.type) {
    case "choice":
      return parsed.value === prepared.answer;
    case "integer":
    case "number":
      return withinTolerance(parsed.value, prepared.answer, tolerance);
    case "rational":
      return fractionEquals(parsed.value, prepared.answer, tolerance);
    case "orderedPair":
    case "vector":
      return (
        parsed.value.length === prepared.answer.length &&
        parsed.value.every((value, index) => fractionEquals(value, prepared.answer[index], tolerance))
      );
    case "unorderedSet": {
      const actual = uniqueFractions(parsed.value, tolerance);
      const expected = prepared.answer;
      if (actual.length !== expected.length) return false;
      const used = new Set();
      return actual.every((actualValue) => {
        for (let index = 0; index < expected.length; index += 1) {
          if (!used.has(index) && fractionEquals(actualValue, expected[index], tolerance)) {
            used.add(index);
            return true;
          }
        }
        return false;
      });
    }
    default:
      return false;
  }
}

function publicNormalized(type, parsed) {
  if (type === "rational") return fractionToPublic(parsed.value);
  if (type === "orderedPair" || type === "vector") {
    return parsed.value.map(fractionToNumber);
  }
  if (type === "unorderedSet") {
    return uniqueFractions(parsed.value, 0).map(fractionToNumber);
  }
  return parsed.normalized;
}

/**
 * Check a learner answer.  Configuration errors are reported separately from
 * malformed learner input so a broken content record is not presented as a
 * learner mistake.
 */
export function checkAnswer(problem, rawAnswer) {
  const prepared = prepareProblem(problem);
  if (!prepared) return { correct: false, message: CHECKER_MESSAGES.problem };

  // Form controls commonly provide null/undefined when no value was entered.
  // Treat those exactly like an empty text field for every answer type.
  if (rawAnswer === null || rawAnswer === undefined) {
    return { correct: false, message: CHECKER_MESSAGES.blank };
  }

  const parsed = parseAnswer(prepared.type, rawAnswer);
  if (!parsed.ok) return { correct: false, message: issueMessage(parsed.issue) };

  // A tuple with the wrong arity is a syntax/shape error, rather than a
  // mathematically wrong answer.  Checking this before comparison also gives
  // the learner a useful message for a 3-vector entered in a 2D problem.
  if (
    (prepared.type === "orderedPair" || prepared.type === "vector") &&
    parsed.value.length !== prepared.answer.length
  ) {
    return { correct: false, message: CHECKER_MESSAGES.format };
  }

  const correct = compareAnswer(prepared, parsed);
  const result = {
    correct,
    normalized: publicNormalized(prepared.type, parsed),
  };
  if (!correct) result.message = CHECKER_MESSAGES.incorrect;
  return result;
}

export const supportedAnswerTypes = Object.freeze([...SUPPORTED_TYPES]);
