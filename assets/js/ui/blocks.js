import { createElement, appendChildren, createText, button } from "./dom.js";

function asList(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function appendTextParagraphs(parent, value, className = "") {
  for (const item of asList(value)) {
    if (item && typeof item === "object") {
      const text = item.body ?? item.text ?? item.content ?? "";
      if (text) appendTextParagraphs(parent, text, className);
      continue;
    }
    const lines = String(item ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) parent.append(createElement("p", { className, text: line }));
  }
}

function appendSteps(parent, steps) {
  const list = createElement("ol", { className: "theory-steps" });
  for (const step of asList(steps)) {
    if (step && typeof step === "object") {
      const item = createElement("li");
      if (step.title) item.append(createElement("strong", { text: step.title }), createText(" "));
      appendTextParagraphs(item, step.body ?? step.text ?? step.content ?? "");
      list.append(item);
    } else {
      list.append(createElement("li", { text: step }));
    }
  }
  parent.append(list);
}

/** Render a whitelisted theory block using text nodes only. */
export function appendTheoryBlock(parent, block, index = 0) {
  if (typeof block === "string") {
    appendTextParagraphs(parent, block);
    return;
  }
  if (!block || typeof block !== "object") return;

  const type = String(block.type || "text").toLowerCase();
  const article = createElement("article", { className: `theory-block theory-${type}` });
  if (block.title) article.append(createElement("h3", { text: block.title }));
  if (block.body !== undefined) appendTextParagraphs(article, block.body);
  if (block.prompt !== undefined) {
    article.append(createElement("p", { className: "theory-prompt", text: block.prompt }));
  }
  if (block.formula !== undefined) {
    article.append(createElement("div", {
      className: "formula",
      attrs: { role: "img", "aria-label": `수식: ${String(block.formula)}` },
      text: block.formula,
    }));
  }
  if (block.steps !== undefined) appendSteps(article, block.steps);
  if (block.answer !== undefined) {
    const details = createElement("details", { className: "worked-answer" });
    details.append(createElement("summary", { text: "예제 답 확인" }));
    appendTextParagraphs(details, block.answer);
    article.append(details);
  }
  if (!article.childNodes.length) appendTextParagraphs(article, block.content ?? "");
  if (article.childNodes.length) parent.append(article);
}

export function appendTheory(parent, theory = []) {
  asList(theory).forEach((block, index) => appendTheoryBlock(parent, block, index));
}

function choiceDetails(choice, index) {
  if (choice && typeof choice === "object") {
    const id = String(choice.id ?? choice.value ?? choice.key ?? index);
    const label = choice.label ?? choice.text ?? choice.title ?? choice.value ?? id;
    return { id, label: String(label) };
  }
  return { id: String(choice ?? index), label: String(choice ?? "") };
}

function inputHint(type) {
  switch (type) {
    case "rational": return "예: 3/4 또는 -2";
    case "orderedPair": return "예: (2, -1)";
    case "vector": return "예: (2, -1)";
    case "unorderedSet": return "예: 1, 3 또는 {1, 3}";
    default: return "답을 입력하세요";
  }
}

/**
 * Build the answer control for a problem.  The caller reads the value through
 * getValue(), keeping raw user text out of any HTML parser.
 */
export function createProblemControl(problem, key) {
  const type = String(problem?.type || "text");
  if (type === "choice") {
    const group = createElement("fieldset", { className: "choice-group" });
    group.append(createElement("legend", { className: "visually-hidden", text: "선택지" }));
    const choices = Array.isArray(problem.choices) ? problem.choices : [];
    const name = `choice-${key}`;
    choices.forEach((choice, index) => {
      const { id, label } = choiceDetails(choice, index);
      const input = createElement("input", {
        attrs: { type: "radio", name, value: id, id: `${name}-${index}` },
      });
      const labelEl = createElement("label", { attrs: { for: input.id } });
      labelEl.append(input, createText(` ${label}`));
      group.append(createElement("div", { className: "choice-option", children: [labelEl] }));
    });
    return {
      control: group,
      getValue: () => group.querySelector("input:checked")?.value ?? "",
      focusTarget: group.querySelector("input"),
    };
  }

  const numeric = ["number", "integer", "rational"].includes(type);
  const input = createElement("input", {
    className: "answer-input",
    attrs: {
      type: "text",
      inputmode: numeric ? (type === "integer" ? "numeric" : "decimal") : "text",
      autocomplete: "off",
      placeholder: inputHint(type),
      "aria-label": "답",
    },
  });
  return {
    control: input,
    getValue: () => input.value,
    focusTarget: input,
  };
}

export function createHintPanel(hints = [], onUse) {
  const list = asList(hints).map((hint) => String(hint ?? "")).filter(Boolean);
  const panel = createElement("section", {
    className: "hint-panel",
    attrs: { "aria-label": "단계별 힌트" },
  });
  if (!list.length) return panel;
  const body = createElement("div", { className: "hint-body", attrs: { hidden: "" } });
  const text = createElement("p", { className: "hint-text" });
  const reveal = button(`힌트 보기 (1/${list.length})`, { className: "button button-secondary" });
  let shown = 0;
  reveal.addEventListener("click", () => {
    shown += 1;
    text.textContent = list[shown - 1];
    body.hidden = false;
    onUse?.(shown);
    reveal.textContent = shown < list.length ? `다음 힌트 보기 (${shown + 1}/${list.length})` : "힌트 모두 보기";
    if (shown >= list.length) reveal.disabled = true;
  });
  body.append(text);
  panel.append(reveal, body);
  return panel;
}
