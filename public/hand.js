// hand.js: reads finger-drawn print letters and returns lowercase text.
// Point-cloud matcher in the $P family (stroke order and direction do not matter).
// Templates: Hershey fonts (public domain): Roman Simplex sans (futural), Times Roman
// complex (timesr), both cases, plus hand-drawn variants. Coordinates use the Hershey
// encoding: each character is a value offset from 'R'; " R" lifts the pen.

const T = [["a","RFJ[ RRFZ[ RMTWT"],["a","XMX[ RXPVNTMQMONMPLSLUMXOZQ[T[VZXX"],["b","KFK[ RKFTFWGXHYJYLXNWOTP RKPTPWQXRYTYWXYWZT[K["],["b","LFL[ RLPNNPMSMUNWPXSXUWXUZS[P[NZLX"],["c","ZKYIWGUFQFOGMILKKNKSLVMXOZQ[U[WZYXZV"],["c","XPVNTMQMONMPLSLUMXOZQ[T[VZXX"],["d","KFK[ RKFRFUGWIXKYNYSXVWXUZR[K["],["d","XFX[ RXPVNTMQMONMPLSLUMXOZQ[T[VZXX"],["e","LFL[ RLFYF RLPTP RL[Y["],["e","LSXSXQWOVNTMQMONMPLSLUMXOZQ[T[VZXX"],["f","LFL[ RLFYF RLPTP"],["f","WFUFSGRJR[ ROMVM"],["g","ZKYIWGUFQFOGMILKKNKSLVMXOZQ[U[WZYXZVZS RUSZS"],["g","XMX]W`VaTbQbOa RXPVNTMQMONMPLSLUMXOZQ[T[VZXX"],["h","KFK[ RYFY[ RKPYP"],["h","MFM[ RMQPNRMUMWNXQX["],["i","QFRGSFREQF RRMR["],["j","VFVVUYTZR[P[NZMYLVLT"],["j","RFSGTFSERF RSMS^RaPbNb"],["k","KFK[ RYFKT RPOY["],["k","MFM[ RWMMW RQSX["],["l","LFL[ RL[X["],["l","RFR["],["m","JFJ[ RJFR[ RZFR[ RZFZ["],["m","GMG[ RGQJNLMOMQNRQR[ RRQUNWMZM\\N]Q]["],["n","KFK[ RKFY[ RYFY["],["n","MMM[ RMQPNRMUMWNXQX["],["o","PFNGLIKKJNJSKVLXNZP[T[VZXXYVZSZNYKXIVGTFPF"],["o","QMONMPLSLUMXOZQ[T[VZXXYUYSXPVNTMQM"],["p","KFK[ RKFTFWGXHYJYMXOWPTQKQ"],["p","LMLb RLPNNPMSMUNWPXSXUWXUZS[P[NZLX"],["q","PFNGLIKKJNJSKVLXNZP[T[VZXXYVZSZNYKXIVGTFPF RSWY]"],["q","XMXb RXPVNTMQMONMPLSLUMXOZQ[T[VZXX"],["r","KFK[ RKFTFWGXHYJYLXNWOTPKP RRPY["],["r","OMO[ ROSPPRNTMWM"],["s","YIWGTFPFMGKIKKLMMNOOUQWRXSYUYXWZT[P[MZKX"],["s","XPWNTMQMNNMPNRPSUTWUXWXXWZT[Q[NZMX"],["t","RFR[ RKFYF"],["t","RFRWSZU[W[ ROMVM"],["u","KFKULXNZQ[S[VZXXYUYF"],["u","MMMWNZP[S[UZXW RXMX["],["v","JFR[ RZFR["],["v","LMR[ RXMR["],["w","HFM[ RRFM[ RRFW[ R\\FW["],["w","JMN[ RRMN[ RRMV[ RZMV["],["x","KFY[ RYFK["],["x","MMX[ RXMM["],["y","JFRPR[ RZFRP"],["y","LMR[ RXMR[P_NaLbKb"],["z","YFK[ RKFYF RK[Y["],["z","XMM[ RMMXM RM[X["],["a","RFK[ RRFY[ RRIX[ RMUVU RI[O[ RU[[["],["a","NONPMPMONNPMTMVNWOXQXXYZZ[ RWOWXXZZ[[[ RWQVRPSMTLVLXMZP[S[UZWX RPSNTMVMXNZP["],["b","LFL[ RMFM[ RIFUFXGYHZJZLYNXOUP RUFWGXHYJYLXNWOUP RMPUPXQYRZTZWYYXZU[I[ RUPWQXRYTYWXYWZU["],["b","LFL[ RMFM[ RMPONQMSMVNXPYSYUXXVZS[Q[OZMX RSMUNWPXSXUWXUZS[ RIFMF"],["c","XIYLYFXIVGSFQFNGLIKKJNJSKVLXNZQ[S[VZXXYV RQFOGMILKKNKSLVMXOZQ["],["c","WPVQWRXQXPVNTMQMNNLPKSKULXNZQ[S[VZXX RQMONMPLSLUMXOZQ["],["d","LFL[ RMFM[ RIFSFVGXIYKZNZSYVXXVZS[I[ RSFUGWIXKYNYSXVWXUZS["],["d","WFW[ RXFX[ RWPUNSMQMNNLPKSKULXNZQ[S[UZWX RQMONMPLSLUMXOZQ[ RTFXF RW[[["],["e","LFL[ RMFM[ RSLST RIFYFYLXF RMPSP RI[Y[YUX["],["e","LSXSXQWOVNTMQMNNLPKSKULXNZQ[S[VZXX RWSWPVN RQMONMPLSLUMXOZQ["],["f","LFL[ RMFM[ RSLST RIFYFYLXF RMPSP RI[P["],["f","UGTHUIVHVGUFSFQGPIP[ RSFRGQIQ[ RMMUM RM[T["],["g","XIYLYFXIVGSFQFNGLIKKJNJSKVLXNZQ[S[VZXX RQFOGMILKKNKSLVMXOZQ[ RXSX[ RYSY[ RUS\\S"],["g","QMONNOMQMSNUOVQWSWUVVUWSWQVOUNSMQM RONNPNTOV RUVVTVPUN RVOWNYMYNWN RNUMVLXLYM[P\\U\\X]Y^ RLYMZP[U[X\\Y^Y_XaUbObLaK_K^L\\O["],["h","KFK[ RLFL[ RXFX[ RYFY[ RHFOF RUF\\F RLPXP RH[O[ RU[\\["],["h","LFL[ RMFM[ RMPONRMTMWNXPX[ RTMVNWPW[ RIFMF RI[P[ RT[[["],["i","RFR[ RSFS[ ROFVF RO[V["],["i","RFQGRHSGRF RRMR[ RSMS[ ROMSM RO[V["],["j","UFUWTZR[P[NZMXMVNUOVNW RTFTWSZR[ RQFXF"],["j","SFRGSHTGSF RTMT_SaQbObNaN`O_P`Oa RSMS_RaQb RPMTM"],["k","KFK[ RLFL[ RYFLS RQOY[ RPOX[ RHFOF RUF[F RH[O[ RU[[["],["k","LFL[ RMFM[ RWMMW RRSX[ RQSW[ RIFMF RTMZM RI[P[ RT[Z["],["l","NFN[ ROFO[ RKFRF RK[Z[ZUY["],["l","RFR[ RSFS[ ROFSF RO[V["],["m","KFK[ RLFRX RKFR[ RYFR[ RYFY[ RZFZ[ RHFLF RYF]F RH[N[ RV[]["],["m","GMG[ RHMH[ RHPJNMMOMRNSPS[ ROMQNRPR[ RSPUNXMZM]N^P^[ RZM\\N]P][ RDMHM RD[K[ RO[V[ RZ[a["],["n","LFL[ RMFYY RMHY[ RYFY[ RIFMF RVF\\F RI[O["],["n","LML[ RMMM[ RMPONRMTMWNXPX[ RTMVNWPW[ RIMMM RI[P[ RT[[["],["o","QFNGLIKKJOJRKVLXNZQ[S[VZXXYVZRZOYKXIVGSFQF RQFOGMILKKOKRLVMXOZQ[ RS[UZWXXVYRYOXKWIUGSF"],["o","QMNNLPKSKULXNZQ[S[VZXXYUYSXPVNSMQM RQMONMPLSLUMXOZQ[ RS[UZWXXUXSWPUNSM"],["p","LFL[ RMFM[ RIFUFXGYHZJZMYOXPUQMQ RUFWGXHYJYMXOWPUQ RI[P["],["p","LMLb RMMMb RMPONQMSMVNXPYSYUXXVZS[Q[OZMX RSMUNWPXSXUWXUZS[ RIMMM RIbPb"],["q","QFNGLIKKJOJRKVLXNZQ[S[VZXXYVZRZOYKXIVGSFQF RQFOGMILKKOKRLVMXOZQ[ RS[UZWXXVYRYOXKWIUGSF RNYNXOVQURUTVUXV_W`Y`Z^Z] RUXV\\W^X_Y_Z^"],["q","WMWb RXMXb RWPUNSMQMNNLPKSKULXNZQ[S[UZWX RQMONMPLSLUMXOZQ[ RTb[b"],["r","LFL[ RMFM[ RIFUFXGYHZJZLYNXOUPMP RUFWGXHYJYLXNWOUP RI[P[ RRPTQURXYYZZZ[Y RTQUSWZX[Z[[Y[X"],["r","NMN[ ROMO[ ROSPPRNTMWMXNXOWPVOWN RKMOM RK[R["],["s","XIYFYLXIVGSFPFMGKIKKLMMNOOUQWRYT RKKMMONUPWQXRYTYXWZT[Q[NZLXKUK[LX"],["s","WOXMXQWOVNTMPMNNMOMQNRPSUUWVXW RMPNQPRUTWUXVXYWZU[Q[OZNYMWM[NY"],["t","RFR[ RSFS[ RLFKLKFZFZLYF RO[V["],["t","PFPWQZS[U[WZXX RQFQWRZS[ RMMUM"],["u","KFKULXNZQ[S[VZXXYUYF RLFLUMXOZQ[ RHFOF RVF\\F"],["u","LMLXMZP[R[UZWX RMMMXNZP[ RWMW[ RXMX[ RIMMM RTMXM RW[[["],["v","KFR[ RLFRX RYFR[ RIFOF RUF[F"],["v","LMR[ RMMRY RXMR[ RJMPM RTMZM"],["w","JFN[ RKFNV RRFN[ RRFV[ RSFVV RZFV[ RGFNF RWF]F"],["w","JMN[ RKMNX RRMN[ RRMV[ RSMVX RZMV[ RGMNM RWM]M"],["x","KFX[ RLFY[ RYFK[ RIFOF RUF[F RI[O[ RU[[["],["x","LMW[ RMMX[ RXML[ RJMPM RTMZM RJ[P[ RT[Z["],["y","KFRQR[ RLFSQS[ RZFSQ RIFOF RVF\\F RO[V["],["y","LMR[ RMMRY RXMR[P_NaLbKbJaK`La RJMPM RTMZM"],["z","XFK[ RYFL[ RLFKLKFYF RK[Y[YUX["],["z","WML[ RXMM[ RMMLQLMXM RL[X[XWW["],["a","OOQMTMUOU[ RUSRSOUOYQ[S[UY"],["a","UQSMQMOPOXQ[S[UW RUMU["],["g","UQSMQMOPOVQYSYUV RUMU_SbPbO`"],["y","OMOVQXSXUV RUMU_SbPbOa"],["y","OMRX RUMQb"],["t","RGRYS[U[ ROMUM"],["t","RGR[ ROMUM"],["r","PMP[ RPQRNUM"],["l","RFR["],["i","RMR[ RRHRI"],["j","SMS_RbPb RSHSI"],["k","OFO[ RUMOU RQSU["],["k","OFO[ RUMOTU["],["e","OTUTUQSMQMOPOXQ[T[UY"],["f","UGSFRGR[ ROMUM"],["s","UNSMQMOOPRTTUWS[Q[OY"],["q","UQSMQMOPOXQ[S[UW RUMUbW`"],["u","OMOXQ[S[UXUM RUMU["],["m","MMM[ RMPOMQMRPR[ RRPTMVMWPW["],["w","LMO[ROU[XM"],["x","OMU[ RUMO["]];

const N = 32, NC = 12;

function len(s) {
  let d = 0;
  for (let i = 1; i < s.length; i++) d += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
  return d;
}

function resampleStroke(s, n, out) {
  if (n <= 0) return;
  if (s.length === 1 || len(s) === 0) {
    for (let i = 0; i < n; i++) out.push([s[0][0], s[0][1]]);
    return;
  }
  const L = len(s), I = L / Math.max(1, n - 1);
  let D = 0, px = s[0][0], py = s[0][1], k = 1, got = 1;
  out.push([px, py]);
  while (k < s.length && got < n) {
    const qx = s[k][0], qy = s[k][1];
    const d = Math.hypot(qx - px, qy - py);
    if (D + d >= I && d > 0) {
      const t = (I - D) / d;
      px = px + t * (qx - px); py = py + t * (qy - py);
      out.push([px, py]); got++; D = 0;
    } else { D += d; px = qx; py = qy; k++; }
  }
  const last = s[s.length - 1];
  while (got < n) { out.push([last[0], last[1]]); got++; }
}

// Turn strokes into a normalised cloud of N points. Every stroke gets at least
// two points so a dot (the top of an i) still counts.
function cloud(strokes, N) {
  const ls = strokes.map(len);
  const total = ls.reduce((a, b) => a + b, 0) || 1;
  const counts = ls.map(l => Math.max(2, Math.round(N * l / total)));
  let sum = counts.reduce((a, b) => a + b, 0);
  while (sum !== N) {
    let bi = 0;
    for (let i = 1; i < counts.length; i++) if (counts[i] > counts[bi]) bi = i;
    if (sum > N) { if (counts[bi] <= 2) break; counts[bi]--; sum--; } else { counts[bi]++; sum++; }
  }
  const pts = [];
  strokes.forEach((s, i) => resampleStroke(s, counts[i], pts));
  while (pts.length > N) pts.pop();
  while (pts.length < N) pts.push(pts[pts.length - 1]);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, cx = 0, cy = 0;
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    cx += p[0]; cy += p[1];
  }
  const sc = Math.max(x1 - x0, y1 - y0) || 1;
  cx /= N; cy /= N;
  const xs = new Float64Array(N), ys = new Float64Array(N);
  for (let i = 0; i < N; i++) { xs[i] = (pts[i][0] - cx) / sc; ys[i] = (pts[i][1] - cy) / sc; }
  return { xs, ys, n: N };
}

const matched = new Uint8Array(N);
function cloudDist(a, b, start, best) {
  const N = a.n;
  matched.fill(0);
  let sum = 0, i = start, w = N;
  do {
    let min = Infinity, idx = -1;
    const ax = a.xs[i], ay = a.ys[i];
    for (let j = 0; j < N; j++) {
      if (matched[j]) continue;
      const dx = ax - b.xs[j], dy = ay - b.ys[j], d = dx * dx + dy * dy;
      if (d < min) { min = d; idx = j; }
    }
    matched[idx] = 1;
    sum += (w / N) * Math.sqrt(min);
    if (sum >= best) return sum;
    w--;
    i = (i + 1) % N;
  } while (i !== start);
  return sum;
}

function match(a, b, best) {
  const n = a.n, step = Math.floor(Math.sqrt(n));
  for (let i = 0; i < n; i += step) {
    const d1 = cloudDist(a, b, i, best);
    if (d1 < best) best = d1;
    const d2 = cloudDist(b, a, i, best);
    if (d2 < best) best = d2;
  }
  return best;
}

function decode(str) {
  return str.split(' R').filter(Boolean).map(s => {
    const pts = [];
    for (let i = 0; i + 1 < s.length; i += 2) pts.push([s.charCodeAt(i) - 82, s.charCodeAt(i + 1) - 82]);
    return pts;
  }).filter(s => s.length);
}

const TEMPLATES = [];
for (const [ch, data] of T) { const st = decode(data); TEMPLATES.push({ k: ch.charCodeAt(0) - 97, c: cloud(st, N), q: cloud(st, NC) }); }
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

// Distance from a character's strokes to every letter (best template per letter).
// A coarse pass on 12 points picks the likely letters; only those (plus any
// letter a known word needs here) get the full 32-point match.
function letterDistances(strokes, need) {
  const q = cloud(strokes, NC), c = cloud(strokes, N);
  const coarse = new Float64Array(26).fill(Infinity);
  for (const t of TEMPLATES) coarse[t.k] = match(q, t.q, coarse[t.k]);
  const order = Array.from(coarse.keys()).sort((a, b) => coarse[a] - coarse[b]);
  const want = new Uint8Array(26);
  for (let i = 0; i < 6; i++) want[order[i]] = 1;
  if (need) for (const k of need) want[k] = 1;
  const d = new Float64Array(26).fill(Infinity);
  for (const t of TEMPLATES) if (want[t.k]) d[t.k] = match(c, t.c, d[t.k]);
  return d;
}

function box(s) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of s) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
  }
  return { x0, y0, x1, y1 };
}

function median(a) {
  if (!a.length) return 0;
  const s = a.slice().sort((p, q) => p - q);
  return s[s.length >> 1];
}

function minPointDist(a, b) {
  let m = Infinity;
  const sa = Math.max(1, Math.floor(a.length / 40)), sb = Math.max(1, Math.floor(b.length / 40));
  for (let i = 0; i < a.length; i += sa) for (let j = 0; j < b.length; j += sb) {
    const d = Math.hypot(a[i][0] - b[j][0], a[i][1] - b[j][1]);
    if (d < m) m = d;
  }
  return m;
}

// Group strokes into characters, left to right. Returns [{strokes, x0, x1}], with
// {space: true} markers between clearly separated words.
function segment(strokes) {
  const items = strokes.map(s => ({ s, b: box(s) }));
  const H = median(items.map(it => Math.max(it.b.y1 - it.b.y0, it.b.x1 - it.b.x0))) || 1;
  const big = Math.max(H, ...items.map(it => it.b.y1 - it.b.y0)) ;
  const ref = Math.max(H, big * 0.6);
  const isDot = it => Math.max(it.b.x1 - it.b.x0, it.b.y1 - it.b.y0) < 0.22 * ref;
  const dots = items.filter(isDot), main = items.filter(it => !isDot(it));
  main.sort((p, q) => p.b.x0 - q.b.x0);
  const groups = [];
  for (const it of main) {
    const g = groups[groups.length - 1];
    if (g) {
      const ov = Math.min(g.x1, it.b.x1) - Math.max(g.x0, it.b.x0);
      const mw = Math.min(g.x1 - g.x0, it.b.x1 - it.b.x0);
      let join = ov > 0.3 * mw + 0.02 * ref && ov > 0;
      if (!join && ov > -0.12 * ref) {
        for (const s of g.strokes) if (minPointDist(s, it.s) < 0.1 * ref) { join = true; break; }
      }
      if (join) {
        g.strokes.push(it.s);
        g.x0 = Math.min(g.x0, it.b.x0); g.x1 = Math.max(g.x1, it.b.x1);
        g.y0 = Math.min(g.y0, it.b.y0); g.y1 = Math.max(g.y1, it.b.y1);
        continue;
      }
    }
    groups.push({ strokes: [it.s], x0: it.b.x0, x1: it.b.x1, y0: it.b.y0, y1: it.b.y1 });
  }
  // Dots: above a narrow group they belong to it (i, j); otherwise they are a full stop.
  for (const d of dots) {
    const cx = (d.b.x0 + d.b.x1) / 2, cy = (d.b.y0 + d.b.y1) / 2;
    let best = null, bd = Infinity;
    for (const g of groups) {
      if (cy > g.y0 + 0.3 * (g.y1 - g.y0)) continue;
      const dx = cx < g.x0 ? g.x0 - cx : cx > g.x1 ? cx - g.x1 : 0;
      if (dx < 0.3 * ref && dx < bd) { bd = dx; best = g; }
    }
    if (best) best.strokes.push(d.s);
  }
  const gaps = [];
  for (let i = 1; i < groups.length; i++) gaps.push(groups[i].x0 - groups[i - 1].x1);
  const mg = Math.max(median(gaps), 0.15 * ref);
  const out = [];
  groups.forEach((g, i) => {
    if (i > 0) {
      const gap = gaps[i - 1];
      if ((gap > 2.5 * mg && gap > 0.7 * ref) || gap > 1.4 * ref) out.push({ space: true });
    }
    out.push(g);
  });
  return out;
}

function clean(strokes) {
  if (!Array.isArray(strokes)) return [];
  const out = [];
  for (const s of strokes) {
    if (!Array.isArray(s)) continue;
    const pts = [];
    for (const p of s) {
      if (!p) continue;
      const x = +p[0], y = +p[1];
      if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
    }
    if (pts.length) out.push(pts);
  }
  return out;
}

const ACCEPT = 1.2, SLACK = 0.03, PER = 1.5;

export function read(strokes, words = []) {
  try {
    const st = clean(strokes);
    if (!st.length) return '';
    const parts = segment(st);
    const chars = parts.filter(p => !p.space);
    if (!chars.length) return '';
    const keys = [];
    for (const w of Array.isArray(words) ? words : []) {
      if (typeof w !== 'string') continue;
      const key = w.toLowerCase().replace(/[^a-z]/g, '');
      if (key.length === chars.length) keys.push([key, w.toLowerCase()]);
    }
    const need = i => {
      const out = [];
      for (const [k] of keys) { const c = k.charCodeAt(i) - 97; out.push(c); if (c === 8) out.push(11); if (c === 11) out.push(8); }
      return out;
    }
    const dist = chars.map((g, i) => letterDistances(g.strokes, need(i)));
    let free = 0, text = '', ci = 0;
    for (const p of parts) {
      if (p.space) { text += ' '; continue; }
      const d = dist[ci++];
      let k = 0;
      for (let i = 1; i < 26; i++) if (d[i] < d[k]) k = i;
      free += d[k];
      text += LETTERS[k];
    }
    // Known-word prior: the word wins when its total is close to the free reading
    // and none of its letters is far from what that character looks like.
    let best = null, bs = Infinity;
    for (const [key, w] of keys) {
      let s = 0, ok = true;
      for (let i = 0; i < key.length; i++) {
        const d = dist[i], k = key.charCodeAt(i) - 97;
        // A bare upright stroke is either a capital I or an l: let words take either.
        const v = k === 8 || k === 11 ? Math.min(d[8], d[11]) : d[k];
        let m = Infinity; for (let j = 0; j < 26; j++) if (d[j] < m) m = d[j];
        if (v > m * PER + 0.04) { ok = false; break; }
        s += v;
      }
      if (ok && s < bs) { bs = s; best = w; }
    }
    if (best !== null && bs <= free * ACCEPT + SLACK * chars.length) return best;
    return text;
  } catch (e) {
    return '';
  }
}
