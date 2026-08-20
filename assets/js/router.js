/**
 * Small hash router used by the static app.  The router deliberately keeps
 * route parsing independent of the DOM so it can also be used by smoke tests.
 */

const VALID_ROUTES = new Set(["home", "catalog", "learn", "progress", "not-found"]);

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Parse one of the public hash routes.
 *
 * Supported routes are #/, #/catalog, #/learn/:unitId and #/progress.
 * Unknown routes are returned as not-found rather than throwing so the app
 * can render a useful recovery screen.
 */
export function parseRoute(hash = "") {
  const raw = String(hash || "").replace(/^#/, "");
  const withoutQuery = raw.split(/[?]/, 1)[0];
  const pathname = withoutQuery.replace(/^\/+|\/+$/g, "");

  if (!pathname) return { name: "home", path: "#/" };

  const segments = pathname.split("/").filter(Boolean).map(safeDecode);
  if (segments.length === 1 && segments[0] === "catalog") {
    return { name: "catalog", path: "#/catalog" };
  }
  if (segments.length === 1 && segments[0] === "progress") {
    return { name: "progress", path: "#/progress" };
  }
  if (segments.length === 2 && segments[0] === "learn" && segments[1]) {
    return {
      name: "learn",
      unitId: segments[1],
      path: `#/learn/${encodeURIComponent(segments[1])}`,
    };
  }

  return { name: "not-found", path: `#/${pathname}`, requestedPath: `#/${pathname}` };
}

export function routeToHash(route, unitId) {
  if (typeof route === "object" && route) {
    if (route.name === "learn") return routeToHash("learn", route.unitId);
    route = route.name;
  }
  switch (route) {
    case "home":
      return "#/";
    case "catalog":
      return "#/catalog";
    case "progress":
      return "#/progress";
    case "learn":
      return unitId ? `#/learn/${encodeURIComponent(unitId)}` : "#/catalog";
    default:
      return "#/";
  }
}

export function navigate(route, unitId) {
  const hash = routeToHash(route, unitId);
  if (typeof window === "undefined") return hash;
  if (window.location.hash === hash) {
    // A same-hash navigation normally does not produce hashchange.  Dispatch
    // a synthetic event so a link can still request a rerender.
    const event = typeof HashChangeEvent === "function" ? new HashChangeEvent("hashchange") : new Event("hashchange");
    window.dispatchEvent(event);
  } else {
    window.location.hash = hash;
  }
  return hash;
}

/**
 * Create a router subscription.  `onRoute` receives a parsed route and is
 * called once immediately and whenever the hash changes.
 */
export function createRouter(onRoute, { target = globalThis } = {}) {
  let disposed = false;
  const handleChange = () => {
    if (!disposed) onRoute(parseRoute(target?.location?.hash || "#/"));
  };

  target?.addEventListener?.("hashchange", handleChange);
  handleChange();

  return {
    get current() {
      return parseRoute(target?.location?.hash || "#/");
    },
    navigate,
    dispose() {
      disposed = true;
      target?.removeEventListener?.("hashchange", handleChange);
    },
  };
}

export function getCurrentRoute(hash) {
  return parseRoute(hash ?? globalThis.location?.hash ?? "#/");
}

export function startRouter(onRoute, options) {
  return createRouter(onRoute, options);
}

export { VALID_ROUTES };
