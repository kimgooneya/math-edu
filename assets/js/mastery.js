/**
 * 숙련도와 간격 반복을 계산하는 순수 함수 모음입니다.
 *
 * 이 파일은 DOM이나 localStorage를 참조하지 않으므로 브라우저와 Node에서
 * 같은 방식으로 사용할 수 있습니다. 날짜는 저장하기 쉬운 ISO 문자열로
 * 반환합니다.
 */

export const REVIEW_INTERVAL_DAYS = Object.freeze([1, 3, 7, 14, 30]);
export const MAX_REVIEW_LEVEL = REVIEW_INTERVAL_DAYS.length - 1;

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_ATTEMPT_LIMIT = 20;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clamp(value, minimum = 0, maximum = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.min(maximum, Math.max(minimum, number));
}

function toDate(value, fallback = new Date()) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? new Date(fallback) : new Date(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date(fallback) : date;
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date(fallback) : date;
  }
  return new Date(fallback);
}

function timestamp(value) {
  if (value instanceof Date) {
    const result = value.getTime();
    return Number.isNaN(result) ? null : result;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const result = Date.parse(value);
    return Number.isNaN(result) ? null : result;
  }
  return null;
}

function numberOfHints(attempt) {
  if (!isObject(attempt)) return 0;
  const value = attempt.usedHints ?? attempt.hintsUsed ?? attempt.result?.usedHints;
  if (Array.isArray(value)) return value.length;
  if (typeof value === "boolean") return value ? 1 : 0;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function revealedAnswer(attempt) {
  if (!isObject(attempt)) return false;
  return Boolean(
    attempt.revealedAnswer ??
      attempt.answerRevealed ??
      attempt.result?.revealedAnswer ??
      false,
  );
}

function correctAnswer(attempt) {
  if (!isObject(attempt)) return false;
  return Boolean(attempt.correct ?? attempt.result?.correct ?? false);
}

function normalizeAttempt(attempt, index) {
  if (!isObject(attempt)) return null;
  const attemptedAt = attempt.attemptedAt ?? attempt.result?.attemptedAt;
  return {
    correct: correctAnswer(attempt),
    usedHints: numberOfHints(attempt),
    revealedAnswer: revealedAnswer(attempt),
    attemptedAt,
    index,
  };
}

/**
 * Get the attempt history embedded in a unit progress object.
 *
 * The store keeps `recentAttempts`, while accepting `attempts` and
 * `attemptHistory` here makes this function useful with older/exported data
 * and with small hand-written fixtures.
 */
function getAttemptHistory(progress) {
  if (!isObject(progress)) return [];
  const candidates = [
    progress.recentAttempts,
    progress.attemptHistory,
    progress.stats?.attempts,
    progress.attempts,
  ];
  const source = candidates.find((value) => Array.isArray(value));
  if (!source) return [];

  const unitId = typeof progress.unitId === "string" ? progress.unitId : null;
  const attempts = source
    .map(normalizeAttempt)
    .filter(Boolean)
    .filter((attempt, index) => {
      const original = source[index];
      return !unitId || typeof original?.unitId !== "string" || original.unitId === unitId;
    });

  // Preserve input order when timestamps are missing or equal. This makes a
  // plain array deterministic while still handling imported records in any
  // order.
  return attempts
    .map((attempt, index) => ({ ...attempt, index }))
    .sort((left, right) => {
      const leftTime = timestamp(left.attemptedAt);
      const rightTime = timestamp(right.attemptedAt);
      if (leftTime === null && rightTime === null) return left.index - right.index;
      if (leftTime === null) return -1;
      if (rightTime === null) return 1;
      return leftTime - rightTime || left.index - right.index;
    })
    .slice(-RECENT_ATTEMPT_LIMIT);
}

function attemptQuality(attempt) {
  if (!attempt.correct) return 0;

  // Seeing the full answer is a much weaker signal than solving with a hint.
  // A revealed answer is still retained as a small positive signal so that a
  // learner can recover from it through later independent attempts.
  if (attempt.revealedAnswer) return 0.2;

  const hints = Math.max(0, numberOfHints(attempt));
  // No hint: 1.00, one hint: .85, two: .70, ...; never let hints make a
  // correct answer look like independent mastery.
  return clamp(1 - hints * 0.15, 0.25, 1);
}

function numericProgressValue(progress, names) {
  for (const name of names) {
    for (const value of [progress?.[name], progress?.stats?.[name]]) {
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
  }
  return null;
}

/**
 * Calculate a unit's mastery score in the inclusive range [0, 1].
 *
 * The newest attempts have the greatest weight, so a learner can recover from
 * an early mistake without an old result permanently dominating the score.
 */
export function calculateUnitMastery(progress = {}) {
  const attempts = getAttemptHistory(progress);
  if (attempts.length > 0) {
    let weightedTotal = 0;
    let weightTotal = 0;
    attempts.forEach((attempt, index) => {
      // The most recent attempt receives weight 1, and older attempts decay
      // gently. This avoids a single repeated problem making the score jump
      // too quickly while still responding to new evidence.
      const weight = 0.85 ** (attempts.length - index - 1);
      weightedTotal += attemptQuality(attempt) * weight;
      weightTotal += weight;
    });
    return clamp(weightTotal === 0 ? 0 : weightedTotal / weightTotal);
  }

  const totalAttempts = numericProgressValue(progress, [
    "totalAttempts",
    "attemptCount",
    "total",
    "totalQuestions",
    "attempts",
  ]);
  const correctAttempts = numericProgressValue(progress, [
    "correctAttempts",
    "correctCount",
    "correctAnswers",
    "correct",
  ]);
  if (totalAttempts !== null && totalAttempts > 0 && correctAttempts !== null) {
    let aggregateScore = clamp(correctAttempts / totalAttempts);
    const hintsUsed = numericProgressValue(progress, ["hintsUsed", "hintCount"]);
    const revealedAnswers = numericProgressValue(progress, ["revealedAnswers", "revealedAnswerCount"]);
    if (revealedAnswers !== null && revealedAnswers > 0) {
      aggregateScore *= Math.max(0.2, 1 - Math.min(1, revealedAnswers / totalAttempts) * 0.8);
    }
    if (hintsUsed !== null && hintsUsed > 0) {
      aggregateScore *= Math.max(0.25, 1 - Math.min(1, hintsUsed / totalAttempts) * 0.15);
    }
    return clamp(aggregateScore);
  }

  const score = numericProgressValue(progress, ["masteryScore", "score"]);
  return score === null ? 0 : clamp(score);
}

function hasAttemptEvidence(progress) {
  if (!isObject(progress)) return false;
  if (getAttemptHistory(progress).length > 0) return true;
  const total = numericProgressValue(progress, ["totalAttempts", "attemptCount", "total", "attempts"]);
  return (total !== null && total > 0) || Boolean(progress.lastStudiedAt);
}

function isDue(progress, now = new Date()) {
  const next = timestamp(progress?.nextReviewAt);
  return next !== null && next <= toDate(now).getTime();
}

/**
 * Return the user-facing mastery state used by the progress screen.
 *
 * A progress object that is past its review date is labelled "복습 필요" even
 * when its score was previously high. A bare numeric score has no attempt
 * metadata, so zero is treated as "미학습".
 */
export function getMasteryLabel(scoreOrProgress = 0) {
  const progress = isObject(scoreOrProgress) ? scoreOrProgress : null;
  const score = clamp(
    progress ? numericProgressValue(progress, ["masteryScore", "score"]) ?? calculateUnitMastery(progress) : scoreOrProgress,
  );

  if (progress && isDue(progress)) return "복습 필요";
  if (score <= 0 && (!progress || !hasAttemptEvidence(progress))) return "미학습";
  if (score < 0.6) return "학습 중";
  if (score < 0.8) return "이해";
  return "숙달";
}

function explicitReviewLevel(progress) {
  if (!isObject(progress)) return null;
  for (const key of ["reviewLevel", "reviewStep", "reviewIndex", "reviewStage", "intervalIndex"]) {
    const value = progress[key];
    if (Number.isInteger(value)) return Math.min(MAX_REVIEW_LEVEL, Math.max(0, value));
  }
  return null;
}

function inferReviewLevel(progress) {
  const score = calculateUnitMastery(progress);
  if (score >= 0.95) return 4;
  if (score >= 0.85) return 3;
  if (score >= 0.75) return 2;
  if (score >= 0.6) return 1;
  return 0;
}

function latestOutcome(progress) {
  if (typeof progress?.lastAttemptCorrect === "boolean") return progress.lastAttemptCorrect;
  if (typeof progress?.lastResult === "boolean") return progress.lastResult;
  if (typeof progress?.lastResult?.correct === "boolean") return progress.lastResult.correct;
  if (typeof progress?.lastCorrect === "boolean") return progress.lastCorrect;
  if (typeof progress?.correct === "boolean") return progress.correct;
  if (typeof progress?.result?.correct === "boolean") return progress.result.correct;
  if (isObject(progress?.lastAttempt) && typeof progress.lastAttempt.correct === "boolean") {
    return progress.lastAttempt.correct;
  }
  const attempts = getAttemptHistory(progress);
  if (attempts.length === 0) return null;
  return attempts[attempts.length - 1].correct;
}

function levelForSchedule(progress) {
  const explicit = explicitReviewLevel(progress);
  const current = explicit ?? inferReviewLevel(progress);

  // The store marks a level as already applied when it records an attempt.
  // This keeps calling scheduleNextReview on persisted progress idempotent.
  if (progress?.reviewLevelApplied === true || progress?.scheduleLevelOnly === true) {
    return current;
  }

  const outcome = latestOutcome(progress);
  if (outcome === null) return current;

  const history = getAttemptHistory(progress);
  // An explicitly supplied stage represents the current stage. Callers that
  // want to schedule the first attempt at stage zero can mark it as already
  // applied (as store.js does); otherwise a success advances it and a failure
  // keeps it at the one-day floor.
  const hasPriorReview = Boolean(
    explicit !== null ||
      progress?.nextReviewAt ||
      progress?.reviewCount > 0 ||
      history.length > 1,
  );

  // The first result starts at the one-day interval. A later success advances
  // one stage; a failure backs up one stage but never below one day.
  if (!hasPriorReview) return 0;
  return outcome
    ? Math.min(MAX_REVIEW_LEVEL, current + 1)
    : Math.max(0, current - 1);
}

/**
 * Schedule the next review and return its ISO timestamp.
 *
 * `now` is an optional Date, timestamp, or date string and is the anchor for
 * the interval. The function accepts the progress object produced by store.js
 * as well as a small object containing `reviewLevel` and the latest result.
 */
export function scheduleNextReview(progress = {}, now = new Date()) {
  const anchor = toDate(now);
  const level = levelForSchedule(progress);
  const intervalDays = REVIEW_INTERVAL_DAYS[level];
  return new Date(anchor.getTime() + intervalDays * DAY_MS).toISOString();
}

function clone(value) {
  if (value === undefined) return undefined;
  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch {
    // Fall through to the JSON clone for plain persisted data.
  }
  return JSON.parse(JSON.stringify(value));
}

/**
 * Return due units sorted by the oldest review date first.
 *
 * Both the persisted `units` map and an array of progress records are accepted
 * to keep the helper convenient for UI code and tests.
 */
export function getReviewQueue(allProgress = {}, now = new Date()) {
  let entries;
  if (Array.isArray(allProgress)) {
    entries = allProgress.map((progress, index) => [progress?.unitId ?? progress?.id ?? String(index), progress]);
  } else if (isObject(allProgress?.units)) {
    entries = Object.entries(allProgress.units);
  } else if (isObject(allProgress)) {
    entries = Object.entries(allProgress);
  } else {
    entries = [];
  }

  const nowTime = toDate(now).getTime();
  return entries
    .filter(([, progress]) => isObject(progress))
    .map(([key, progress]) => {
      const nextTime = timestamp(progress.nextReviewAt);
      const unitId = typeof progress.unitId === "string" && progress.unitId ? progress.unitId : key;
      return { progress, nextTime, unitId };
    })
    .filter((entry) => entry.nextTime !== null && entry.nextTime <= nowTime)
    .sort((left, right) => left.nextTime - right.nextTime || left.unitId.localeCompare(right.unitId))
    .map(({ progress, unitId }) => ({ ...clone(progress), unitId }));
}

export { DAY_MS, RECENT_ATTEMPT_LIMIT };
