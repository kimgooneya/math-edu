/**
 * Content loading for the static site.
 *
 * Manifest paths are intentionally relative to the manifest URL.  This is
 * important on GitHub project pages where the site is served below a
 * repository path rather than at the domain root.
 */

export const MANIFEST_PATHS = [
  "./content/middle/manifest.json",
  "./content/high/manifest.json",
];

let cache = null;
let pending = null;

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeManifestEntry(entry) {
  if (typeof entry === "string") return entry;
  if (!isObject(entry)) return "";
  return asText(entry.path || entry.file || entry.href || entry.url);
}

function unitError(message, source) {
  const error = new Error(message);
  error.source = source;
  return error;
}

export function validateUnit(unit, source = "") {
  const errors = [];
  if (!isObject(unit)) return { valid: false, errors: [unitError("단원 데이터가 객체가 아닙니다.", source)] };
  for (const field of ["id", "title"]) {
    if (!asText(unit[field])) errors.push(unitError(`단원에 ${field}가 없습니다.`, source));
  }
  if (unit.problems !== undefined && !Array.isArray(unit.problems)) {
    errors.push(unitError("problems는 배열이어야 합니다.", source));
  }
  if (unit.theory !== undefined && !Array.isArray(unit.theory)) {
    errors.push(unitError("theory는 배열이어야 합니다.", source));
  }
  return { valid: errors.length === 0, errors };
}

async function fetchJson(path, { signal } = {}) {
  if (typeof fetch !== "function") {
    throw unitError("이 브라우저에서는 콘텐츠를 불러올 수 없습니다.", path);
  }
  const response = await fetch(path, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response || response.ok === false) {
    throw unitError(`콘텐츠 요청에 실패했습니다 (${response.status}).`, path);
  }
  try {
    return await response.json();
  } catch (error) {
    throw unitError("콘텐츠 JSON을 읽을 수 없습니다.", path);
  }
}

function manifestUnits(manifest) {
  if (!isObject(manifest) || !Array.isArray(manifest.units)) return [];
  return manifest.units.map(normalizeManifestEntry).filter(Boolean);
}

function contentResult(manifests, units, errors = []) {
  const byId = new Map();
  for (const unit of units) {
    if (unit?.id && !byId.has(unit.id)) byId.set(unit.id, unit);
  }
  return {
    manifests,
    units,
    byId,
    errors,
    empty: units.length === 0,
  };
}

/**
 * Load both stage manifests and every unit listed in each manifest.
 * A failed request or malformed individual unit rejects, allowing the app to
 * show an explicit error screen rather than silently presenting partial
 * curriculum data.
 */
export async function loadAllContent({ force = false, signal } = {}) {
  if (cache && !force) return cache;
  if (pending && !force) return pending;

  pending = (async () => {
    const manifests = await Promise.all(
      MANIFEST_PATHS.map(async (path) => ({ path, data: await fetchJson(path, { signal }) })),
    );

    const references = manifests.flatMap(({ path, data }) =>
      manifestUnits(data).map((relativePath) => ({
        manifestPath: path,
        relativePath,
        path: new URL(
          relativePath,
          new URL(
            path,
            (() => {
              const base = globalThis.document?.baseURI || globalThis.location?.href;
              return base && !String(base).startsWith("about:") ? base : "http://localhost/";
            })(),
          ),
        ).toString(),
      })),
    );

    const loaded = await Promise.all(
      references.map(async (reference) => {
        try {
          const unit = await fetchJson(reference.path, { signal });
          const validation = validateUnit(unit, reference.path);
          if (!validation.valid) return { unit: null, errors: validation.errors };
          return { unit, errors: [] };
        } catch (error) {
          return { unit: null, errors: [error] };
        }
      }),
    );

    const units = loaded.map((entry) => entry.unit).filter(Boolean);
    const errors = loaded.flatMap((entry) => entry.errors || []);
    if (errors.length) throw errors[0];
    if (units.length === 0) {
      throw unitError("학습 콘텐츠가 비어 있습니다.", "manifest");
    }
    const result = contentResult(manifests, units, errors);
    cache = result;
    return result;
  })();

  try {
    return await pending;
  } finally {
    pending = null;
  }
}

export async function loadUnits(options) {
  const result = await loadAllContent(options);
  return result.units;
}

export async function loadContent(options) {
  return loadAllContent(options);
}

export async function loadManifest(path, options) {
  return fetchJson(path, options);
}

export async function loadCatalog(options) {
  const result = await loadAllContent(options);
  return result.units;
}

export async function getUnit(unitId, options) {
  const result = await loadAllContent(options);
  return result.byId.get(unitId) || null;
}

export function clearContentCache() {
  cache = null;
  pending = null;
}

export { fetchJson };
