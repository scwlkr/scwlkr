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

const UPDATE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in vec4 aVel;
layout(location=2) in vec4 aTarget;
layout(location=3) in vec4 aSeed;
uniform float uDt, uTime, uSince, uStagger, uTurb, uRadius, uOn, uPull, uBurst, uKick;
uniform vec2 uPointer, uPointerVel;
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

  float delay = aSeed.x * uStagger;
  float bound = smoothstep(delay, delay + 0.45, uSince);
  float stiff = mix(24.0, 70.0, aSeed.y);
  float damp = 2.0 * mix(0.52, 0.8, aSeed.z) * sqrt(stiff);

  vec2 acc = (aTarget.xy - p) * stiff * bound;
  acc += flow(p + aSeed.zw * 40.0, uTime) * (uTurb * 520.0 * (1.0 - 0.9 * bound) + 12.0);

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
  float alpha = uAlpha * aVel.w * mix(0.72, 1.0, aSeed.x) * (1.0 - heat * 0.3);
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

  const coarse = matchMedia("(pointer: coarse)").matches;
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

  // Measure the ink, then cut it into one cell per grain so the fill is even, never clumped.
  function raster(w, h, paint) {
    const rough = scan(w, h, Math.min(1, Math.sqrt(2.5e5 / (w * h))), paint);
    const ink = Math.max(rough.n / (rough.q * rough.q), 1);
    const shape = scan(w, h, clamp(Math.sqrt(count / ink), 0.3, Math.min(3, Math.sqrt(4e6 / (w * h)))), paint);
    const { filled, n } = shape;
    for (let i = n - 1; i > 0; i -= 1) {
      const j = (Math.random() * (i + 1)) | 0;
      const swap = filled[i];
      filled[i] = filled[j];
      filled[j] = swap;
    }
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

  function mark() {
    const size = Math.min(vw * 0.66, vh * 0.52, 440);
    const scale = size / MARK.w;
    return raster(size, size, (c) => {
      c.scale(scale, scale);
      c.fillStyle = "#fff";
      for (const path of markPaths) c.fill(path);
    });
  }

  function spaced(c, size) {
    c.font = `800 ${size}px "Inter", "Arial Black", sans-serif`;
    if ("letterSpacing" in c) c.letterSpacing = `${(-0.035 * size).toFixed(2)}px`;
    c.textBaseline = "alphabetic";
  }

  // `lit` characters are solid; the rest is the ghost of a suggestion.
  function text(value, lit = Infinity, inked = false) {
    spaced(pen, 100);
    const unit = pen.measureText(value).width || 1;
    const size = Math.min(vh * 0.27, vw * 0.21, 236, (Math.min(vw * 0.78, 1240) / unit) * 100);
    const pad = size * 0.3;
    const advance = (unit * size) / 100;
    const litWidth = lit < value.length ? (pen.measureText(value.slice(0, lit)).width * size) / 100 : advance + pad;
    const baseline = size * 1.15;
    const shape = raster(advance + pad * 2, size * 1.6, (c) => {
      spaced(c, size);
      c.fillStyle = "#ff0";
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

  function build(spec) {
    if (spec.shape === "wordmark") return wordmark();
    if (spec.shape === "mark") return mark();
    return text(spec.text, spec.lit, spec.inked);
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

  // ---- scene state ----

  let index = 0;
  let current = VIEWS[0];
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

  function fit() {
    const cell = Math.sqrt(Math.max(area, 1) / count);
    const ideal = clamp(cell * 1.5, 0.95, 2.8);
    return { size: ideal, alpha: clamp(0.96 * ((cell * 1.5) / ideal) ** 2, 0.6, 0.96) };
  }

  function show(spec, motion) {
    current = spec;
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
      const blue = data[pixel * 4 + 2];
      targets[o] = ((pixel % W) + 0.05 + Math.random() * 0.9) / q + ox;
      targets[o + 1] = (((pixel / W) | 0) + 0.05 + Math.random() * 0.9) / q + oy;
      targets[o + 2] = red < 150 ? 1 : 0;
      targets[o + 3] = red >= 150 && blue < 90 ? 0.2 : 1;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, targetBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, targets);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    area = n / (q * q);
    if (motion) {
      since = 0;
      stagger = motion.stagger;
      turb = Math.max(turb, motion.turb);
    }

    const pad = 14;
    const [x0, y0, x1, y1] = shape.box;
    out.style.setProperty("--x", `${(halfW + ox + x0 - pad).toFixed(1)}px`);
    out.style.setProperty("--y", `${(halfH + oy + y0 - pad).toFixed(1)}px`);
    out.style.setProperty("--w", `${(x1 - x0 + pad * 2).toFixed(1)}px`);
    out.style.setProperty("--h", `${(y1 - y0 + pad * 2).toFixed(1)}px`);
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
    show({ ...view, inked: true }, { stagger: 0.55, turb: 1 });
    if (user) history.replaceState(null, "", index ? `#${view.slug}` : location.pathname + location.search);
  }

  // ---- typing: there is no input box; the dust is the input ----

  function suggest(value) {
    const needle = value.toLowerCase();
    const view = VIEWS.findIndex((candidate) => candidate.slug !== "mark" && candidate.slug.startsWith(needle));
    if (view >= 0) return { label: VIEWS[view].slug, view };
    if (LINE.startsWith(needle)) return { label: LINE };
    return null;
  }

  function clearQuery(restore = true) {
    window.clearTimeout(queryTimer);
    if (!query) return;
    query = "";
    root.classList.remove("typing");
    if (restore) show({ ...VIEWS[index], inked: true }, { stagger: 0.3, turb: 0.5 });
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

  // ---- input ----

  const ptr = { sx: 0, sy: 0, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, on: 0, want: 0, fresh: true };
  const cursor = { x: 0, y: 0, set: false };
  let pull = 0;
  let holding = false;
  let held = false;
  let holdTimer = 0;
  let press = null;
  let auto = !location.hash;
  let nextAt = 0;
  let resumeAt = 0;
  let sleepTimer = 0;

  function wake() {
    root.classList.add("awake");
    window.clearTimeout(sleepTimer);
    sleepTimer = window.setTimeout(() => root.classList.remove("awake"), 2600);
  }

  function touched() {
    auto = false;
    resumeAt = performance.now() + 45000;
    wake();
  }

  function step(direction) {
    touched();
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
    if (press && !held && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12) {
      press.moved = true;
      if (event.pointerType !== "mouse") window.clearTimeout(holdTimer);
    }
    nextAt = Math.max(nextAt, performance.now() + 3500);
    wake();
  }, { passive: true });

  window.addEventListener("pointerdown", (event) => {
    if (event.button > 0) return;
    if (event.pointerType !== "mouse") ptr.fresh = true;
    point(event);
    press = { x: event.clientX, y: event.clientY, at: performance.now(), moved: false, touch: event.pointerType !== "mouse" };
    held = false;
    window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => {
      held = true;
      holding = true;
      root.classList.add("hold");
      touched();
    }, 260);
  }, { passive: true });

  function release(event) {
    window.clearTimeout(holdTimer);
    if (holding) {
      holding = false;
      burst = 1;
      root.classList.remove("hold");
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

  canvas.addEventListener("click", () => {
    if (held || (press && press.moved)) return;
    if (query) {
      clearQuery();
      return;
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
      if (VIEWS[index].link === link && !query) return;
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
      clearQuery();
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
        const hit = suggest(query);
        if (hit && hit.view !== undefined) {
          touched();
          go(hit.view, true);
        }
        return;
      }
      if (!links.includes(document.activeElement) && VIEWS[index].link) VIEWS[index].link.click();
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

    const move = { ArrowDown: 1, ArrowRight: 1, PageDown: 1, " ": 1, ArrowUp: -1, ArrowLeft: -1, PageUp: -1 }[key];
    if (move) {
      event.preventDefault();
      step(move);
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
      measure();
      show(current);
    }, 120);
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
    ptr.on += (ptr.want - ptr.on) * Math.min(1, dt * 9);
    pull += ((holding ? 1 : 0) - pull) * Math.min(1, dt * (holding ? 5 : 16));

    // The whole sculpture leans toward the pointer and drifts when left alone.
    const drift = 1 - 0.6 * ptr.on;
    const wantY = (ptr.sx / halfW) * 0.2 * ptr.on + Math.sin(time * 0.41) * 0.07 * drift;
    const wantX = -(ptr.sy / halfH) * 0.13 * ptr.on + Math.sin(time * 0.29 + 1.3) * 0.04 * drift;
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
    gl.uniform1f(update.u.uOn, ptr.on);
    gl.uniform1f(update.u.uPull, pull);
    gl.uniform1f(update.u.uBurst, burst);
    gl.uniform1f(update.u.uKick, kick);
    gl.uniform2f(update.u.uPointer, ptr.x, ptr.y);
    gl.uniform2f(update.u.uPointerVel, ptr.vx, ptr.vy);
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
    if (now - began > 2500 && elapsed < 0.2 && trims < 3) {
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

    if (!auto && now > resumeAt) {
      auto = true;
      nextAt = now + 400;
    }
    const busy = query || holding || links.includes(document.activeElement) || root.classList.contains("aim");
    if (auto && !busy && now > nextAt) {
      go(index + 1, false);
      nextAt = now + 5200;
    }
  }

  document.addEventListener("visibilitychange", () => {
    window.cancelAnimationFrame(raf);
    if (document.hidden) return;
    last = 0;
    raf = window.requestAnimationFrame(frame);
  });

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    window.cancelAnimationFrame(raf);
  });
  canvas.addEventListener("webglcontextrestored", () => location.reload());
  reduce.addEventListener("change", () => location.reload());

  // ---- open: a single green point, then everything ----

  const wanted = decodeURIComponent(location.hash.slice(1)).toLowerCase();
  const first = Math.max(0, VIEWS.findIndex((view) => view.slug === wanted));
  root.dataset.view = VIEWS[first].slug;
  ticks[first].classList.add("on");
  wake();
  raf = window.requestAnimationFrame(frame);

  const fonts = document.fonts ? document.fonts.load('800 100px "Inter"').catch(() => {}) : Promise.resolve();
  const beat = new Promise((resolve) => window.setTimeout(resolve, 520));
  Promise.all([fonts, beat]).then(() => {
    kick = 1;
    go(first, false);
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
