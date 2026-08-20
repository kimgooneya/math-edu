import { createElement, link, safeDate } from "./dom.js";

export function progressScore(progress) {
  if (!progress || typeof progress !== "object") return 0;
  const value = progress.masteryScore ?? progress.score ?? progress.mastery ?? progress.percent;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return number > 1 ? Math.max(0, Math.min(1, number / 100)) : Math.max(0, Math.min(1, number));
}

export function fallbackMasteryLabel(progress) {
  const status = String(progress?.status || "").toLowerCase();
  if (status.includes("review") || status.includes("복습")) return "복습 필요";
  if (status.includes("master") || status.includes("숙달")) return "숙달";
  if (status.includes("understand") || status.includes("이해")) return "이해";
  const score = progressScore(progress);
  if (!progress || (score === 0 && !progress.attempts && !progress.lastStudiedAt)) return "미학습";
  if (score >= 0.8) return "숙달";
  if (score >= 0.6) return "이해";
  return "학습 중";
}

export function createBadge(label, className = "") {
  return createElement("span", {
    className: `badge ${className}`.trim(),
    text: label,
  });
}

export function createStatCard(label, value, detail = "") {
  const card = createElement("article", { className: "stat-card" });
  card.append(createElement("span", { className: "stat-label", text: label }));
  card.append(createElement("strong", { className: "stat-value", text: value }));
  if (detail) card.append(createElement("span", { className: "stat-detail", text: detail }));
  return card;
}

export function createProgressMeter(progress, { label = "숙련도" } = {}) {
  const score = progressScore(progress);
  const wrap = createElement("div", { className: "progress-wrap" });
  const labelEl = createElement("span", { className: "progress-label", text: `${label} ${Math.round(score * 100)}%` });
  const meter = createElement("progress", {
    attrs: { max: "1", value: String(score), "aria-label": labelEl.textContent },
  });
  wrap.append(labelEl, meter);
  return wrap;
}

export function createUnitCard(unit, progress, { masteryLabel, href = `#/learn/${encodeURIComponent(unit.id)}` } = {}) {
  const card = createElement("article", { className: "unit-card" });
  const header = createElement("div", { className: "unit-card-header" });
  const title = link(unit.title || unit.id, href, { className: "unit-card-title" });
  title.setAttribute("aria-label", `${unit.title || unit.id} 학습 시작`);
  header.append(title, createBadge(masteryLabel || fallbackMasteryLabel(progress)));
  card.append(header);

  const curriculum = createElement("div", {
    className: "unit-curriculum-tags",
    attrs: { "aria-label": "교육과정 분류" },
  });
  if (unit.level) curriculum.append(createBadge(`수준: ${unit.level}`, "badge-level"));
  if (unit.framework) curriculum.append(createBadge(`기준: ${unit.framework}`, "badge-framework"));
  if (curriculum.childNodes.length) card.append(curriculum);

  const meta = [unit.course, unit.grade, unit.domain].filter(Boolean).join(" · ");
  if (meta) card.append(createElement("p", { className: "unit-meta", text: meta }));
  if (unit.description) card.append(createElement("p", { className: "unit-description", text: unit.description }));
  if (unit.estimatedMinutes) card.append(createElement("p", { className: "unit-time", text: `약 ${unit.estimatedMinutes}분` }));
  card.append(createProgressMeter(progress));
  if (progress?.nextReviewAt) card.append(createElement("p", { className: "unit-review-date", text: `복습 예정: ${safeDate(progress.nextReviewAt)}` }));
  return card;
}
