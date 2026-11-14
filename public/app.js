import { WORDMARK, MARK } from "./shapes.js";

const root = document.documentElement;
const canvas = document.getElementById("dust");
const out = document.getElementById("out");
const links = [...out.querySelectorAll("a")];
const rail = document.getElementById("rail");
const dot = document.getElementById("dot");

const VIEWS = [
  { slug: "scwlkr", shape: "wordmark" },
  { slug: "mark", shape: "mark" },
  ...links.map((link) => {
    const text = link.textContent.trim();
    return { slug: text.toLowerCase(), shape: "text", text, link };
  }),
];
const LINE = "n00b until proven guilty";
const FOCAL = 1500;
const DEPTH = 18;

// The raccoon, in the mark's own 1000-unit space.
const EYES = [5, 6];
const EYE_LINE = 598;
const NOSE = [497, 755];

// Words a shared link may not spell. Stored as hashes so the list is not a word list.
const BLOCKED_INSIDE = new Set([
  825071621, 1825958011, 2090526271, 2285825857, 2444789715, 2447652168, 2491417249, 2505785029,
  2758825305, 2824268595, 3104482549, 3114006918, 3646700319, 3656079069, 3691556361, 3866578250,
]);
const BLOCKED_WHOLE = new Set([
  336914794, 393612970, 1911768552, 2113294878, 2123226675, 2985822365, 3004352723, 3368596176,
  3610473989, 3758695880, 4064161250, 4137990222,
]);
const BLOCKED_LENGTHS = [4, 5, 6];
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", "@": "a", $: "s", "!": "i" };

const UPDATE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in vec4 aVel;
layout(location=2) in vec4 aTarget;
layout(location=3) in vec4 aSeed;
uniform float uDt, uTime, uSince, uStagger, uTurb, uRadius, uOn, uPull, uBurst, uKick, uFall, uBlink, uEyeY;
uniform vec2 uPointer, uPointerVel, uGaze;
out vec2 vPos;
out vec4 vVel;

vec2 flow(vec2 p, float t) {
  vec2 q = p * 0.0052;
  float a = q.x * 1.3 + t * 0.9;
  float b = q.y * 1.7 - t * 0.7;
  float c = (q.x - q.y) * 2.3 + t * 1.3;
  float d = (q.x + q.y) * 3.1 - t * 1.1;
  float dx = 1.3 * cos(a) * cos(b) + 1.15 * cos(c) - 1.085 * sin(d);
  float dy = -1.7 * sin(a) * sin(b) - 1.15 * cos(c) - 1.085 * sin(d);
  return vec2(dy, -dx);
}

void main() {
  vec2 p = aPos;
  vec2 v = aVel.xy;

  // Grains flagged as an eye follow the gaze and close on a blink.
  float eye = step(1.25, aTarget.w);
  vec2 goal = aTarget.xy + eye * uGaze;
  goal.y = mix(goal.y, uEyeY, eye * uBlink);

  float delay = aSeed.x * uStagger;
  float bound = smoothstep(delay, delay + 0.45, uSince);
  float stiff = mix(mix(24.0, 70.0, aSeed.y), 230.0, eye);
  float damp = 2.0 * mix(0.52, 0.8, aSeed.z) * sqrt(stiff);
  vec2 wander = flow(p + aSeed.zw * 40.0, uTime);
  vec2 acc;

  if (uFall > 0.5) {
    // Sand: each grain lets go in turn, drops, and comes to rest in the pile.
    float loose = step(delay, uSince);
    acc = vec2((goal.x - p.x) * 6.0 - v.x * 3.0, 1500.0) * loose + wander * 8.0;
    damp = mix(9.0, 0.2, loose);
  } else {
    acc = (goal - p) * stiff * bound;
    acc += wander * (uTurb * 520.0 * (1.0 - 0.9 * bound) + 12.0);
  }

  vec2 d = p - uPointer;
  float r2 = dot(d, d);
  vec2 away = d * inversesqrt(r2 + 1.0);
  float near = exp(-r2 / (uRadius * uRadius)) * uOn;
  float wide = exp(-r2 / (uRadius * uRadius * 9.0)) * uOn;
  acc += away * near * 3000.0 * (1.0 - uPull);
  acc += uPointerVel * near * 7.0;
  acc -= away * wide * 5200.0 * uPull;

  float turn = aSeed.z * 43.98;
  v += vec2(cos(turn), sin(turn)) * (30.0 + 1500.0 * aSeed.x * aSeed.x) * uKick;
  v += away * wide * (500.0 + 900.0 * aSeed.y) * uBurst;

  v += acc * uDt;
  v *= exp(-damp * uDt);
  p += v * uDt;

  if (uFall > 0.5 && p.y >= goal.y) {
    p.y = goal.y;
    p.x += (goal.x - p.x) * (1.0 - exp(-uDt * 6.0));
    v = vec2(0.0, v.y > 140.0 ? -v.y * 0.18 : 0.0);
  }

  vPos = p;
  vVel = vec4(v, aVel.zw + (aTarget.zw - aVel.zw) * (1.0 - exp(-uDt * 5.0)));
}`;

const UPDATE_FS = `#version 300 es
precision mediump float;
void main() {}`;

const DRAW_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in vec4 aVel;
layout(location=3) in vec4 aSeed;
uniform mat3 uRot;
uniform vec2 uHalf;
uniform float uFocal, uDepth, uSize, uAlpha;
out vec4 vColor;

void main() {
  float heat = smoothstep(90.0, 900.0, length(aVel.xy));
  float z = (aSeed.w - 0.5) * uDepth + heat * (aSeed.y - 0.5) * 220.0;
  vec3 p = uRot * vec3(aPos, z);
  float scale = uFocal / (uFocal - p.z);
  gl_Position = vec4(p.x * scale / uHalf.x, -p.y * scale / uHalf.y, 0.0, 1.0);
  gl_PointSize = uSize * mix(0.75, 1.4, aSeed.y) * (1.0 + heat * 0.5) * scale;
  vec3 color = mix(vec3(1.0), vec3(0.137, 0.808, 0.42), clamp(max(aVel.z, heat * 0.7), 0.0, 1.0));
  float alpha = uAlpha * min(aVel.w, 1.0) * mix(0.72, 1.0, aSeed.x) * (1.0 - heat * 0.3);
  vColor = vec4(color * alpha, alpha);
}`;

const DRAW_FS = `#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 color;
void main() {
  color = vColor * smoothstep(0.5, 0.2, length(gl_PointCoord - 0.5));
}`;

const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function hash(value) {
  let result = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 0x01000193) >>> 0;
  }
  return result;
}

// What a shared link is allowed to spell: short, printable, and not on the blocked list.
function speakable(raw, limit = 28) {
  const text = raw
    .replace(/[_+]+/g, " ")
    .replace(/[^\p{L}\p{N}\p{P}\p{S}\p{Zs}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit)
    .trim();
  const flat = text.toLowerCase().replace(/[013457@$!]/g, (character) => LEET[character]);
  for (const word of flat.split(/[^a-z]+/)) {
    if (BLOCKED_WHOLE.has(hash(word))) return "";
  }
  const run = flat.replace(/[^a-z]/g, "");
  for (const length of BLOCKED_LENGTHS) {
    for (let i = 0; i + length <= run.length; i += 1) {
      if (BLOCKED_INSIDE.has(hash(run.slice(i, i + length)))) return "";
    }
  }
  return text;
}

function plain() {
  root.className = "";
  delete root.dataset.view;
}

function live() {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("WebGL2 is unavailable");

  const pen = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const wordmarkPaths = WORDMARK.paths.map((path) => ({ ...path, shape: new Path2D(path.d) }));
  const markPaths = MARK.paths.map((d) => new Path2D(d));

  let vw = 0;
  let vh = 0;
  let halfW = 0;
  let halfH = 0;
  let dpr = 1;
  let stageY = 0;

  const coarse = matchMedia("(pointer: coarse)").matches;

  function measure() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    halfW = vw / 2;
    halfH = vh / 2;
    stageY = -vh * 0.02;
    dpr = Math.min(window.devicePixelRatio || 1, coarse ? 3 : 2);
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  measure();

  const total = clamp(Math.round(vw * vh * 0.12), 40000, coarse ? 70000 : 160000);
  let count = total;

  // ---- shapes: everything on screen is sampled from one of these ----

  function scan(w, h, q, paint) {
    const W = Math.max(1, Math.ceil(w * q));
    const H = Math.max(1, Math.ceil(h * q));
    pen.canvas.width = W;
    pen.canvas.height = H;
    pen.setTransform(q, 0, 0, q, 0, 0);
    paint(pen);
    const data = pen.getImageData(0, 0, W, H).data;
    const filled = new Uint32Array(W * H);
    let n = 0;
    let x0 = W;
    let y0 = H;
    let x1 = 0;
    let y1 = 0;
    for (let y = 0, i = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1, i += 1) {
        if (data[i * 4 + 3] <= 96) continue;
        filled[n] = i;
        n += 1;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    const box = n ? [x0 / q, y0 / q, (x1 + 1) / q, (y1 + 1) / q] : [0, 0, w, h];
    return { W, q, data, filled, n, box, cx: (box[0] + box[2]) / 2, cy: (box[1] + box[3]) / 2 };
  }

  function shuffle(list, n) {
    for (let i = n - 1; i > 0; i -= 1) {
      const j = (Math.random() * (i + 1)) | 0;
      const swap = list[i];
      list[i] = list[j];
      list[j] = swap;
    }
  }

  // Measure the ink, then cut it into one cell per grain so the fill is even, never clumped.
  function raster(w, h, paint) {
    const rough = scan(w, h, Math.min(1, Math.sqrt(2.5e5 / (w * h))), paint);
    const ink = Math.max(rough.n / (rough.q * rough.q), 1);
    const shape = scan(w, h, clamp(Math.sqrt(count / ink), 0.3, Math.min(3, Math.sqrt(4e6 / (w * h)))), paint);
    shuffle(shape.filled, shape.n);
    return shape;
  }

  function wordmark() {
    const width = Math.min(vw * 0.76, 980, (vh * 0.36 * WORDMARK.w) / WORDMARK.h);
    const scale = width / WORDMARK.w;
    return raster(width, WORDMARK.h * scale, (c) => {
      c.scale(scale, scale);
      c.transform(0.92, 0, 0, 0.267, 0, 1168.125);
      c.transform(1.414926, 0, 0, 4.8754, -192.577466, -26867.746731);
      for (const path of wordmarkPaths) {
        c.save();
        c.translate(path.tx, 0);
        c.fillStyle = path.green ? "rgb(35,206,107)" : "#fff";
        c.fill(path.shape);
        c.restore();
      }
    });
  }

  // Eyes are painted in a marker colour so their grains can be told apart later.
  function mark() {
    const size = Math.min(vw * 0.66, vh * 0.52, 440);
    const scale = size / MARK.w;
    const shape = raster(size, size, (c) => {
      c.scale(scale, scale);
      markPaths.forEach((path, i) => {
        c.fillStyle = EYES.includes(i) ? "#f0f" : "#fff";
        c.fill(path);
      });
    });
    shape.scale = scale;
    return shape;
  }

  function spaced(c, size, tight = true) {
    c.font = `800 ${size}px "Inter", "Arial Black", sans-serif`;
    if ("letterSpacing" in c) c.letterSpacing = tight ? `${(-0.035 * size).toFixed(2)}px` : "0px";
    c.textBaseline = "alphabetic";
  }

  function typeSize(unit) {
    return Math.min(vh * 0.27, vw * 0.21, 236, (Math.min(vw * 0.78, 1240) / unit) * 100);
  }

  // `lit` characters are solid; the rest is the ghost of a suggestion.
  function text(value, lit = Infinity, inked = false, hot = false) {
    spaced(pen, 100);
    const unit = pen.measureText(value).width || 1;
    const size = typeSize(unit);
    const pad = size * 0.3;
    const advance = (unit * size) / 100;
    const litWidth = lit < value.length ? (pen.measureText(value.slice(0, lit)).width * size) / 100 : advance + pad;
    const baseline = size * 1.15;
    const shape = raster(advance + pad * 2, size * 1.6, (c) => {
      spaced(c, size);
      c.fillStyle = hot ? "rgb(35,206,107)" : "#ff0";
      c.fillText(value, pad, baseline);
      c.save();
      c.beginPath();
      c.rect(0, 0, pad + litWidth, size * 1.6);
      c.clip();
      c.clearRect(0, 0, advance + pad * 2, size * 1.6);
      c.fillStyle = "#fff";
      c.fillText(value, pad, baseline);
      c.restore();
    });
    if (!inked) {
      shape.cx = pad + advance / 2;
      shape.cy = baseline - size * 0.36;
    }
    return shape;
  }

  // A sentence wraps onto a few lines and is centred as a block.
  function sentence(value) {
    const rows = value.length <= 16 ? 1 : value.length <= 40 ? 2 : value.length <= 72 ? 3 : 4;
    const width = Math.ceil(value.length / rows) + 3;
    const wrapped = [""];
    for (const word of value.split(" ")) {
      const line = wrapped[wrapped.length - 1];
      if (line && `${line} ${word}`.length > width && wrapped.length < 5) wrapped.push(word);
      else wrapped[wrapped.length - 1] = line ? `${line} ${word}` : word;
    }
    spaced(pen, 100);
    const unit = Math.max(...wrapped.map((line) => pen.measureText(line).width)) || 1;
    const size = Math.min(typeSize(unit), (vh * 0.6) / (wrapped.length * 1.08));
    const leading = size * 1.08;
    const wide = (unit * size) / 100 + size * 0.6;
    return raster(wide, leading * wrapped.length + size * 0.5, (c) => {
      spaced(c, size);
      c.textAlign = "center";
      c.fillStyle = "#fff";
      wrapped.forEach((line, i) => c.fillText(line, wide / 2, size + i * leading));
    });
  }

  function build(spec) {
    if (spec.shape === "wordmark") return wordmark();
    if (spec.shape === "mark") return mark();
    if (spec.shape === "sentence") return sentence(spec.text);
    return text(spec.text, spec.lit, spec.inked, spec.hot);
  }

  // ---- GPU: positions and velocities live on the card, stepped by transform feedback ----

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  function program(vertex, fragment, varyings) {
    const result = gl.createProgram();
    gl.attachShader(result, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(result, compile(gl.FRAGMENT_SHADER, fragment));
    if (varyings) gl.transformFeedbackVaryings(result, varyings, gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(result);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result));
    const uniforms = {};
    const size = gl.getProgramParameter(result, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < size; i += 1) {
      const { name } = gl.getActiveUniform(result, i);
      uniforms[name] = gl.getUniformLocation(result, name);
    }
    return { id: result, u: uniforms };
  }

  const update = program(UPDATE_VS, UPDATE_FS, ["vPos", "vVel"]);
  const draw = program(DRAW_VS, DRAW_FS);

  const seeds = new Float32Array(total * 4);
  for (let i = 0; i < seeds.length; i += 1) seeds[i] = Math.random();

  const start = new Float32Array(total * 6);
  for (let i = 0; i < total; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * 2.5;
    start[i * 6] = Math.cos(angle) * radius;
    start[i * 6 + 1] = stageY + Math.sin(angle) * radius;
    start[i * 6 + 4] = 1;
    start[i * 6 + 5] = 1;
  }

  const targets = new Float32Array(total * 4);
  for (let i = 0; i < total; i += 1) {
    targets[i * 4] = start[i * 6];
    targets[i * 4 + 1] = start[i * 6 + 1];
    targets[i * 4 + 2] = 1;
    targets[i * 4 + 3] = 1;
  }

  function buffer(data, usage) {
    const result = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, result);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    return result;
  }

  const seedBuffer = buffer(seeds, gl.STATIC_DRAW);
  const targetBuffer = buffer(targets, gl.DYNAMIC_DRAW);
  const states = [buffer(start, gl.DYNAMIC_COPY), buffer(start, gl.DYNAMIC_COPY)];

  const arrays = states.map((state) => {
    const result = gl.createVertexArray();
    gl.bindVertexArray(result);
    gl.bindBuffer(gl.ARRAY_BUFFER, state);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8);
    gl.bindBuffer(gl.ARRAY_BUFFER, targetBuffer);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuffer);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 0, 0);
    return result;
  });
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(24 / 255, 24 / 255, 24 / 255, 1);

  function upload() {
    gl.bindBuffer(gl.ARRAY_BUFFER, targetBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, targets);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  // ---- scene state ----

  let index = 0;
  let current = VIEWS[0];
  let mode = "";
  let area = 1;
  let since = 0;
  let stagger = 0;
  let turb = 0;
  let kick = 0;
  let burst = 0;
  let size = 1.2;
  let alpha = 0.9;
  let source = 0;
  let query = "";
  let queryTimer = 0;
  let sayTimer = 0;
  let face = null;

  // "" is a normal view; "say" a greeting, "clock" the time, "sand" the collapsed pile.
  function setMode(next) {
    mode = next;
    if (next) root.dataset.mode = next;
    else delete root.dataset.mode;
    if (next !== "say") {
      window.clearTimeout(sayTimer);
      delete root.dataset.say;
    }
  }

  function move(motion) {
    if (!motion) return;
    since = 0;
    stagger = motion.stagger;
    turb = Math.max(turb, motion.turb);
  }

  function fit() {
    const cell = Math.sqrt(Math.max(area, 1) / count);
    const ideal = clamp(cell * 1.5, 0.95, 2.8);
    return { size: ideal, alpha: clamp(0.96 * ((cell * 1.5) / ideal) ** 2, 0.6, 0.96) };
  }

  function show(spec, motion) {
    current = spec;
    stopClock();
    if (spec.shape === "clock") {
      setMode("clock");
      startClock();
      move(motion);
      return;
    }
    setMode(spec.mode || "");

    const shape = build(spec);
    const { W, q, data, filled, n } = shape;
    const ox = -shape.cx;
    const oy = stageY - shape.cy;

    for (let i = 0; i < total; i += 1) {
      const o = i * 4;
      if (!n) {
        targets[o + 3] = 0;
        continue;
      }
      const pixel = filled[i % n];
      const red = data[pixel * 4];
      const green = data[pixel * 4 + 1];
      const blue = data[pixel * 4 + 2];
      targets[o] = ((pixel % W) + 0.05 + Math.random() * 0.9) / q + ox;
      targets[o + 1] = (((pixel / W) | 0) + 0.05 + Math.random() * 0.9) / q + oy;
      targets[o + 2] = red < 150 ? 1 : 0;
      targets[o + 3] = red < 150 ? 1 : blue < 90 ? 0.2 : green < 110 ? 1.5 : 1;
    }

    upload();
    area = n / (q * q);
    move(motion);

    face = spec.shape === "mark"
      ? {
        eyeY: oy + EYE_LINE * shape.scale,
        noseX: ox + NOSE[0] * shape.scale,
        noseY: oy + NOSE[1] * shape.scale,
        reach: Math.max(30, 80 * shape.scale),
        glance: 16 * shape.scale,
      }
      : null;

    const pad = 14;
    const [x0, y0, x1, y1] = shape.box;
    out.style.setProperty("--x", `${(halfW + ox + x0 - pad).toFixed(1)}px`);
    out.style.setProperty("--y", `${(halfH + oy + y0 - pad).toFixed(1)}px`);
    out.style.setProperty("--w", `${(x1 - x0 + pad * 2).toFixed(1)}px`);
    out.style.setProperty("--h", `${(y1 - y0 + pad * 2).toFixed(1)}px`);
  }

  function home(motion = { stagger: 0.3, turb: 0.5 }) {
    show({ ...VIEWS[index], inked: true }, motion);
  }

  const ticks = VIEWS.map((view, i) => {
    const tick = document.createElement("button");
    tick.type = "button";
    tick.tabIndex = -1;
    tick.addEventListener("click", () => {
      touched();
      go(i, true);
    });
    rail.append(tick);
    return tick;
  });

  function go(next, user) {
    index = (next + VIEWS.length) % VIEWS.length;
    const view = VIEWS[index];
    clearQuery(false);
    root.dataset.view = view.slug;
    ticks.forEach((tick, i) => tick.classList.toggle("on", i === index));
    links.forEach((link) => link.classList.toggle("on", link === view.link));
    if (links.includes(document.activeElement) && document.activeElement !== view.link) document.activeElement.blur();
    home({ stagger: 0.55, turb: 1 });
    if (user) history.replaceState(null, "", index ? `#${view.slug}` : location.pathname + location.search);
  }

  // ---- a greeting: scwlkr.com/#anything opens spelling it ----

  function say(message) {
    window.clearTimeout(sayTimer);
    show({ shape: "text", text: message, mode: "say" }, { stagger: 0.55, turb: 1 });
    root.dataset.say = message;
    sayTimer = window.setTimeout(() => {
      if (mode !== "say") return;
      go(0, false);
      auto = true;
      nextAt = performance.now() + 6200;
    }, 4600);
  }

  // ---- the clock: one fixed slot per character, so only the digit that changes moves ----

  let clock = null;
  let clockTimer = 0;

  function clockText() {
    const now = new Date();
    const cycle = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hourCycle;
    const twelve = cycle === "h12" || cycle === "h11";
    const hours = twelve ? now.getHours() % 12 || 12 : now.getHours();
    return [hours, now.getMinutes(), now.getSeconds()].map((part) => String(part).padStart(2, "0")).join(":");
  }

  function startClock() {
    spaced(pen, 100, false);
    const digits = "0123456789";
    const digitUnit = Math.max(...[...digits].map((digit) => pen.measureText(digit).width));
    const colonUnit = pen.measureText(":").width;
    const fontSize = typeSize(digitUnit * 6 + colonUnit * 2);
    const digitWidth = (digitUnit * fontSize) / 100;
    const colonWidth = (colonUnit * fontSize) / 100;
    const height = fontSize * 1.3;
    const baseline = fontSize;
    const glyph = (character, width, q) => scan(width, height, q, (c) => {
      spaced(c, fontSize, false);
      c.textAlign = "center";
      c.fillStyle = "#fff";
      c.fillText(character, width / 2, baseline);
    });

    // Every digit gets the same grain budget, sized so the heaviest digit is exactly full.
    const digitBudget = Math.floor(count / 6.44);
    const colonBudget = Math.floor(digitBudget * 0.22);
    const rough = Math.min(1, Math.sqrt(4e4 / (digitWidth * height)));
    const heaviest = Math.max(...[...digits].map((digit) => glyph(digit, digitWidth, rough).n)) / (rough * rough);
    const q = Math.min(3, Math.sqrt(digitBudget / Math.max(heaviest, 1)) * 0.985);

    const slots = [];
    let x = -(digitWidth * 6 + colonWidth * 2) / 2;
    let first = 0;
    for (let i = 0; i < 8; i += 1) {
      const colon = i === 2 || i === 5;
      const width = colon ? colonWidth : digitWidth;
      const budget = colon ? colonBudget : digitBudget;
      slots.push({ x, width, first, budget, colon });
      x += width;
      first += budget;
    }

    clock = { slots, q, glyphs: {}, shown: "", glyph, top: stageY - (baseline - fontSize * 0.36), used: first };
    for (let i = first; i < total; i += 1) targets[i * 4 + 3] = 0;
    area = count / (q * q);
    face = null;
    tick();
  }

  function tick() {
    if (!clock) return;
    const value = clockText();
    clock.slots.forEach((slot, i) => {
      const character = value[i];
      if (clock.shown[i] === character) return;
      let cut = clock.glyphs[character];
      if (!cut) {
        cut = clock.glyph(character, slot.width, clock.q);
        shuffle(cut.filled, cut.n);
        clock.glyphs[character] = cut;
      }
      for (let j = 0; j < slot.budget; j += 1) {
        const o = (slot.first + j) * 4;
        const pixel = cut.filled[j % Math.max(cut.n, 1)];
        targets[o] = slot.x + ((pixel % cut.W) + 0.05 + Math.random() * 0.9) / clock.q;
        targets[o + 1] = clock.top + (((pixel / cut.W) | 0) + 0.05 + Math.random() * 0.9) / clock.q;
        targets[o + 2] = slot.colon ? 1 : 0;
        targets[o + 3] = j < cut.n ? 1 : 0;
      }
    });
    clock.shown = value;
    upload();
    clockTimer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 8);
  }

  function stopClock() {
    window.clearTimeout(clockTimer);
    clock = null;
  }

  // ---- sand: left alone long enough, whatever is on screen crumbles into a pile ----

  function fall(delay = 2.4) {
    if (mode === "clock") return;
    const cell = Math.max(0.4, Math.sqrt(Math.max(area, 1) / count));
    const columns = Math.max(8, Math.ceil(vw / cell));
    const column = new Int32Array(count);
    const heights = new Float32Array(columns);
    for (let i = 0; i < count; i += 1) {
      const c = clamp(Math.floor((targets[i * 4] + halfW) / cell), 0, columns - 1);
      column[i] = c;
      heights[c] += 1;
    }

    // Let the heap slump to its angle of repose.
    const slope = 0.95;
    for (let pass = 0; pass < 220; pass += 1) {
      let moved = 0;
      for (let sweep = 0; sweep < 2; sweep += 1) {
        for (let k = 0; k < columns - 1; k += 1) {
          const c = sweep ? columns - 2 - k : k;
          const excess = heights[c] - heights[c + 1];
          const shift = excess > slope ? (excess - slope) / 2 : excess < -slope ? (excess + slope) / 2 : 0;
          heights[c] -= shift;
          heights[c + 1] += shift;
          moved = Math.max(moved, Math.abs(shift));
        }
      }
      if (moved < 0.2) break;
    }

    // Grains keep their left-to-right order on the way down, so each letter feeds the pile beneath it.
    const order = new Int32Array(count);
    const offsets = new Int32Array(columns + 1);
    for (let i = 0; i < count; i += 1) offsets[column[i] + 1] += 1;
    for (let c = 0; c < columns; c += 1) offsets[c + 1] += offsets[c];
    const cursorAt = offsets.slice(0, columns);
    for (let i = 0; i < count; i += 1) {
      order[cursorAt[column[i]]] = i;
      cursorAt[column[i]] += 1;
    }

    const floor = halfH + 4;
    let taken = 0;
    let carry = 0;
    for (let c = 0; c < columns; c += 1) {
      carry += heights[c];
      const end = c === columns - 1 ? count : Math.min(count, Math.round(carry));
      const stack = Array.from(order.subarray(taken, end));
      // Grains that let go first land lowest.
      stack.sort((a, b) => seeds[a * 4] - seeds[b * 4]);
      for (let row = 0; row < stack.length; row += 1) {
        const o = stack[row] * 4;
        targets[o] = -halfW + (c + Math.random()) * cell;
        targets[o + 1] = floor - (row + Math.random()) * cell;
        targets[o + 3] = 1;
      }
      taken = end;
    }

    upload();
    setMode("sand");
    face = null;
    since = 0;
    stagger = delay;
  }

  // ---- typing: there is no input box; the dust is the input ----

  const COMMANDS = {
    time: () => show({ shape: "clock" }, { stagger: 0.4, turb: 0.6 }),
    sand: () => fall(),
  };

  function suggest(value) {
    const needle = value.toLowerCase();
    const view = VIEWS.findIndex((candidate) => candidate.slug !== "mark" && candidate.slug.startsWith(needle));
    if (view >= 0) return { label: VIEWS[view].slug, view };
    const command = Object.keys(COMMANDS).find((name) => name.startsWith(needle));
    if (command) return { label: command, run: COMMANDS[command] };
    if (LINE.startsWith(needle)) return { label: LINE };
    return null;
  }

  function clearQuery(restore = true) {
    window.clearTimeout(queryTimer);
    if (!query) return;
    query = "";
    root.classList.remove("typing");
    if (restore) home();
  }

  function type() {
    window.clearTimeout(queryTimer);
    if (!query.trim()) {
      clearQuery();
      return;
    }
    const hit = suggest(query);
    root.classList.add("typing");
    show(
      { shape: "text", text: hit ? hit.label : query, lit: hit ? query.length : Infinity },
      { stagger: 0.14, turb: 0.25 },
    );
    queryTimer = window.setTimeout(clearQuery, 6000);
  }

  // Enter, or a tap on a phone: go where the word points, or ask the page what it thinks.
  let thinking = false;
  let asking = 0;

  function submit() {
    const asked = query.trim();
    const hit = suggest(query);
    if (hit && hit.view !== undefined) {
      touched();
      go(hit.view, true);
    } else if (hit && hit.run) {
      touched();
      clearQuery(false);
      hit.run();
    } else if (!hit && asked.length > 1) {
      answer(asked);
    }
  }

  // The reply comes from a model running in the visitor's own browser, when one is available.
  function answer(asked) {
    touched();
    asking += 1;
    const ticket = asking;
    thinking = true;
    window.clearTimeout(queryTimer);
    queryTimer = window.setTimeout(clearQuery, 24000);
    import("./mind.js")
      .then((mind) => mind.reply(asked))
      .catch(() => null)
      .then((line) => {
        if (ticket !== asking) return;
        thinking = false;
        if (query.trim() !== asked) return;
        const said = line ? speakable(String(line), 110) : "";
        if (!said) {
          window.clearTimeout(queryTimer);
          queryTimer = window.setTimeout(clearQuery, 1800);
          return;
        }
        clearQuery(false);
        show({ shape: "sentence", text: said, mode: "say" }, { stagger: 0.5, turb: 0.9 });
        root.dataset.say = said;
        sayTimer = window.setTimeout(() => {
          if (mode === "say") home();
        }, 7500);
      });
  }

  // Phones have no keys: drag sideways and the alphabet runs under the finger; let go to keep the letter.
  // The left edge deletes, the right edge sends, and just inside it is the space. Stop for a moment and it sends itself.
  const KEYS = ["<", ..."abcdefghijklmnopqrstuvwxyz", " ", " ", ">"];
  let scrub = null;

  function pick(x) {
    const key = KEYS[clamp(Math.floor((x / vw) * KEYS.length), 0, KEYS.length - 1)];
    if (key === scrub) return;
    scrub = key;
    window.clearTimeout(queryTimer);
    if ((key === "<" || key === ">") && !query) return;
    root.classList.add("typing");
    const preview = key === "<" ? query : key === ">" ? `${query} \u2192` : `${query}${key === " " ? "_" : key}`;
    const lit = key === "<" ? query.length - 1 : query.length;
    show({ shape: "text", text: preview, lit, hot: true }, { stagger: 0.04, turb: 0.1 });
  }

  function send() {
    if (!query.trim()) return;
    submit();
    if (query && !thinking) {
      window.clearTimeout(queryTimer);
      queryTimer = window.setTimeout(clearQuery, 3500);
    }
  }

  function keep() {
    const key = scrub;
    scrub = null;
    if (key === "<") query = query.slice(0, -1);
    else if (key !== null && key !== ">" && query.length < 28) query += key;
    if (!query.trim()) {
      query = "";
      root.classList.remove("typing");
      home();
      return;
    }
    type();
    window.clearTimeout(queryTimer);
    if (key === ">") send();
    else queryTimer = window.setTimeout(send, 3000);
  }

  // ---- input ----

  const ptr = { sx: 0, sy: 0, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, on: 0, want: 0, fresh: true };
  const cursor = { x: 0, y: 0, set: false };
  let pull = 0;
  let holding = false;
  let held = false;
  let holdTimer = 0;
  let press = null;
  let acted = false;
  let auto = !location.hash;
  let nextAt = 0;
  let resumeAt = location.hash ? performance.now() + 45000 : 0;
  let sleepTimer = 0;
  let idleAt = performance.now();
  let sneezeAt = 0;
  let blinkAt = performance.now() + 2600;
  let gazeX = 0;
  let gazeY = 0;

  function wake() {
    idleAt = performance.now();
    root.classList.add("awake");
    window.clearTimeout(sleepTimer);
    sleepTimer = window.setTimeout(() => root.classList.remove("awake"), 2600);
  }

  function touched() {
    acted = true;
    auto = false;
    resumeAt = performance.now() + 45000;
    wake();
  }

  function step(direction) {
    touched();
    if (mode === "sand") {
      home({ stagger: 0.55, turb: 1 });
      return;
    }
    go(index + direction, true);
  }

  function point(event) {
    ptr.sx = event.clientX - halfW;
    ptr.sy = event.clientY - halfH;
    ptr.want = 1;
  }

  window.addEventListener("pointermove", (event) => {
    point(event);
    if (event.pointerType === "mouse" && !root.classList.contains("fine")) root.classList.add("fine");
    if (press && (!held || press.touch) && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) {
      if (press.touch && !press.moved) {
        window.clearTimeout(holdTimer);
        press.scrub = Math.abs(event.clientX - press.x) >= Math.abs(event.clientY - press.y);
        if (press.scrub) {
          // A finger that rested before it moved had started a hold; a sideways drag wins.
          held = false;
          holding = false;
          root.classList.remove("hold");
          touched();
        }
      }
      press.moved = true;
    }
    if (press && press.scrub) {
      ptr.want = 0;
      pick(event.clientX);
    }
    nextAt = Math.max(nextAt, performance.now() + 3500);
    wake();
  }, { passive: true });

  window.addEventListener("pointerdown", (event) => {
    if (event.button > 0) return;
    if (event.pointerType !== "mouse") ptr.fresh = true;
    point(event);
    press = { x: event.clientX, y: event.clientY, at: performance.now(), moved: false, touch: event.pointerType !== "mouse" };
    // A finger on the glass means the word is not finished: hold the automatic send.
    if (press.touch && query && !thinking) window.clearTimeout(queryTimer);
    held = false;
    window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => {
      held = true;
      holding = true;
      root.classList.add("hold");
      touched();
    }, press.touch ? 480 : 260);
  }, { passive: true });

  function release(event) {
    window.clearTimeout(holdTimer);
    if (holding) {
      holding = false;
      burst = 1;
      root.classList.remove("hold");
    }
    if (press && press.scrub) {
      press.scrub = false;
      ptr.want = 0;
      keep();
      return;
    }
    if (press && press.touch && query && !thinking) {
      window.clearTimeout(queryTimer);
      queryTimer = window.setTimeout(send, 3000);
    }
    if (press && press.touch) {
      const dx = event.clientX - press.x;
      const dy = event.clientY - press.y;
      const far = Math.max(Math.abs(dx), Math.abs(dy));
      if (!held && far > 44 && performance.now() - press.at < 800) {
        const along = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
        step(along < 0 ? 1 : -1);
      }
      ptr.want = 0;
    }
  }

  window.addEventListener("pointerup", release, { passive: true });
  window.addEventListener("pointercancel", release, { passive: true });
  document.addEventListener("mouseleave", () => {
    ptr.want = 0;
  });

  canvas.addEventListener("click", (event) => {
    if (held || (press && press.moved)) return;
    if (query) {
      if (press && press.touch) send();
      else clearQuery();
      return;
    }
    if (mode === "clock") {
      touched();
      home();
      return;
    }
    // The raccoon's nose is a button nobody is told about.
    if (face && !mode && !sneezeAt) {
      const dx = event.clientX - halfW - face.noseX;
      const dy = event.clientY - halfH - face.noseY;
      if (Math.hypot(dx, dy) < face.reach) {
        touched();
        sneezeAt = performance.now();
        root.classList.add("sneeze");
        return;
      }
    }
    step(1);
  });

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      if (held || (press && press.moved)) event.preventDefault();
    });
    link.addEventListener("pointerenter", () => root.classList.add("aim"));
    link.addEventListener("pointerleave", () => root.classList.remove("aim"));
    link.addEventListener("focus", () => {
      if (VIEWS[index].link === link && !query && !mode) return;
      touched();
      go(VIEWS.findIndex((view) => view.link === link), true);
    });
  });

  let wheelSum = 0;
  let wheelLast = 0;
  let wheelPrev = 0;
  let wheelStep = 0;
  let wheelLocked = false;

  window.addEventListener("wheel", (event) => {
    event.preventDefault();
    const now = performance.now();
    const unit = event.deltaMode ? 32 : 1;
    const delta = (Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX) * unit;
    const mag = Math.abs(delta);
    const fresh = now - wheelLast > 140
      || (now - wheelStep > 350 && mag > wheelPrev * 1.6 + 6)
      || (now - wheelStep > 900 && mag >= 40);
    wheelLast = now;
    wheelPrev = mag;
    if (fresh) {
      wheelLocked = false;
      wheelSum = 0;
    }
    if (wheelLocked) return;
    wheelSum += delta;
    if (Math.abs(wheelSum) < 44) return;
    wheelLocked = true;
    wheelStep = now;
    step(wheelSum > 0 ? 1 : -1);
  }, { passive: false });

  window.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const { key } = event;

    if (key === "Escape") {
      if (query) clearQuery();
      else if (mode) {
        touched();
        home();
      }
      return;
    }
    if (key === "Backspace" && query) {
      event.preventDefault();
      query = query.slice(0, -1);
      touched();
      type();
      return;
    }
    if (key === "Enter") {
      if (query) {
        submit();
        return;
      }
      if (!mode && !links.includes(document.activeElement) && VIEWS[index].link) VIEWS[index].link.click();
      return;
    }
    if (key.length === 1 && (key !== " " || query)) {
      if (query.length >= 28) return;
      event.preventDefault();
      query += key;
      touched();
      type();
      return;
    }

    const direction = { ArrowDown: 1, ArrowRight: 1, PageDown: 1, " ": 1, ArrowUp: -1, ArrowLeft: -1, PageUp: -1 }[key];
    if (direction) {
      event.preventDefault();
      step(direction);
    } else if (key === "Home" || key === "End") {
      event.preventDefault();
      touched();
      go(key === "Home" ? 0 : VIEWS.length - 1, true);
    }
  });

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const fallen = mode === "sand";
      measure();
      show(current);
      if (fallen) fall(0);
    }, 120);
  });

  // ---- where a link lands: a view, a command, or a greeting ----

  function arrive(fragment, opening) {
    let raw = fragment;
    try {
      raw = decodeURIComponent(fragment);
    } catch (error) {
      // A malformed link is still worth spelling as written.
    }
    const name = raw.trim().toLowerCase();
    const view = VIEWS.findIndex((candidate) => candidate.slug === name);
    if (view >= 0) return go(view, false);
    if (Object.hasOwn(COMMANDS, name)) {
      root.dataset.view = VIEWS[index].slug;
      return COMMANDS[name]();
    }
    const message = speakable(raw);
    if (message) return say(message);
    return opening ? go(0, false) : undefined;
  }

  window.addEventListener("hashchange", () => {
    touched();
    arrive(location.hash.slice(1), false);
  });

  // ---- frame ----

  const rot = new Float32Array(9);
  let rotX = 0;
  let rotY = 0;
  let last = 0;
  let raf = 0;
  let slow = 0;
  let sampled = 0;
  let trims = 0;
  let began = 0;

  function frame(now) {
    raf = window.requestAnimationFrame(frame);
    const time = now / 1000;
    if (!last) {
      last = time;
      began = now;
      nextAt = now + 6200;
      return;
    }
    const elapsed = time - last;
    const dt = Math.min(elapsed, 1 / 30);
    last = time;
    if (dt <= 0) return;

    since += dt;
    turb *= Math.exp(-dt * 1.5);
    if (thinking) turb = Math.max(turb, 0.32);
    ptr.on += (ptr.want - ptr.on) * Math.min(1, dt * 9);

    // A sneeze is a short breath in at the nose, then everything goes.
    let sneezing = false;
    if (sneezeAt) {
      sneezing = true;
      if (now - sneezeAt > 340) {
        burst = 3;
        sneezeAt = 0;
        root.classList.remove("sneeze");
      }
    }
    const drawing = holding || (sneezing && sneezeAt > 0);
    pull += ((drawing ? 1 : 0) - pull) * Math.min(1, dt * (drawing ? 5 : 16));

    // The whole sculpture leans toward the pointer and drifts when left alone. Sand lies still.
    const calm = mode === "sand" ? 0.1 : 1;
    const drift = 1 - 0.6 * ptr.on;
    const wantY = ((ptr.sx / halfW) * 0.2 * ptr.on + Math.sin(time * 0.41) * 0.07 * drift) * calm;
    const wantX = (-(ptr.sy / halfH) * 0.13 * ptr.on + Math.sin(time * 0.29 + 1.3) * 0.04 * drift) * calm;
    rotY += (wantY - rotY) * Math.min(1, dt * 4);
    rotX += (wantX - rotX) * Math.min(1, dt * 4);
    const ca = Math.cos(rotY);
    const sa = Math.sin(rotY);
    const cb = Math.cos(rotX);
    const sb = Math.sin(rotX);
    rot[0] = ca; rot[1] = sa * sb; rot[2] = -sa * cb;
    rot[3] = 0; rot[4] = cb; rot[5] = sb;
    rot[6] = sa; rot[7] = -ca * sb; rot[8] = ca * cb;

    // Cast the pointer back through the lens onto the tilted plane the dust lives on.
    const a = FOCAL * rot[0] + ptr.sx * rot[2];
    const b = FOCAL * rot[3] + ptr.sx * rot[5];
    const c = FOCAL * rot[1] + ptr.sy * rot[2];
    const d = FOCAL * rot[4] + ptr.sy * rot[5];
    const det = a * d - b * c || 1;
    ptr.x = (ptr.sx * FOCAL * d - b * ptr.sy * FOCAL) / det;
    ptr.y = (a * ptr.sy * FOCAL - c * ptr.sx * FOCAL) / det;
    if (ptr.fresh) {
      ptr.px = ptr.x;
      ptr.py = ptr.y;
      ptr.fresh = ptr.want === 0;
    }
    ptr.vx += (clamp((ptr.x - ptr.px) / dt, -4000, 4000) - ptr.vx) * 0.35;
    ptr.vy += (clamp((ptr.y - ptr.py) / dt, -4000, 4000) - ptr.vy) * 0.35;
    ptr.px = ptr.x;
    ptr.py = ptr.y;
    if (ptr.want === 0 && ptr.on < 0.01) ptr.fresh = true;

    // The raccoon watches the pointer and blinks on its own schedule.
    let blink = 0;
    let wantGazeX = 0;
    let wantGazeY = 0;
    if (face) {
      const dx = ptr.x;
      const dy = ptr.y - face.eyeY;
      const far = Math.hypot(dx, dy) || 1;
      const pullTo = Math.min(1, far / 220) * face.glance * ptr.on;
      wantGazeX = (dx / far) * pullTo;
      wantGazeY = (dy / far) * pullTo * 0.6;
      if (now > blinkAt + 190) blinkAt = now + 2200 + Math.random() * 4200;
      if (now > blinkAt) blink = Math.sin(((now - blinkAt) / 190) * Math.PI);
      if (sneezing) blink = 1;
    }
    gazeX += (wantGazeX - gazeX) * Math.min(1, dt * 9);
    gazeY += (wantGazeY - gazeY) * Math.min(1, dt * 9);

    const look = fit();
    size += (look.size - size) * Math.min(1, dt * 4);
    alpha += (look.alpha - alpha) * Math.min(1, dt * 4);

    const target = 1 - source;
    gl.useProgram(update.id);
    gl.uniform1f(update.u.uDt, dt);
    gl.uniform1f(update.u.uTime, time);
    gl.uniform1f(update.u.uSince, since);
    gl.uniform1f(update.u.uStagger, stagger);
    gl.uniform1f(update.u.uTurb, turb);
    gl.uniform1f(update.u.uRadius, 30 + Math.min(vw, vh) * 0.055);
    gl.uniform1f(update.u.uOn, sneezing ? 1 : ptr.on);
    gl.uniform1f(update.u.uPull, pull);
    gl.uniform1f(update.u.uBurst, burst);
    gl.uniform1f(update.u.uKick, kick);
    gl.uniform1f(update.u.uFall, mode === "sand" ? 1 : 0);
    gl.uniform1f(update.u.uBlink, blink);
    gl.uniform1f(update.u.uEyeY, face ? face.eyeY : 0);
    gl.uniform2f(update.u.uGaze, gazeX, gazeY);
    if (sneezing && face) {
      gl.uniform2f(update.u.uPointer, face.noseX, face.noseY);
      gl.uniform2f(update.u.uPointerVel, 0, 0);
    } else {
      gl.uniform2f(update.u.uPointer, ptr.x, ptr.y);
      gl.uniform2f(update.u.uPointerVel, ptr.vx, ptr.vy);
    }
    burst = 0;
    kick = 0;

    gl.bindVertexArray(arrays[source]);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, states[target]);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    source = target;

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(draw.id);
    gl.uniformMatrix3fv(draw.u.uRot, false, rot);
    gl.uniform2f(draw.u.uHalf, halfW, halfH);
    gl.uniform1f(draw.u.uFocal, FOCAL);
    gl.uniform1f(draw.u.uDepth, DEPTH);
    gl.uniform1f(draw.u.uSize, size * dpr);
    gl.uniform1f(draw.u.uAlpha, alpha);
    gl.bindVertexArray(arrays[source]);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.bindVertexArray(null);

    if (root.classList.contains("fine")) {
      const ease = cursor.set ? Math.min(1, dt * 26) : 1;
      cursor.x += (ptr.sx + halfW - cursor.x) * ease;
      cursor.y += (ptr.sy + halfH - cursor.y) * ease;
      cursor.set = true;
      dot.style.transform = `translate3d(${cursor.x.toFixed(1)}px, ${cursor.y.toFixed(1)}px, 0)`;
      dot.style.opacity = ptr.want ? "1" : "0";
    }

    // Slow machine: drop dust, keep the frame rate.
    if (now - began > 2500 && elapsed < 0.2 && trims < 3 && !mode) {
      slow += elapsed;
      sampled += 1;
      if (sampled === 45) {
        if (slow / sampled > 0.026 && count > 24000) {
          count = Math.max(24000, Math.round(count * 0.6));
          trims += 1;
          show(current);
        }
        slow = 0;
        sampled = 0;
      }
    }

    const still = !query && !holding && !mode && !links.includes(document.activeElement);
    if (!auto && now > resumeAt) {
      auto = true;
      nextAt = now + 400;
    }
    if (still && now - idleAt > 90000) {
      fall();
    } else if (auto && still && !root.classList.contains("aim") && now > nextAt) {
      go(index + 1, false);
      nextAt = now + 5200;
    }
  }

  document.addEventListener("visibilitychange", () => {
    window.cancelAnimationFrame(raf);
    if (document.hidden) return;
    last = 0;
    idleAt = performance.now();
    raf = window.requestAnimationFrame(frame);
  });

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    window.cancelAnimationFrame(raf);
  });
  canvas.addEventListener("webglcontextrestored", () => location.reload());
  reduce.addEventListener("change", () => location.reload());

  // ---- open: a single green point, then everything ----

  root.dataset.view = VIEWS[0].slug;
  ticks[0].classList.add("on");
  wake();
  raf = window.requestAnimationFrame(frame);

  const fonts = document.fonts ? document.fonts.load('800 100px "Inter"').catch(() => {}) : Promise.resolve();
  const beat = new Promise((resolve) => window.setTimeout(resolve, 520));
  Promise.all([fonts, beat]).then(() => {
    kick = 1;
    if (acted) return;
    arrive(location.hash.slice(1), true);
    since = -0.2;
  });
}

if (root.classList.contains("live") && !reduce.matches) {
  try {
    live();
  } catch (error) {
    plain();
    console.warn(error);
  }
} else {
  plain();
}

console.log(
  "%cscwlkr%c\nn00b until proven guilty.\n\nthere is no interface. scroll, press and hold, or just start typing.",
  "font: 800 28px/1.4 Inter, Arial Black, sans-serif; color: #23ce6b",
  "font: 12px/1.6 ui-monospace, Menlo, monospace; color: #8c8c8c",
);
