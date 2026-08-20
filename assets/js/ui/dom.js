/** Safe DOM helpers shared by the app views. */

export function createElement(tagName, {
  className = "",
  text,
  attrs = {},
  children = [],
  on = {},
} = {}) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = String(text);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (value === true) element.setAttribute(name, "");
    else element.setAttribute(name, String(value));
  }
  for (const [eventName, handler] of Object.entries(on)) {
    if (typeof handler === "function") element.addEventListener(eventName, handler);
  }
  appendChildren(element, children);
  return element;
}

export function appendChildren(parent, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list.flat(Infinity)) {
    if (child && typeof child.nodeType === "number") parent.append(child);
  }
  return parent;
}

export function createText(text) {
  return document.createTextNode(String(text ?? ""));
}

export function button(label, { className = "button", type = "button", onClick, attrs = {} } = {}) {
  return createElement("button", {
    className,
    text: label,
    attrs: { type, ...attrs },
    on: onClick ? { click: onClick } : {},
  });
}

export function link(label, href, { className = "", attrs = {} } = {}) {
  return createElement("a", {
    className,
    text: label,
    attrs: { href, ...attrs },
  });
}

export function heading(level, text, { id, className = "" } = {}) {
  return createElement(`h${Math.min(6, Math.max(1, level))}`, {
    className,
    text,
    attrs: id ? { id, tabindex: "-1" } : {},
  });
}

export function clear(parent) {
  parent.replaceChildren();
  return parent;
}

export function setLiveMessage(element, message, kind = "") {
  const visualKind = kind === "success" ? "correct" : kind === "error" ? "incorrect" : kind;
  element.className = visualKind ? `feedback feedback-${visualKind}` : "feedback";
  element.textContent = message || "";
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  return element;
}

export function safeDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function slugify(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9가-힣_-]+/gi, "-");
}

export function focusHeading(container) {
  const target = container.querySelector("h1[tabindex], h1");
  target?.focus?.({ preventScroll: false });
}
