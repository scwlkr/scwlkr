import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const publicDir = resolve(root, "public");

const [html, css, javascript, headers, readme, favicon, manifest] = await Promise.all([
  readFile(resolve(publicDir, "index.html"), "utf8"),
  readFile(resolve(publicDir, "styles.css"), "utf8"),
  readFile(resolve(publicDir, "app.js"), "utf8"),
  readFile(resolve(publicDir, "_headers"), "utf8"),
  readFile(resolve(root, "README.md"), "utf8"),
  readFile(resolve(publicDir, "favicon.svg"), "utf8"),
  readFile(resolve(publicDir, "site.webmanifest"), "utf8"),
]);

for (const expected of [
  "I build whatever",
  "SELECTED EVIDENCE",
  "OpenJob",
  "WalkLang",
  "LocalHub",
  "UQIQ",
  "Vampyre",
  "paletteWOW",
]) {
  assert.ok(html.includes(expected), `index.html must include ${expected}`);
}

assert.equal((html.match(/data-project/g) ?? []).length, 6, "exactly six projects must be presented");
assert.match(html, /<meta name="description" content="[^"]+">/, "meta description must exist");
assert.match(html, /<h1[^>]*>[\s\S]*?scwlkr[\s\S]*?<\/h1>/i, "page must have a scwlkr h1");
assert.match(css, /prefers-reduced-motion:\s*reduce/, "reduced motion styles must exist");
assert.match(css, /:focus-visible/, "keyboard focus styles must exist");
assert.match(javascript, /America\/Chicago/, "Dallas clock must use the correct time zone");
assert.match(headers, /Content-Security-Policy:/, "security headers must include CSP");
assert.match(readme, /https:\/\/scwlkr\.com/, "profile README must link to the site");
assert.match(css, /--signal:\s*#23ce6b/i, "site signal must use the canonical scwlkr green");
assert.match(css, /--field:\s*#181818/i, "site field must use the canonical scwlkr charcoal");
assert.match(favicon, /#181818/i, "favicon must use the canonical scwlkr charcoal");
assert.match(favicon, /aria-label="scwlkr raccoon"/i, "favicon must identify the scwlkr brandmark");
assert.match(manifest, /"theme_color":\s*"#181818"/i, "manifest must use the canonical theme color");

for (const publicCopy of [html, css, javascript, readme]) {
  assert.doesNotMatch(publicCopy, /ROOM_1|One-Room Internet/i, "retired product copy must not remain public");
}

const siteUrl = process.env.SITE_URL;

if (siteUrl) {
  const response = await fetch(siteUrl, {
    headers: { "user-agent": "scwlkr-site-verifier/1.0" },
    redirect: "follow",
  });

  assert.equal(response.status, 200, `${siteUrl} must return 200`);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/i, "live root must return HTML");
  assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'self'/, "live CSP must be active");

  const liveHtml = await response.text();
  assert.match(liveHtml, /I build whatever/, "live site must contain the new hero");
  assert.doesNotMatch(liveHtml, /ROOM_1|One-Room Internet/i, "retired experience must not remain live");

  const retiredApi = await fetch(new URL("/api/readiness", siteUrl), {
    headers: { "user-agent": "scwlkr-site-verifier/1.0" },
  });
  const retiredBody = await retiredApi.text();
  assert.doesNotMatch(retiredBody, /"ready"\s*:\s*true/, "retired API must no longer answer readiness requests");
}

console.log(siteUrl ? `Verified local contract and ${siteUrl}` : "Verified local site contract");
