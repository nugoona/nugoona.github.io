'use strict';
// 지도 생성기: 씨앗(정수) 하나 → 지도 정의 하나(data/maps.json 의 항목과 같은 모양). 같은 씨앗이면 항상 같은 지도.
// 뼈대는 "지그재그 줄" — 가로 줄 몇 개를 번갈아 잇는 S자. 씨앗이 정하는 것:
//   목표 비율 2.02~2.18 · 줄 간격 700~1150(좁으면 사거리 짧은 타워도 양쪽을 덮는다) · 길 가로 폭 1,200~1,900 · 줄 수 3~10
//   쐐기 굽이(줄 중간이 ㄷ자로 튀어나옴, 0~3개) · 나선 변형(안으로 감아 들어감) · 공중 길(직선/한가운데 경유) · 테마(풀·눈·사막·용암)
// 🔑 판은 세로로 길어야 한다 — 폰 화면이 360×780 = 2.17 이라, 판이 정사각이면 화면 위아래 65% 가 빈 배경으로 남는다.
//    그래서 가로 폭을 먼저 정하고 세로는 비율로 따라오게 하며, 줄 수는 "길 길이는 그대로" 가 되게 역산한다.
//    (가로를 좁히고 줄을 늘리면 세로만 길어지고 길 길이는 유지된다 = 밸런스가 안 바뀐다)
//    가로로 눕히는 회전(rotate)은 없앴다 — 세로 화면에 정반대다.
// 자리는 통로 중앙선(줄 사이)에 600~800 간격으로, 길을 많이 덮는 곳부터 12~16개. 전부 판(bounds) 안에.
// 자동 검증(validateGenerated)에서 떨어지면 씨앗을 큰 수로 바꿔 재시도(결정적) — 실제로는 구조가 항상 유효해서 거의 안 떨어진다.
// node:    const { generateMap } = require('./mapgen');  const def = generateMap(7);
// browser: NGN.generateMap(7)

(function () {
const isNode = typeof module !== 'undefined' && module.exports;

function rng(seed) { // 씨앗 난수(결정적)
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const THEMES = ['grass', 'snow', 'desert', 'lava'];
const THEME_KO = { grass: '풀밭', snow: '눈밭', desert: '사막', lava: '용암' };
// 이름에 붙는 모양말. 판이 세로로 길어지며 줄 수가 늘어 굽이가 통째로 커졌으므로 기준도 같이 올렸다
const shapeKo = (turns, spiral) => (spiral ? '감아드는' : turns >= 26 ? '미로 같은' : turns >= 20 ? '굽이진' : turns >= 14 ? '꺾이는' : '곧은');

function samplePoly(poly, step) {
  const pts = [];
  for (let i = 0; i < poly.length - 1; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 0; k < n; k++) pts.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
  }
  pts.push(poly[poly.length - 1]);
  return pts;
}
const polyLen = (poly) => poly.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - poly[i - 1][0], p[1] - poly[i - 1][1]) : 0), 0);

// 지그재그 뼈대(가로 기준). 쐐기 굽이를 넣는다
function zigzag(r, W, gap, rows, margin, wedges) {
  const ys = []; for (let i = 0; i < rows; i++) ys.push(margin + i * gap);
  const poly = [];
  let leftToRight = true;
  for (let i = 0; i < rows; i++) {
    const y = ys[i];
    const xa = leftToRight ? 0 : W, xb = leftToRight ? W : 0;
    const startX = i === 0 ? xa : poly[poly.length - 1][0];
    if (i === 0) poly.push([xa, y]);
    // 이 줄에 쐐기? 줄 중간 어딘가에서 ㄷ자로 튀어나온다(위/아래 중 통로가 있는 쪽으로 gap*0.45)
    if (wedges > 0 && r() < 0.6 && rows > 1) {
      const dirY = i === 0 ? 1 : i === rows - 1 ? -1 : (r() < 0.5 ? -1 : 1);
      const depth = gap * 0.45;
      const w = 500 + Math.floor(r() * 3) * 200;
      const cx = 600 + r() * (W - 1200 - w);
      const x1 = leftToRight ? cx : cx + w, x2 = leftToRight ? cx + w : cx;
      poly.push([x1, y], [x1, y + dirY * depth], [x2, y + dirY * depth], [x2, y]);
      wedges--;
    }
    void startX;
    poly.push([xb, y]);
    if (i < rows - 1) poly.push([xb, ys[i + 1]]);
    leftToRight = !leftToRight;
  }
  return { poly, ys };
}

// 나선 뼈대: 바깥에서 안으로 감아 들어간다(출구는 한가운데)
function spiral(W, H, gap, margin) {
  // 사각 나선: (0,t) → 오른쪽 끝 → 아래 → 왼쪽 → 한 칸 안쪽으로 올라와 다시 오른쪽… 매 바퀴 gap 씩 안으로. 마지막 점이 출구(한가운데)
  // 판이 세로로 길면(가로 폭이 좁으면) 가로로 감을 여유가 한 바퀴 만에 없어진다.
  // 그때는 가로 폭을 그대로 두고 위아래에서만 좁혀 들어온다 — "바깥에서 안으로" 는 그대로고, 길만 길어진다.
  let x0 = margin, y0 = margin, x1 = W - margin, y1 = H - margin;
  // 입구는 판 위쪽에서 내려온다(왼쪽 밖으로 빼면 포탈이 판 가로를 넓혀 화면에서 판이 작아진다).
  // 출구는 원래대로 판 한가운데라 성도 판 안에 선다.
  const poly = [[x0, 0], [x0, y0]];
  let guard = 0;
  while (y1 - y0 > gap * 2 && x1 - x0 > gap && guard++ < 12) {
    poly.push([x1, y0], [x1, y1], [x0, y1]);
    y0 += gap;
    poly.push([x0, y0]);
    y1 -= gap;
    if (x1 - x0 > gap * 3) { x0 += gap; x1 -= gap; } // 가로 여유가 넉넉할 때만 가로도 좁힌다
  }
  poly.push([x1, y0]); // 마지막 짧은 구간
  return poly;
}

const PAD = 250;        // 판 테두리 여유 — bounds 는 길보다 이만큼 넓다
// 지그재그 좌우 여백. 600 인 이유: 입구·출구에 서는 포탈이 폭 1,140(반폭 570) · 성이 폭 860(반폭 430) 이라,
// 입구·출구가 판 좌우 끝에서 570 은 떨어져야 그 둘이 판 밖으로 삐져나가지 않는다.
// 삐져나가면 카메라가 담아야 할 가로가 그만큼 넓어지고, 카메라는 가로에 맞춰 멀어져 판이 화면에서 작아진다.
const SIDE = 600;
const RATIO_MIN = 2.02; // 판의 세로/가로 비율. 폰 화면이 360×780 = 2.17 이라 판도 그만큼 세로로 길어야
const RATIO_MAX = 2.18; // 화면 위아래가 빈 배경으로 남지 않는다

// 길 폴리라인과 판 크기 → 타워 자리 목록. 생성 지도와 손 지도(data/maps.json)가 같은 규칙을 쓴다.
// 자리 후보: 판 안 격자에서 길과 260~900 사이인 점 — 통로 한가운데(길에서 간격/2)가 가장 좋다.
// 격자를 150 으로 촘촘히 두는 게 중요하다. 300 이면 통로 한가운데를 비껴가 통로 하나가 통째로 버려진다
// (줄 간격 800 이면 한가운데가 400, 격자가 200 어긋나면 길에서 200 뿐이라 전부 탈락했다).
// 자리는 판 안(bounds)에만 — 판 밖으로 삐져나가면 판이 넓어져 세로로 긴 비율이 깨진다.
function placeSlots(poly, boardW, boardH, want) {
  const pts = samplePoly(poly, 20);
  const cand = [];
  const step = 150;
  for (let x = 150; x <= boardW - 150; x += step) for (let y = 150; y <= boardH - 150; y += step) {
    let near = Infinity, n = 0;
    for (const q of pts) { const dx = q[0] - x, dy = q[1] - y, s2 = dx * dx + dy * dy; if (s2 < near) near = s2; if (s2 <= 640000) n++; }
    const d = Math.sqrt(near);
    if (d < 260 || d > 900) continue;
    cand.push({ x, y, cover: n * 20, d });
  }
  cand.sort((a, b) => b.cover - a.cover);
  const slots = [];
  // 길을 많이 덮는 자리부터. 판이 좁아지면 좋은 자리가 모자랄 수 있어 문턱과 자리 간격을 늦추며 채운다
  // (자리 간격은 sim/map.js 가 검사하는 450 아래로는 절대 안 내려간다)
  for (const [minCover, minGap] of [[600, 560], [420, 560], [260, 500]]) {
    for (const c of cand) {
      if (slots.length >= want) break;
      if (c.cover < minCover) continue;
      if (slots.some((s) => Math.hypot(s[0] - c.x, s[1] - c.y) < minGap)) continue;
      slots.push([c.x, c.y]);
    }
    if (slots.length >= want) break;
  }
  return slots;
}

function generateRaw(seed) {
  const r = rng(seed * 7919 + 17);
  const margin = 300 + Math.floor(r() * 3) * 100;
  const targetLen = 12000 + r() * 7000;
  const R = RATIO_MIN + r() * (RATIO_MAX - RATIO_MIN); // 이 지도가 노리는 세로/가로 비율
  const useSpiral = r() < 0.2;
  let poly, W, H, gap, rows = 0, Wd, Hd;
  if (useSpiral) {
    // 나선: 가로 폭을 훑어 세로는 비율로 따라오게 하고, 길 길이가 목표에 가장 가까운 폭을 고른다
    gap = pick(r, [800, 900, 1000, 1100]);
    let best = null;
    for (let w = 1800; w <= 2800; w += 100) {
      const h = Math.round(R * (w + PAD)) - PAD;
      const p = spiral(w, h, gap, margin);
      const err = Math.abs(polyLen(p) - targetLen);
      if (!best || err < best.err) best = { W: w, H: h, poly: p, err };
    }
    W = best.W; H = best.H; poly = best.poly;
    Wd = W + PAD; Hd = H + PAD;
  } else {
    // 지그재그: 비율과 길 길이를 함께 만족하는 (가로 폭 · 줄 수 · 줄 간격) 을 찾는다.
    //   판 세로 = 2*margin + (줄수-1)*간격 이고, 비율이 R 이면 판 세로는 가로 폭에서 정해진다.
    //   길 길이 = 줄수*가로폭 + 판세로(줄 잇는 세로 구간 + 위아래 진입·진출) — 가로를 좁히고 줄을 늘리면
    //   길이는 그대로인 채 세로만 길어진다. 그게 이 지도들을 세로로 세우는 방법이다.
    const wedges = Math.floor(r() * 4);
    const adj = targetLen - wedges * 0.6 * 0.9 * 900; // 쐐기 굽이가 늘릴 길이만큼 미리 뺀다
    let best = null;
    for (let w = 1200; w <= 1900; w += 100) { // 길 자체의 가로 폭. 판은 여기에 좌우 여백 600 씩을 더한 크기다
      const h = Math.round(R * (w + 2 * SIDE));
      const span = h - 2 * margin; // (줄수-1)*간격
      for (let n = 3; n <= 10; n++) {
        const g = Math.round(span / (n - 1));
        if (g < 700 || g > 1150) continue; // 700 보다 좁으면 통로 한가운데도 길에 너무 붙어 자리를 못 놓는다
        const err = Math.abs(n * w + h - adj);
        if (!best || err < best.err) best = { W: w, rows: n, gap: g, err };
      }
    }
    if (!best) best = { W: 1800, rows: 5, gap: 900 }; // 있을 수 없는 조합용 안전판
    W = best.W; rows = best.rows; gap = best.gap;
    H = margin * 2 + (rows - 1) * gap;
    Wd = W + 2 * SIDE; Hd = H;
    // 🔑 입구는 판 위쪽에서 내려오고, 출구는 판 아래쪽으로 빠진다.
    // 좌우로 빼면 판 밖에 놓이는 성과 포탈이 판 가로를 30% 넘게 넓혀 버리고, 카메라는 가로에 맞춰
    // 멀어진다 — 그러면 애써 세로로 세운 판이 화면에서 다시 작아진다. 세로는 남아도니 위아래로 뺀다.
    poly = zigzag(r, W, gap, rows, margin, wedges).poly.map(([x, y]) => [x + SIDE, y]);
    poly.unshift([poly[0][0], 0]);
    poly.push([poly[poly.length - 1][0], H]);
  }
  const length = polyLen(poly);
  const slots = placeSlots(poly, Wd, Hd, 12 + Math.floor(r() * 5));
  // 공중 길
  const entry = poly[0], exit = poly[poly.length - 1];
  // 입구와 출구가 같은 변에 있으면(줄 수가 짝수면 둘 다 x=0) 직선 공중 길이 판 가장자리에 딱 붙는다.
  // 그러면 자리가 한쪽에서만 닿아 공중을 막을 수가 없다 — 그때는 반드시 판 한가운데를 경유시킨다.
  const sameEdge = Math.abs(entry[0] - exit[0]) < 1 || Math.abs(entry[1] - exit[1]) < 1;
  const air = (!sameEdge && r() < 0.5) ? [entry, exit] : [entry, [Wd / 2, Hd / 2], exit];
  const theme = THEMES[(seed + Math.floor(seed / 4)) % THEMES.length]; // 씨앗 순서대로 테마가 골고루 돌게
  const turns = poly.length - 2;
  // 판 크기는 길과 자리가 아니라 가로 폭에서 곧바로 정한다 — 그래야 세로/가로 비율이 흔들리지 않는다
  const bounds = [0, 0, Wd, Hd];
  return {
    id: 'gen' + seed, seed, name: `${shapeKo(turns, useSpiral)} ${THEME_KO[theme]} ${seed}번`, theme, generated: true,
    성격: `씨앗 ${seed}. 굽이 ${turns}, 길 ${Math.round(length).toLocaleString()}, 자리 ${slots.length}, 통로 ${gap}${useSpiral ? ', 나선' : ''}.`,
    ground: poly.map(([x, y]) => [Math.round(x), Math.round(y)]), air: air.map(([x, y]) => [Math.round(x), Math.round(y)]), slots, bounds: bounds.map(Math.round), gap, length, turns,
  };
}

// 쓸 만한 지도인가. 떨어지는 이유를 배열로
function validateGenerated(def) {
  const bad = [];
  const bw = def.bounds[2] - def.bounds[0], bh = def.bounds[3] - def.bounds[1];
  const ratio = bh / bw;
  if (ratio < 1.95 || ratio > 2.25) bad.push('판 비율 ' + ratio.toFixed(2) + ' (세로로 길어야 화면이 안 빈다)');
  if (def.length < 11000) bad.push('길이 너무 짧음 ' + Math.round(def.length));
  if (def.length > 22000) bad.push('길이 너무 김 ' + Math.round(def.length));
  if (def.slots.length < 10) bad.push('자리 ' + def.slots.length + '개뿐');
  if (def.turns < 3) bad.push('굽이 ' + def.turns);
  const pts = samplePoly(def.ground, 20);
  const covers = def.slots.map(([x, y]) => { let n = 0; for (const q of pts) if ((q[0] - x) ** 2 + (q[1] - y) ** 2 <= 800 * 800) n++; return n * 20; });
  const maxRatio = Math.max(...covers) / def.length;
  const avgRatio = covers.reduce((a, b) => a + b, 0) / covers.length / def.length;
  if (maxRatio > 0.45) bad.push('한 자리가 길의 ' + Math.round(maxRatio * 100) + '% 를 덮음');
  if (avgRatio < 0.10) bad.push('자리들이 길을 평균 ' + Math.round(avgRatio * 100) + '% 밖에 못 덮음');
  for (const [x, y] of def.slots) { let d = Infinity; for (const q of pts) d = Math.min(d, Math.hypot(q[0] - x, q[1] - y)); if (d < 260) { bad.push('자리가 길에 걸침'); break; } }
  return bad;
}

// 씨앗 → 통과한 지도. 떨어지면 씨앗을 큰 수로 바꿔 재시도(결정적). 이름·id 는 원래 씨앗으로
function generateMap(seed) {
  let s = seed, tries = 0, def, bad;
  do {
    def = generateRaw(s);
    bad = validateGenerated(def);
    if (!bad.length) break;
    s = seed + 1000003 * (tries + 1); tries++;
  } while (tries < 50);
  def.id = 'gen' + seed; def.seed = seed; def.tries = tries;
  def.name = def.name.replace(/\d+번$/, seed + '번');
  def.성격 = def.성격.replace(/^씨앗 \d+\./, `씨앗 ${seed}.`);
  if (bad.length) def.rejected = bad;
  return def;
}

const api = { generateMap, generateRaw, validateGenerated, placeSlots, polyLen, THEME_KO };
if (isNode) module.exports = api;
else { window.NGN = window.NGN || {}; Object.assign(window.NGN, api); }
})();
