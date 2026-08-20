import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requestedPort = Number.parseInt(process.argv[2] ?? "8000", 10);
const port = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : 8000;
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = normalize(decoded).replace(/^[/\\]+/, "");
  const candidate = resolve(projectRoot, relative || "index.html");
  if (candidate !== projectRoot && !candidate.startsWith(`${projectRoot}${sep}`)) return null;
  return candidate;
}

const server = createServer(async (request, response) => {
  try {
    let filePath = safePath(new URL(request.url ?? "/", "http://localhost").pathname);
    if (!filePath) throw Object.assign(new Error("Forbidden"), { code: "EACCES" });
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = join(filePath, "index.html");
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(body);
  } catch (error) {
    const status = error?.code === "EACCES" ? 403 : 404;
    response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(status === 403 ? "Forbidden" : "Not Found");
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`매듭수학 개발 서버: http://127.0.0.1:${port}\n`);
});
