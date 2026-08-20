/**
 * 브라우저 학습 상태 저장소.
 *
 * localStorage를 사용할 수 없는 환경(SSR, Node 테스트, 시크릿 모드 또는
 * quota 초과)에서도 동일한 API를 제공하도록 메모리 사본을 함께 유지합니다.
 */

import {
  REVIEW_INTERVAL_DAYS,
  calculateUnitMastery,
  scheduleNextReview,
} from "./mastery.js";

export const STORAGE_KEY = "mathEdu:userData:v1";
export const SCHEMA_VERSION = 1;
export const MAX_ATTEMPTS = 500;
export const RECENT_ATTEMPTS_LIMIT = 20;

const DEFAULT_DAILY_GOAL_MINUTES = 15;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPlainObject(value) {
  if (!isObject(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function clone(value) {
  if (value === undefined) return undefined;
  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch {
    // Persisted data is JSON-compatible; use the portable fallback below.
  }
  return JSON.parse(JSON.stringify(value));
}

function validationError(path, message) {
  return new Error(`학습 데이터 ${path}가 올바르지 않습니다: ${message}`);
}

function fail(path, message) {
  throw validationError(path, message);
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function integerAtLeast(value, minimum = 0) {
  return Number.isInteger(value) && value >= minimum;
}

function normalizeDate(value, path, { strict = false, allowNumber = false } = {}) {
  if (value === undefined || value === null || value === "") return undefined;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      if (strict) fail(path, "유효한 날짜여야 합니다");
      return undefined;
    }
    return value.toISOString();
  }
  if (allowNumber && typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  if (typeof value !== "string" || !value.trim() || Number.isNaN(Date.parse(value))) {
    if (strict) fail(path, "유효한 날짜 문자열이어야 합니다");
    return undefined;
  }
  return new Date(value).toISOString();
}

function createDefaultUserData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: {
      displayName: "",
      dailyGoalMinutes: DEFAULT_DAILY_GOAL_MINUTES,
    },
    units: {},
    attempts: [],
    bookmarks: [],
    lastUnitId: null,
  };
}

function normalizeProfile(value, { strict = false } = {}) {
  if (value === undefined) return createDefaultUserData().profile;
  if (!isPlainObject(value)) {
    if (strict) fail("profile", "객체여야 합니다");
    return createDefaultUserData().profile;
  }

  const profile = {
    displayName: value.displayName === undefined ? "" : value.displayName,
    dailyGoalMinutes:
      value.dailyGoalMinutes === undefined ? DEFAULT_DAILY_GOAL_MINUTES : value.dailyGoalMinutes,
  };
  if (typeof profile.displayName !== "string") {
    if (strict) fail("profile.displayName", "문자열이어야 합니다");
    profile.displayName = "";
  }
  if (!finiteNumber(profile.dailyGoalMinutes) || profile.dailyGoalMinutes <= 0) {
    if (strict) fail("profile.dailyGoalMinutes", "양의 숫자여야 합니다");
    profile.dailyGoalMinutes = DEFAULT_DAILY_GOAL_MINUTES;
  }
  return profile;
}

function normalizeAttempt(value, path, { strict = false, requireIds = true } = {}) {
  if (!isPlainObject(value)) {
    if (strict) fail(path, "객체여야 합니다");
    return null;
  }

  const nested = isPlainObject(value.result) ? value.result : {};
  const unitId = value.unitId ?? nested.unitId;
  const problemId = value.problemId ?? nested.problemId;
  const correct = value.correct ?? nested.correct;
  const usedHints = value.usedHints ?? nested.usedHints ?? 0;
  const revealedAnswer = value.revealedAnswer ?? nested.revealedAnswer ?? false;
  const attemptedAt = value.attemptedAt ?? nested.attemptedAt;

  if (requireIds && (typeof unitId !== "string" || !unitId.trim())) {
    if (strict) fail(`${path}.unitId`, "비어 있지 않은 문자열이어야 합니다");
    return null;
  }
  if (requireIds && (typeof problemId !== "string" || !problemId.trim())) {
    if (strict) fail(`${path}.problemId`, "비어 있지 않은 문자열이어야 합니다");
    return null;
  }
  if (typeof correct !== "boolean") {
    if (strict) fail(`${path}.correct`, "boolean이어야 합니다");
    return null;
  }
  const hintCount = typeof usedHints === "boolean" ? (usedHints ? 1 : 0) : usedHints;
  if (!integerAtLeast(hintCount)) {
    if (strict) fail(`${path}.usedHints`, "0 이상의 정수여야 합니다");
    return null;
  }
  if (typeof revealedAnswer !== "boolean") {
    if (strict) fail(`${path}.revealedAnswer`, "boolean이어야 합니다");
    return null;
  }

  const normalizedDate = normalizeDate(attemptedAt, `${path}.attemptedAt`, {
    strict,
    allowNumber: !strict,
  });
  const result = {
    ...(typeof unitId === "string" ? { unitId } : {}),
    ...(typeof problemId === "string" ? { problemId } : {}),
    correct,
    usedHints: hintCount,
    revealedAnswer,
  };
  if (normalizedDate) result.attemptedAt = normalizedDate;
  return result;
}

function normalizeHistoryAttempt(value, path, { strict = false } = {}) {
  if (!isPlainObject(value)) {
    if (strict) fail(path, "객체여야 합니다");
    return null;
  }
  // A history item may omit IDs because its containing unit supplies one.
  return normalizeAttempt(value, path, { strict, requireIds: false });
}

function normalizeProgress(value, unitId, { strict = false } = {}) {
  if (!isPlainObject(value)) {
    if (strict) fail(`units.${unitId}`, "객체여야 합니다");
    return {};
  }

  const progress = {};
  if (value.unitId !== undefined) {
    if (typeof value.unitId !== "string" || !value.unitId.trim()) {
      if (strict) fail(`units.${unitId}.unitId`, "문자열이어야 합니다");
    } else {
      progress.unitId = value.unitId;
    }
  }
  const stringFields = ["status"];
  const scoreFields = ["masteryScore", "score"];
  const countFields = [
    "totalAttempts",
    "attemptCount",
    "correctAttempts",
    "correctCount",
    "incorrectAttempts",
    "incorrectCount",
    "hintsUsed",
    "revealedAnswers",
  ];
  const levelFields = ["reviewLevel", "reviewStep", "reviewIndex", "reviewStage", "intervalIndex"];
  const dateFields = ["lastStudiedAt", "nextReviewAt"];

  for (const field of stringFields) {
    if (value[field] === undefined) continue;
    if (typeof value[field] !== "string") {
      if (strict) fail(`units.${unitId}.${field}`, "문자열이어야 합니다");
      continue;
    }
    progress[field] = value[field];
  }

  for (const field of scoreFields) {
    if (value[field] === undefined) continue;
    if (!finiteNumber(value[field]) || value[field] < 0 || value[field] > 1) {
      if (strict) fail(`units.${unitId}.${field}`, "0에서 1 사이의 숫자여야 합니다");
      continue;
    }
    progress[field] = value[field];
  }

  for (const field of countFields) {
    if (value[field] === undefined) continue;
    if (!integerAtLeast(value[field])) {
      if (strict) fail(`units.${unitId}.${field}`, "0 이상의 정수여야 합니다");
      continue;
    }
    progress[field] = value[field];
  }

  // Some callers keep a unit-local attempt history under `attempts`, while
  // the persisted store uses the numeric aggregate plus top-level attempts.
  // Accept both representations at the import boundary.
  if (value.attempts !== undefined) {
    if (Array.isArray(value.attempts)) {
      progress.attempts = value.attempts
        .map((item, index) => normalizeHistoryAttempt(item, `units.${unitId}.attempts[${index}]`, { strict }))
        .filter(Boolean)
        .slice(-RECENT_ATTEMPTS_LIMIT);
    } else if (!integerAtLeast(value.attempts)) {
      if (strict) fail(`units.${unitId}.attempts`, "배열 또는 0 이상의 정수여야 합니다");
    } else {
      progress.attempts = value.attempts;
    }
  }

  for (const field of levelFields) {
    if (value[field] === undefined) continue;
    if (!Number.isInteger(value[field]) || value[field] < 0 || value[field] > REVIEW_INTERVAL_DAYS.length - 1) {
      if (strict) fail(`units.${unitId}.${field}`, `0에서 ${REVIEW_INTERVAL_DAYS.length - 1} 사이의 정수여야 합니다`);
      continue;
    }
    progress[field] = value[field];
  }

  if (value.reviewIntervalDays !== undefined) {
    if (!finiteNumber(value.reviewIntervalDays) || value.reviewIntervalDays <= 0) {
      if (strict) fail(`units.${unitId}.reviewIntervalDays`, "양의 숫자여야 합니다");
    } else {
      progress.reviewIntervalDays = value.reviewIntervalDays;
    }
  }

  for (const field of dateFields) {
    if (value[field] === undefined) continue;
    const date = normalizeDate(value[field], `units.${unitId}.${field}`, { strict });
    if (date) progress[field] = date;
    else if (value[field] === null) progress[field] = null;
  }

  for (const field of ["lastAttemptCorrect", "reviewLevelApplied", "lastResult"]) {
    if (value[field] === undefined) continue;
    if (typeof value[field] !== "boolean") {
      if (strict) fail(`units.${unitId}.${field}`, "boolean이어야 합니다");
      continue;
    }
    progress[field] = value[field];
  }

  for (const field of ["recentAttempts", "attemptHistory"]) {
    if (value[field] === undefined) continue;
    if (!Array.isArray(value[field])) {
      if (strict) fail(`units.${unitId}.${field}`, "배열이어야 합니다");
      continue;
    }
    const history = value[field]
      .map((item, index) => normalizeHistoryAttempt(item, `units.${unitId}.${field}[${index}]`, { strict }))
      .filter(Boolean)
      .slice(-RECENT_ATTEMPTS_LIMIT);
    progress[field] = history;
  }

  if (value.lastAttempt !== undefined) {
    const lastAttempt = normalizeHistoryAttempt(value.lastAttempt, `units.${unitId}.lastAttempt`, { strict });
    if (lastAttempt) progress.lastAttempt = lastAttempt;
  }

  if (value.stats !== undefined) {
    if (!isPlainObject(value.stats)) {
      if (strict) fail(`units.${unitId}.stats`, "객체여야 합니다");
    } else {
      // stats is an optional aggregate for UI consumers. Its nested shape is
      // intentionally copied as JSON data after the container type is checked.
      progress.stats = clone(value.stats);
    }
  }
  return progress;
}

function normalizeBookmark(value, path, { strict = false } = {}) {
  if (typeof value === "string" && value.trim()) return value;
  if (isPlainObject(value)) {
    const bookmark = {};
    for (const field of ["unitId", "problemId", "createdAt", "note"]) {
      if (value[field] === undefined) continue;
      if (field === "createdAt") {
        const date = normalizeDate(value[field], `${path}.createdAt`, { strict });
        if (date) bookmark.createdAt = date;
      } else if (field === "note") {
        if (typeof value[field] !== "string") {
          if (strict) fail(`${path}.note`, "문자열이어야 합니다");
        } else bookmark.note = value[field];
      } else {
        if (typeof value[field] !== "string" || !value[field].trim()) {
          if (strict) fail(`${path}.${field}`, "비어 있지 않은 문자열이어야 합니다");
        } else bookmark[field] = value[field];
      }
    }
    if (Object.keys(bookmark).some((field) => field === "unitId" || field === "problemId")) return bookmark;
  }
  if (strict) fail(path, "문자열 또는 단원/문제 ID 객체여야 합니다");
  return null;
}

function normalizeData(value, { strict = false } = {}) {
  if (!isPlainObject(value)) {
    if (strict) fail("전체", "객체여야 합니다");
    return null;
  }
  if (value.schemaVersion !== SCHEMA_VERSION) {
    if (strict) fail("schemaVersion", `현재 지원 버전은 ${SCHEMA_VERSION}입니다`);
    return null;
  }

  if (value.units !== undefined && !isPlainObject(value.units)) {
    if (strict) fail("units", "객체여야 합니다");
    return null;
  }
  if (value.attempts !== undefined && !Array.isArray(value.attempts)) {
    if (strict) fail("attempts", "배열이어야 합니다");
    return null;
  }
  if (value.bookmarks !== undefined && !Array.isArray(value.bookmarks)) {
    if (strict) fail("bookmarks", "배열이어야 합니다");
    return null;
  }

  const data = {
    schemaVersion: SCHEMA_VERSION,
    profile: normalizeProfile(value.profile, { strict }),
    units: {},
    attempts: [],
    bookmarks: [],
    lastUnitId: null,
  };

  for (const [unitId, progress] of Object.entries(value.units ?? {})) {
    if (!unitId.trim()) {
      if (strict) fail("units", "단원 ID가 비어 있습니다");
      continue;
    }
    data.units[unitId] = normalizeProgress(progress, unitId, { strict });
  }

  const attempts = (value.attempts ?? [])
    .map((attempt, index) => normalizeAttempt(attempt, `attempts[${index}]`, { strict }))
    .filter(Boolean);
  data.attempts = attempts.slice(-MAX_ATTEMPTS);

  data.bookmarks = (value.bookmarks ?? [])
    .map((bookmark, index) => normalizeBookmark(bookmark, `bookmarks[${index}]`, { strict }))
    .filter(Boolean);

  if (value.lastUnitId !== undefined && value.lastUnitId !== null) {
    if (typeof value.lastUnitId !== "string" || !value.lastUnitId.trim()) {
      if (strict) fail("lastUnitId", "null 또는 비어 있지 않은 문자열이어야 합니다");
    } else {
      data.lastUnitId = value.lastUnitId;
    }
  }
  return data;
}

let memoryData = createDefaultUserData();
let fallbackActive = false;
let lastStorageReference;

function resolveStorage() {
  // Reading window.localStorage itself can throw in privacy-restricted
  // browsers, hence the separate guarded attempts.
  try {
    if (typeof window !== "undefined" && window && window.localStorage) return window.localStorage;
  } catch {
    // Try a global localStorage below (useful for test harnesses).
  }
  try {
    if (typeof globalThis !== "undefined" && globalThis.localStorage) return globalThis.localStorage;
  } catch {
    // No usable storage; callers will use memoryData.
  }
  return null;
}

function readStoredData() {
  const storage = resolveStorage();
  if (!storage || typeof storage.getItem !== "function") {
    fallbackActive = true;
    lastStorageReference = storage;
    return null;
  }
  if (fallbackActive && lastStorageReference === storage) return null;

  lastStorageReference = storage;
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    fallbackActive = true;
    return null;
  }
  if (raw === null || raw === undefined || raw === "") return null;

  try {
    const parsed = JSON.parse(raw);
    // Storage is treated as an external boundary just like an import. If a
    // field has the wrong type, retain the last in-memory snapshot instead of
    // silently replacing one malformed record with a partial default.
    const normalized = normalizeData(parsed, { strict: true });
    if (!normalized) {
      fallbackActive = true;
      return null;
    }
    fallbackActive = false;
    memoryData = normalized;
    return normalized;
  } catch {
    // Corrupt or partially-written storage must never prevent the app from
    // starting. Keep the last in-memory snapshot instead.
    fallbackActive = true;
    return null;
  }
}

function writeStoredData(data) {
  const storage = resolveStorage();
  lastStorageReference = storage;
  if (!storage || typeof storage.setItem !== "function") {
    fallbackActive = true;
    return false;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    fallbackActive = false;
    return true;
  } catch {
    // QuotaExceededError and SecurityError are both intentionally handled the
    // same way: the in-memory copy remains usable for this session.
    fallbackActive = true;
    return false;
  }
}

function removeStoredData() {
  const storage = resolveStorage();
  lastStorageReference = storage;
  if (!storage || typeof storage.removeItem !== "function") {
    fallbackActive = true;
    return false;
  }
  try {
    storage.removeItem(STORAGE_KEY);
    fallbackActive = false;
    return true;
  } catch {
    fallbackActive = true;
    return false;
  }
}

function emptyUnitProgress(unitId) {
  return {
    unitId,
    status: "unstarted",
    masteryScore: 0,
    score: 0,
    totalAttempts: 0,
    attemptCount: 0,
    attempts: 0,
    correctAttempts: 0,
    correctCount: 0,
    incorrectAttempts: 0,
    incorrectCount: 0,
    hintsUsed: 0,
    revealedAnswers: 0,
    reviewLevel: 0,
    reviewIntervalDays: REVIEW_INTERVAL_DAYS[0],
    lastStudiedAt: null,
    nextReviewAt: null,
    recentAttempts: [],
  };
}

function reviewLevelOf(progress) {
  for (const field of ["reviewLevel", "reviewStep", "reviewIndex", "reviewStage", "intervalIndex"]) {
    if (Number.isInteger(progress?.[field])) {
      return Math.min(REVIEW_INTERVAL_DAYS.length - 1, Math.max(0, progress[field]));
    }
  }
  return 0;
}

function statusForScore(score) {
  if (score >= 0.8) return "mastered";
  if (score >= 0.6) return "understood";
  return "learning";
}

function validateRecordInput(unitId, problemId, result) {
  if (typeof unitId !== "string" || !unitId.trim()) {
    throw new TypeError("recordAttempt의 unitId는 비어 있지 않은 문자열이어야 합니다.");
  }
  if (typeof problemId !== "string" || !problemId.trim()) {
    throw new TypeError("recordAttempt의 problemId는 비어 있지 않은 문자열이어야 합니다.");
  }
  if (!isPlainObject(result)) {
    throw new TypeError("recordAttempt의 result는 객체여야 합니다.");
  }
  const normalized = normalizeAttempt(
    {
      unitId,
      problemId,
      correct: result.correct,
      usedHints: result.usedHints ?? 0,
      revealedAnswer: result.revealedAnswer ?? false,
      attemptedAt: result.attemptedAt,
    },
    "recordAttempt",
    { strict: true },
  );
  if (!normalized.attemptedAt) normalized.attemptedAt = new Date().toISOString();
  return normalized;
}

/** Load a defensive copy of the current user data. */
export function loadUserData() {
  const stored = readStoredData();
  return clone(stored ?? memoryData);
}

/**
 * Validate and persist user data. If storage is unavailable, the validated
 * copy is retained in memory and returned instead of throwing.
 */
export function saveUserData(data) {
  const normalized = normalizeData(data, { strict: true });
  memoryData = normalized;
  writeStoredData(normalized);
  return clone(normalized);
}

/** Record one problem attempt and update its unit aggregate. */
export function recordAttempt(unitId, problemId, result) {
  const attempt = validateRecordInput(unitId, problemId, result);
  const data = loadUserData();
  const existing = isPlainObject(data.units[unitId]) ? data.units[unitId] : emptyUnitProgress(unitId);
  const priorUnitAttempts = data.attempts.filter((item) => item.unitId === unitId);
  const hadPriorAttempt = priorUnitAttempts.length > 0 || (existing.totalAttempts ?? 0) > 0;
  const previousLevel = reviewLevelOf(existing);

  data.attempts.push(attempt);
  data.attempts = data.attempts.slice(-MAX_ATTEMPTS);
  const unitAttempts = data.attempts.filter((item) => item.unitId === unitId);
  const recentAttempts = unitAttempts.slice(-RECENT_ATTEMPTS_LIMIT);
  const correctAttempts = unitAttempts.reduce((total, item) => total + (item.correct ? 1 : 0), 0);
  const incorrectAttempts = unitAttempts.length - correctAttempts;
  const hintsUsed = unitAttempts.reduce((total, item) => total + item.usedHints, 0);
  const revealedAnswers = unitAttempts.reduce((total, item) => total + (item.revealedAnswer ? 1 : 0), 0);
  const score = calculateUnitMastery({
    ...existing,
    unitId,
    totalAttempts: unitAttempts.length,
    recentAttempts,
  });

  const reviewLevel = hadPriorAttempt
    ? attempt.correct
      ? Math.min(REVIEW_INTERVAL_DAYS.length - 1, previousLevel + 1)
      : Math.max(0, previousLevel - 1)
    : 0;
  const intervalDays = REVIEW_INTERVAL_DAYS[reviewLevel];
  const updated = {
    ...existing,
    unitId,
    status: statusForScore(score),
    masteryScore: score,
    score,
    totalAttempts: unitAttempts.length,
    attemptCount: unitAttempts.length,
    attempts: unitAttempts.length,
    correctAttempts,
    correctCount: correctAttempts,
    incorrectAttempts,
    incorrectCount: incorrectAttempts,
    hintsUsed,
    revealedAnswers,
    reviewLevel,
    reviewStep: reviewLevel,
    reviewIntervalDays: intervalDays,
    lastStudiedAt: attempt.attemptedAt,
    lastAttemptCorrect: attempt.correct,
    lastResult: attempt.correct,
    lastAttempt: {
      correct: attempt.correct,
      usedHints: attempt.usedHints,
      revealedAnswer: attempt.revealedAnswer,
      attemptedAt: attempt.attemptedAt,
    },
    recentAttempts,
    stats: {
      attempts: unitAttempts.length,
      correct: correctAttempts,
      incorrect: incorrectAttempts,
      hintsUsed,
      revealedAnswers,
    },
    // scheduleNextReview sees this as the already-updated stage, so reading
    // the progress and scheduling again does not advance it a second time.
    reviewLevelApplied: true,
  };
  updated.nextReviewAt = scheduleNextReview(updated, new Date(attempt.attemptedAt));
  data.units[unitId] = updated;

  saveUserData(data);
  return clone(updated);
}

/** Set (or clear with null) the unit used by the resume action. */
export function setLastUnit(unitId) {
  if (unitId !== null && (typeof unitId !== "string" || !unitId.trim())) {
    throw new TypeError("setLastUnit의 unitId는 null 또는 비어 있지 않은 문자열이어야 합니다.");
  }
  const data = loadUserData();
  data.lastUnitId = unitId;
  saveUserData(data);
  return unitId;
}

/** Clear both persisted and in-memory learning data. */
export function resetData() {
  memoryData = createDefaultUserData();
  removeStoredData();
  return clone(memoryData);
}

/** Return indented JSON suitable for a manual backup. */
export function exportData() {
  return JSON.stringify(loadUserData(), null, 2);
}

/**
 * Parse, validate and persist a backup. Validation happens before any state is
 * changed, so a failed import leaves the current learning data untouched.
 */
export function importData(jsonText) {
  if (typeof jsonText !== "string") {
    throw new TypeError("학습 데이터 가져오기는 JSON 문자열을 받아야 합니다.");
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`학습 데이터 JSON을 읽을 수 없습니다: ${error.message}`);
  }
  const normalized = normalizeData(parsed, { strict: true });
  return saveUserData(normalized);
}

/** Return one unit's progress, including useful zero-valued defaults. */
export function getUnitProgress(unitId) {
  if (typeof unitId !== "string" || !unitId.trim()) {
    throw new TypeError("getUnitProgress의 unitId는 비어 있지 않은 문자열이어야 합니다.");
  }
  const data = loadUserData();
  return clone({ ...emptyUnitProgress(unitId), ...(data.units[unitId] ?? {}) });
}

/** Return a defensive copy of the persisted unit progress map. */
export function getAllProgress() {
  const data = loadUserData();
  return clone(data.units);
}

export { createDefaultUserData };
