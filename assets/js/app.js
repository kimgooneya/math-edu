import { createRouter, navigate } from "./router.js";
import { loadAllContent } from "./content-loader.js";
import {
  loadUserData,
  recordAttempt,
  setLastUnit,
  resetData,
  exportData,
  importData,
  getUnitProgress,
  getAllProgress,
} from "./store.js";
import { calculateUnitMastery, getMasteryLabel, getReviewQueue } from "./mastery.js";
import { checkAnswer } from "./answer-checkers.js";
import {
  appendChildren,
  button,
  clear,
  createElement,
  focusHeading,
  heading,
  link,
  safeDate,
  setLiveMessage,
} from "./ui/dom.js";
import { appendTheory, createHintPanel, createProblemControl } from "./ui/blocks.js";
import {
  createBadge,
  createProgressMeter,
  createStatCard,
  createUnitCard,
  fallbackMasteryLabel,
  progressScore,
} from "./ui/cards.js";

const appState = {
  root: null,
  main: null,
  router: null,
  content: null,
  userData: null,
  loading: true,
  error: null,
  route: null,
  catalogFilters: { query: "", course: "all", grade: "all", level: "all", domain: "all" },
  learnSessions: new Map(),
  renderNumber: 0,
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unitList() {
  return asArray(appState.content?.units);
}

function getUnit(unitId) {
  if (!unitId) return null;
  return appState.content?.byId?.get?.(unitId) || unitList().find((unit) => unit.id === unitId) || null;
}

function progressFallback(unitId) {
  const units = appState.userData?.units;
  if (units && typeof units === "object") return units[unitId] || {};
  const progress = appState.userData?.progress;
  if (progress && typeof progress === "object") return progress[unitId] || {};
  return {};
}

function unitProgress(unitId) {
  try {
    const result = getUnitProgress(unitId, appState.userData);
    if (result && typeof result === "object") return result;
  } catch {
    try {
      const result = getUnitProgress(appState.userData, unitId);
      if (result && typeof result === "object") return result;
    } catch {
      // Local fallback below keeps a corrupted optional progress record from
      // making the catalog unusable.
    }
  }
  return progressFallback(unitId);
}

function allProgress() {
  try {
    const result = getAllProgress(appState.userData);
    if (Array.isArray(result)) return result;
    if (result && typeof result === "object") return result;
  } catch {
    try {
      const result = getAllProgress();
      if (Array.isArray(result)) return result;
      if (result && typeof result === "object") return result;
    } catch {
      // Use the shape kept by the store as a safe fallback.
    }
  }
  return appState.userData?.units || appState.userData?.progress || {};
}

function progressForList(unitId, progressMap = allProgress()) {
  if (Array.isArray(progressMap)) {
    return progressMap.find((entry) => entry?.unitId === unitId || entry?.id === unitId) || unitProgress(unitId);
  }
  return progressMap?.[unitId] || unitProgress(unitId);
}

function masteryFor(unit, progress = unitProgress(unit.id)) {
  let calculated = null;
  try {
    // mastery.js accepts the persisted unit progress object.  Keep the
    // additional fallbacks for compatible future implementations.
    calculated = calculateUnitMastery(progress);
  } catch {
    try {
      calculated = calculateUnitMastery(unit.id, appState.userData);
    } catch {
      try {
        calculated = calculateUnitMastery(unit, appState.userData);
      } catch {
        calculated = progress;
      }
    }
  }
  const score = calculated?.masteryScore ?? calculated?.score ?? calculated?.mastery ?? calculated;
  let label = "";
  try {
    // Passing the progress object lets mastery.js distinguish an overdue
    // review from a merely high score.
    label = getMasteryLabel(progress);
  } catch {
    try {
      label = getMasteryLabel(calculated);
    } catch {
      label = "";
    }
  }
  return {
    score: Number.isFinite(Number(score)) ? Number(score) : progressScore(progress),
    label: label || fallbackMasteryLabel({ ...progress, masteryScore: score }),
    value: calculated,
  };
}

function isComplete(progress, unit) {
  if (!progress) return false;
  if (progress.completed === true || progress.status === "mastered" || progress.status === "completed") return true;
  return masteryFor(unit, progress).score >= 0.8;
}

function isReviewDue(progress) {
  if (!progress) return false;
  const status = String(progress.status || "").toLowerCase();
  if (status.includes("review") || status.includes("복습")) return true;
  if (!progress.nextReviewAt) return false;
  const when = new Date(progress.nextReviewAt).getTime();
  return Number.isFinite(when) && when <= Date.now();
}

function reviewUnits() {
  let queue = [];
  try {
    // mastery.js accepts the progress map (or the full user-data object) and
    // uses its second argument as a Date. Do not pass the unit list there.
    queue = getReviewQueue(appState.userData) || [];
  } catch {
    try {
      queue = getReviewQueue(allProgress()) || [];
    } catch {
      queue = [];
    }
  }
  if (queue && !Array.isArray(queue) && Array.isArray(queue.queue)) queue = queue.queue;
  const ids = new Set();
  for (const entry of asArray(queue)) {
    const id = typeof entry === "string" ? entry : entry?.unitId || entry?.id;
    if (id) ids.add(id);
  }
  if (!ids.size) {
    for (const unit of unitList()) if (isReviewDue(unitProgress(unit.id))) ids.add(unit.id);
  }
  return unitList().filter((unit) => ids.has(unit.id));
}

function lastUnit() {
  const candidate = appState.userData?.lastUnitId
    || appState.userData?.lastUnit
    || appState.userData?.profile?.lastUnitId
    || appState.userData?.profile?.lastUnit;
  return getUnit(typeof candidate === "object" ? candidate.id : candidate);
}

async function refreshUserData() {
  try {
    const data = await Promise.resolve(loadUserData());
    if (data && typeof data === "object") appState.userData = data;
  } catch {
    // A broken localStorage record should be treated as an empty profile by
    // the store.  Keep the already loaded value if it can be displayed.
  }
}

function appShell(root) {
  clear(root);
  const header = createElement("header", { className: "site-header" });
  const inner = createElement("div", { className: "site-header__inner" });
  const brand = link("매듭수학", "#/", { className: "brand" });
  brand.setAttribute("aria-label", "매듭수학 홈");
  const nav = createElement("nav", { className: "main-nav", attrs: { id: "main-navigation", "aria-label": "내 학습" } });
  nav.append(link("내 학습", "#/progress"));
  inner.append(brand, nav);
  header.append(inner);
  const main = createElement("main", { attrs: { id: "main-content", tabindex: "-1" } });
  const footer = createElement("footer", { className: "site-footer" });
  footer.append(createElement("p", { text: "학습 기록은 이 브라우저에만 저장됩니다." }));
  root.append(header, main, footer);
  appState.main = main;
  return main;
}

function renderLoading() {
  if (!appState.main) return;
  clear(appState.main);
  const section = createElement("section", { className: "state state-loading", attrs: { "aria-busy": "true" } });
  section.append(heading(1, "수학 학습을 준비하고 있어요"));
  section.append(createElement("p", { text: "학습 단원과 진도를 불러오는 중입니다." }));
  appState.main.append(section);
}

function renderError(error = appState.error) {
  if (!appState.main) return;
  clear(appState.main);
  const section = createElement("section", { className: "state state-error" });
  section.append(heading(1, "콘텐츠를 불러오지 못했어요"));
  section.append(createElement("p", {
    text: error?.message || "잠시 후 다시 시도해 주세요. 네트워크 또는 콘텐츠 파일을 확인해 주세요.",
  }));
  const actions = createElement("div", { className: "button-row" });
  actions.append(button("다시 시도", {
    onClick: async () => {
      appState.loading = true;
      renderLoading();
      try {
        appState.content = await loadAllContent({ force: true });
        appState.error = null;
        appState.loading = false;
        renderRoute(appState.route || { name: "home" }, false);
      } catch (retryError) {
        appState.error = retryError;
        appState.loading = false;
        renderError(retryError);
      }
    },
  }));
  actions.append(link("카탈로그로", "#/catalog", { className: "button button-secondary" }));
  section.append(actions);
  appState.main.append(section);
  focusHeading(appState.main);
}

function renderNotFound(route) {
  clear(appState.main);
  const section = createElement("section", { className: "state state-not-found" });
  section.append(heading(1, "페이지를 찾을 수 없어요"));
  section.append(createElement("p", { text: `${route?.requestedPath || "요청한 경로"}는 지원하지 않는 경로입니다.` }));
  section.append(link("홈으로 돌아가기", "#/", { className: "button" }));
  appState.main.append(section);
}

function renderHero() {
  const hero = createElement("section", { className: "hero" });
  const copy = createElement("div", { className: "hero__copy" });
  copy.append(createElement("p", { className: "eyebrow", text: "개념을 연결하고, 스스로 풀어요" }));
  copy.append(heading(1, "오늘도 한 걸음씩 수학을 이어가요"));
  copy.append(createElement("p", {
    className: "hero__lead",
    text: "짧은 개념 설명과 단계별 힌트로 막힌 문제를 다시 자기 힘으로 풀어 보세요.",
  }));
  const actions = createElement("div", { className: "button-row" });
  const previous = lastUnit();
  actions.append(link(previous ? "이어서 학습하기" : "첫 단원 시작하기", previous ? `#/learn/${encodeURIComponent(previous.id)}` : "#/catalog", { className: "button primary" }));
  actions.append(link("개념으로 찾기", "#/catalog", { className: "button button-secondary" }));
  copy.append(actions);
  hero.append(copy);
  return hero;
}

function renderHome() {
  clear(appState.main);
  const section = createElement("section", { className: "page page-home" });
  section.append(renderHero());

  const units = unitList();
  const progress = allProgress();
  const completed = units.filter((unit) => isComplete(progressForList(unit.id, progress), unit)).length;
  const reviews = reviewUnits();
  const attempted = units.filter((unit) => {
    const item = progressForList(unit.id, progress);
    return Boolean(item?.attempts || item?.attemptCount || item?.lastStudiedAt || item?.status);
  }).length;
  const stats = createElement("section", { className: "dashboard-grid stats-grid", attrs: { "aria-label": "학습 통계" } });
  stats.append(
    createStatCard("전체 단원", `${units.length}개`, attempted ? `${attempted}개 학습 기록 있음` : "아직 시작 전"),
    createStatCard("완료한 단원", `${completed}개`, units.length ? `${Math.round((completed / units.length) * 100)}%` : "-"),
    createStatCard("복습 예정", `${reviews.length}개`, reviews.length ? "오늘 확인해 보세요" : "현재 없음"),
  );
  section.append(stats);

  const continueSection = createElement("section", { className: "content-section" });
  continueSection.append(heading(2, "이어서 학습하기"));
  const previous = lastUnit();
  if (previous) {
    const progressItem = unitProgress(previous.id);
    continueSection.append(createUnitCard(previous, progressItem, { masteryLabel: masteryFor(previous, progressItem).label }));
  } else {
    const empty = createElement("div", { className: "empty-state" });
    empty.append(createElement("p", { text: "아직 이어서 학습할 단원이 없습니다." }));
    empty.append(link("카탈로그 둘러보기", "#/catalog", { className: "button button-secondary" }));
    continueSection.append(empty);
  }
  section.append(continueSection);

  const recommendationSection = createElement("section", { className: "content-section" });
  recommendationSection.append(heading(2, reviews.length ? "오늘의 복습" : "추천 단원"));
  const recommendations = (reviews.length ? reviews : units.filter((unit) => !isComplete(unitProgress(unit.id), unit))).slice(0, 3);
  if (!recommendations.length) {
    recommendationSection.append(createElement("p", { text: "모든 단원을 살펴봤어요. 새로운 콘텐츠를 준비 중입니다." }));
  } else {
    const grid = createElement("div", { className: "unit-grid" });
    for (const unit of recommendations) {
      const item = unitProgress(unit.id);
      grid.append(createUnitCard(unit, item, { masteryLabel: masteryFor(unit, item).label }));
    }
    recommendationSection.append(grid);
  }
  section.append(recommendationSection);

  const principles = createElement("section", { className: "content-section principles" });
  principles.append(heading(2, "학습 원칙"));
  const list = createElement("ul");
  [
    ["개념 연결", "현재 단원에 필요한 선수개념부터 확인해요."],
    ["풀이 과정", "정답보다 다음에 시도할 행동을 알려 드려요."],
    ["짧은 복습", "한 번에 오래 하기보다 잊기 전에 다시 만나요."],
  ].forEach(([title, body]) => {
    const item = createElement("li");
    item.append(createElement("strong", { text: title }), createElement("span", { text: body }));
    list.append(item);
  });
  principles.append(list);
  section.append(principles);

  const notice = createElement("p", { className: "storage-notice", text: "로그인 없이 사용하며, 학습 기록은 이 브라우저의 로컬 저장소에 보관됩니다. 브라우저 데이터를 지우면 기록도 사라질 수 있어요." });
  section.append(notice);
  appState.main.append(section);
}

function filterValues(field) {
  const values = new Set();
  for (const unit of unitList()) if (unit[field]) values.add(String(unit[field]));
  return [...values].sort((a, b) => a.localeCompare(b, "ko"));
}

function unitMatches(unit) {
  const { query, course, grade, level, domain } = appState.catalogFilters;
  for (const [field, selected] of Object.entries({ course, grade, level, domain })) {
    if (selected !== "all" && String(unit[field] || "") !== selected) return false;
  }
  if (!query) return true;
  const haystack = [
    unit.id,
    unit.title,
    unit.description,
    unit.grade,
    unit.course,
    unit.level,
    unit.framework,
    unit.domain,
    ...asArray(unit.standards),
    ...asArray(unit.pathways),
    ...asArray(unit.aliases),
  ].join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function createCatalogSelect(field, labelText) {
  const label = createElement("label", { text: labelText });
  const select = createElement("select", { attrs: { name: field } });
  [["all", "전체"], ...filterValues(field).map((value) => [value, value])].forEach(([value, optionLabel]) => {
    const option = createElement("option", { text: optionLabel, attrs: { value } });
    if (value === appState.catalogFilters[field]) option.selected = true;
    select.append(option);
  });
  label.append(select);
  return { label, select };
}

function renderCatalog() {
  clear(appState.main);
  const section = createElement("section", { className: "page page-catalog" });
  section.append(heading(1, "전체 학습"));
  section.append(createElement("p", { className: "page-lead", text: "과정, 학년, 수준, 개념 영역을 고르거나 성취기준과 학습 경로까지 검색해 보세요." }));

  const form = createElement("form", { className: "filters catalog-filters", attrs: { role: "search" } });
  const searchLabel = createElement("label", { text: "단원 검색" });
  const search = createElement("input", {
    attrs: { type: "search", name: "query", placeholder: "예: 일차방정식", value: appState.catalogFilters.query },
  });
  searchLabel.append(search);

  const courseFilter = createCatalogSelect("course", "과정");
  const gradeFilter = createCatalogSelect("grade", "학년");
  const levelFilter = createCatalogSelect("level", "수준");
  const domainFilter = createCatalogSelect("domain", "영역");
  form.append(searchLabel, courseFilter.label, gradeFilter.label, levelFilter.label, domainFilter.label);

  const results = createElement("div", { className: "catalog-results" });
  const update = () => {
    appState.catalogFilters = {
      query: search.value.trim(),
      course: courseFilter.select.value,
      grade: gradeFilter.select.value,
      level: levelFilter.select.value,
      domain: domainFilter.select.value,
    };
    const filtered = unitList().filter(unitMatches);
    results.replaceChildren();
    results.append(createElement("p", { className: "result-count", text: `${filtered.length}개 단원` }));
    if (!filtered.length) {
      results.append(createElement("div", { className: "empty-state", children: [createElement("p", { text: "조건에 맞는 단원이 없습니다." })] }));
      return;
    }
    const grid = createElement("div", { className: "unit-grid" });
    const progressMap = allProgress();
    for (const unit of filtered) {
      const progress = progressForList(unit.id, progressMap);
      grid.append(createUnitCard(unit, progress, { masteryLabel: masteryFor(unit, progress).label }));
    }
    results.append(grid);
  };
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  section.append(form, results);
  appState.main.append(section);
  update();
}

function renderObjectives(unit) {
  const section = createElement("section", { className: "lesson-objectives" });
  section.append(heading(2, "학습 목표"));
  const list = createElement("ul");
  const objectives = asArray(unit.objectives);
  if (!objectives.length) list.append(createElement("li", { text: "이 단원의 핵심 개념을 이해하고 문제에 적용합니다." }));
  for (const objective of objectives) list.append(createElement("li", { text: objective }));
  section.append(list);
  if (asArray(unit.prerequisites).length) {
    section.append(createElement("h3", { text: "먼저 확인하면 좋은 개념" }));
    const links = createElement("ul", { className: "prerequisite-list" });
    for (const id of unit.prerequisites) {
      const target = getUnit(id);
      const item = createElement("li");
      if (target) item.append(link(target.title || id, `#/learn/${encodeURIComponent(id)}`));
      else item.append(createElement("span", { text: id }));
      links.append(item);
    }
    section.append(links);
  }
  return section;
}

function misconceptionFor(problem, raw) {
  for (const item of asArray(problem.misconceptions)) {
    if (!item || typeof item !== "object") continue;
    const match = item.match;
    if (match instanceof RegExp && match.test(raw)) return item.feedback;
    if (match !== undefined && String(raw).trim() === String(match).trim()) return item.feedback;
  }
  return "";
}

function recordAttemptSafely(payload) {
  try {
    return Promise.resolve(recordAttempt(payload.unitId, payload.problemId, {
      correct: payload.correct,
      usedHints: payload.usedHints ?? payload.hintsUsed ?? 0,
      revealedAnswer: payload.revealedAnswer ?? payload.answerRevealed ?? false,
      attemptedAt: payload.attemptedAt,
    }));
  } catch {
    try {
      return Promise.resolve(recordAttempt(payload));
    } catch {
      return Promise.resolve();
    }
  }
}

function setLastUnitSafely(unitId) {
  try {
    return Promise.resolve(setLastUnit(unitId));
  } catch {
    try {
      return Promise.resolve(setLastUnit({ unitId }));
    } catch {
      return Promise.resolve();
    }
  }
}

function createLessonSession(unit) {
  const existing = appState.learnSessions.get(unit.id);
  if (existing) return existing;
  const session = {
    index: 0,
    hintsByProblem: new Map(),
    results: new Map(),
    completed: false,
  };
  appState.learnSessions.set(unit.id, session);
  return session;
}

function allProblemsCorrect(unit, session) {
  const problems = asArray(unit.problems);
  return problems.length > 0 && problems.every((problem) => session.results.get(problem.id || problems.indexOf(problem))?.correct === true);
}

function renderCompletion(unit, session) {
  clear(appState.main);
  const section = createElement("section", { className: "page page-complete" });
  section.append(createElement("p", { className: "eyebrow", text: "학습 세션 완료" }));
  section.append(heading(1, `${unit.title}을(를) 마쳤어요`));
  const total = asArray(unit.problems).length;
  const correct = [...session.results.values()].filter((result) => result.correct).length;
  const hintCount = [...session.hintsByProblem.values()].reduce((sum, value) => sum + value, 0);
  const summary = createElement("div", { className: "summary-grid" });
  summary.append(createStatCard("정답", `${correct}/${total}`), createStatCard("힌트", `${hintCount}회`));
  const progress = unitProgress(unit.id);
  const mastery = masteryFor(unit, progress);
  summary.append(createStatCard("현재 숙련도", mastery.label, `${Math.round(mastery.score * 100)}%`));
  section.append(summary);
  section.append(createElement("p", { className: "completion-message", text: "오늘 배운 개념을 짧게 복습하고, 다음 복습 예정일에 다시 확인해 보세요." }));
  if (progress.nextReviewAt) section.append(createElement("p", { text: `다음 복습 예정: ${safeDate(progress.nextReviewAt)}` }));
  const actions = createElement("div", { className: "button-row" });
  actions.append(link("다른 단원 찾기", "#/catalog", { className: "button primary" }));
  actions.append(link("내 학습 보기", "#/progress", { className: "button button-secondary" }));
  section.append(actions);
  appState.main.append(section);
}

function renderProblem(unit, session, lessonBody) {
  const problems = asArray(unit.problems);
  if (!problems.length) {
    lessonBody.append(createElement("div", { className: "empty-state", children: [createElement("p", { text: "이 단원에는 아직 연습문제가 없습니다." })] }));
    return;
  }
  const index = Math.max(0, Math.min(session.index, problems.length - 1));
  session.index = index;
  const problem = problems[index];
  const key = problem.id || `${unit.id}-${index}`;
  const card = createElement("section", { className: "problem-card", attrs: { "aria-labelledby": `problem-title-${index}` } });
  const progressLine = createElement("p", { className: "problem-progress", text: `문제 ${index + 1} / ${problems.length}` });
  card.append(progressLine, heading(2, problem.prompt || "문제를 읽고 답을 입력하세요.", { id: `problem-title-${index}` }));
  if (problem.formula) card.append(createElement("div", { className: "formula", text: problem.formula, attrs: { role: "img", "aria-label": `수식: ${problem.formula}` } }));

  const answerForm = createElement("form", { className: "answer-form" });
  const control = createProblemControl(problem, key);
  control.control.setAttribute("aria-describedby", `feedback-${index}`);
  answerForm.append(control.control);
  const hintCount = session.hintsByProblem.get(key) || 0;
  const hints = createHintPanel(problem.hints, (count) => session.hintsByProblem.set(key, Math.max(count, session.hintsByProblem.get(key) || 0)));
  if (hints.childNodes.length) answerForm.append(hints);
  const feedback = createElement("div", { className: "feedback", attrs: { id: `feedback-${index}`, role: "status", "aria-live": "polite" } });
  const result = session.results.get(key);
  const actions = createElement("div", { className: "problem-actions" });
  const submit = button("답 확인", { type: "submit", className: "button primary" });
  actions.append(submit);
  answerForm.append(actions, feedback);

  const explanation = createElement("details", { className: "explanation", hidden: true });
  explanation.append(createElement("summary", { text: "해설 보기" }));
  const explanationBody = createElement("div");
  if (problem.explanation) explanationBody.append(createElement("p", { text: problem.explanation }));
  if (problem.answer !== undefined) explanationBody.append(createElement("p", { children: [createElement("strong", { text: "정답: " }), createElement("span", { text: formatAnswer(problem.answer) })] }));
  explanation.append(explanationBody);
  answerForm.append(explanation);

  const navigation = createElement("div", { className: "problem-navigation" });
  const previous = button("이전 문제", { className: "button button-secondary", onClick: () => {
    if (session.index > 0) {
      session.index -= 1;
      renderLesson(unit, false);
    }
  } });
  previous.disabled = index === 0;
  navigation.append(previous);
  const next = button(index === problems.length - 1 ? "학습 요약 보기" : "다음 문제", { className: "button button-secondary", onClick: () => {
    if (index === problems.length - 1) {
      if (allProblemsCorrect(unit, session)) {
        session.completed = true;
        void setLastUnitSafely(unit.id);
        renderCompletion(unit, session);
      } else {
        setLiveMessage(feedback, "모든 문제를 한 번씩 맞힌 뒤 요약을 확인할 수 있어요. 틀린 문제를 다시 풀어 보세요.", "warning");
      }
      return;
    }
    session.index += 1;
    renderLesson(unit, false);
  } });
  next.disabled = Boolean(result && !result.correct && index === problems.length - 1);
  navigation.append(next);
  answerForm.append(navigation);
  card.append(answerForm);
  lessonBody.append(card);

  const restoreResult = () => {
    if (!result) return;
    if (result.correct) {
      control.focusTarget && (control.focusTarget.disabled = true);
      submit.disabled = true;
      setLiveMessage(feedback, result.message || "정답이에요! 풀이 과정을 확인해 보세요.", "success");
    } else {
      setLiveMessage(feedback, result.message || misconceptionFor(problem, result.rawAnswer) || "아직 맞지 않아요. 힌트를 참고해 다시 시도해 보세요.", "error");
    }
    explanation.hidden = false;
  };
  restoreResult();
  answerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const rawAnswer = control.getValue();
    if (!String(rawAnswer).trim()) {
      setLiveMessage(feedback, "답을 입력한 뒤 확인해 주세요.", "warning");
      control.focusTarget?.focus();
      return;
    }
    let checked;
    try {
      checked = checkAnswer(problem, rawAnswer) || { correct: false };
    } catch {
      checked = { correct: false, message: "이 문제의 답을 확인하는 중 오류가 발생했습니다." };
    }
    const correct = checked.correct === true;
    const attempt = {
      unitId: unit.id,
      problemId: key,
      rawAnswer: String(rawAnswer),
      answer: String(rawAnswer),
      correct,
      usedHints: session.hintsByProblem.get(key) || 0,
      hintsUsed: session.hintsByProblem.get(key) || 0,
      hintCount: session.hintsByProblem.get(key) || 0,
      attemptedAt: new Date().toISOString(),
      revealedAnswer: false,
      answerRevealed: false,
    };
    session.results.set(key, { ...attempt, message: checked.message, normalized: checked.normalized });
    await recordAttemptSafely(attempt);
    await refreshUserData();
    setLiveMessage(
      feedback,
      correct ? (checked.message || "정답이에요! 풀이 과정을 확인해 보세요.") : (checked.message || misconceptionFor(problem, rawAnswer) || "아직 맞지 않아요. 힌트를 참고해 다시 시도해 보세요."),
      correct ? "success" : "error",
    );
    explanation.hidden = false;
    if (correct) {
      control.focusTarget && (control.focusTarget.disabled = true);
      submit.disabled = true;
    }
    if (correct && index === problems.length - 1) {
      next.disabled = false;
      setLiveMessage(feedback, `${checked.message || "정답이에요!"} 모든 문제를 맞히면 학습 요약을 열 수 있어요.`, "success");
    }
  });
}

function formatAnswer(answer) {
  if (answer && typeof answer === "object") {
    if (answer.numerator !== undefined && answer.denominator !== undefined) return `${answer.numerator}/${answer.denominator}`;
    if (Array.isArray(answer)) return answer.join(", ");
    try { return JSON.stringify(answer); } catch { return String(answer); }
  }
  return String(answer ?? "");
}

function renderLesson(unit, shouldFocus = true) {
  const session = createLessonSession(unit);
  if (!session.lastUnitSaved) {
    session.lastUnitSaved = true;
    void setLastUnitSafely(unit.id);
  }
  if (session.completed) {
    renderCompletion(unit, session);
    return;
  }
  clear(appState.main);
  const section = createElement("section", { className: "page page-lesson" });
  const top = createElement("div", { className: "lesson-top" });
  top.append(link("← 전체 학습", "#/catalog", { className: "back-link" }));
  const progress = unitProgress(unit.id);
  top.append(createBadge(masteryFor(unit, progress).label));
  section.append(top);
  section.append(heading(1, unit.title || unit.id));
  if (unit.description) section.append(createElement("p", { className: "page-lead", text: unit.description }));
  if (unit.estimatedMinutes) section.append(createElement("p", { className: "unit-time", text: `예상 학습 시간 ${unit.estimatedMinutes}분` }));
  section.append(renderObjectives(unit));

  const concepts = createElement("section", { className: "lesson-concepts" });
  concepts.append(heading(2, "개념과 예제"));
  if (asArray(unit.theory).length) appendTheory(concepts, unit.theory);
  else concepts.append(createElement("p", { text: "이 단원의 개념 설명을 준비 중입니다." }));
  section.append(concepts);

  const practice = createElement("section", { className: "lesson-practice" });
  practice.append(heading(2, "연습 문제"));
  renderProblem(unit, session, practice);
  section.append(practice);
  appState.main.append(section);
  if (shouldFocus) focusHeading(appState.main);
}

function renderProgress() {
  clear(appState.main);
  const section = createElement("section", { className: "page page-progress" });
  section.append(heading(1, "내 학습"));
  section.append(createElement("p", { className: "page-lead", text: "이 브라우저에 저장된 학습 기록을 확인하고 백업할 수 있어요." }));
  const units = unitList();
  const progressMap = allProgress();
  const completed = units.filter((unit) => isComplete(progressForList(unit.id, progressMap), unit)).length;
  const reviews = reviewUnits();
  const scores = units.map((unit) => masteryFor(unit, progressForList(unit.id, progressMap)).score).filter((score) => Number.isFinite(score));
  const average = scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) : 0;
  const stats = createElement("section", { className: "dashboard-grid stats-grid", attrs: { "aria-label": "숙련도 요약" } });
  stats.append(createStatCard("완료한 단원", `${completed}/${units.length}`), createStatCard("복습 예정", `${reviews.length}개`), createStatCard("평균 숙련도", `${average}%`));
  section.append(stats);

  const reviewSection = createElement("section", { className: "content-section" });
  reviewSection.append(heading(2, "복습 예정"));
  if (!reviews.length) reviewSection.append(createElement("p", { text: "지금은 예정된 복습이 없습니다." }));
  else {
    const grid = createElement("div", { className: "unit-grid" });
    for (const unit of reviews) {
      const item = progressForList(unit.id, progressMap);
      grid.append(createUnitCard(unit, item, { masteryLabel: masteryFor(unit, item).label }));
    }
    reviewSection.append(grid);
  }
  section.append(reviewSection);

  const allSection = createElement("section", { className: "content-section" });
  allSection.append(heading(2, "단원별 숙련도"));
  const list = createElement("div", { className: "progress-list" });
  for (const unit of units) {
    const item = progressForList(unit.id, progressMap);
    const row = createElement("article", { className: "progress-row" });
    const rowHeader = createElement("div", { className: "progress-row-header" });
    rowHeader.append(link(unit.title || unit.id, `#/learn/${encodeURIComponent(unit.id)}`), createBadge(masteryFor(unit, item).label));
    row.append(rowHeader, createProgressMeter(item));
    if (item.nextReviewAt) row.append(createElement("p", { text: `복습 예정: ${safeDate(item.nextReviewAt)}` }));
    list.append(row);
  }
  if (!units.length) list.append(createElement("p", { text: "학습 단원이 없습니다." }));
  allSection.append(list);
  section.append(allSection);

  const dataSection = createElement("section", { className: "content-section data-management" });
  dataSection.append(heading(2, "학습 데이터 관리"));
  dataSection.append(createElement("p", { text: "다른 브라우저에서 이어 하려면 JSON 파일로 내보낸 뒤 가져오세요. 파일에는 학습 기록만 포함됩니다." }));
  const dataActions = createElement("div", { className: "button-row" });
  dataActions.append(button("JSON 내보내기", { onClick: handleExport }));
  const importInput = createElement("input", { attrs: { type: "file", accept: "application/json,.json", hidden: "" } });
  const importLabel = createElement("label", { className: "button button-secondary", text: "JSON 가져오기", attrs: { for: "import-data-file" } });
  importInput.id = "import-data-file";
  importInput.addEventListener("change", (event) => handleImport(event, section));
  importLabel.append(importInput);
  dataActions.append(importLabel);
  dataActions.append(button("전체 초기화", { className: "button secondary button-danger", onClick: () => showResetDialog(section) }));
  dataSection.append(dataActions);
  dataSection.append(createElement("p", { className: "storage-notice", text: "초기화와 가져오기는 이 브라우저의 저장 기록을 바꿉니다. 중요한 백업 파일을 먼저 보관하세요." }));
  section.append(dataSection);
  appState.main.append(section);
}

async function handleExport() {
  try {
    const exported = await Promise.resolve(exportData());
    const payload = typeof exported === "string" ? exported : JSON.stringify(exported ?? appState.userData ?? {}, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `math-edu-progress-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch {
    window.alert?.("학습 데이터를 내보내지 못했습니다.");
  }
}

async function handleImport(event, section) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    await Promise.resolve(importData(text));
    await refreshUserData();
    appState.learnSessions.clear();
    renderProgress();
    const live = createElement("p", { className: "feedback feedback-correct", attrs: { role: "status", "aria-live": "polite" }, text: "학습 데이터를 가져왔습니다." });
    appState.main.querySelector(".data-management")?.append(live);
  } catch {
    const live = createElement("p", { className: "feedback feedback-incorrect", attrs: { role: "alert" }, text: "JSON 파일을 가져오지 못했습니다. 내보낸 파일 형식인지 확인해 주세요." });
    section.querySelector(".data-management")?.append(live);
  } finally {
    event.target.value = "";
  }
}

function showResetDialog() {
  const dialog = createElement("dialog", { className: "reset-dialog", attrs: { "aria-labelledby": "reset-title" } });
  dialog.append(heading(2, "학습 기록을 모두 지울까요?", { id: "reset-title" }));
  dialog.append(createElement("p", { text: "이 작업은 되돌릴 수 없습니다. 필요하다면 먼저 JSON으로 내보내세요." }));
  const form = createElement("form", { attrs: { method: "dialog" } });
  const cancel = button("취소", { className: "button button-secondary", type: "submit", attrs: { value: "cancel" } });
  const confirm = button("전체 초기화", { className: "button secondary button-danger", type: "submit", attrs: { value: "confirm" } });
  form.append(cancel, confirm);
  dialog.append(form);
  document.body.append(dialog);
  const close = () => dialog.remove();
  const applyReset = async () => {
    try {
      await Promise.resolve(resetData());
      appState.userData = await Promise.resolve(loadUserData());
      appState.learnSessions.clear();
      renderProgress();
    } catch {
      window.alert?.("학습 기록을 초기화하지 못했습니다.");
    }
  };
  dialog.addEventListener("close", async () => {
    if (dialog.returnValue === "confirm") await applyReset();
    close();
  }, { once: true });
  confirm.addEventListener("click", () => { dialog.returnValue = "confirm"; });
  cancel.addEventListener("click", () => { dialog.returnValue = "cancel"; });
  if (typeof dialog.showModal === "function") dialog.showModal();
  else {
    const confirmed = window.confirm?.("학습 기록을 모두 지울까요?") === true;
    close();
    if (confirmed) void applyReset();
  }
}

function renderRoute(route, shouldFocus = true) {
  appState.route = route;
  appState.renderNumber += 1;
  for (const anchor of appState.root?.querySelectorAll?.(".main-nav a") || []) {
    const href = anchor.getAttribute("href") || "";
    const active = route.name === "progress" && href === "#/progress";
    if (active) anchor.setAttribute("aria-current", "page");
    else anchor.removeAttribute("aria-current");
  }
  if (appState.loading) {
    renderLoading();
    return;
  }
  if (appState.error) {
    renderError(appState.error);
    return;
  }
  if (!appState.content || !unitList().length) {
    renderError(new Error("학습 콘텐츠가 비어 있습니다."));
    return;
  }
  switch (route.name) {
    case "catalog":
      renderCatalog();
      break;
    case "learn": {
      const unit = getUnit(route.unitId);
      if (unit) renderLesson(unit, false);
      else renderNotFound({ requestedPath: `#/learn/${route.unitId}` });
      break;
    }
    case "progress":
      renderProgress();
      break;
    case "home":
      renderHome();
      break;
    default:
      renderNotFound(route);
      break;
  }
  if (shouldFocus) focusHeading(appState.main);
}

export async function initApp(root = document.querySelector("#app")) {
  if (!root) throw new Error("#app 요소를 찾을 수 없습니다.");
  appState.root = root;
  appState.loading = true;
  appState.error = null;
  appShell(root);
  renderLoading();
  appState.router = createRouter((route) => renderRoute(route), { target: window });

  try {
    await refreshUserData();
    appState.content = await loadAllContent();
    if (!unitList().length) throw new Error("학습 콘텐츠가 비어 있습니다.");
    appState.loading = false;
    renderRoute(appState.router.current, false);
    focusHeading(appState.main);
  } catch (error) {
    appState.loading = false;
    appState.error = error;
    renderError(error);
  }
  return appState;
}

export function getAppState() {
  return appState;
}

if (typeof document !== "undefined") {
  const start = () => { void initApp(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
