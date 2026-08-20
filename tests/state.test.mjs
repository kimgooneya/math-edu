import test from "node:test";
import assert from "node:assert/strict";

import {
  STORAGE_KEY,
  exportData,
  getAllProgress,
  getUnitProgress,
  importData,
  loadUserData,
  recordAttempt,
  resetData,
  setLastUnit,
} from "../assets/js/store.js";
import {
  getMasteryLabel,
  getReviewQueue,
  scheduleNextReview,
} from "../assets/js/mastery.js";

function installStorage(storage) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    enumerable: true,
    value: storage,
    writable: true,
  });
  return () => {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("store works with the in-memory fallback and records unit progress", () => {
  const restore = installStorage(null);
  try {
    resetData();
    assert.deepEqual(loadUserData(), {
      schemaVersion: 1,
      profile: { displayName: "", dailyGoalMinutes: 15 },
      units: {},
      attempts: [],
      bookmarks: [],
      lastUnitId: null,
    });

    const attemptedAt = "2026-08-20T00:00:00.000Z";
    const progress = recordAttempt("alg-linear", "p1", {
      correct: true,
      usedHints: 0,
      attemptedAt,
    });
    assert.equal(progress.totalAttempts, 1);
    assert.equal(progress.correctAttempts, 1);
    assert.equal(progress.masteryScore, 1);
    assert.equal(progress.lastStudiedAt, attemptedAt);
    assert.equal(loadUserData().attempts.length, 1);
    assert.equal(getUnitProgress("alg-linear").nextReviewAt, "2026-08-21T00:00:00.000Z");

    setLastUnit("alg-linear");
    assert.equal(loadUserData().lastUnitId, "alg-linear");
    assert.ok(getAllProgress()["alg-linear"]);
  } finally {
    restore();
  }
});

test("corrupt localStorage and invalid imports do not crash or partially replace memory", () => {
  const storage = memoryStorage();
  const restore = installStorage(storage);
  try {
    resetData();
    recordAttempt("unit-a", "problem-a", { correct: false, usedHints: 1 });
    const before = loadUserData();

    storage.setItem(STORAGE_KEY, "{not valid json");
    assert.doesNotThrow(() => loadUserData());
    assert.deepEqual(loadUserData(), before);

    assert.throws(
      () => importData(JSON.stringify({ schemaVersion: 99, units: {}, attempts: [], bookmarks: [], lastUnitId: null })),
      /schemaVersion/,
    );
    assert.deepEqual(loadUserData(), before);
    assert.throws(
      () => importData(JSON.stringify({ schemaVersion: 1, units: [], attempts: [], bookmarks: [], lastUnitId: null })),
      /units.*객체/,
    );
    assert.deepEqual(loadUserData(), before);
  } finally {
    restore();
  }
});

test("mastery quality and the review queue follow the interval stages", () => {
  const base = new Date("2026-08-20T00:00:00.000Z");
  assert.equal(getMasteryLabel(0), "미학습");
  assert.equal(getMasteryLabel(0.7), "이해");
  assert.equal(getMasteryLabel(0.9), "숙달");
  assert.equal(
    scheduleNextReview({ reviewLevel: 0, reviewLevelApplied: true }, base),
    "2026-08-21T00:00:00.000Z",
  );

  const restore = installStorage(null);
  try {
    resetData();
    recordAttempt("unit-a", "p1", { correct: true, usedHints: 0, attemptedAt: base.toISOString() });
    recordAttempt("unit-a", "p2", {
      correct: true,
      usedHints: 0,
      attemptedAt: new Date(base.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    });
    assert.equal(getUnitProgress("unit-a").reviewLevel, 1);
    assert.equal(getUnitProgress("unit-a").nextReviewAt, "2026-08-24T00:00:00.000Z");

    recordAttempt("unit-b", "p1", {
      correct: true,
      usedHints: 2,
      attemptedAt: base.toISOString(),
    });
    const queue = getReviewQueue(getAllProgress(), new Date("2026-08-25T00:00:00.000Z"));
    assert.deepEqual(queue.map((progress) => progress.unitId), ["unit-b", "unit-a"]);
    assert.ok(getUnitProgress("unit-b").masteryScore < 1);
  } finally {
    restore();
  }
});

test("export and import round-trip a human-readable backup", () => {
  const restore = installStorage(null);
  try {
    resetData();
    recordAttempt("unit-export", "p1", { correct: true, usedHints: 1, attemptedAt: "2026-08-20T00:00:00.000Z" });
    const backup = exportData();
    assert.match(backup, /\n  "schemaVersion": 1/);
    resetData();
    importData(backup);
    assert.equal(getUnitProgress("unit-export").totalAttempts, 1);
    assert.equal(loadUserData().attempts[0].usedHints, 1);
  } finally {
    restore();
  }
});
