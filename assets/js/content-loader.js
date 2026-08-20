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

const FRAMEWORKS = new Set(["CCSS-M", "College Board AP", "IB DP", "Dual Enrollment"]);
const LEVELS = new Set(["Core", "Honors", "AP", "IB SL", "IB HL", "Post-AP"]);

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
  if (!FRAMEWORKS.has(unit.framework)) {
    errors.push(unitError(`framework는 ${[...FRAMEWORKS].join(", ")} 중 하나여야 합니다.`, source));
  }
  if (!LEVELS.has(unit.level)) {
    errors.push(unitError(`level은 ${[...LEVELS].join(", ")} 중 하나여야 합니다.`, source));
  }
  validateStringArray(unit, "standards", errors, source, { nonempty: true });
  validateStringArray(unit, "pathways", errors, source);
  validateStringArray(unit, "aliases", errors, source);
  validateStringArray(unit, "sources", errors, source, { https: true });
  return { valid: errors.length === 0, errors };
}

function validateStringArray(unit, field, errors, source, { nonempty = false, https = false } = {}) {
  const values = unit[field];
  if (!Array.isArray(values)) {
    errors.push(unitError(`${field}는 문자열 배열이어야 합니다.`, source));
    return;
  }
  if (nonempty && values.length === 0) {
    errors.push(unitError(`${field}에는 하나 이상의 값이 필요합니다.`, source));
  }
  values.forEach((value, index) => {
    if (!asText(value)) {
      errors.push(unitError(`${field}[${index}]는 비어 있지 않은 문자열이어야 합니다.`, source));
      return;
    }
    if (https) {
      try {
        if (new URL(value).protocol !== "https:") throw new Error();
      } catch {
        errors.push(unitError(`${field}[${index}]는 유효한 https URL이어야 합니다.`, source));
      }
    }
  });
}

async function fetchJson(path, { signal } = {}) {
  if (typeof fetch !== "function") {
    throw unitError("이 브라우저에서는 콘텐츠를 불러올 수 없습니다.", path);
  }
  let response;
  try {
    response = await fetch(path, {
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw unitError("콘텐츠 요청 중 네트워크 오류가 발생했습니다.", path);
  }
  if (!response || response.ok === false) {
    throw unitError(`콘텐츠 요청에 실패했습니다 (${response?.status ?? "상태 불명"}).`, path);
  }
  try {
    return await response.json();
  } catch {
    throw unitError("콘텐츠 JSON을 읽을 수 없습니다.", path);
  }
}

function documentBaseUrl() {
  const base = globalThis.document?.baseURI || globalThis.location?.href;
  return base && !String(base).startsWith("about:") ? base : "http://localhost/";
}

function resolveReference(path, parentPath = documentBaseUrl()) {
  return new URL(path, parentPath).toString();
}

function manifestEntries(manifest, field, source) {
  if (!isObject(manifest)) throw unitError("manifest 데이터가 객체가 아닙니다.", source);
  if (manifest[field] === undefined) return [];
  if (!Array.isArray(manifest[field])) throw unitError(`manifest의 ${field}는 배열이어야 합니다.`, source);
  return manifest[field].map((entry, index) => {
    const normalized = normalizeManifestEntry(entry);
    if (!normalized) throw unitError(`manifest의 ${field}[${index}]에 유효한 경로가 없습니다.`, source);
    return normalized;
  });
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
 * Load both stage manifests, recursively include their submanifests, and load
 * every uniquely referenced unit. Shared includes are de-duplicated while an
 * actual ancestor cycle is rejected with the traversal path.
 * A failed request or malformed individual unit rejects, allowing the app to
 * show an explicit error screen rather than silently presenting partial
 * curriculum data.
 */
export async function loadAllContent({ force = false, signal } = {}) {
  if (cache && !force) return cache;
  if (pending && !force) return pending;

  pending = (async () => {
    const manifests = [];
    const references = [];
    const visitedManifests = new Set();
    const activeManifests = [];
    const referencedUnits = new Set();

    async function visitManifest(requestPath, parentUrl, isRoot = false) {
      const canonicalPath = resolveReference(requestPath, parentUrl);
      const cycleIndex = activeManifests.indexOf(canonicalPath);
      if (cycleIndex !== -1) {
        const cycle = [...activeManifests.slice(cycleIndex), canonicalPath].join(" -> ");
        throw unitError(`manifest 순환 참조를 발견했습니다: ${cycle}`, canonicalPath);
      }
      // The same submanifest can intentionally be shared by several curriculum
      // routes. It contributes its units once and is fetched only once.
      if (visitedManifests.has(canonicalPath)) return;

      activeManifests.push(canonicalPath);
      try {
        const fetchPath = isRoot ? requestPath : canonicalPath;
        const data = await fetchJson(fetchPath, { signal });
        const unitEntries = manifestEntries(data, "units", canonicalPath);
        const childEntries = manifestEntries(data, "manifests", canonicalPath);
        manifests.push({ path: canonicalPath, data });

        for (const relativePath of unitEntries) {
          const unitPath = resolveReference(relativePath, canonicalPath);
          if (referencedUnits.has(unitPath)) continue;
          referencedUnits.add(unitPath);
          references.push({ manifestPath: canonicalPath, relativePath, path: unitPath });
        }
        for (const childPath of childEntries) {
          await visitManifest(childPath, canonicalPath);
        }
        visitedManifests.add(canonicalPath);
      } finally {
        activeManifests.pop();
      }
    }

    for (const path of MANIFEST_PATHS) await visitManifest(path, documentBaseUrl(), true);

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
    const duplicateIds = new Set();
    const ids = new Set();
    for (const unit of units) {
      if (ids.has(unit.id)) duplicateIds.add(unit.id);
      ids.add(unit.id);
    }
    if (duplicateIds.size) {
      throw unitError(`중복 단원 ID를 발견했습니다: ${[...duplicateIds].join(", ")}`, "manifest");
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
