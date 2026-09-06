'use strict';
// 지도: 적이 걷는 길(폴리라인)과 타워 자리. 정의는 data/maps.json 에 있고, 여기는 그 표를 읽어 "지도 객체"를 만든다.
// 단위는 원본 사거리 단위와 같다(덤불 사거리 800 등). 문서 10장: "굽이가 많아야 타워 하나가 같은 적을 두 번 때린다" — 지도가 곧 밸런스다.
//
// 길을 20단위 간격의 점으로 미리 펼쳐 두고(points), 적의 진행거리 s → 위치는 인덱스 조회 한 번으로 끝낸다.
// 자리마다 "사거리 r 이면 길을 몇 단위 덮나"를 재 두고(coverageFor) AI 가 자리를 고를 때 쓴다.
//
//   node:     const { createMap, loadMaps } = require('./map');  const maps = loadMaps();  const m = maps.byId.serpent;
//   browser:  NGN.createMap(def) — data.js 가 maps.json 을 읽은 뒤 부른다

(function () {
const isNode = typeof module !== 'undefined' && module.exports;
const STEP = 20; // 길 샘플 간격
const MIN_SLOT_TO_PATH = 260; // 자리 중심이 길에서 이만큼은 떨어져야 한다(길 폭 110 + 원판 150)

function samplePath(poly) {
  const pts = [];
  let total = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.ceil(len / STEP);
    for (let k = 0; k < n; k++) {
      const t = k / n;
      pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    }
    total += len;
  }
  pts.push(poly[poly.length - 1]);
  return { points: pts, length: total, poly };
}

// 지도 정의(maps.json 의 한 항목) → 지도 객체
function createMap(def) {
  const ground = samplePath(def.ground);
  const air = samplePath(def.air);
  const SLOTS = def.slots.map(([x, y], i) => ({ id: i, x, y }));
  const [minX, minY, maxX, maxY] = def.bounds;
  const BOUNDS = { minX, minY, maxX, maxY };
  const cache = new Map();

  function coverage(slot, r, path) {
    const r2 = r * r;
    let n = 0;
    for (const [px, py] of path.points) {
      const dx = px - slot.x, dy = py - slot.y;
      if (dx * dx + dy * dy <= r2) n++;
    }
    return n * STEP;
  }
  function coverageFor(slotId, r, flying) {
    const key = slotId * 100000 + r * 2 + (flying ? 1 : 0);
    let v = cache.get(key);
    if (v === undefined) { v = coverage(SLOTS[slotId], r, flying ? air : ground); cache.set(key, v); }
    return v;
  }
  function positionAt(path, s) {
    if (s <= 0) return path.points[0];
    const idx = Math.floor(s / STEP);
    if (idx >= path.points.length) return path.points[path.points.length - 1];
    return path.points[idx];
  }
  function neighborsWithin(slotId, r) {
    const s = SLOTS[slotId];
    return SLOTS.filter((o) => o.id !== slotId && (o.x - s.x) ** 2 + (o.y - s.y) ** 2 <= r * r);
  }
  // 정의가 말이 되는지: 자리가 길 위에 있지 않은지, 자리끼리 너무 붙지 않았는지. 문제는 문자열 배열로 돌려준다
  function validate() {
    const problems = [];
    for (const s of SLOTS) {
      let d = Infinity;
      for (const [px, py] of ground.points) d = Math.min(d, Math.hypot(px - s.x, py - s.y));
      if (d < MIN_SLOT_TO_PATH) problems.push(`자리 ${s.id}(${s.x},${s.y}) 가 길에서 ${Math.round(d)} 밖에 안 떨어짐`);
      for (const o of SLOTS) if (o.id > s.id && Math.hypot(o.x - s.x, o.y - s.y) < 450) problems.push(`자리 ${s.id} 와 ${o.id} 가 너무 가까움`);
      if (s.x < minX || s.x > maxX || s.y < minY || s.y > maxY) problems.push(`자리 ${s.id} 가 지도 밖`);
    }
    return problems;
  }
  // 굽이 수(꺾이는 점 수)
  const turns = def.ground.length - 2;
  return { id: def.id, name: def.name, theme: def.theme || 'grass', 성격: def.성격 || '', STEP, SLOTS, ground, air, coverageFor, positionAt, neighborsWithin, GROUND_PATH: def.ground, AIR_PATH: def.air, BOUNDS, turns, validate };
}

function buildIndex(defs) {
  const list = defs.map(createMap);
  const byId = {};
  for (const m of list) byId[m.id] = m;
  return { list, byId, default: list[0] };
}

let cached = null;
function loadMaps() { // node 전용
  if (cached) return cached;
  const fs = require('fs'), path = require('path');
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'maps.json'), 'utf8'));
  cached = buildIndex(raw.maps);
  return cached;
}

const api = { STEP, createMap, buildIndex, loadMaps };
if (isNode) module.exports = api;
else { window.NGN = window.NGN || {}; Object.assign(window.NGN, api); }
})();
