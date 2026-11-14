// mind/worker.js — a tiny GPT-Neo (TinyStories-1M, int8) run in plain JavaScript.
// Loaded by /mind.js as a Worker. Receives {id, text}, posts back {id, line}.
"use strict";

const D = 64, H = 16, HD = 4, L = 8, FF = 256, V = 50257, CTX = 128, EOT = 50256;

function load(json, buf) {
  const W = {};
  for (const e of json) {
    if (e.t === "f32") {
      const n = e.s.reduce((a, b) => a * b, 1);
      W[e.n] = { f: new Float32Array(buf, e.o, n), s: e.s };
    } else {
      const [r, c] = e.s;
      W[e.n] = { sc: new Float32Array(buf, e.o, r), q: new Int8Array(buf, e.o + r * 4, r * c), s: e.s };
    }
  }
  return W;
}

// y[o] = b[o] + scale[o] * sum_i q[o,i] x[i]
function mv(m, x, y, b) {
  const [R, C] = m.s, q = m.q, sc = m.sc;
  for (let o = 0; o < R; o++) {
    let s = 0;
    const base = o * C;
    for (let i = 0; i < C; i++) s += q[base + i] * x[i];
    y[o] = s * sc[o] + (b ? b[o] : 0);
  }
}

function ln(x, g, b, y) {
  let m = 0;
  for (let i = 0; i < D; i++) m += x[i];
  m /= D;
  let v = 0;
  for (let i = 0; i < D; i++) { const d = x[i] - m; v += d * d; }
  const r = 1 / Math.sqrt(v / D + 1e-5);
  for (let i = 0; i < D; i++) y[i] = (x[i] - m) * r * g[i] + b[i];
}

function gelu(x) {
  return 0.5 * x * (1 + Math.tanh(0.7978845608028654 * (x + 0.044715 * x * x * x)));
}

function Model(W) {
  const P = (n) => W[n];
  const layers = [];
  for (let l = 0; l < L; l++) {
    const p = "h." + l + ".";
    layers.push({
      g1: P(p + "ln_1.weight").f, b1: P(p + "ln_1.bias").f,
      q: P(p + "attn.attention.q_proj.weight"), k: P(p + "attn.attention.k_proj.weight"),
      v: P(p + "attn.attention.v_proj.weight"), o: P(p + "attn.attention.out_proj.weight"),
      ob: P(p + "attn.attention.out_proj.bias").f,
      g2: P(p + "ln_2.weight").f, b2: P(p + "ln_2.bias").f,
      fc: P(p + "mlp.c_fc.weight"), fcb: P(p + "mlp.c_fc.bias").f,
      pr: P(p + "mlp.c_proj.weight"), prb: P(p + "mlp.c_proj.bias").f,
      K: new Float32Array(CTX * D), Vc: new Float32Array(CTX * D),
      local: l % 2 === 1,
    });
  }
  const wte = P("wte.weight"), wpe = P("wpe.weight").f;
  const gf = P("ln_f.weight").f, bf = P("ln_f.bias").f;
  const h = new Float32Array(D), a = new Float32Array(D), q = new Float32Array(D),
    att = new Float32Array(D), t = new Float32Array(D), f = new Float32Array(FF),
    sc = new Float32Array(CTX), logits = new Float32Array(V);

  // Runs one token at position pos; fills logits when want is true.
  function step(tok, pos, want) {
    const es = wte.sc[tok], eb = tok * D;
    for (let i = 0; i < D; i++) h[i] = wte.q[eb + i] * es + wpe[pos * D + i];
    for (const ly of layers) {
      ln(h, ly.g1, ly.b1, a);
      mv(ly.q, a, q, null);
      mv(ly.k, a, t, null); ly.K.set(t, pos * D);
      mv(ly.v, a, t, null); ly.Vc.set(t, pos * D);
      for (let hh = 0; hh < H; hh++) {
        const off = hh * HD;
        let mx = -Infinity;
        for (let j = 0; j <= pos; j++) {
          let s = 0;
          for (let d = 0; d < HD; d++) s += q[off + d] * ly.K[j * D + off + d];
          sc[j] = s; // GPT-Neo does not scale attention scores
          if (s > mx) mx = s;
        }
        let sum = 0;
        for (let j = 0; j <= pos; j++) { sc[j] = Math.exp(sc[j] - mx); sum += sc[j]; }
        for (let d = 0; d < HD; d++) {
          let s = 0;
          for (let j = 0; j <= pos; j++) s += sc[j] * ly.Vc[j * D + off + d];
          att[off + d] = s / sum;
        }
      }
      mv(ly.o, att, t, ly.ob);
      for (let i = 0; i < D; i++) h[i] += t[i];
      ln(h, ly.g2, ly.b2, a);
      mv(ly.fc, a, f, ly.fcb);
      for (let i = 0; i < FF; i++) f[i] = gelu(f[i]);
      mv(ly.pr, f, t, ly.prb);
      for (let i = 0; i < D; i++) h[i] += t[i];
    }
    if (!want) return null;
    ln(h, gf, bf, a);
    mv(wte, a, logits, null);
    return logits;
  }
  return { step };
}

// ---- GPT-2 byte-level BPE ----
function Tokenizer(tj) {
  const b2u = {}, u2b = {};
  const bs = [];
  for (let i = 33; i <= 126; i++) bs.push(i);
  for (let i = 161; i <= 172; i++) bs.push(i);
  for (let i = 174; i <= 255; i++) bs.push(i);
  const cs = bs.slice();
  let n = 0;
  for (let b = 0; b < 256; b++) if (!bs.includes(b)) { bs.push(b); cs.push(256 + n++); }
  bs.forEach((b, i) => { const c = String.fromCharCode(cs[i]); b2u[b] = c; u2b[c] = b; });
  const enc = new Map();
  tj.v.forEach((s, i) => enc.set(s, i));
  const ranks = new Map();
  tj.m.forEach((m, i) => ranks.set(m, i));
  const pat = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;
  const te = new TextEncoder(), td = new TextDecoder();

  function bpe(word) {
    let parts = Array.from(word);
    while (parts.length > 1) {
      let best = -1, br = Infinity;
      for (let i = 0; i < parts.length - 1; i++) {
        const r = ranks.get(parts[i] + " " + parts[i + 1]);
        if (r !== undefined && r < br) { br = r; best = i; }
      }
      if (best < 0) break;
      parts = parts.slice(0, best).concat(parts[best] + parts[best + 1], parts.slice(best + 2));
    }
    return parts;
  }
  function encode(text) {
    const out = [];
    for (const m of text.matchAll(pat)) {
      const w = Array.from(te.encode(m[0]), (b) => b2u[b]).join("");
      for (const p of bpe(w)) { const id = enc.get(p); if (id !== undefined) out.push(id); }
    }
    return out;
  }
  function decode(ids) {
    const bytes = [];
    for (const id of ids) for (const c of tj.v[id] || "") bytes.push(u2b[c]);
    return td.decode(new Uint8Array(bytes));
  }
  return { encode, decode };
}

function sample(logits, temp, topk) {
  // keep the top-k logits
  const idx = [], val = [];
  for (let i = 0; i < logits.length; i++) {
    const x = logits[i];
    if (idx.length < topk) {
      idx.push(i); val.push(x);
    } else {
      let mi = 0;
      for (let j = 1; j < topk; j++) if (val[j] < val[mi]) mi = j;
      if (x > val[mi]) { idx[mi] = i; val[mi] = x; }
    }
  }
  if (temp <= 0) return idx[val.indexOf(Math.max(...val))];
  const mx = Math.max(...val);
  const p = val.map((x) => Math.exp((x - mx) / temp));
  let r = Math.random() * p.reduce((a, b) => a + b, 0);
  for (let i = 0; i < p.length; i++) { r -= p[i]; if (r <= 0) return idx[i]; }
  return idx[idx.length - 1];
}

// Feeds prompt ids, then samples until a stop character or maxNew tokens.
async function generate(model, tok, prompt, opts) {
  const temp = opts.temp ?? 1, topk = opts.topk ?? 40, maxNew = opts.maxNew ?? 32;
  let ids = tok.encode(prompt);
  if (ids.length > CTX - maxNew) ids = ids.slice(ids.length - (CTX - maxNew));
  let logits = null;
  for (let i = 0; i < ids.length; i++) logits = model.step(ids[i], i, i === ids.length - 1);
  const outIds = [];
  let pos = ids.length;
  for (let n = 0; n < maxNew && pos < CTX; n++) {
    const next = sample(logits, temp, topk);
    if (next === EOT) break;
    outIds.push(next);
    const text = tok.decode(outIds);
    if (opts.stop && opts.stop.test(text)) break;
    logits = model.step(next, pos++, true);
    if (opts.yieldEvery && n % opts.yieldEvery === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return tok.decode(outIds);
}

const MIND = { load, Model, Tokenizer, generate };
if (typeof module !== "undefined") module.exports = MIND;

// ---- Worker wiring ----
if (typeof importScripts === "function" && typeof self !== "undefined") {
  let ready = null;
  const base = self.location.href.replace(/[^/]*$/, "");
  function boot() {
    if (!ready) {
      ready = Promise.all([
        fetch(base + "model.json").then((r) => { if (!r.ok) throw 0; return r.json(); }),
        fetch(base + "model.bin").then((r) => { if (!r.ok) throw 0; return r.arrayBuffer(); }),
        fetch(base + "tok.json").then((r) => { if (!r.ok) throw 0; return r.json(); }),
      ]).then(([j, b, t]) => ({ W: load(j, b), tok: Tokenizer(t) }));
      ready.catch(() => { ready = null; });
    }
    return ready;
  }
  const OPENERS = [
    'Lily said, "', 'Tom said, "', 'Mom smiled and said, "', 'The bird said, "',
    'The old tree said, "', 'Ben shouted, "', 'The cat said, "', 'Sue laughed and said, "',
  ];
  self.onmessage = async (e) => {
    const { id, text } = e.data || {};
    let line = null;
    try {
      const { W, tok } = await boot();
      const model = Model(W); // fresh KV cache per reply
      const said = String(text).replace(/["\n]/g, " ").slice(0, 200);
      const opener = OPENERS[Math.floor(Math.random() * OPENERS.length)];
      const prompt = 'One day, a little friend said, "' + said + '"\n' + opener;
      line = await generate(model, tok, prompt, {
        temp: 1.0, topk: 40, maxNew: 30, stop: /["\n]|[.!?]\s/,
      });
    } catch {
      line = null;
    }
    self.postMessage({ id, line });
  };
}
