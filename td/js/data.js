'use strict';
// 데이터 읽기: 시뮬레이터와 똑같은 표(data/*.json)를 읽는다. 숫자를 코드에 박지 않는다 — docs/design.md 9장.
// 두 방식을 다 받는다:
//   ⑴ 단일 HTML 번들(game/bundle.js 가 만든 dist/nephew-td.html): window.__NGN_DATA__ 에 표가 미리 들어 있다 → 그것을 쓴다
//   ⑵ 개발 중(node game/serve.js): 없으면 ../data/*.json 을 fetch 한다
window.NGN = window.NGN || {};

// 파일 위치. 개발(game/index.html)은 프로젝트 루트 기준 '../', 나눔 빌드(dist/)는 index.html 이 window.__NGN_PATHS__ 로 './' 를 준다
NGN.PATHS = Object.assign({ data: '../data/', assets: '../assets/', sim: '../sim/', vendor: 'vendor/' }, window.__NGN_PATHS__ || {});

NGN.DATA_FILES = ['towers', 'enemies', 'waves', 'affinity', 'balance', 'growth', 'gacha', 'kenney_parts', 'maps', 'stages', 'wave_specials', 'items'];

NGN.loadData = async function loadData(onProgress) {
  let raw = window.__NGN_DATA__;
  if (!raw) {
    const get = async (p) => {
      const r = await fetch(NGN.PATHS.data + p + '.json');
      if (!r.ok) throw new Error('데이터를 못 읽음: ' + p);
      return r.json();
    };
    raw = {};
    let n = 0;
    await Promise.all(NGN.DATA_FILES.map(async (k) => { raw[k] = await get(k); n++; if (onProgress) onProgress(n, NGN.DATA_FILES.length, k); }));
  }
  return NGN.shapeData(raw);
};

// 표 → 게임이 쓰는 모양
NGN.shapeData = function shapeData(raw) {
  const towers = {};
  for (const t of raw.towers.towers) towers[t.id] = t;
  const byFamily = {};
  for (const t of raw.towers.towers) (byFamily[t.family] ||= [])[t.tier - 1] = t;
  const families = Object.keys(byFamily);
  NGN.FAMILY_NAMES = {};
  NGN.FAMILY_INFO = {}; // 계열 → { element, role, grade } — 3D 부품 표(kenney_parts.json)에 없는 새 계열(뽑기 20종, 2026-09-06)이 같은 속성의 실루엣을 빌릴 때 models.js 가 읽는다
  for (const f of families) { const t = byFamily[f][0]; NGN.FAMILY_NAMES[f] = t.familyName; NGN.FAMILY_INFO[f] = { element: t.element, role: t.role, grade: t.등급 || 'basic', attackType: t.attackType }; }
  // 지도들: maps.json 의 정의 → 지도 객체(sim/map.js 의 createMap). 고른 지도가 NGN.map 이 된다
  const maps = NGN.buildIndex(raw.maps.maps);
  return {
    maps,
    towers, byFamily, families, roleKo: raw.towers._역할,
    enemies: raw.enemies.enemies, waves: raw.waves, affinity: raw.affinity, balance: raw.balance, growth: raw.growth || null, gacha: raw.gacha || null, kenneyParts: raw.kenney_parts || null,
    stages: raw.stages, // 스테이지 20개·별 등급·강화 나무·해금 표 (design.md 12장)
    specials: raw.wave_specials || null, // 적 성질 9종 (checklist I-8) — 웨이브 생성기가 스테이지 번호로 붙인다
    items: raw.items || null, // 아이템 24종 (checklist I-11) — 처치 수로 떨어진다
  };
};
