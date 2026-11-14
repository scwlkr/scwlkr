import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const publicDir = resolve(root, "public");

const [html, css, javascript, boot, headers, readme, favicon, wordmark, manifest] = await Promise.all([
  readFile(resolve(publicDir, "index.html"), "utf8"),
  readFile(resolve(publicDir, "styles.css"), "utf8"),
  readFile(resolve(publicDir, "app.js"), "utf8"),
  readFile(resolve(publicDir, "boot.js"), "utf8"),
  readFile(resolve(publicDir, "_headers"), "utf8"),
  readFile(resolve(root, "README.md"), "utf8"),
  readFile(resolve(publicDir, "favicon.svg"), "utf8"),
  readFile(resolve(publicDir, "wordmark.svg"), "utf8"),
  readFile(resolve(publicDir, "site.webmanifest"), "utf8"),
]);

const ways = [
  "https://wlkr.si",
  "https://x.com/scwlkr",
  "https://instagram.com/scwlkr_",
];

for (const href of ways) {
  assert.ok(html.includes(`href="${href}"`), `index.html must link to ${href}`);
}

assert.equal((html.match(/<a /g) ?? []).length, ways.length, "the page offers exactly three ways out");
assert.match(html, /<meta name="description" content="[^"]+">/, "meta description must exist");
assert.match(html, /<h1>[\s\S]*?alt="scwlkr"[\s\S]*?<\/h1>/, "page must have a scwlkr h1");
assert.doesNotMatch(html, /\sstyle="/, "no inline styles: the content security policy forbids them");
assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)/, "no inline scripts: the content security policy forbids them");
assert.doesNotMatch(wordmark, /\sstyle="/, "the wordmark must not rely on inline styles");
assert.match(css, /prefers-reduced-motion:\s*reduce/, "reduced motion styles must exist");
assert.match(css, /:focus-visible/, "keyboard focus styles must exist");
assert.match(css, /--signal:\s*#23ce6b/i, "site signal must use the canonical scwlkr green");
assert.match(css, /--field:\s*#181818/i, "site field must use the canonical scwlkr charcoal");
assert.match(boot, /prefers-reduced-motion: reduce/, "the live version must not start under reduced motion");
assert.match(javascript, /webgl2/, "the live version is drawn with WebGL2");
assert.match(javascript, /function plain\(\)/, "the live version must be able to hand back to the plain version");
assert.match(headers, /Content-Security-Policy:/, "security headers must include CSP");
assert.match(readme, /https:\/\/scwlkr\.com/, "profile README must link to the site");
assert.match(favicon, /#181818/i, "favicon must use the canonical scwlkr charcoal");
assert.match(favicon, /aria-label="scwlkr raccoon"/i, "favicon must identify the scwlkr brandmark");
assert.match(wordmark, /#23ce6b/i, "wordmark must keep its green l");
assert.match(manifest, /"theme_color":\s*"#181818"/i, "manifest must use the canonical theme color");

for (const publicCopy of [html, css, javascript, readme]) {
  assert.doesNotMatch(publicCopy, /ROOM_1|One-Room Internet/i, "retired product copy must not remain public");
}

const siteUrl = process.env.SITE_URL;

if (siteUrl) {
  const agent = { "user-agent": "scwlkr-site-verifier/1.0" };
  const response = await fetch(siteUrl, { headers: agent, redirect: "follow" });

  assert.equal(response.status, 200, `${siteUrl} must return 200`);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/i, "live root must return HTML");
  assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'self'/, "live CSP must be active");

  const liveHtml = await response.text();
  assert.match(liveHtml, /<canvas id="dust"/, "live site must serve the current page");
  for (const href of ways) {
    assert.ok(liveHtml.includes(`href="${href}"`), `live site must link to ${href}`);
  }
  assert.doesNotMatch(liveHtml, /ROOM_1|One-Room Internet/i, "retired experience must not remain live");

  for (const asset of ["/app.js", "/boot.js", "/shapes.js", "/styles.css", "/wordmark.svg", "/fonts/inter-800.woff2", "/og.png", "/mind.js", "/hand.js", "/mind/worker.js", "/mind/model.json", "/mind/model.bin", "/mind/tok.json"]) {
    const assetResponse = await fetch(new URL(asset, siteUrl), { headers: agent });
    assert.equal(assetResponse.status, 200, `${asset} must be served`);
    assert.doesNotMatch(assetResponse.headers.get("content-type") ?? "", /text\/html/i, `${asset} must not fall back to the page`);
    await assetResponse.arrayBuffer();
  }

  const retiredApi = await fetch(new URL("/api/readiness", siteUrl), { headers: agent });
  const retiredBody = await retiredApi.text();
  assert.doesNotMatch(retiredBody, /"ready"\s*:\s*true/, "retired API must no longer answer readiness requests");
}

console.log(siteUrl ? `Verified local contract and ${siteUrl}` : "Verified local site contract");
