import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function text(relativePath) {
  return readFile(join(projectRoot, relativePath), "utf8");
}

test("the static entry point has accessible and relative-path essentials", async () => {
  const html = await text("index.html");
  assert.match(html, /<html[^>]+lang=["']ko["']/i);
  assert.match(html, /id=["']app["']/i);
  assert.match(html, /href=["']#(?:app|main-content)["']/i, "skip link가 본문 영역을 가리켜야 합니다.");
  assert.match(html, /<noscript[\s>]/i);
  assert.match(html, /<meta[^>]+name=["']viewport["']/i);
  assert.match(html, /<script[^>]+type=["']module["'][^>]+src=["']\.\/assets\/js\/app\.js["']/i);
  assert.doesNotMatch(html, /(?:src|href)=["']\/(?!\/)/i, "프로젝트 Pages에서 깨지는 루트 절대경로가 있습니다.");
});

test("all required static modules and deployment files exist", async () => {
  const required = [
    "404.html",
    "assets/js/app.js",
    "assets/js/router.js",
    "assets/js/content-loader.js",
    "assets/js/store.js",
    "assets/js/mastery.js",
    "assets/js/answer-checkers.js",
    "content/middle/manifest.json",
    "content/high/manifest.json",
    ".github/workflows/pages.yml",
  ];
  await Promise.all(required.map((path) => access(join(projectRoot, path), constants.R_OK)));
});

test("GitHub Pages workflow validates before deploying", async () => {
  const workflow = await text(".github/workflows/pages.yml");
  assert.match(workflow, /npm test/);
  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /needs:\s*test/);
});
