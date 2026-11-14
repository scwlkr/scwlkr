// mind.js — answers typed text with one short, probably nonsensical sentence.
// A tiny real language model (TinyStories-1M, ~5 MB) runs in a Worker in every
// browser, so the page never freezes and every visitor gets the same mind.
// Nothing loads until reply() is first called. reply() never throws and
// settles within 20 seconds, resolving null when no sentence came out.

const LIMIT_MS = 20000;
const MAX_CHARS = 90;
const TRIES = 3;

let worker = null;
let seq = 0;
const waiting = new Map();

function getWorker() {
  if (worker) return worker;
  if (typeof Worker !== "function") return null;
  try {
    worker = new Worker(new URL("./mind/worker.js", import.meta.url));
  } catch {
    return null;
  }
  worker.onmessage = (e) => {
    const { id, line } = e.data || {};
    const done = waiting.get(id);
    if (done) { waiting.delete(id); done(typeof line === "string" ? line : null); }
  };
  worker.onerror = () => {
    for (const done of waiting.values()) done(null);
    waiting.clear();
    try { worker.terminate(); } catch {}
    worker = null; // a later call may try again
  };
  return worker;
}

function ask(text) {
  const w = getWorker();
  if (!w) return Promise.resolve(null);
  const id = ++seq;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    try { w.postMessage({ id, text }); } catch { waiting.delete(id); resolve(null); }
  });
}

function clean(raw) {
  if (typeof raw !== "string") return null;
  let s = raw
    .replace(/["“”]/g, " ")
    .replace(/[*_`#>~|\[\]<>{}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,;:.!?'\-\s]+/, "");
  if (!s || !/[a-z]{2}/i.test(s)) return null;
  const m = s.match(/^.*?[.!?](?=\s|$)/);
  if (m) s = m[0];
  s = s.replace(/[,;:\s'-]+$/, "");
  if (s.length > MAX_CHARS) {
    let cut = s.slice(0, MAX_CHARS - 1);
    const sp = cut.lastIndexOf(" ");
    if (sp > 20) cut = cut.slice(0, sp);
    s = cut.replace(/[\s,;:'-]+$/, "") + ".";
  }
  if (!/[.!?]$/.test(s)) s += ".";
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s.length > 2 ? s : null;
}

async function run(input, deadline) {
  for (let i = 0; i < TRIES && Date.now() < deadline; i++) {
    const line = clean(await ask(input));
    if (line) return line;
  }
  return null;
}

export async function reply(text) {
  try {
    const input = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!input) return null;
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), LIMIT_MS); });
    try {
      return await Promise.race([run(input, Date.now() + LIMIT_MS).catch(() => null), timeout]);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

export default reply;
