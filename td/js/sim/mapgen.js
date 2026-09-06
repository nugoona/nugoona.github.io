'use strict';
// 지도 생성기: 씨앗(정수) 하나 → 지도 정의 하나(data/maps.json 의 항목과 같은 모양). 같은 씨앗이면 항상 같은 지도.
// 뼈대는 "지그재그 줄" — 가로 줄 몇 개를 번갈아 잇는 S자. 씨앗이 정하는 것:
//   줄 수(길이 목표 12,000~19,000 에 맞춰) · 줄 간격 700/850/1050(좁으면 사거리 짧은 타워도 양쪽을 덮는다) · 가로 폭 2,400~3,600
//   쐐기 굽이(줄 중간이 ㄷ자로 튀어나옴, 0~3개) · 회전(가로 지그재그 ↔ 세로 지그재그) · 나선 변형(안으로 감아 들어감) · 공중 길(직선/한가운데 경유) · 테마(풀·눈·사막·용암)
// 자리는 통로 중앙선(줄 사이)에 600~800 간격으로, 길을 많이 덮는 곳부터 12~16개. 바깥 열에 1~2개.
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
const shapeKo = (turns, spiral) => (spiral ? '감아드는' : turns >= 12 ? '미로 같은' : turns >= 8 ? '굽이진' : turns >= 5 ? '꺾이는' : '곧은');

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
  let x0 = margin, y0 = margin, x1 = W - margin, y1 = H - margin;
  const poly = [[0, y0]];
  let guard = 0;
  while (x1 - x0 > gap * 2 && y1 - y0 > gap * 2 && guard++ < 10) {
    poly.push([x1, y0], [x1, y1], [x0, y1]);
    y0 += gap;
    poly.push([x0, y0]);
    x0 += gap; x1 -= gap; y1 -= gap;
  }
  poly.push([x1, y0]); // 마지막 짧은 구간
  return poly;
}

function generateRaw(seed) {
  const r = rng(seed * 7919 + 17);
  const gap = pick(r, [700, 850, 1050]);
  const W = 2400 + Math.floor(r() * 6) * 240; // 2400~3600
  const margin = 300 + Math.floor(r() * 3) * 100;
  const targetLen = 12000 + r() * 7000;
  const useSpiral = r() < 0.2;
  let poly, H, rows = 0;
  if (useSpiral) {
    H = W + Math.floor(r() * 3) * 300;
    poly = spiral(W, H, gap, margin);
    // 출구를 지도 밖이 아닌 한가운데로 두려면 마지막 점 그대로. 입구는 (0, margin)
  } else {
    rows = Math.max(2, Math.min(6, Math.round((targetLen - 0) / (W + gap))));
    const wedges = Math.floor(r() * 4);
    const z = zigzag(r, W, gap, rows, margin, wedges);
    poly = z.poly;
    H = margin * 2 + (rows - 1) * gap;
    // 출구: 마지막 줄 끝에서 지도 밖으로(가로 지그재그면 그 방향으로 이미 밖 = x=0 또는 W). 마지막 점이 x=0/W 이니 그대로.
  }
  // 회전: 절반은 세로 지그재그(x↔y). 지도 크기도 바뀐다
  const rotate = !useSpiral && r() < 0.45;
  let Wd = W, Hd = H;
  if (rotate) { poly = poly.map(([x, y]) => [y, x]); Wd = H; Hd = W; }
  const length = polyLen(poly);
  const pts = samplePoly(poly, 20);
  const dist = (x, y) => { let d = Infinity; for (const q of pts) { const dd = Math.hypot(q[0] - x, q[1] - y); if (dd < d) d = dd; } return d; };
  const cover = (x, y) => { let n = 0; for (const q of pts) if ((q[0] - x) ** 2 + (q[1] - y) ** 2 <= 800 * 800) n++; return n * 20; };

  // 자리 후보: 지도 안 격자(300 간격)에서 길과 260~700 사이인 점 — 통로 한가운데(길에서 gap/2)가 가장 좋다
  const cand = [];
  const stepX = 300;
  for (let x = 250; x <= Wd + 400; x += stepX) for (let y = 250; y <= Hd + 400; y += stepX) {
    const d = dist(x, y);
    if (d < 260 || d > 900) continue;
    cand.push({ x, y, cover: cover(x, y), d });
  }
  cand.sort((a, b) => b.cover - a.cover);
  const want = 12 + Math.floor(r() * 5);
  const minGap = 560;
  const slots = [];
  for (const c of cand) {
    if (slots.length >= want) break;
    if (c.cover < 600) continue;
    if (slots.some((s) => Math.hypot(s[0] - c.x, s[1] - c.y) < minGap)) continue;
    slots.push([c.x, c.y]);
  }
  // 공중 길
  const entry = poly[0], exit = poly[poly.length - 1];
  const air = r() < 0.5 ? [entry, exit] : [entry, [Wd / 2, Hd / 2], exit];
  const theme = THEMES[(seed + Math.floor(seed / 4)) % THEMES.length]; // 씨앗 순서대로 테마가 골고루 돌게
  const turns = poly.length - 2;
  const bounds = [Math.min(0, ...poly.map((p) => p[0])), Math.min(0, ...poly.map((p) => p[1])), Math.max(Wd, ...slots.map((s) => s[0]) , ...poly.map((p) => p[0])) + 250, Math.max(Hd, ...slots.map((s) => s[1]), ...poly.map((p) => p[1])) + 250];
  return {
    id: 'gen' + seed, seed, name: `${shapeKo(turns, useSpiral)} ${THEME_KO[theme]} ${seed}번`, theme, generated: true,
    성격: `씨앗 ${seed}. 굽이 ${turns}, 길 ${Math.round(length).toLocaleString()}, 자리 ${slots.length}, 통로 ${gap}${useSpiral ? ', 나선' : rotate ? ', 세로' : ''}.`,
    ground: poly.map(([x, y]) => [Math.round(x), Math.round(y)]), air: air.map(([x, y]) => [Math.round(x), Math.round(y)]), slots, bounds: bounds.map(Math.round), gap, length, turns,
  };
}

// 쓸 만한 지도인가. 떨어지는 이유를 배열로
function validateGenerated(def) {
  const bad = [];
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

const api = { generateMap, generateRaw, validateGenerated, THEME_KO };
if (isNode) module.exports = api;
else { window.NGN = window.NGN || {}; Object.assign(window.NGN, api); }
})();
