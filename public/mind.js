// mind.js — answers typed text with one short sentence from an on-device model.
// Uses the browser's built-in model (Chrome Prompt API, `LanguageModel`) only.
// Nothing loads until reply() is first called. reply() never throws and settles
// within 20 seconds; it resolves null when no model can answer here.

const LIMIT_MS = 20000;
const MAX_CHARS = 90;
const LANG = ["en"];

const SYSTEM =
  "You are the quiet mind inside scwlkr's one-screen website, a field of white dust on charcoal. " +
  "Answer whatever the visitor types with exactly one short sentence of at most twelve words. " +
  "Be direct, dry, self-aware and a little strange. Plain text only: no quotes, no emoji, " +
  "no markdown, no lists, no questions back, no greetings, no explanations. " +
  "Never claim facts about scwlkr, projects, jobs, customers or numbers. " +
  "If unsure, say something oddly calm instead.";

const OPTIONS = {
  initialPrompts: [{ role: "system", content: SYSTEM }],
  expectedInputs: [{ type: "text", languages: LANG }],
  expectedOutputs: [{ type: "text", languages: LANG }],
};

let sessionPromise = null; // shared base session (holds the system prompt)
let dead = false; // true once we know no model can run here

function api() {
  try {
    return typeof globalThis.LanguageModel === "function" ||
      typeof globalThis.LanguageModel === "object"
      ? globalThis.LanguageModel
      : null;
  } catch {
    return null;
  }
}

async function getSession() {
  if (sessionPromise) return sessionPromise;
  const LM = api();
  if (!LM || typeof LM.create !== "function") {
    dead = true;
    return null;
  }
  sessionPromise = (async () => {
    let state = "unavailable";
    try {
      state = await LM.availability(OPTIONS);
    } catch {
      state = "unavailable";
    }
    if (state === "unavailable") {
      dead = true;
      return null;
    }
    // "available", "downloadable" or "downloading": create() starts or joins the
    // download. It keeps running in the background if this call times out.
    return await LM.create(OPTIONS);
  })().catch(() => {
    sessionPromise = null; // allow a later retry (e.g. needed a user gesture)
    return null;
  });
  return sessionPromise;
}

function clean(raw) {
  if (typeof raw !== "string") return null;
  let s = raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>~|\[\]]/g, "")
    .replace(/["“”«»]/g, "")
    .replace(/^\s*['‘’]+|['‘’]+\s*$/g, "")
    .replace(/^\s*[-•\d.)]+\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;
  const m = s.match(/^.*?[.!?…](?=\s|$)/);
  if (m) s = m[0];
  if (s.length > MAX_CHARS) {
    let cut = s.slice(0, MAX_CHARS - 1);
    const sp = cut.lastIndexOf(" ");
    if (sp > 20) cut = cut.slice(0, sp);
    s = cut.replace(/[\s,;:–—-]+$/, "") + ".";
  }
  if (!/[.!?…]$/.test(s)) s = s.length < MAX_CHARS ? s + "." : s.slice(0, -1) + ".";
  return s.length > 1 ? s : null;
}

async function run(text, signal) {
  const base = await getSession();
  if (!base || signal.aborted) return null;
  let s = null;
  try {
    // Clone so each reply is independent and context never piles up.
    s = typeof base.clone === "function" ? await base.clone({ signal }) : base;
    const out = await s.prompt(text, { signal });
    return clean(out);
  } finally {
    if (s && s !== base) {
      try { s.destroy(); } catch {}
    }
  }
}

export async function reply(text) {
  try {
    if (dead) return null;
    const input = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (!input) return null;
    const ctrl = new AbortController();
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => { ctrl.abort(); resolve(null); }, LIMIT_MS);
    });
    try {
      return await Promise.race([run(input, ctrl.signal).catch(() => null), timeout]);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

export default reply;
