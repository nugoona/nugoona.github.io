'use strict';
// 3D 세계: 지형·길·타워 자리·장식·성·입구·카메라. 테마 색은 NGN.THEMES.
// 좌표: sim/map.js 의 지도 단위(원본 사거리 단위)를 1/100 로 줄여 그대로 쓴다(1칸 = 100 = 1 세계 단위). 길 길이·자리·줄 간격이 곧 밸런스라 바꾸지 않는다.
//
// 2026-09-06 창고(Kenney CC0)로 세계를 채운다(사장님: "디펜스인데 맨 마지막에 성이 없어. 그냥 나가는 통로야" · "창고에 있는 건 최대한 다 써").
//   ⑴ 출구 = 성(castle 팩 조립, 길과 직각, 길 끝이 성문 안으로) — 생명이 줄면 3단계로 그을리고 깃발이 사라지고 탑이 무너진다(setCastleDamage)
//   ⑵ 입구 = 동굴(nature 절벽 + 어둠 원판 + 적 진영 깃발·목책·화로) — world.portal 자리에 렌더러가 소용돌이를 뿌린다
//   ⑶ 길 위 진행 화살표(캔버스 데칼, 인스턴스 2회) · 길 위 잔돌
//   ⑷ 테마별 장식 세트(data/kenney_parts.json scenery — 테마당 40여 종, 500개 이상) — 정점을 하나로 구워 메시 2개(그림자 있는 판 둘레 / 없는 먼 땅) = 그리기 2회
//   모델이 아직 없으면(attachModels 전·못 읽음) 옛 코드 도형(원뿔 나무·다면체 바위·깃발)으로 그린다 — 폴백.
// 성능(폰): 움직이지 않는 창고 조각(장식·성·동굴)은 mergeStatic 으로 한 메시에 굽는다(종류가 85가지여도 그리기 1~2회 — 실측 본 패스 128 → 53회).
//   타일·언덕·잔돌·화살표·점선·자리 점은 InstancedMesh(한 종류 = 1회). 픽셀 비율 상한 1.5, 폰은 안티앨리어싱 끔, 그림자맵 1024.
// 자동 품질: 프레임 시간이 17ms 를 30프레임 연속 넘으면 단계를 낮춘다(픽셀 비율 → 그림자 끄기 → 시야 줄이기).
window.NGN = window.NGN || {};

NGN.SCALE = 1 / 100;

// ---------- 툰 셰이딩(2026-09-08, 사장님 「음악빼고 다해」) ----------
// 무엇: 빛이 물체를 비출 때 밝기가 **매끄럽게** 변하던 것을 **몇 단으로 뚝뚝 끊어** 만화처럼 보이게 한다.
//   지금까지 재질은 MeshBasicMaterial 29곳(빛을 아예 안 받음) + MeshLambertMaterial 14곳(가장 단순한 음영)뿐이었다.
//   Lambert 를 MeshToonMaterial 로 바꾸면 같은 조명·같은 모델로 **칸이 진 그림자**가 생긴다.
// 어떻게: 「밝기 → 실제로 칠할 밝기」 표를 그림 한 장(gradientMap)으로 준다. 3픽셀짜리 가로 그림이면 3단이다.
//   🛑 NearestFilter 여야 한다 — 기본값(Linear)이면 세 칸을 부드럽게 섞어 버려 Lambert 와 똑같아진다.
// 🔴 **켜 보고 껐다**(2026-09-08). 같은 판을 세 조합으로 찍어 픽셀로 쟀다(scratchpad/toon_*.png):
//   판 영역(y400~2100) 평균 밝기 / 대비(표준편차)
//     Lambert(끔)              198.1 / **31.0**
//     툰 [0x55,0xB4,0xFF]      207.7 / 27.3   ← 밝아지고 **대비가 3.7 떨어진다**
//     툰 + 하늘빛0.28·햇빛1.35 208.3 / 29.9   ← 조명을 다시 맞춰도 Lambert 보다 낮다
//   왜: 툰은 빛이 **비스듬히** 닿는 면에서 칸이 갈리는데, 이 게임은 위에서 내려다보는 **평평한 판**이라
//   땅 법선이 거의 전부 위를 향한다 → dotNL 이 0.94 근처로 몰려 **맨 위 칸 하나만** 쓰인다.
//   게다가 HemisphereLight 는 툰의 칸을 **거치지 않고** 그대로 더해져 남은 칸마저 뭉갠다.
//   결과: 효과는 없고 그림자만 들려 허옇게 뜬다. **켜지 않는다** — '안 해봤다'가 아니라 **재보고 고른 결과**다.
//   다시 시험하려면 on: true 한 글자만 바꾸면 된다(litMat 이 두 재질을 같은 입구로 만든다).
NGN.TOON = NGN.TOON || { on: false, steps: [0x55, 0xB4, 0xFF] };
NGN.toonGradient = function toonGradient() {
  if (NGN.__toonTex !== undefined) return NGN.__toonTex;
  if (!NGN.TOON.on || typeof THREE === 'undefined' || !THREE.MeshToonMaterial) return (NGN.__toonTex = null);
  const st = NGN.TOON.steps, d = new Uint8Array(st.length);
  for (let i = 0; i < st.length; i++) d[i] = st[i];
  const t = new THREE.DataTexture(d, st.length, 1, THREE.LuminanceFormat);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false; t.needsUpdate = true;
  return (NGN.__toonTex = t);
};
// 빛을 받는 재질을 만드는 유일한 입구. 툰이 꺼져 있거나 못 쓰면 예전 Lambert 로 그대로 돌아간다.
// 🛑 Lambert 전용 옵션은 없다(map·vertexColors·emissive·skinning·transparent 는 둘 다 받는다).
NGN.litMat = function litMat(params) {
  const g = NGN.toonGradient();
  if (!g) return new THREE.MeshLambertMaterial(params);
  return new THREE.MeshToonMaterial(Object.assign({ gradientMap: g }, params));
};

// 명도 세 층(2026-09-06 화면 설계 2판 — 사장님 "뿌옇고 길이 또렷하게 안 보여"): 길(road) = 가장 밝게 + 어두운 테두리(roadEdge) · 판 안 잔디(grass) = 중간 · 판 밖(outer) = 어둡게.
// 전에는 길과 잔디의 명도가 거의 같았다(풀밭 흙길 0xA8814D vs 잔디 0x6BA34A · 눈은 둘 다 흰색). 테마마다 세 층의 밝기 차가 확실히 나게 골랐다
NGN.C = {
  sky: 0x4A6B3F, fog: 0xB4D3DF,
  // 잔디는 채도 있는 초록으로(2026-09-07) — 옛 색(0x7FA76A)은 회끼가 돌아 화면이 흐릿했다(사장님 "잔디 디테일이 떨어진다")
  grass: 0x74B84A, grassAlt: 0x86C755, outer: 0x4A6B3F, outerAlt: 0x45643B, cliff: 0x8A7452,
  road: 0xF2EAD6, roadEdge: 0x4E3A22,
  stone: 0x8F8A80, stoneDark: 0x6B6760, slot: 0xFFFFFF, slotEdge: 0xE8C34A, slotHover: 0xFFE27A,
  wood: 0x7A5A3A, leaf: 0x437A2E, leafAlt: 0x356524, trunk: 0x6B4E33,
  air: 0xD9EEF7, flagIn: 0x4FA36B, flagOut: 0xC94B3D,
  shot: 0xFFD34D, spark: 0xFFE9A8, water: 0x5FA8D8,
};
NGN.THEMES = {
  grass: {},
  snow: { sky: 0x6C8293, fog: 0xD6E4EE, grass: 0xC4D2DB, grassAlt: 0xBECDD7, outer: 0x6C8293, outerAlt: 0x667C8D, cliff: 0x8FA3B4, road: 0xF7F9FB, roadEdge: 0x4E6274, leaf: 0x4F7A62, leafAlt: 0x3E6650, trunk: 0x5A4634, air: 0xFFFFFF, water: 0x8FC4E8 },
  desert: { sky: 0x8E6B3F, fog: 0xF0DCC0, grass: 0xD6B978, grassAlt: 0xD0B372, outer: 0x8E6B3F, outerAlt: 0x88663B, cliff: 0xA0562F, road: 0xFBF1D8, roadEdge: 0x6B4426, leaf: 0x7FA34A, leafAlt: 0x6B8E3C, trunk: 0x7A5A3A, air: 0xFFF3E0, water: 0x5FA8D8 },
  lava: { sky: 0x2A1F26, fog: 0x4A3038, grass: 0x6E5866, grassAlt: 0x695361, outer: 0x2A1F26, outerAlt: 0x271C23, cliff: 0x1E1418, road: 0xF6A860, roadEdge: 0x6E2208, leaf: 0x6A3A2A, leafAlt: 0x502A20, trunk: 0x3A2420, air: 0xFFB070, water: 0xFF7A30 },
  // 2026-09-07 K-2-3: 큰 테마 넷 아래에 변종 다섯을 폈다 — 지도 20개가 지금보다 서로 달라 보이게.
  meadow: { sky: 0x5A7F42, fog: 0xD8E8C8, grass: 0x8FBE5E, grassAlt: 0x86B657, outer: 0x5A7F42, outerAlt: 0x54783C, cliff: 0x9A8460, road: 0xF6EFD4, roadEdge: 0x6B5228, leaf: 0x5AA83E, leafAlt: 0x479130, trunk: 0x7A5A3A, air: 0xEAF6D8, water: 0x6FB8E0 },
  swamp: { sky: 0x2E3F2A, fog: 0x74896A, grass: 0x5F7550, grassAlt: 0x586E4A, outer: 0x2E3F2A, outerAlt: 0x293A26, cliff: 0x5E5A48, road: 0xBEB48E, roadEdge: 0x3A3222, leaf: 0x3E6A38, leafAlt: 0x2E5A2C, trunk: 0x4A3A2A, air: 0xA8C2A0, water: 0x4A6A48 },
  glacier: { sky: 0x486078, fog: 0xC0DCEE, grass: 0xAFCEE0, grassAlt: 0xA8C8DC, outer: 0x486078, outerAlt: 0x435A70, cliff: 0x7FA0BC, road: 0xEAF6FC, roadEdge: 0x3E5A72, leaf: 0x4A7A78, leafAlt: 0x3A6664, trunk: 0x50606E, air: 0xFFFFFF, water: 0x6FC0EE },
  shore: { sky: 0x3F7E8E, fog: 0xE4E0C4, grass: 0xE0CE96, grassAlt: 0xD9C68E, outer: 0x3F7E8E, outerAlt: 0x3A7686, cliff: 0xB09468, road: 0xFAF2DC, roadEdge: 0x8A7048, leaf: 0x5FA05A, leafAlt: 0x4C8A48, trunk: 0x8A6A44, air: 0xEAF8FC, water: 0x35A8C8 },
  ruins: { sky: 0x3E3C42, fog: 0xACA8A2, grass: 0x86846F, grassAlt: 0x7E7C69, outer: 0x3E3C42, outerAlt: 0x39373D, cliff: 0x6E6A62, road: 0xC8C2AE, roadEdge: 0x4A463E, leaf: 0x5A7248, leafAlt: 0x486038, trunk: 0x585044, air: 0xC8C8C4, water: 0x5A7A80 },
};
// 지도가 정하는 큰 테마(grass·snow·desert·lava) 아래의 변종. 씨앗으로 고르므로 같은 지도는 늘 같은 모습이다.
// 🛑 지도 생성기(sim/mapgen.js)는 이 담당의 경계 밖이라 큰 테마 넷은 그대로 두고 화면에서만 편다 — 길·자리·판정은 하나도 안 바뀐다(색과 장식뿐).
NGN.THEME_VARIANTS = { grass: ['grass', 'meadow', 'swamp'], snow: ['snow', 'glacier'], desert: ['desert', 'shore'], lava: ['lava', 'ruins'] };
NGN.pickTheme = function pickTheme(map) {
  const base = NGN.THEMES[map.theme] ? map.theme : 'grass';
  const vs = NGN.THEME_VARIANTS[base];
  if (!vs || vs.length < 2) return base;
  // 🛑 손으로 만든 지도(id 가 gen<숫자> 가 아닌 것)는 변종을 안 건다 — 이름·성격이 정해져 있어서다("첫 숲길"·"뱀길").
  //    스테이지 1~3 이 바로 이 지도들이라, 조카가 처음 보는 화면이 "첫 숲길"인데 늪으로 나오던 것도 이걸로 막힌다
  //    (코디네이터 지적 2026-09-07. 튜토리얼 보호는 적 배치에서도 쓰는 원칙 — build-waves.js 가 스테이지 1~3 을 안 섞는다).
  const g = /^gen(\d+)$/.exec(String(map.id || ''));
  if (!g) return base;
  // 씨앗을 제대로 섞는다. 🔴 생성 지도 씨앗이 3·7·11… 4씩 느는 등차라, 나머지를 그냥 쓰거나 한 번만 곱하면
  //    주기가 생겨 변종이 한쪽으로 몰린다(실측: 곱셈만 썼더니 눈 계열 셋이 전부 빙하, 사막 셋이 전부 해변으로 갔다)
  let h = Number(g[1]) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return vs[(h >>> 0) % vs.length];
};
NGN.ELEMENT_COLOR = { nature: 0x4FA36B, fire: 0xE0612F, ice: 0x6FC3E8, darkness: 0x6B3FA0, iron: 0x8E9AA5, astral: 0xE8C34A, storm: 0x3D6FD6 };
NGN.ELEMENT_KO = { nature: '자연', fire: '불', ice: '얼음', darkness: '어둠', iron: '강철', astral: '천체', storm: '폭풍' };
NGN.DEFENSE_COLOR = { LUA: 0xE8C34A, SOL: 0xE0612F, HEL: 0x4FA36B, MYT: 0x8E5BD6, SIF: 0xC9D1D9, ZOD: 0xF2EFE6 };
NGN.DEFENSE_KO = { LUA: '루아', SOL: '솔', HEL: '헬', MYT: '미트', SIF: '시프', ZOD: '조드' };
NGN.ATTACK_KO = { physical: '물리', decay: '부패', energy: '에너지', elemental: '원소', essence: '정수', arcane: '비전' };

// 여러 인스턴스를 한 번에 그리는 도우미: 위치·회전·크기 목록 → InstancedMesh
// frustumCulled 를 끈다 — InstancedMesh 는 지오메트리 하나의 경계(원점 근처 작은 공)로 컬링을 판단해서, 판 밖에 퍼진 장식이 카메라를 돌리면 통째로 사라진다
function instanced(geo, mat, items, root) {
  if (!items.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  const o = new THREE.Object3D();
  items.forEach((it, i) => {
    o.position.set(it.x, it.y, it.z); o.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
    const s = it.s === undefined ? 1 : it.s; o.scale.set(it.sx || s, it.sy || s, it.sz || s);
    o.updateMatrix(); m.setMatrixAt(i, o.matrix);
  });
  // it.k = 이 인스턴스만의 밝기(1 = 그대로). 잔디 칸마다 아주 조금씩 달리해 균일한 판을 자연스럽게 만든다 — 그리기 횟수는 그대로다
  if (items.some((it) => it.k !== undefined) && m.setColorAt) {
    const c = new THREE.Color();
    items.forEach((it, i) => { const k = it.k === undefined ? 1 : it.k; c.setRGB(k, k, k); m.setColorAt(i, c); });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
  m.castShadow = items.some((it) => it.cast); m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; // 하나라도 그림자를 원하면 켠다(종류 하나 = 그림자 패스 1회)
  root.add(m);
  return m;
}
// 여러 종류의 조각 인스턴스를 정점 하나로 굽는다 → 메시 하나 = 그리기 1회(종류가 85가지여도). 장식·성·동굴은 움직이지 않으니 이게 InstancedMesh(종류당 1회)보다 낫다.
// list = [{ g: {geometry(비인덱스, position/normal/uv/color)}, items: [{x,y,z,rx,ry,rz,s,sx,sy,sz}] }]. 삼각형 수는 인스턴스와 같다(코디네이터 실측: 본 패스 340회가 문제였다, 2026-09-06)
function mergeStatic(list) {
  let n = 0; const srcs = [];
  for (const { g, items } of list) { const src = g.geometry.index ? g.geometry.toNonIndexed() : g.geometry; srcs.push(src); n += src.attributes.position.count * items.length; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  const o = new THREE.Object3D(), v = new THREE.Vector3(), nm = new THREE.Matrix3();
  let k = 0;
  list.forEach(({ items }, li) => {
    const src = srcs[li], p = src.attributes.position, nr = src.attributes.normal, u = src.attributes.uv, c = src.attributes.color, cnt = p.count;
    for (const it of items) {
      o.position.set(it.x, it.y, it.z); o.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
      const s = it.s === undefined ? 1 : it.s; o.scale.set(it.sx || s, it.sy || s, it.sz || s); o.updateMatrix(); nm.getNormalMatrix(o.matrix);
      for (let i = 0; i < cnt; i++, k++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrix); pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z;
        if (nr) v.fromBufferAttribute(nr, i).applyMatrix3(nm).normalize(); else v.set(0, 1, 0);
        nor[k * 3] = v.x; nor[k * 3 + 1] = v.y; nor[k * 3 + 2] = v.z;
        if (u) { uv[k * 2] = u.getX(i); uv[k * 2 + 1] = u.getY(i); }
        if (c) { col[k * 3] = c.getX(i); col[k * 3 + 1] = c.getY(i); col[k * 3 + 2] = c.getZ(i); } else { col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = 1; }
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
// 방향 (dx,dz) → y 회전: 물체의 로컬 +x 축이 그 방향을 보게 한다(길 상자·화살표·성·동굴이 전부 이 규칙)
function headingRy(dx, dz) { return Math.atan2(-dz, dx); }
const hexOf = (c) => '#' + new THREE.Color(c).getHexString();
// 색을 k 배 밝게(0xRRGGBB → '#rrggbb'). 🔴 THREE.Color.multiplyScalar 로 하면 안 된다 —
// 이 버전은 색을 선형 공간에 담고 getHexString 이 한 번 더 변환해서, #becdd7 을 1.35 배 했더니 #011522(거의 검정)이 나왔다(실측 2026-09-07).
const brighten = (hex, k) => {
  const c = [16, 8, 0].map((s) => Math.min(255, Math.round(((hex >> s) & 255) * k)));
  return '#' + ((c[0] << 16) | (c[1] << 8) | c[2]).toString(16).padStart(6, '0');
};
const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0); // 잔존물(그을음)을 땅 위에서 돌릴 때 쓰는 축

NGN.World = class World {
  constructor(stage) {
    this.stage = stage;
    this.isMobile = ('ontouchstart' in window) || innerWidth < 700;
    // 🔑 **3 에서 시작한다** — 빛번짐(4)은 기본 꺼짐이고, 여유가 10초 이어져야 자동으로 켜진다.
    //    1판에서는 4 에서 시작해 무거운 기기가 곧장 떨어졌고, 떨어지는 길에 그림자까지 잃었다.
    this.quality = 3; // 0~4. 단계별 내용은 setQuality 참고
    this.scene = new THREE.Scene();
    // 🔴 안개를 끈다(2026-09-06 화면 설계 2판). 카메라가 판에서 229 떨어져 있는데 안개가 263 부터 껴서 판 뒤쪽이 하늘색 안개에 잠겼다(배포본 실측 234~407).
    //    땅이 화면 끝까지 채우므로 안개 없이도 지평선이 안 보인다. 판이 안개에 잠기면 안 된다
    this.scene.fog = null;

    // 화각 22° — 좁은 화각 + 멀리서 당겨 찍기(망원). 42° 였을 때는 화면 위쪽 줄이 거의 수직으로 내려다보여 납작하고 작게,
    // 아래쪽 줄은 옆이 보여 크게 나왔다(사장님 지적 2026-09-06 "앞쪽 타워는 왜 작게 나와"). 좁히면 판 전체가 같은 각도로 보인다
    this.camera = new THREE.PerspectiveCamera(22, 1, 1, 800);
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.isMobile, powerPreference: 'high-performance' });
    // 🔴 2026-09-08 (사장님 "그래픽이 너무 구려"). 폰 상한이 **1.5** 였다.
    //    사장님 폰은 3배 화면(360×780·DPR3)이라 **540×1170 으로 그려 1080×2340 에 2배 확대**하고 있었다 —
    //    실제 픽셀의 1/4 로 그린 것이다. 같은 장면을 1.5배·3배로 찍어 대 보니(scratchpad/px15.png·px30.png)
    //    성의 면들이 뭉개져 하나로 붙고 타워 나무결이 사라졌다. 수치로도 또렷한 가장자리 비율 0.69% → 1.55% (2.2배).
    //    🛑 이게 화면이 「싸구려로」 보이던 가장 큰 원인이다. 모델이나 조명 문제가 아니었다.
    this.maxPixelRatio = this.isMobile ? 2.5 : 2;
    this.renderer.setPixelRatio(this.pixelFor(3));   // 시작 단계(3)의 배율
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.shadowStatic = false; // 그림자를 매 프레임 굽는 중인가(setShadowStatic 참고)
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    // 톤매핑(M-4-2, 2026-09-07) — **비교해 보고 끄는 것으로 결론냈다.**
    // 계약은 "ACES 는 카툰 색을 뭉갠다고 껐는데 판단은 옳았고 선택지가 틀렸다, r128 의 Cineon·Reinhard 를 비교해 골라라" 였다.
    // 같은 장면을 여섯 조합으로 찍어 나란히 놓고 봤다(scratchpad/m4_grid.png):
    //   Cineon(노출 1.15) · Reinhard(1.35) **둘 다 ACES 와 같은 병을 앓는다** — 잔디 초록이 회끼 돌게 바래고 길이 회색이 된다.
    //   톤매핑이란 밝은 쪽을 눌러 담는 장치라, **원래 색이 선명한 카툰 화면에서는 누를 것이 색채뿐**이다.
    // 그래서 셋 다 쓰지 않는다. 이건 "안 해봤다" 가 아니라 **해보고 고른 결과**다.
    NGN.TONE = NGN.TONE || {};
    this.renderer.toneMapping = THREE[NGN.TONE.map || 'NoToneMapping'];
    this.renderer.toneMappingExposure = NGN.TONE.exposure === undefined ? 1.0 : NGN.TONE.exposure;
    stage.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xE4F0F8, 0x46552F, 0.55));
    const sun = new THREE.DirectionalLight(0xFFF0D2, 1.0);
    // 🔴 2026-09-07 밤 (사장님 "그림자 거리가 너무 길어서 떠 다녀"):
    //    옛 자리 (20, 30, 14) 는 수평에서 **50.9도** — 그림자가 물체 높이의 **0.81배**만큼 옆으로 진다.
    //    적 높이가 1.5칸이면 그림자가 1.2칸 옆에 떨어져서 **길 위 적들이 공중에 뜬 것처럼** 보였다.
    //    물리적으로는 맞지만 **보기에 틀렸다** — 사람 눈은 물체와 그림자가 붙어 있어야 바닥에 놓인 것으로 읽는다.
    //    그래서 카툰풍 게임은 그림자를 물체 바로 밑에 짧게 둔다.
    //    네 각(50.9 / 65 / 72 / 80도)을 적이 길 위를 걸을 때·타워가 서 있을 때로 나란히 찍어 골랐다
    //    (scratchpad/sun_angles.png · sun_enemy.png):
    //      50.9 = 그림자가 몸에서 완전히 떨어진다 · 65 = 아직 옆으로 나간다
    //      **72 = 적은 발밑에 붙고 타워·나무는 그림자로 입체감이 남는다** ✅ · 80 = 그림자가 너무 작아 입체감을 잃는다
    //    방위(해가 오는 쪽)와 거리(38.7)는 그대로 두고 **고도만** 50.9° → 72° 로 올렸다. 그림자 길이 0.81배 → **0.32배**
    sun.position.set(9.79, 36.79, 6.85);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.isMobile ? 1024 : 2048, this.isMobile ? 1024 : 2048);
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
    const S = 32;
    sun.shadow.camera.left = -S; sun.shadow.camera.right = S; sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
    sun.shadow.bias = -0.0012;
    this.scene.add(sun); this.sun = sun;
    const rim = new THREE.DirectionalLight(0x9FBCE0, 0.22);
    rim.position.set(-12, 7, -14);
    this.scene.add(rim);

    // 검증용 손잡이: 브라우저에서 조명·재질을 실제로 재고 비교하려면 장면에 닿을 수 있어야 한다.
    // 게임 동작에는 쓰지 않는다(읽기 전용으로만 쓸 것).
    NGN.world = this;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.camAngle = 0;
    this.zoom = 1;
    this.frameTimes = []; this.lastDrop = 0;
    // 자동 품질의 기억(watchFrame·setQuality 가 쓴다)
    this.qualityCap = 4;      // 이 기기에서 **올라갈 수 있는** 최고 단계. 높은 자리에서 두 판 떨어지면 한 칸 내려 굳는다
    this.qualityBase = 3;     // 판을 **시작할 때**의 단계. 빛번짐(4)은 여기서 시작하지 않는다 —
                              // 여유가 10초 이어진 것이 확인돼야 watchFrame 이 올려 준다(그래야 느린 기기가 헛되이 떨어지지 않는다)
    this.dropsAtCap = 0;      // 그 "두 번"을 세는 곳
    this.cappedThisRound = false; // 이 판에서 이미 한 번 셌나(연속 낙하를 겹쳐 세지 않게)
    this.goodSince = 0;       // 여유로운 상태가 시작된 시각(10초 이어져야 올린다)
    this.raisedOnce = false;  // 이 판에서 한 번이라도 올렸나
    this.qualityLocked = false; // 올렸다 도로 떨어졌다 → 이 판에서는 더 안 올린다
    this.lastWatch = 0;       // 마지막으로 프레임을 잰 시각(웨이브 사이 공백을 알아채는 용도)
    // 창고 모델(attachModels 로 들어온다) · 카메라 흔들림 · 성 피격 · 불 자리(렌더러가 읽는다)
    this.models = null; this.parts = null;
    this.camBase = new THREE.Vector3(); this.trauma = 0; this.shakeScale = 1; this.hitT = 0; // trauma = 화면 흔들림 세기(0~1). shakeScale 은 설정(끄기·절반·기본)
    this.fireSpots = []; this.castleFireSpots = []; this.flagMeshes = []; this.castleFires = [[], [], []]; this.damageStage = 0;
    addEventListener('resize', () => this.resize());
    this.setMap(NGN.map);
    this.buildPost(); // 빛번짐 준비(지도를 다 지은 뒤 — 화면 크기를 알아야 한다)
  }

  // 모델 로딩이 끝난 뒤 main.js 가 부른다. 그때부터 창고 장식·성·동굴로 다시 짓는다(못 읽었으면 코드 도형 그대로)
  attachModels(models) {
    this.models = models && models.ready ? models : null;
    this.parts = this.models ? models.parts : null;
    this.setMap(NGN.map);
  }

  // 지도를 (다시) 만든다. 지도마다 테마 색·길·자리가 다르다. 이전 지도의 3D 는 전부 지운다
  setMap(map) {
    NGN.map = map;
    while (this.root.children.length) this.root.remove(this.root.children[0]);
    this.stageMark = null; this.lobbyMode = null; // 로비 표지도 지운 것들 중 하나 — buildStageMark 가 다시 만들고, 다음 프레임에 setLobbyMode 가 다시 정한다
    this.theme = NGN.pickTheme(map); // 큰 테마 아래 변종까지(NGN.THEME_VARIANTS) — 지도 씨앗으로 고른다
    const C = Object.assign({}, NGN.C, NGN.THEMES[this.theme] || {});
    this.C = C;
    this.scene.background = new THREE.Color(C.sky);
    if (this.scene.fog) this.scene.fog.color = new THREE.Color(C.fog);
    const mat = (color, opts) => NGN.litMat(Object.assign({ color }, opts || {}));
    this.M = {
      grass: mat(C.grass), grassAlt: mat(C.grassAlt), outer: mat(C.outer), outerAlt: mat(C.outerAlt), cliff: mat(C.cliff), road: mat(C.road), roadEdge: mat(C.roadEdge),
      stone: mat(C.stone), stoneDark: mat(C.stoneDark), slot: mat(C.slot), wood: mat(C.wood),
      leaf: mat(C.leaf), leafAlt: mat(C.leafAlt), trunk: mat(C.trunk),
      air: new THREE.MeshBasicMaterial({ color: C.air, transparent: true, opacity: 0.55 }),
      shot: new THREE.MeshBasicMaterial({ color: C.shot }), spark: new THREE.MeshBasicMaterial({ color: C.spark }),
      water: NGN.litMat({ color: C.water, transparent: true, opacity: 0.85 }),
      pip: NGN.litMat({ color: 0xE8C34A, emissive: 0xE8C34A, emissiveIntensity: 0.35 }),
    };
    const B = map.BOUNDS;
    this.cx = (B.minX + B.maxX) / 2; this.cz = (B.minY + B.maxY) / 2;
    this.width = (B.maxX - B.minX) * NGN.SCALE; this.depth = (B.maxY - B.minY) * NGN.SCALE;
    // 기본 방향: 0° 와 90° 중 판이 더 크게 나오는 쪽(카메라 거리가 짧은 쪽). [돌리기]는 여기에 90° 씩 더한다
    this.camera.aspect = this.stage.clientWidth / Math.max(1, this.stage.clientHeight) || this.camera.aspect;
    this.baseAngle = this.camDist(0) <= this.camDist(Math.PI / 2) ? 0 : Math.PI / 2;
    this.camAngle = this.baseAngle;
    // 성·동굴·불 자리는 지도마다 새로
    this.fireSpots = []; this.castleFireSpots = []; this.castleFires = [[], [], []]; this.flagMeshes = []; this.gateMesh = null;
    this.castle = null; this.castleIntact = []; this.castleRuin = []; this.damageStage = 0; this.keepOut = []; this.missing = this.missing || new Set();
    this.castleBox = null; this.portalBox = null; // 이전 지도의 성 범위가 카메라 계산에 남지 않게
    this.buildGround();
    this.buildPaths();
    this.buildSlots();
    this.buildLandmarks(); // 장식보다 먼저 — 장식이 성·동굴 자리를 피해야 한다
    // 성·동굴 범위가 생겼으니 기본 방향을 다시 고른다(위 계산은 판 모서리만 알았다)
    this.baseAngle = this.camDist(0) <= this.camDist(Math.PI / 2) ? 0 : Math.PI / 2;
    this.camAngle = this.baseAngle;
    this.buildScenery();
    this.buildDecals(); // 잔존물(그을음) 판 — root 를 비웠으니 다시 만든다
    this.markShadowDirty(); // 판이 통째로 바뀌었다 — 고정 그림자면 여기서 한 번 다시 굽는다
    // 🛑 지도를 다 지은 뒤에 부른다 — 되돌리면 카메라를 다시 앉히는데, 그 전에 부르면 옛 지도 기준으로 앉는다
    this.resetQualityWatch();
    this.resize();
  }
  toWorld(x, y, h = 0) { return new THREE.Vector3((x - this.cx) * NGN.SCALE, h, (y - this.cz) * NGN.SCALE); }

  // ---------- 창고 조각 도우미 ----------
  // 조각 하나 → { g: {geometry, material, height, size}, key }. nature 팩은 텍스처가 없어 테마 기본 재질색(scenery.natureColors)을 깔고 항목의 recolor 를 덮는다.
  // 없는 조각은 한 번만 경고하고 null(그 자리는 비운다 — 게임은 계속)
  piece(P) {
    if (!this.models) return null;
    const pack = P.p.split('/')[0];
    const Q = { p: P.p, raw: P.raw, tint: P.tint };
    const SC = this.parts.scenery || {};
    // 텍스처를 못 쓰는 팩은 재질 이름별 색을 깔아 준다: nature·space 는 원래 텍스처가 없고,
    // retro-fantasy 처럼 UV 를 반복하는 팩은 아틀라스로 못 옮겨서 같은 길을 탄다(K-2-13, models.js tiled)
    const tpl = this.models.templates && this.models.templates.get(P.p);
    if (pack === 'nature' || pack === 'space') { const base = (SC.natureColors && SC.natureColors[this.theme]) || {}; Q.recolor = Object.assign({}, base, P.recolor || {}); }
    else if (tpl && tpl.tiled) { const base = (SC.matColors && SC.matColors[pack]) || {}; Q.recolor = Object.assign({}, base, P.recolor || {}); }
    else if (P.recolor) Q.recolor = P.recolor;
    const g = this.models.pieceGeometry(Q);
    if (!g) { if (!this.missing.has(P.p)) { this.missing.add(P.p); console.warn('장식 조각 없음', P.p); } return null; }
    return { g, key: P.p + '|' + (P.tint || '') + '|' + (P.raw === false ? 'g' : 'r') + '|' + JSON.stringify(Q.recolor || null) };
  }
  // 조각 인스턴스 모음: 같은 조각·같은 색끼리 묶어 두고 flush() 때 정점 하나로 굽거나(merged — 장식·성·동굴) 종류당 InstancedMesh 로 만든다
  // box(Box3)를 주면 놓은 조각마다 로컬 범위를 넓혀 준다(회전은 무시하고 가로·세로 중 큰 쪽을 반지름으로 — 카메라 범위용이라 넉넉해도 된다).
  // InstancedMesh 는 Box3.setFromObject 가 인스턴스 행렬을 무시해서 이렇게 직접 잰다
  collector(root, box) {
    const groups = new Map();
    return {
      add: (P, it) => {
        const r = this.piece(P); if (!r) return null;
        (groups.get(r.key) || groups.set(r.key, { g: r.g, items: [] }).get(r.key)).items.push(it);
        if (box) { const sz = r.g.size, s = it.s || 1, rad = Math.max(sz.x * (it.sx || s), sz.z * (it.sz || s)) / 2; box.expandByPoint(new THREE.Vector3(it.x - rad, it.y, it.z - rad)); box.expandByPoint(new THREE.Vector3(it.x + rad, it.y + sz.y * (it.sy || s), it.z + rad)); }
        return r.g;
      },
      // merged=true: 종류를 가리지 않고 정점 하나로 굽는다 — 그림자를 만드는 것(cast)과 안 만드는 것 둘로만 나눠 메시 최대 2개. 아니면 종류당 InstancedMesh
      flush: (material, merged) => {
        const out = [];
        if (merged) {
          const near = [], far = [];
          for (const { g, items } of groups.values()) { const a = items.filter((it) => it.cast), b = items.filter((it) => !it.cast); if (a.length) near.push({ g, items: a }); if (b.length) far.push({ g, items: b }); }
          for (const [list, cast] of [[near, true], [far, false]]) {
            if (!list.length) continue;
            const m = new THREE.Mesh(mergeStatic(list), material || list[0].g.material);
            m.castShadow = cast; m.receiveShadow = true; root.add(m); out.push(m);
          }
          return out;
        }
        for (const { g, items } of groups.values()) { const m = instanced(g.geometry, material || g.material, items, root); if (m) out.push(m); }
        return out;
      },
    };
  }

  // 지형: 바닥 한 장 + 체커 타일(인스턴스 1회) + 가장자리 언덕(창고 절벽 블록 인스턴스 1회 — 없으면 상자 2회).
  // 땅은 판보다 훨씬 넓게(가로 +40 · 세로 +70 칸) — 세로 폰에서 정사각 판은 가로에 막혀 위아래가 남는데, 거기가 하늘색으로 비면 "지도가 작다"로 보인다.
  // 참고 게임(레이드 러시)처럼 땅이 화면을 끝까지 채우게 한다(2026-09-06)
  // 명도 세 층(2026-09-06): 판 밖 큰 땅은 어둡게(outer), 판(BOUNDS + 여백 2.4칸)은 중간 밝기(grass)로 0.25 올려 무대처럼 떠 보이게, 판 가장자리에 어두운 테두리.
  // 체커 타일은 판 안은 grassAlt, 판 밖은 outerAlt — 둘 다 인스턴스 1회씩
  buildGround() {
    const W = this.width + 40, D = this.depth + 70;
    const ground = new THREE.Mesh(new THREE.BoxGeometry(W, 1, D), this.M.outer);
    ground.position.y = -0.5; ground.receiveShadow = true; this.root.add(ground);
    const PAD = this.boardPad = 2.4, BW = this.width + PAD * 2, BD = this.depth + PAD * 2;
    // 판 테두리(어두운 띠 0.35칸) → 그 위에 판. 판 윗면 y=0 이 길·자리·타워의 바닥
    const rim = new THREE.Mesh(new THREE.BoxGeometry(BW + 0.7, 0.32, BD + 0.7), this.M.roadEdge);
    rim.position.y = -0.18; rim.receiveShadow = true; this.root.add(rim);
    // 🔴 2026-09-07 (K-2-12 2판, 사장님 "누가 격자선을 만들라고 했어"): 1판은 칸 사이를 크게 벌리고 바닥을 확 어둡게 해서
    //    **선**이 그어진 것처럼 보였다. 격자선은 목표가 아니었다 — 사장님 말씀은 "깔끔하게"였다.
    //    지금은 ⑴칸 사이를 거의 붙이고 ⑵바닥 대비를 은은하게 낮춰 **면**으로 읽히게 하고,
    //    ⑶대신 창고 지형 타일(둔덕·바위·나무)을 길·자리에서 떨어진 곳에 가끔 놓아 땅에 변화를 준다.
    // 🔴 3판(2026-09-07 저녁, 사장님 "맵디자인은 개선되었어?" · 주 세션 실측):
    //    2판(틈 0.06 · 칸밝기 1.16)은 **390×844 에서는 멀쩡해 보였지만 360×780·픽셀비율 3 에서 보니 둘 다 틀렸다.**
    //    ⑴ **틈 0.06 이 여전히 선으로 읽혔다** — 틈 사이로 어두운 바닥이 비친다. 화면이 촘촘할수록 가는 선이 더 잘 보인다.
    //       0.02 로 줄여도 읽혔다(대조표 F). **0 이어야 한다.** 칸의 존재감은 아래 칸마다 밝기(0.93~1.07)만으로 낸다 = 면으로 읽히는 땅.
    //    ⑵ **칸 밝기 1.16 이 판 안쪽을 허옇게 띄웠다** — 판 밖은 진한 초록인데 판 안만 하얘서 따로 놀았다.
    //       "무대처럼 떠 보이게" 하려던 것인데, 그건 **테두리 띠와 그림자**가 이미 하고 있다. 색으로까지 하니 과했다.
    //    여섯 안(밝기 1.16·1.05·0.96·0.88 × 틈 0.06·0.02·0)을 한 화면에 놓고 골랐다 → scratchpad/ground_grid.png
    // 🛑 **앞으로 땅 확인은 반드시 360×780·픽셀비율 3 으로 한다.** 390 으로 보면 이 문제가 안 보인다(두 번 속았다).
    const T = NGN.GROUND_TUNE || {};
    const GAP = T.gap === undefined ? 0 : T.gap;             // 칸 사이 틈 — **0**. 조금이라도 벌리면 선이 된다
    const BOARD_MUL = T.board === undefined ? 0.88 : T.board; // 바닥 어둡기(1 = 잔디와 같음)
    const TINT_MUL = T.tint === undefined ? 0.88 : T.tint;    // 칸 밝기 — 바닥과 같은 값. grassAlt 가 grass 보다 조금 밝아 층은 남는다
    const FEATURE = T.feature === undefined ? 0.34 : T.feature; // 지형 타일을 놓을 칸의 비율
    const boardMat = NGN.litMat({ color: new THREE.Color(this.C.grass).multiplyScalar(BOARD_MUL) });
    const board = new THREE.Mesh(new THREE.BoxGeometry(BW, 0.3, BD), boardMat);
    board.position.y = -0.15; board.receiveShadow = true; this.root.add(board);
    const TILE = 3, TS = TILE - GAP, tiles = [], outerTiles = [], feats = [];
    // 지형 타일을 놓아도 되는 곳인가 — 길·자리·성·동굴에서 떨어져 있어야 한다(가리면 못 쓴다)
    const blocked = [];
    for (const s of (NGN.map.SLOTS || [])) blocked.push({ p: this.toWorld(s.x, s.y), r: 2.6 });
    const gp = NGN.map.GROUND_PATH || [];
    for (let i = 0; i < gp.length - 1; i++) {
      const a = this.toWorld(gp[i][0], gp[i][1]), b = this.toWorld(gp[i + 1][0], gp[i + 1][1]);
      const steps = Math.max(1, Math.ceil(a.distanceTo(b) / 2));
      for (let k = 0; k <= steps; k++) blocked.push({ p: a.clone().lerp(b, k / steps), r: 2.4 });
    }
    const free = (x, z) => blocked.every((b) => (b.p.x - x) * (b.p.x - x) + (b.p.z - z) * (b.p.z - z) > b.r * b.r);
    let seed = 1;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let x = -W / 2 + TILE / 2; x < W / 2; x += TILE) for (let z = -D / 2 + TILE / 2; z < D / 2; z += TILE) {
      const inside = Math.abs(x) < BW / 2 - TILE * 0.6 && Math.abs(z) < BD / 2 - TILE * 0.6;
      if (!inside) { if ((Math.round(x / TILE) + Math.round(z / TILE)) % 2 === 0) outerTiles.push({ x, y: -0.47, z }); continue; }
      // 창고 타일은 두께 0.2 · 바닥이 y=0 → 윗면이 0.02 에 오게 내린다(길은 0.075~0.12 라 그 위에 얹힌다)
      tiles.push({ x, y: -0.18, z, sx: TS, sy: 1, sz: TS, k: 0.93 + rnd() * 0.14 }); // 칸마다 밝기를 아주 조금씩 — 균일한 판보다 자연스럽다
      if (FEATURE > 0 && rnd() < FEATURE && free(x, z)) feats.push({ x, z, k: Math.floor(rnd() * 4), ry: Math.floor(rnd() * 4) * Math.PI / 2 });
    }
    // 🔴 타일은 테마와 무관하게 `tile` 하나만 쓰고 색만 입힌다 — `snow-tile` 을 눈 테마에 썼더니 그 조각의 원본이 어두워
    //    판이 짙은 청록으로 나왔다(실측 2026-09-07). 회색조 칸에 색을 곱하는 구조라 tint 를 밝게 넣어야 칸이 바닥 위로 뜬다.
    const tileTint = brighten(this.C.grassAlt, TINT_MUL);
    const tileP = this.piece({ p: 'tower-defense/tile', tint: tileTint });
    if (tileP) instanced(tileP.g.geometry, tileP.g.material, tiles, this.root);
    else instanced(new THREE.BoxGeometry(TS, 0.06, TS), this.M.grassAlt, tiles.map((t) => ({ x: t.x, y: 0.02, z: t.z })), this.root); // 조각을 못 읽었을 때
    instanced(new THREE.BoxGeometry(TILE, 0.06, TILE), this.M.outerAlt, outerTiles, this.root);
    // 지형 타일 — 자연스러운 땅은 균일하지 않다. 종류가 넷이어도 정점을 하나로 구워 그리기 1~2회
    if (feats.length && this.models) {
      const kinds = ['tower-defense/tile-bump', 'tower-defense/tile-rock', 'tower-defense/tile-tree', 'tower-defense/tile-tree-double'];
      const col = this.collector(this.root);
      for (const f of feats) {
        col.add({ p: kinds[f.k] || kinds[0], tint: tileTint }, { x: f.x, y: -0.18, z: f.z, ry: f.ry, sx: TS, sy: 1, sz: TS, cast: f.k >= 1 });
      }
      if (this.models.sceneryMat) col.flush(this.models.sceneryMat, true);
      else feats.length = 0;
    } else feats.length = 0;
    this.groundFeatures = feats.length;
    const hillsA = [], hillsB = [], blocks = []; this.hillSpots = [];
    for (let i = 0; i < 60; i++) {
      const ang = i / 60 * Math.PI * 2;
      const x = Math.cos(ang) * (W / 2 - 1.2), z = Math.sin(ang) * (D / 2 - 1.2);
      if (Math.abs(x) < W / 2 - 3.2 && Math.abs(z) < D / 2 - 3.2) continue;
      const h = 0.8 + ((i * 7) % 5) * 0.35;
      (i % 2 ? hillsA : hillsB).push({ x, y: h / 2, z, sx: 1, sy: h, sz: 1, cast: true });
      blocks.push({ x, y: 0, z, sx: TILE, sy: h, sz: TILE, cast: true });
      this.hillSpots.push({ x, y: h, z });
    }
    // 창고 절벽 블록(풀 뚜껑 + 흙 옆면)을 테마 색으로 — 눈 테마는 돌 블록
    // 돌 절벽(윗면이 돌) 쪽이 어울리는 테마: 눈·빙하·폐허. 나머지는 흙 절벽
    const stoneCliff = this.theme === 'snow' || this.theme === 'glacier' || this.theme === 'ruins';
    const C = this.C, cliffP = stoneCliff ? { p: 'nature/cliff_block_stone', recolor: { grass: hexOf(C.outerAlt), stone: hexOf(C.cliff) } } : { p: 'nature/cliff_block_rock', recolor: { grass: hexOf(C.outerAlt), dirt: hexOf(C.cliff) } };
    const cliff = this.piece(cliffP);
    if (cliff) instanced(cliff.g.geometry, cliff.g.material, blocks, this.root);
    else { const hill = new THREE.BoxGeometry(TILE, 1, TILE); instanced(hill, this.M.cliff, hillsA, this.root); instanced(hill, this.M.outerAlt, hillsB, this.root); }
  }

  // 길: 폴리라인 구간마다 상자(구간 수만큼) + 진행 화살표 데칼(인스턴스 2회 — 입구 쪽 3개는 진하게) + 길 위 잔돌(인스턴스 1회) + 공중 점선(인스턴스 1회)
  buildPaths() {
    const road = NGN.map.GROUND_PATH, ROAD_W = 2.2;
    const segs = [];
    for (let i = 0; i < road.length - 1; i++) {
      const a = this.toWorld(road[i][0], road[i][1]), b = this.toWorld(road[i + 1][0], road[i + 1][1]);
      const len = a.distanceTo(b);
      const rot = -Math.atan2(b.z - a.z, b.x - a.x);
      // 길 = 가장 밝은 색, 그 밑에 폭 +0.7 의 어두운 테두리(2026-09-06 — 길이 잔디와 명도가 같아 어디가 길인지 안 보였다)
      const seg = new THREE.Mesh(new THREE.BoxGeometry(len + ROAD_W, 0.12, ROAD_W), this.M.road);
      seg.position.copy(a).lerp(b, 0.5); seg.position.y = 0.06; seg.rotation.y = rot; seg.receiveShadow = true; this.root.add(seg);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(len + ROAD_W + 0.7, 0.09, ROAD_W + 0.7), this.M.roadEdge);
      edge.position.copy(seg.position); edge.position.y = 0.03; edge.rotation.y = rot; edge.receiveShadow = true; this.root.add(edge);
      segs.push({ a, b, len, dx: (b.x - a.x) / len, dz: (b.z - a.z) / len, ry: rot });
    }
    this.roadSegs = segs;
    this.buildArrows(segs);
    const air = NGN.map.air.points, dots = [];
    for (let i = 0; i < air.length; i += 6) { const p = this.toWorld(air[i][0], air[i][1], 3.2); dots.push({ x: p.x, y: p.y, z: p.z }); }
    instanced(new THREE.SphereGeometry(0.16, 6, 4), this.M.air, dots, this.root);
    this.entry = this.toWorld(road[0][0], road[0][1], 0.2);
  }
  // 길 위 진행 화살표: 캔버스에 그린 꺾쇠(창고엔 화살표 모델이 없다) → 반투명 흰 데칼. 구간마다 gap 칸 간격, 입구 근처 3개는 진하게(별도 인스턴스 = 그리기 +1)
  buildArrows(segs) {
    const A = Object.assign({ gap: 2.6, size: 1.3, opacity: 0.35, strong: 0.6, strongCount: 3 }, (this.parts && this.parts.landmarks && this.parts.landmarks.arrow) || {});
    if (!this.arrowTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64; const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(12, 10); ctx.lineTo(38, 32); ctx.lineTo(12, 54); ctx.lineTo(26, 54); ctx.lineTo(52, 32); ctx.lineTo(26, 10); ctx.closePath(); ctx.fill();
      this.arrowTex = new THREE.CanvasTexture(c); this.arrowTex.minFilter = THREE.LinearFilter;
    }
    const geo = new THREE.PlaneGeometry(A.size, A.size); geo.rotateX(-Math.PI / 2); // 바닥에 눕힌다(캔버스 오른쪽 = +x)
    const soft = [], strong = [];
    let n = 0;
    segs.forEach((s, i) => {
      const last = i === segs.length - 1;
      for (let t = i === 0 ? 2.2 : A.gap * 0.6; t < s.len - (last ? 3.4 : 0.6); t += A.gap) {
        (n++ < A.strongCount ? strong : soft).push({ x: s.a.x + s.dx * t, y: 0.15, z: s.a.z + s.dz * t, ry: s.ry });
      }
    });
    const mk = (o) => new THREE.MeshBasicMaterial({ map: this.arrowTex, transparent: true, opacity: o, depthWrite: false });
    instanced(geo, mk(A.opacity), soft, this.root); instanced(geo, mk(A.strong), strong, this.root);
  }
  flag(pos, color) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5), this.M.wood);
    pole.position.copy(pos); pole.position.y = 1.2; pole.castShadow = true;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), NGN.litMat({ color, side: THREE.DoubleSide }));
    cloth.position.set(pos.x + 0.45, 2.05, pos.z);
    this.root.add(pole, cloth);
  }

  // 자리(2026-09-06 화면 설계 2판): 흰 원판 + 금색 테두리 링. 원판은 InstancedMesh 하나(색으로 선택 표시), 금테는 조명을 안 받는 Basic 재질 InstancedMesh 하나 — 자리 수와 무관하게 그리기 2회.
  // 비어 있는 자리는 금테가 은은히 숨 쉰다(render 에서 인스턴스 색 밝기를 사인파로) — "여기 지으라고". 타워가 서면(setSlotBuilt) 숨쉬기를 멈추고 얌전한 금색으로
  // 2026-09-06 사장님 "타워 놓는 곳 디자인 디테일하게": 창고 조각 세 겹(kenney_parts.json landmarks.slot) — 바닥판 + 둥근 석조 기단 + 기단 위 파인 홈 + 기단을 두르는 선택 링.
  // 층마다 InstancedMesh 하나 → 자리 수와 무관하게 그리기 4회(+자리 점 1회). 상태(빈/놓을 수 있음/돈 모자람/손가락/타워 섬)는 링 색·기단 색·기단 높이(인스턴스 색·행렬)로만 바꾼다 — 그리기 횟수 불변.
  // 타워는 기단 위(slotH)에 선다 — 타워가 서도 기단이 그대로 보여 "몇 자리가 남았나"가 한눈에 세진다. 모델이 없으면 옛 원판+링(폴백)
  buildSlots() {
    this.slotMeshes = [];
    this.slotBuilt = []; this.slotHi = []; this.slotPick = 0; this.slotDirty = true; this.slotH = 0.3;
    const pips = [], pos = [];
    for (const s of NGN.map.SLOTS) {
      const p = this.toWorld(s.x, s.y, 0); pos.push(p);
      this.slotBuilt[s.id] = false; this.slotHi[s.id] = false;
      const cover = NGN.map.coverageFor(s.id, 800, false);
      const n = cover > 2600 ? 3 : cover > 1900 ? 2 : 1;
      for (let i = 0; i < n; i++) pips.push({ x: p.x + (i - (n - 1) / 2) * 0.45, y: 0.34, z: p.z + 1.05 });
    }
    this.slotPos = pos; this._slotC = new THREE.Color(); this._slotO = new THREE.Object3D();
    const L = this.parts && this.parts.landmarks && this.parts.landmarks.slot;
    this.slotLayers = null;
    if (!(L && this.models && this.buildSlotsKenney(L, pos))) this.buildSlotsFallback(pos);
    instanced(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 8), this.M.pip, pips, this.root);
  }
  buildSlotsKenney(L, pos) {
    const T = (L.theme || {})[this.theme] || {}, D = 3.1; // 자리 지름(세계 단위) — 옛 원판과 같다
    const mk = (P) => this.piece(P);
    const base = mk({ p: L.base.p, raw: false, tint: T.tint || '#CFC6B4' }); if (!base) return false;
    const fit = (g, d) => d / Math.max(1e-3, Math.max(g.size.x, g.size.z));
    const sb = fit(base.g, D), hb = base.g.height * sb;
    this.slotH = hb + 0.02;
    const ground = L.ground ? mk({ p: L.ground.p, raw: false, tint: T.ground || '#9AB07A' }) : null;
    const hole = L.hole ? mk({ p: (T.holePiece && T.holePiece.p) || L.hole.p, raw: false, tint: T.hole || '#8A6A48' }) : null; // 테마 조각은 {p} 꼴(로더가 p 키만 모은다)
    const ring = L.ring ? mk({ p: L.ring.p, raw: false, tint: '#FFFFFF' }) : null;
    const n = pos.length, layers = {};
    const put = (key, g, s, y, material, cast) => { const m = instanced(g.geometry, material || g.material, pos.map((p) => ({ x: p.x, y, z: p.z, s, cast })), this.root); if (!m) return; m.castShadow = !!cast; layers[key] = { m, s, y }; for (let i = 0; i < n; i++) m.setColorAt(i, this._slotC.setHex(0xFFFFFF)); m.instanceColor.needsUpdate = true; };
    // 바닥판은 브래킷보다 넓게(1.42배) — 브래킷 ㄱ자 네 개가 어두운 바닥판 위에 온전히 얹혀야 대비가 난다(2026-09-06 밸런스 담당 지적: 금색 브래킷이 흙색 바닥판과 명도가 비슷해 상태 변화가 안 보였다)
    if (ground) put('ground', ground.g, fit(ground.g, D * 1.42), 0.005, null, false);
    put('base', base.g, sb, 0.01, null, true);
    if (hole) put('hole', hole.g, fit(hole.g, D * 0.46), hb + 0.012, null, false);
    // 링은 조명을 안 받는 재질(늘 밝게) — 아틀라스 × 인스턴스 색
    // vertexColors 는 안 켠다 — 링 조각은 흰색(#FFFFFF)으로 구워져 정점색을 곱해도 그대로라 켜나 안 켜나 화면이 같다.
    // ⚠️ 2026-09-06 정정: 여기 있던 "vertexColors 가 WebGL 경고의 원인" 이라는 기록은 틀렸다(밸런스 담당 오진).
    //    진짜 원인은 적 오버레이의 길이 0 색 버퍼였다(J-11 ⑥). 적이 있는 상태에서 이 칸을 다시 켜 봐도 경고는 안 난다(실측).
    if (ring) { this.slotRingMat = this.slotRingMat || new THREE.MeshBasicMaterial({ map: this.models.atlas, transparent: true, opacity: 0.98, depthWrite: false }); put('ring', ring.g, fit(ring.g, D * 1.26), 0.03, this.slotRingMat, false); layers.ring.m.renderOrder = 1; }
    this.slotLayers = layers;
    return true;
  }
  buildSlotsFallback(pos) {
    const geo = new THREE.CylinderGeometry(1.5, 1.65, 0.3, 14);
    const disc = instanced(geo, this.M.slot, pos.map((p) => ({ x: p.x, y: 0.15, z: p.z, cast: true })), this.root);
    const ringGeo = new THREE.RingGeometry(1.32, 1.62, 40); ringGeo.rotateX(-Math.PI / 2);
    const ring = instanced(ringGeo, new THREE.MeshBasicMaterial({ color: 0xFFFFFF }), pos.map((p) => ({ x: p.x, y: 0.32, z: p.z })), this.root);
    for (let i = 0; i < pos.length; i++) { if (disc) disc.setColorAt(i, this._slotC.setHex(0xFFFFFF)); if (ring) ring.setColorAt(i, this._slotC.setHex(0xFFFFFF)); }
    this.slotLayers = { base: { m: disc, s: 1, y: 0.15 }, ring: { m: ring, s: 1, y: 0.32 } };
    this.slotH = 0.3;
  }
  setSlotHighlight(slotId, on) { if (slotId < this.slotBuilt.length && this.slotHi[slotId] !== !!on) { this.slotHi[slotId] = !!on; this.slotDirty = true; } }
  // 렌더러(syncTowers)가 판의 자리 상태를 알려 준다
  setSlotBuilt(slotId, built) { if (this.slotBuilt && this.slotBuilt[slotId] !== !!built) { this.slotBuilt[slotId] = !!built; this.slotDirty = true; } }
  // 화면이 알려 주는 카드 상태: 0 = 안 고름 · 1 = 골랐고 돈이 된다(빈 자리가 떠오르며 밝게) · 2 = 골랐는데 돈이 모자란다(회색으로 가라앉음)
  setPickState(state) { const s = state | 0; if (this.slotPick !== s) { this.slotPick = s; this.slotDirty = true; } }
  // 매 프레임: 링 색은 늘(숨쉬기), 기단 색·높이는 상태가 바뀐 프레임에만 행렬을 다시 쓴다
  breatheSlots(now) {
    const Lr = this.slotLayers; if (!Lr || !Lr.ring) return;
    const gold = this.C.slotEdge, c = this._slotC, o = this._slotO, ring = Lr.ring.m, base = Lr.base.m;
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.004);
    for (let i = 0; i < this.slotBuilt.length; i++) {
      const built = this.slotBuilt[i], hi = this.slotHi[i];
      // 링 지오메트리는 회색조 칸(최대 밝기 ~0.9)이라 1 을 넘는 색을 곱해 밝힌다(Basic 재질은 클램프 안 함)
      // 2026-09-06 대비 상향(밸런스 담당 지적 "골랐을 때 자리가 밝아진 게 폰에서 한눈에 안 보인다"): 골랐을 때는 흰빛 섞인 금색을 더 세게, 빈 자리는 조금 더 밝게 — 바닥판은 어둡게 내렸다(kenney_parts.json slot.theme.ground)
      if (hi) c.setHex(0xFFFFFF).multiplyScalar(1.8 + 0.2 * pulse);             // 손가락이 올라간 자리: 흰색, 굵게(아래 스케일)
      else if (built) c.setHex(gold).multiplyScalar(0.5);                         // 타워가 선 자리: 어두운 금색(찬 자리)
      else if (this.slotPick === 2) c.setHex(0x8A8F94).multiplyScalar(0.8);       // 골랐는데 돈이 모자람: 회색
      else if (this.slotPick === 1) c.setHex(0xFFF0B0).multiplyScalar(1.7 + 0.5 * pulse); // 놓을 수 있음: 흰빛 도는 금색으로 밝게 빛남
      else c.setHex(gold).multiplyScalar(0.95 + 0.4 * (0.5 + 0.5 * Math.sin(now * 0.0028 + i * 0.9))); // 그냥 비어 있음: 은은히 숨 쉼
      ring.setColorAt(i, c);
    }
    ring.instanceColor.needsUpdate = true;
    if (!this.slotDirty) return;
    this.slotDirty = false;
    for (let i = 0; i < this.slotBuilt.length; i++) {
      const p = this.slotPos[i], built = this.slotBuilt[i], hi = this.slotHi[i];
      const lift = built ? 0 : hi ? 0.14 : this.slotPick === 1 ? 0.12 : this.slotPick === 2 ? -0.06 : 0; // 떠오름 / 가라앉음
      const gray = !built && this.slotPick === 2, ready = !built && this.slotPick === 1;
      for (const k of Object.keys(Lr)) {
        const { m, s, y } = Lr[k]; if (!m) continue;
        const ringK = k === 'ring';
        o.position.set(p.x, y + (ringK ? 0 : lift), p.z); o.rotation.set(0, 0, 0);
        const sc = ringK ? s * (hi ? 1.18 : ready ? 1.08 : 1) : s; o.scale.set(sc, ringK ? s : sc, sc); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
        // 상태는 브래킷 색만이 아니라 기단·홈 전체로 — 골랐을 때 기단이 금빛으로, 손가락이 올라가면 흰빛으로 밝아진다(Lambert 인스턴스 색은 1 을 넘어도 된다). 바닥판은 골랐을 때 오히려 더 어둡게(대비)
        if (!ringK) {
          if (gray) c.setHex(0x9AA0A6);
          else if (k === 'ground') c.setHex(0xFFFFFF).multiplyScalar(ready || hi ? 0.7 : 1);
          else if (hi && !built) c.setHex(0xFFFFFF).multiplyScalar(1.35);
          else if (ready) c.setHex(k === 'hole' ? 0xFFD870 : 0xFFE9A8).multiplyScalar(1.2);
          else c.setHex(0xFFFFFF);
          m.setColorAt(i, c);
        }
      }
    }
    for (const k of Object.keys(Lr)) { const m = Lr[k].m; if (m) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } }
    void base;
  }

  // ---------- 성(출구)·동굴(입구) ----------
  // 길 마지막 구간 방향으로 성을, 첫 구간 방향으로 동굴을 세운다. 모델이 없으면 옛 깃발 둘(입구 초록·출구 빨강)
  buildLandmarks() {
    const road = NGN.map.GROUND_PATH;
    const end = this.toWorld(road[road.length - 1][0], road[road.length - 1][1]), prev = this.toWorld(road[road.length - 2][0], road[road.length - 2][1]);
    const start = this.toWorld(road[0][0], road[0][1]), next = this.toWorld(road[1][0], road[1][1]);
    const dirOut = end.clone().sub(prev).normalize(), dirIn = next.clone().sub(start).normalize();
    // 렌더러가 읽는 자리 — 모델이 없어도 채워 둔다(파티클은 그 자리에 뿌려진다)
    this.castleGate = end.clone(); this.castleTop = end.clone().setY(4); this.portal = start.clone().setY(1.2);
    const L = this.parts && this.parts.landmarks;
    if (!this.models || !L || !L.castle || !L.castle.length) { this.flag(start, NGN.C.flagIn); this.flag(end, NGN.C.flagOut); return; }
    this.buildCastle(L, end, dirOut);
    this.buildPortal(L, start, dirIn);
    this.buildStageMark(L);
  }
  // 로비 표지(K-2-8, 2026-09-07): 다음에 갈 스테이지의 작은 3D 모형을 판 한가운데 공중에 띄운다 — "다음은 여기다"가 한눈에 보이게.
  // 테마마다 다른 모형이라 눈밭인지 늪인지 해변인지가 들어가기 전에 보인다. 전투가 시작되면 render.js 가 숨긴다(syncTowers).
  // 조립표는 landmarks.stageMark(테마별 조각 목록). 조각을 정점 하나로 구워 메시 1개 = 그리기 1회.
  buildStageMark(L) {
    const spec = L && L.stageMark; if (!spec || !this.models) return;
    const set = (spec.theme || {})[this.theme] || spec.theme.grass || [];
    if (!set.length || !this.models.sceneryMat) return;
    const S = spec.scale || 2.0;
    const g = new THREE.Group();
    // 🔴 cx·cz 는 지도 좌표다(세계 좌표가 아니다) — 판 한가운데의 세계 좌표는 원점(0,0). 처음에 cx 를 그대로 써서 표지가 화면 밖 1725 에 놓였다(실측)
    this.stageMarkY = (spec.y === undefined ? 8 : spec.y);
    g.position.set(0, this.stageMarkY, 0);
    this.root.add(g);
    const col = this.collector(g);
    for (const E of set) {
      const s = S * (E.s === undefined ? 1 : E.s);
      col.add({ p: E.p, raw: E.raw, recolor: E.recolor, tint: E.tint },
        { x: (E.x || 0) * S, y: (E.y || 0) * S, z: (E.z || 0) * S, ry: (E.ry || 0) * DEG, s, cast: true }); // 그림자를 켠다 — 없으면 조각이 바닥판에 납작하게 붙어 보인다
    }
    col.flush(this.models.sceneryMat, true);
    this.stageMark = g;
  }
  // 로비 모드(render.js 가 매 프레임 부른다). 로비에서는 판(길·자리·성·동굴·장식)을 통째로 숨기고 표지만 남긴다 —
  // 판 위에 표지를 겹쳐 두었더니 둘이 뒤섞여 모형이 뭐인지 안 보였다(2026-09-07 실측, 사장님 "배경하고 너무 산만해").
  // 🛑 보이고 안 보이고만 바꾼다 — 지도 생성·길·자리 좌표는 그대로다. 판을 안 그리는 만큼 로비 그리기 횟수도 준다.
  setLobbyMode(on) {
    on = !!on;
    if (this.lobbyMode === on) return;
    this.lobbyMode = on;
    // 로비 → 전투 = 새 판이 시작됐다. 여기서 품질을 이 기기 상한까지 되돌리고 처음부터 다시 잰다.
    // 🛑 setMap 만으로는 모자란다 — main.js 는 지도가 실제로 바뀔 때만 setMap 을 부르므로(showMap),
    //    같은 판을 다시 도전하면 지난 판에서 내려간 그림자가 그대로 꺼져 있었다
    if (!on) this.resetQualityWatch();
    for (const c of this.root.children) c.visible = (c === this.stageMark) ? on : !on;
    // 로비 배경은 그 테마 하늘을 반쯤 어둡게 — 풀밭 하늘이 초록이라 초록 모형이 그대로 묻혔다(실측). 판에 들어가면 원래 하늘로 되돌린다
    this.scene.background = new THREE.Color(on ? brighten(this.C.sky, 0.55) : this.C.sky);
    this.placeCamera();
  }
  // 로비 카메라: 판이 아니라 모형에 맞춘다. 판을 내려다보는 각(62°)으로는 모형이 납작하게 눌려 나무인지 바위인지 안 보였다(실측) —
  // 각을 40° 로 낮춰 옆모습이 보이게 하고, 거리는 모형 지름에 맞춘다
  placeLobbyCamera() {
    const spec = (this.parts && this.parts.landmarks && this.parts.landmarks.stageMark) || {};
    const size = spec.scale || 22, pitch = 40 * Math.PI / 180;
    // 거리는 세로·가로 시야 중 좁은 쪽에 맞춘다 — 세로 화면은 가로가 훨씬 좁아, 세로 시야로만 재면 모형이 화면을 뚫고 나온다(실측)
    const halfV = Math.tan(this.camera.fov * Math.PI / 360);
    const dist = (size * 0.82) / Math.max(0.06, Math.min(halfV, halfV * this.camera.aspect));
    const look = new THREE.Vector3(0, (this.stageMarkY || 0) + size * 0.22, 0); // 바라보는 점을 모형 위로 올리면 모형이 화면 아래로 내려가 제목·별과 안 겹친다
    this.camera.position.set(look.x + Math.sin(this.camAngle) * Math.cos(pitch) * dist, look.y + Math.sin(pitch) * dist, look.z + Math.cos(this.camAngle) * Math.cos(pitch) * dist);
    this.camera.lookAt(look);
    this.camBase.copy(this.camera.position);
    this.dist = dist;
  }
  // 성: 조립표(landmarks.castle)를 성 단위 × castleScale 로 놓는다. 같은 조각은 InstancedMesh 로 묶고(벽 9개 = 그리기 1회), 성문 문짝·깃발만 개별 메시(움직여야 해서).
  // 재질은 장식 아틀라스 재질을 복제한 성 전용 하나 — 그을음(setCastleDamage)이 성만 어둡게 하려고. 테마: castleTheme[테마].tint(성벽) · flag(깃발)
  buildCastle(L, at, dir) {
    const CS = L.castleScale || 1.7, T = (L.castleTheme || {})[this.theme] || {};
    const g = new THREE.Group(); g.position.copy(at); g.rotation.y = headingRy(dir.x, dir.z); this.root.add(g); g.updateMatrixWorld(true);
    this.castle = g;
    const box = new THREE.Box3(); // 성의 로컬 범위 — 카메라가 성까지 담게(boardExtent)
    const stat = this.collector(g, box), intact = this.collector(g, box), ruin = this.collector(g, box);
    const fires = [[], [], []]; let topLocal = null, topY = 0;
    const singles = [];
    for (const E of L.castle) {
      const lx = (E.x || 0) * CS, ly = (E.y || 0) * CS, lz = (E.z || 0) * CS;
      if (E.fire) { fires[E.fire].push(g.localToWorld(new THREE.Vector3(lx, ly, lz))); continue; }
      const P = { p: E.p, raw: E.raw, recolor: E.recolor, tint: E.role === 'flag' ? (T.flag || E.tint) : (T.tint || E.tint) };
      const s = CS * (E.s || 1);
      const it = { x: lx, y: ly, z: lz, ry: (E.ry || 0) * DEG, s, sx: E.sx ? s * E.sx : undefined, sy: E.sy ? s * E.sy : undefined, sz: E.sz ? s * E.sz : undefined, cast: true };
      let gg;
      if (E.role === 'gate' || E.role === 'flag') { const r = this.piece(P); if (!r) continue; gg = r.g; singles.push({ E, it, gg }); }
      else gg = (E.role === 'ruin' ? ruin : E.role === 'intact' ? intact : stat).add(P, it);
      if (gg && E.top) { topY = ly + gg.height * s; topLocal = new THREE.Vector3(lx, topY, lz); }
    }
    if (!this.models.sceneryMat) return; // 조각을 하나도 못 만들었다
    this.castleMat = this.castleMat || this.models.sceneryMat.clone();
    this.castleMat.color.setHex(0xFFFFFF);
    stat.flush(this.castleMat, true); // 성 몸통 전체 = 메시 1개
    this.castleIntact = intact.flush(this.castleMat, true); this.castleRuin = ruin.flush(this.castleMat, true);
    for (const m of this.castleRuin) m.visible = false;
    for (const { E, it, gg } of singles) {
      const m = new THREE.Mesh(gg.geometry, this.castleMat);
      m.position.set(it.x, it.y, it.z); m.rotation.y = it.ry; m.scale.set(it.sx || it.s, it.sy || it.s, it.sz || it.s); m.castShadow = true; g.add(m);
      if (E.role === 'gate') this.gateMesh = m; else this.flagMeshes.push(m);
    }
    this.castleGate = g.localToWorld(new THREE.Vector3(0, 0, 0));
    this.castleTop = topLocal ? g.localToWorld(topLocal.clone()) : g.localToWorld(new THREE.Vector3(CS, 2.4 * CS, 0));
    this.castleFires = [[], fires[1], fires[1].concat(fires[2])];
    this.castleFireSpots = [];
    this.castleBox = box.isEmpty() ? null : box.applyMatrix4(g.matrixWorld); // 세계 좌표 범위(회전된 상자를 감싸는 축 정렬 상자)
    const c = g.localToWorld(new THREE.Vector3(1.0 * CS, 0, 0)); this.keepOut.push({ x: c.x, z: c.z, r: 3.4 * CS });
  }
  // 동굴(입구): 절벽 블록 더미 + 동굴 입(cliff_cave) + 어둠 원판 + 적 진영 깃발·걸개·목책·화로. 전부 인스턴스(장식 재질 공유). portalTheme[테마]: swap(_rock→_stone)·recolor·flag
  buildPortal(L, at, dir) {
    const PS = L.portalScale || 2.0, T = (L.portalTheme || {})[this.theme] || {};
    const g = new THREE.Group(); g.position.copy(at); g.rotation.y = headingRy(dir.x, dir.z); this.root.add(g); g.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const col = this.collector(g, box);
    for (const E of L.portal || []) {
      const lx = (E.x || 0) * PS, ly = (E.y || 0) * PS, lz = (E.z || 0) * PS, s = PS * (E.s || 1);
      if (E.dark) { const d = new THREE.Mesh(new THREE.CircleGeometry(E.r * PS, 18), new THREE.MeshBasicMaterial({ color: 0x08040C, transparent: true, opacity: 0.9, depthWrite: false })); d.position.set(lx, ly + E.r * PS, lz); d.rotation.y = Math.PI / 2; g.add(d); continue; }
      if (E.portal) { this.portal = g.localToWorld(new THREE.Vector3(lx, ly, lz)); continue; }
      let name = E.p; if (T.swap && name.startsWith('nature/')) name = name.replace(T.swap[0], T.swap[1]);
      const P = { p: name, raw: E.raw, recolor: name.startsWith('nature/') ? Object.assign({}, T.recolor || {}, E.recolor || {}) : E.recolor, tint: E.role === 'flag' ? (T.flag || E.tint) : E.tint };
      col.add(P, { x: lx, y: ly, z: lz, ry: (E.ry || 0) * DEG, s, cast: true });
      if (E.fire) this.fireSpots.push(g.localToWorld(new THREE.Vector3(lx, ly + 0.28 * s, lz)));
    }
    col.flush(null, true); // 동굴 전체 = 메시 1개
    this.portalBox = box.isEmpty() ? null : box.applyMatrix4(g.matrixWorld);
    const c = g.localToWorld(new THREE.Vector3(-0.3 * PS, 0, 0)); this.keepOut.push({ x: c.x, z: c.z, r: 2.6 * PS });
  }
  // 성 피격: 성문 문짝이 움찔·깃발이 흔들린다(0.3초). 파티클은 렌더러가 castleGate 자리에
  castleHit() { this.hitT = 0.3; }
  // 생명 비율(1→0) → 3단계: ≥0.6 멀쩡 / <0.6 그을음 + 깃발 하나 사라짐 / <0.3 성문 기울어짐·탑 하나 무너짐(잔해로 바꿈)·깃발 전부 사라짐. castleFireSpots 를 단계마다 채운다
  setCastleDamage(ratio) {
    const stage = ratio >= 0.6 ? 0 : ratio >= 0.3 ? 1 : 2;
    if (stage === this.damageStage) return;
    this.damageStage = stage;
    this.castleFireSpots = this.castle ? this.castleFires[stage].map((v) => v.clone()) : [];
    if (!this.castle) return;
    this.castleMat.color.setHex(stage === 0 ? 0xFFFFFF : stage === 1 ? 0x9A8E86 : 0x6E6260);
    this.flagMeshes.forEach((m, i) => { m.visible = stage === 0 || (stage === 1 && i > 0); });
    for (const m of this.castleIntact) m.visible = stage < 2;
    for (const m of this.castleRuin) m.visible = stage >= 2;
    if (this.gateMesh) { this.gateMesh.rotation.z = stage >= 2 ? -0.42 : 0; this.gateMesh.rotation.x = stage >= 2 ? 0.18 : 0; }
  }
  // 카메라 흔들림(0.6~1.0). 보스 등장·성 피격 때 렌더러가 부른다. render() 가 감쇠시키며 camBase 에 난수 오프셋을 더한다
  // ---------- 화면 흔들림(M-4-4, 2026-09-07 전면 교체) ----------
  // 옛 방식: 매 프레임 `Math.random()` 으로 **카메라 위치**를 튕겼다. 두 가지가 잘못됐다 —
  //   ⑴ 난수는 앞뒤 프레임이 서로 무관해 화면이 **지직거린다**(흔들리는 게 아니라 떨린다).
  //   ⑵ 3D 에서 위치를 흔들면 원근이 바뀌어 물체가 미끄러지고, 심하면 카메라가 땅을 파고든다.
  // 새 방식(GDC 2016 Squirrel Eiserloh, "Math for Game Programmers: Juicing Your Cameras"):
  //   · 이어진 잡음(SimplexNoise)을 쓴다 — 강연 원문 "Smoothed fractal noise is WAY better than random for screen shake"
  //   · **위치 말고 회전만** 흔든다(pitch·yaw·roll 세 축을 각각 다른 잡음 줄에서 뽑는다)
  //   · 세기는 `trauma` 라는 0~1 값 하나로 모으고, 화면에는 **trauma 의 제곱**을 쓴다 —
  //     작은 충격은 거의 안 흔들리고 큰 충격만 확 흔들려서, 세기 차이가 저절로 생긴다.
  // 흔들림이 어지러운 사람을 위해 `shakeScale`(0 끄기 / 0.5 절반 / 1 기본)을 곱한다 — main.js 가 설정에서 넣어 준다.
  shake(strength) { this.trauma = Math.min(1, (this.trauma || 0) + (strength || 0.8) * 0.55); }

  // ---------- 장식 ----------
  // 풍경: 연못 둘(용암 테마면 용암 못) + 테마 장식 세트(창고 모델, 인스턴스) — 모델이 없으면 옛 코드 도형. 같은 시드(NGN.map.seed)면 같은 배치
  buildScenery() {
    const B = NGN.map.BOUNDS;
    let seed = 7 + (NGN.map.seed || 0) * 13;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    // 연못 둘(지도 바깥쪽 좌우) — 용암 테마면 용암 못
    const ponds = [[B.maxX + 450, (B.minY + B.maxY) / 2, 520], [B.minX - 450, (B.minY + B.maxY) / 2, 380]];
    for (const [x, y, r] of ponds) {
      const p = this.toWorld(x, y);
      const pond = new THREE.Mesh(new THREE.CylinderGeometry(r * NGN.SCALE, r * NGN.SCALE * 1.1, 0.12, 14), this.M.water);
      pond.position.set(p.x, 0.05, p.z); pond.receiveShadow = true; this.root.add(pond);
      const bank = new THREE.Mesh(new THREE.CylinderGeometry(r * NGN.SCALE * 1.2, r * NGN.SCALE * 1.25, 0.08, 14), this.M.roadEdge);
      bank.position.set(p.x, 0.02, p.z); this.root.add(bank);
    }
    const set = this.models && this.parts && this.parts.scenery && (this.parts.scenery[this.theme] || this.parts.scenery.grass);
    if (set && set.length) this.buildKenneyScenery(set, ponds, rnd);
    else this.buildSceneryFallback(ponds, rnd);
    // 길 위 잔돌은 뺐다(2026-09-06) — 길을 또렷하게 하는 데 노이즈였다. 판 안에는 장식을 하나도 안 둔다
  }
  // 판 안(BOUNDS + 여백)인가 — 장식은 판 안에 놓지 않는다(2026-09-06 "장식 570개가 판 안에도 있어 산만하다")
  insideBoard(x, z, extra = 0) { const pad = (this.boardPad || 2.4) + extra; return Math.abs(x) < this.width / 2 + pad && Math.abs(z) < this.depth / 2 + pad; }
  // 길과 자리와 성·동굴에서 떨어졌나(세계 단위). 길은 폴리라인 구간까지의 거리로 잰다
  roadDist(x, z) {
    let d = Infinity;
    for (const s of this.roadSegs) { const t = Math.max(0, Math.min(s.len, (x - s.a.x) * s.dx + (z - s.a.z) * s.dz)); d = Math.min(d, Math.hypot(x - s.a.x - s.dx * t, z - s.a.z - s.dz * t)); }
    return d;
  }
  // 창고 장식 배치. zone 마다 후보 자리를 만들고(edge 판 둘레 ±3.5칸 · far 늘어난 땅 · road 길 옆 · water 연못 둑 · pond 연못 위 · hill 언덕 위) 가중치로 종류를 고른다.
  // 겹침은 발자국 반지름(모델 크기 × 배율)으로 막는다(격자 해시). 목표: 판 둘레 230 + 먼 땅 300 + 길 옆·물가·언덕 → 500개 이상, 전부 인스턴스
  buildKenneyScenery(set, ponds, rnd) {
    const B = NGN.map.BOUNDS, S = NGN.SCALE;
    const hw = (B.maxX - B.minX) * S / 2, hd = (B.maxY - B.minY) * S / 2;
    const slots = NGN.map.SLOTS.map((s) => this.toWorld(s.x, s.y));
    const pondsW = ponds.map(([x, y, r]) => { const p = this.toWorld(x, y); return { x: p.x, z: p.z, r: r * S }; });
    const col = this.collector(this.root);
    // 자리 검사: 길 2.2 · 자리 2.6 · 성/동굴 keepOut · 연못(둑까지). 길 옆(road) 후보는 길 검사를 건너뛴다(일부러 길 옆이니까)
    const freeAt = (x, z, r, skipRoad) => {
      if (!skipRoad && this.roadDist(x, z) < 2.2 + r) return false;
      for (const p of slots) if ((p.x - x) ** 2 + (p.z - z) ** 2 < (2.6 + r) ** 2) return false;
      for (const k of this.keepOut) if ((k.x - x) ** 2 + (k.z - z) ** 2 < (k.r + r) ** 2) return false;
      for (const p of pondsW) if ((p.x - x) ** 2 + (p.z - z) ** 2 < (p.r * 1.25 + 0.6 + r) ** 2) return false;
      return true;
    };
    const cells = new Map(); const CELL = 4;
    const cellKey = (cx, cz) => cx + ',' + cz;
    const overlaps = (x, z, r) => {
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const c = cells.get(cellKey(cx + i, cz + j)); if (c) for (const o of c) if ((o.x - x) ** 2 + (o.z - z) ** 2 < ((o.r + r) * 0.72) ** 2) return true; }
      return false;
    };
    const mark = (x, z, r) => { const k = cellKey(Math.floor(x / CELL), Math.floor(z / CELL)); (cells.get(k) || cells.set(k, []).get(k)).push({ x, z, r }); };
    // 종류 풀
    const pools = { edge: [], far: [], road: [], water: [], pond: [], hill: [] };
    for (const it of set) for (const z of (it.zone === 'any' ? ['edge', 'far'] : [it.zone || 'edge'])) if (pools[z]) pools[z].push(it);
    // 🔴 2026-09-07 저녁 (사장님 "배경 너무 산만하지 않아? 조형물이 덕지덕지"):
    //    장식이 572개였다. 땅이 약 7,900칸이니 **14칸마다 하나씩** — 판 위아래가 빈틈없이 덮였다.
    //    🔑 개수는 예전부터 그대로였는데 이제야 걸린 이유: **판이 깨끗해지니 배경이 상대적으로 도드라졌다.**
    //    🛑 "창고를 다 쓰라"와 충돌하지 않는다 — 그건 **종류를 다양하게** 쓰라는 뜻이지 빽빽하게 채우라는 뜻이 아니다.
    //       종류는 그대로 두고 **개수만** 줄인다.
    //    네 가지를 함께 손봤다(값은 아래 대조표에서 눈으로 골랐다):
    //      ⑴개수 ⑵판 둘레 여백(판이 무대처럼 도드라지게 — 색으로 하려다 실패했던 그 효과를 여백으로)
    //      ⑶밀도를 고르게 뿌리지 않는다(잡음으로 뭉치는 곳과 비는 곳을 만든다 — 균일하면 "벽지"가 된다)
    //      ⑷큰 것 위주(작은 것 열 개보다 큰 나무 세 그루가 덜 산만하고 더 그럴듯하다)
    const ST = NGN.SCENERY_TUNE || {};
    //    여섯 안(572 / 307 / 306 / 306 / 208 / 145)을 한 화면에 놓고, 다시 셋(310 / 258 / 209)을 크게 봤다 —
    //    310 은 숲 띠가 아직 촘촘하고, 209 는 배경이 허전해 "빈 들판에 나무 몇 그루"가 된다.
    //    **258 개**에서 뭉친 곳과 빈 곳이 생기고 판 둘레 여백이 살아난다(scratchpad/scenery_grid.png · scenery_pick.png)
    const N_EDGE = ST.edge === undefined ? 95 : ST.edge;      // 판 둘레 개수(옛 230)
    const N_FAR = ST.far === undefined ? 120 : ST.far;        // 먼 땅 개수(옛 300)
    const MARGIN = ST.margin === undefined ? 2.9 : ST.margin; // 판 테두리에서 띄울 여백(칸, 옛 0.4)
    const CLUMP = ST.clump === undefined ? 0.88 : ST.clump;   // 뭉침 정도(0 = 예전처럼 고르게)
    const BIG = ST.big === undefined ? 1.1 : ST.big;          // 큰 것 선호(0 = 예전처럼 크기 무시)
    const nz = (CLUMP > 0 && THREE.SimplexNoise) ? new THREE.SimplexNoise() : null;
    // 밀도 잡음 — 같은 자리는 늘 같은 값이라 씨앗이 같으면 배치도 같다(결정론 유지)
    const denseOk = (x, z) => {
      if (!nz) return true;
      const v = (nz.noise(x * 0.028, z * 0.028) + 1) / 2;      // 0~1, 부드럽게 이어진다
      return rnd() < (1 - CLUMP) + CLUMP * (v * v * 1.9);      // 제곱해서 빈 곳은 더 비고 뭉친 곳은 더 뭉친다
    };
    const counts = new Map();
    const fpCache = new Map();
    const footprint = (it) => {
      if (it.r) return it.r;
      if (fpCache.has(it)) return fpCache.get(it);
      const p = it.p || (it.parts && it.parts[0] && it.parts[0].p); const sz = p && this.models.size(p);
      const v = sz ? Math.max(sz.x, sz.z) / 2 : 0.4;
      fpCache.set(it, v); return v;
    };
    const weight = (it) => (it.n || 1) * (BIG ? Math.pow(Math.max(0.25, footprint(it)), BIG) : 1);
    const pick = (pool) => {
      let tot = 0; const c = [];
      for (const it of pool) { if (it.max && (counts.get(it) || 0) >= it.max) continue; c.push(it); tot += weight(it); }
      if (!c.length) return null;
      let r = rnd() * tot; for (const it of c) { r -= weight(it); if (r <= 0) return it; }
      return c[c.length - 1];
    };
    let placed = 0;
    // 항목 하나를 자리에 놓는다(묶음이면 조각들을 회전시켜 함께). fire 항목은 불 자리로
    const put = (it, sp) => {
      const s = it.s ? it.s[0] + rnd() * (it.s[1] - it.s[0]) : 1;
      const r = footprint(it) * s;
      if (!sp.noOverlap && overlaps(sp.x, sp.z, r)) return false;
      const ry = sp.ry !== undefined ? sp.ry : rnd() * Math.PI * 2;
      // 낱개 항목은 조각 하나(오프셋 0·배율 1) — 항목의 s 는 [최소,최대] 배열이라 하위 칸으로 읽으면 안 된다(실측: NaN 배율로 전부 안 보였다)
      const parts = it.parts || [{ p: it.p }];
      let ok = false;
      for (const sub of parts) {
        const ox = (sub.x || 0) * s, oz = (sub.z || 0) * s, c = Math.cos(ry), sn = Math.sin(ry);
        const P = { p: sub.p, tint: sub.tint || it.tint, raw: sub.raw !== undefined ? sub.raw : it.raw, recolor: sub.recolor || it.recolor };
        // 그림자 패스는 캐스터 종류마다 그리기 +1 — 판 둘레(edge)·물가의 큰 것(나무·바위·풍차, 키 0.7칸 이상)만 그림자를 만든다.
        // 먼 땅(far)·언덕(hill)은 전부 끔, 길 옆(road)은 키 1.2칸 이상만(울타리·잔돌·표지판·가로등 제외). 코디네이터 실측: CPU 4배 감속에서 340회·22ms 가 나와 20~30회를 줄여야 했다
        const sz = this.models.size(sub.p), hgt = sz ? sz.y * s * (sub.s || 1) : 9;
        const tall = sp.zone !== 'far' && sp.zone !== 'hill' && hgt >= (sp.zone === 'road' ? 1.2 : 0.7);
        if (col.add(P, { x: sp.x + ox * c + oz * sn, y: (sp.y || 0) + (sub.y || 0) * s, z: sp.z - ox * sn + oz * c, ry: ry + (sub.ry || 0) * DEG, s: s * (sub.s || 1), cast: tall })) ok = true;
      }
      if (!ok) return false;
      mark(sp.x, sp.z, r); counts.set(it, (counts.get(it) || 0) + 1); placed++;
      if (it.fire) this.fireSpots.push(new THREE.Vector3(sp.x, (sp.y || 0) + 0.06 * s, sp.z));
      return true;
    };
    // 자리 만들기
    // 🔴 판 안에는 장식을 하나도 놓지 않는다(2026-09-06). 판 둘레(edge)는 판 테두리 바깥 0.4~6.5칸 띠, 먼 땅(far)은 그 밖.
    //    길 옆(road) 장식은 전부 판 안이라 뺐다 — 울타리·가로등·수레가 타워 자리와 뒤섞여 어디가 자리인지 헷갈리게 했다. 개수(230+300)는 그대로라 안 산만해진다
    const EDGE_W = 6.5;
    const genEdge = () => { const x = -hw - EDGE_W + rnd() * (2 * hw + 2 * EDGE_W), z = -hd - EDGE_W + rnd() * (2 * hd + 2 * EDGE_W); if (this.insideBoard(x, z, MARGIN)) return null; if (!denseOk(x, z)) return null; return freeAt(x, z, 0.5) ? { x, z, zone: 'edge' } : null; };
    const genFar = () => {
      const x = -(hw + 18) + rnd() * (2 * hw + 36), z = -(hd + 33) + rnd() * (2 * hd + 66);
      if (Math.abs(x) < hw + EDGE_W && Math.abs(z) < hd + EDGE_W) return null; // 판 둘레는 edge 몫
      if (!denseOk(x, z)) return null;
      return freeAt(x, z, 0.5) ? { x, z, zone: 'far' } : null;
    };
    const roadSpots = [];
    const waterSpots = [], pondSpots = [];
    for (const p of pondsW) {
      for (let i = 0; i < 14; i++) { const a = rnd() * Math.PI * 2, d = p.r * 1.25 + 0.4 + rnd() * 1.0; const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d; if (freeAt(x, z, 0.3)) waterSpots.push({ x, z, zone: 'water', faceRy: headingRy(p.x - x, p.z - z), bridgeX: p.x + Math.cos(a) * p.r * 1.05, bridgeZ: p.z + Math.sin(a) * p.r * 1.05 }); }
      for (let i = 0; i < 8; i++) { const a = rnd() * Math.PI * 2, d = rnd() * p.r * 0.7; pondSpots.push({ x: p.x + Math.cos(a) * d, y: 0.11, z: p.z + Math.sin(a) * d, zone: 'pond' }); }
    }
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    shuffle(roadSpots); shuffle(waterSpots); shuffle(pondSpots);
    const hillSpots = shuffle(this.hillSpots.map((h) => ({ x: h.x, y: h.y, z: h.z, noOverlap: true, zone: 'hill' })));
    const spotOf = (zone) => zone === 'edge' ? genEdge() : zone === 'far' ? genFar() : zone === 'road' ? roadSpots.pop() : zone === 'water' ? waterSpots.pop() : zone === 'pond' ? pondSpots.pop() : hillSpots.pop();
    const withFace = (it, sp) => { if (!sp) return sp; if (it.face && sp.faceRy !== undefined) return { x: sp.bridgeX, z: sp.bridgeZ, ry: sp.faceRy, noOverlap: true, zone: 'water' }; return sp; };
    // ① 최소 개수가 있는 것(풍차·물레방아·밭·다리·잔해)부터 — 자리가 남아 있을 때
    for (const it of set) for (let k = 0; k < (it.min || 0); k++) for (let tries = 0; tries < 60; tries++) { const zone = it.zone === 'any' ? (rnd() < 0.5 ? 'edge' : 'far') : it.zone; const sp = withFace(it, spotOf(zone)); if (sp && put(it, sp)) break; }
    // ② 판 둘레 · 먼 땅 (개수는 위 조절값)
    for (let i = 0, n = 0; i < 9000 && n < N_EDGE; i++) { const sp = genEdge(); if (!sp) continue; const it = pick(pools.edge); if (!it) break; if (put(it, sp)) n++; }
    for (let i = 0, n = 0; i < 11000 && n < N_FAR; i++) { const sp = genFar(); if (!sp) continue; const it = pick(pools.far); if (!it) break; if (put(it, sp)) n++; }
    // ③ 길 옆(후보의 65%) · 물가 · 연못 위 · 언덕 위
    while (roadSpots.length) { const sp = roadSpots.pop(); if (rnd() > 0.65) continue; const it = pick(pools.road); if (!it) break; put(it, sp); }
    while (waterSpots.length) { const sp = waterSpots.pop(); const it = pick(pools.water); if (!it) break; put(it, withFace(it, sp)); }
    while (pondSpots.length) { const sp = pondSpots.pop(); const it = pick(pools.pond); if (!it) break; put(it, sp); }
    while (hillSpots.length) { const sp = hillSpots.pop(); if (rnd() > 0.6) continue; const it = pick(pools.hill); if (!it) break; put(it, sp); }
    this.sceneryMeshes = col.flush(null, true); // 장식 전체 = 메시 2개(그림자 있는 판 둘레 / 없는 먼 땅)
    this.sceneryCount = placed;
  }
  // 옛 코드 도형 장식(모델이 없을 때): 침엽수·둥근 나무·바위·꽃. 길·자리와 안 겹치는 곳에 고정 시드로. 전부 인스턴스
  buildSceneryFallback(ponds, rnd) {
    const road = NGN.map.ground.points, slots = NGN.map.SLOTS, B = NGN.map.BOUNDS;
    const free = (x, y) => {
      for (const p of road) if ((p[0] - x) ** 2 + (p[1] - y) ** 2 < 220 ** 2) return false;
      for (const s of slots) if ((s.x - x) ** 2 + (s.y - y) ** 2 < 260 ** 2) return false;
      return true;
    };
    const trunks = [], cones1 = [], cones2 = [], rounds1 = [], rounds2 = [], rocks1 = [], rocks2 = [], flowers = [[], [], [], []];
    let placed = 0;
    // 판 둘레 ±3칸에 110개 + 늘어난 땅(가로 ±20 · 세로 ±35칸)에 140개 더 — 전부 인스턴스라 그리기 횟수는 그대로
    for (let i = 0; i < 1400 && placed < 250; i++) {
      const far = placed >= 110;
      const mx = far ? 2000 : 300, my = far ? 3500 : 300;
      const x = B.minX - mx + rnd() * (B.maxX - B.minX + 2 * mx), y = B.minY - my + rnd() * (B.maxY - B.minY + 2 * my);
      if (far && x > B.minX - 300 && x < B.maxX + 300 && y > B.minY - 300 && y < B.maxY + 300) continue; // 먼 쪽은 판 둘레를 피한다
      if (!free(x, y)) continue;
      if (ponds.some(([px, py, pr]) => (x - px) ** 2 + (y - py) ** 2 < (pr + 150) ** 2)) continue;
      placed++;
      const p = this.toWorld(x, y);
      const roll = rnd(), s = 0.85 + rnd() * 0.5, ry = rnd() * 6;
      if (roll < 0.45) { trunks.push({ x: p.x, y: 0.5 * s, z: p.z, s, cast: true }); cones1.push({ x: p.x, y: 1.35 * s, z: p.z, s, ry, cast: true }); cones2.push({ x: p.x, y: 2.05 * s, z: p.z, s, ry, cast: true }); }
      else if (roll < 0.68) { trunks.push({ x: p.x, y: 0.5 * s, z: p.z, s, cast: true }); (rnd() < 0.5 ? rounds1 : rounds2).push({ x: p.x, y: 1.5 * s, z: p.z, s, cast: true }); }
      else if (roll < 0.85) { for (let k = 0; k < 4; k++) flowers[Math.floor(rnd() * 4)].push({ x: p.x + (rnd() - .5) * 1.2, y: 0.2, z: p.z + (rnd() - .5) * 1.2 }); }
      else (rnd() < 0.5 ? rocks1 : rocks2).push({ x: p.x, y: 0.3, z: p.z, sx: 1, sy: 0.62 + rnd() * 0.4, sz: 0.9, rx: rnd() * 3, ry: rnd() * 3, rz: rnd(), cast: true });
    }
    instanced(new THREE.CylinderGeometry(0.13, 0.19, 1.0, 6), this.M.trunk, trunks, this.root);
    instanced(new THREE.ConeGeometry(0.72, 1.15, 7), this.M.leaf, cones1, this.root);
    instanced(new THREE.ConeGeometry(0.52, 0.95, 7), this.M.leafAlt, cones2, this.root);
    const autumn = NGN.litMat({ color: 0xC9803A }), autumn2 = NGN.litMat({ color: 0xA8A03A });
    instanced(new THREE.SphereGeometry(0.75, 9, 7), autumn, rounds1, this.root);
    instanced(new THREE.SphereGeometry(0.75, 9, 7), autumn2, rounds2, this.root);
    const rockGeo = new THREE.DodecahedronGeometry(0.42, 0);
    instanced(rockGeo, this.M.stone, rocks1, this.root); instanced(rockGeo, this.M.stoneDark, rocks2, this.root);
    const flowerGeo = new THREE.SphereGeometry(0.14, 6, 5);
    [0xE86A8A, 0xF2D25A, 0xF2F2F2, 0x9B6FE0].forEach((c, i) => instanced(flowerGeo, NGN.litMat({ color: c }), flowers[i], this.root));
    this.sceneryCount = placed;
  }

  // ---------- 카메라 ----------
  resize() {
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    this.renderer.setSize(w, h, false);
    if (this.post) { this.post.setPixelRatio(this.renderer.getPixelRatio()); this.post.setSize(w, h); }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.placeCamera();
  }

  // ---------- 잔존물(M-4-5) ----------
  // 적이 죽은 자리·성이 맞은 자리에 **그을음이 땅에 남는다.** 타워 디펜스는 같은 길을 계속 보므로,
  // 싸운 흔적이 남으면 "여기서 한참 버텼다"가 눈에 보인다(전투가 지나가도 화면이 리셋되지 않는다).
  // 🛑 자국이 쌓여도 **그리기는 1회**여야 한다 → 납작한 사각형 하나를 InstancedMesh 로 64장 돌려 쓴다(링 버퍼).
  //    three.js 의 인스턴스 색은 색만 바꿀 수 있고 투명도는 못 바꾸므로, 사라질 때는 **크기를 줄여서** 없앤다.
  buildDecals() {
    this.decals = null;
    const tex = this.models && this.models.fxTexture;
    if (!tex || !THREE.InstancedMesh) return;
    const N = 64;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2); // 땅에 눕힌다
    // 파티클 아틀라스(4×4)의 '연기' 칸으로 UV 를 옮긴다 — 그을음처럼 가장자리가 부드러운 그림이다
    const CELL = (NGN.CELL && NGN.CELL.smoke) || 1, col = CELL % 4, row = Math.floor(CELL / 4);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + uv.getX(i)) * 0.25, (row + uv.getY(i)) * 0.25);
    uv.needsUpdate = true;
    // 🛑 불투명도·크기·높이 셋 다 실측하며 올렸다. 처음 값(0.42 · 1.5 · y 0.045)으로는 **화면에서 아예 안 보였다** —
    //    연기 그림이 가장자리가 매우 옅어 실효 크기가 작고, 땅 타일에 높낮이가 있어 낮게 깔면 묻힌다
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.7, depthWrite: false, color: 0xFFFFFF });
    const m = new THREE.InstancedMesh(geo, mat, N);
    m.frustumCulled = false; m.renderOrder = 2;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < N; i++) m.setMatrixAt(i, zero);
    this.root.add(m);
    this.decals = m; this.decalN = N; this.decalAt = 0;
    this.decalAge = new Float32Array(N).fill(1e9); // 큰 값 = 이미 사라진 자리
    this.decalLife = new Float32Array(N);
    this.decalSize = new Float32Array(N);
    this.decalPos = new Float32Array(N * 3);
    this.decalRot = new Float32Array(N);
    this._dm = new THREE.Matrix4(); this._dq = new THREE.Quaternion(); this._dv = new THREE.Vector3(); this._ds = new THREE.Vector3();
  }
  // 자국 하나 남기기. at = 세계 좌표(THREE.Vector3), size = 지름, color = 색, life = 몇 초 남을지
  addDecal(at, size, color, life) {
    const m = this.decals; if (!m) return;
    const i = this.decalAt; this.decalAt = (i + 1) % this.decalN;
    this.decalPos[i * 3] = at.x; this.decalPos[i * 3 + 1] = 0.13; this.decalPos[i * 3 + 2] = at.z; // 땅 타일의 높낮이(tile-bump 등)보다 위 — 더 낮게 두면 묻힌다
    this.decalRot[i] = Math.random() * Math.PI * 2; // 같은 그림이 반복돼 보이지 않게 돌려 놓는다
    this.decalSize[i] = size || 2.6;
    this.decalLife[i] = life || 11;
    this.decalAge[i] = 0;
    if (m.setColorAt) { m.setColorAt(i, (this._dc || (this._dc = new THREE.Color())).set(color === undefined ? 0x2A2118 : color)); if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  // 매 프레임: 나이를 먹이고, 마지막 25% 구간에서 오그라들며 사라진다
  updateDecals(dt) {
    const m = this.decals; if (!m) return;
    let dirty = false;
    for (let i = 0; i < this.decalN; i++) {
      const life = this.decalLife[i];
      if (this.decalAge[i] > life) continue;
      this.decalAge[i] += dt;
      const age = this.decalAge[i], left = life - age;
      let s = this.decalSize[i];
      // 🛑 나타나고 사라지는 시간은 **절대 시간**이어야 한다. 처음엔 수명 대비 비율(6%·25%)로 했다가,
      //    수명이 긴 자국(보스 20초)은 나타나는 데만 1.2초가 걸려 **화면에서 안 보였다**(실측하다 발견).
      if (age < 0.18) s *= age / 0.18;                     // 0.18초에 걸쳐 커지며 나타난다
      else if (left < 1.6) s *= Math.max(0, left / 1.6);   // 마지막 1.6초 동안 오그라들며 사라진다
      this._dv.set(this.decalPos[i * 3], this.decalPos[i * 3 + 1], this.decalPos[i * 3 + 2]);
      this._dq.setFromAxisAngle(UP, this.decalRot[i]);
      this._ds.set(s, 1, s);
      m.setMatrixAt(i, this._dm.compose(this._dv, this._dq, this._ds));
      dirty = true;
    }
    if (dirty) m.instanceMatrix.needsUpdate = true;
  }

  // ---------- 빛번짐(M-4-1) ----------
  // 밝은 곳이 화면으로 번져 나오는 효과. 눈으로 보면 "빛난다"고 느끼는 것의 정체다.
  // 화면에 바로 그리지 않고 그림을 한 장 떠서 손본 뒤 내보내는 방식(후처리)이라, **맨 끝에 감마 보정을 반드시 넣어야 한다** —
  // 안 넣으면 지금 색 설정(sRGB 출력)이 중간 그림에는 적용되지 않아 화면이 통째로 어두워진다.
  // 🛑 폰에서 제일 비싼 것이 이것이다. 그래서 자동 품질의 **가장 먼저 빠지는 단계**(4)로 두었다.
  buildPost() {
    if (this.post || !THREE.EffectComposer || !THREE.UnrealBloomPass) return;
    const w = this.stage.clientWidth || 1, h = this.stage.clientHeight || 1;
    const T = NGN.BLOOM || {};
    const c = new THREE.EffectComposer(this.renderer);
    c.addPass(new THREE.RenderPass(this.scene, this.camera));
    // 세기 · 번지는 반경 · 문턱(이 밝기를 넘는 곳만 번진다).
    // 🔑 **문턱이 이 게임의 전부다.** 우리 화면은 밝은 배경(연두 잔디·흰 길·하늘)이라,
    //    흔히 쓰는 문턱 0.8 대를 쓰면 **길과 잔디가 통째로 번져 안개 낀 화면**이 된다(실측: scratchpad/m4_thresh.png 의 B).
    //    문턱을 1.3 까지 올리면 조명을 받아 정말 밝은 것(흰 타워·얼음·섬광·번개)만 빛나고 길은 그대로 있다.
    //    네 값(번짐 없음 / 0.82 / 1.00 / 1.30)을 같은 장면에서 찍어 나란히 놓고 문턱을 골랐고(scratchpad/m4_thresh.png),
//    세기는 문턱을 고정한 채 0.62·0.95·1.35 를 다시 비교해 골랐다(scratchpad/m4_strength.png) —
//    0.62 는 눈으로 차이를 못 느끼고, 1.35 는 흰 길까지 번진다. 0.95 가 "빛나는 것은 빛나되 길은 길로 남는" 지점이다.
    const b = new THREE.UnrealBloomPass(new THREE.Vector2(w, h),
      T.strength === undefined ? 0.95 : T.strength,
      T.radius === undefined ? 0.40 : T.radius,
      T.threshold === undefined ? 1.25 : T.threshold);
    c.addPass(b);
    c.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader)); // 🛑 반드시 맨 끝
    c.setPixelRatio(this.renderer.getPixelRatio());
    c.setSize(w, h);
    this.post = c; this.bloom = b;
    this.postOn = this.quality >= 4;
  }
  // 판 전체가 화면에 들어오는 가장 가까운 거리를 계산한다. 세로 폰에서는 거의 언제나 가로폭이 한계라(폭 35 단위 ≈ 390px) 그 거리가 된다.
  // 기울기 62°(세로) — 72° 는 너무 수직이라 타워가 원판처럼 보였다. 62° 면 옆면이 보여 "탑"으로 읽힌다.
  // 실측(2026-09-06, 390×844, 20개 지도): 위 줄 대비 아래 줄 타워 폭 비율 1.03~1.10(옛 42°·72° 는 1.04~1.13 에 각도 차이까지 겹쳤다), 판 x 8~382 · y 134~637(HUD·카드 바와 안 겹침)
  // 카메라 방향(camAngle)에 따라 판의 가로·세로 폭이 달라진다 — 네 모서리를 돌려 재고, 그 폭으로 거리를 정한다.
  // 가로로 긴 지도(스테이지 9·10·14·15 등)는 setMap 이 기본 방향을 90° 돌려 긴 변을 세로로 세운다(세로 폰은 가로가 한계라 그쪽이 더 크게 나온다)
  // 2026-09-06 성·동굴(castleBox·portalBox, 세계 좌표)의 네 모서리도 함께 돌려 잰다 — 출구가 판 끝(x=0)이면 성 절반이 화면 밖으로 나갔다(코디네이터 실측).
  // 돌린 좌표계(rx=화면 가로, rz=카메라 쪽)에서 최소·최대를 잡아 폭·깊이·중심을 돌려준다. 중심은 placeCamera 가 look 지점으로 쓴다(판 중심이 아니라 판+성+동굴의 중심).
  // 모델이 없을 땐 상자가 없어 옛 계산과 같다(판 모서리 넷 → 중심 0)
  boardExtent(angle) {
    const c = Math.cos(angle), s = Math.sin(angle), hw = this.width / 2, hd = this.depth / 2;
    const pts = [[hw, hd], [hw, -hd], [-hw, hd], [-hw, -hd]];
    let h = 0;
    for (const b of [this.castleBox, this.portalBox]) if (b) { pts.push([b.min.x, b.min.z], [b.min.x, b.max.z], [b.max.x, b.min.z], [b.max.x, b.max.z]); h = Math.max(h, b.max.y); }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [px, pz] of pts) { const rx = px * c - pz * s, rz = px * s + pz * c; minX = Math.min(minX, rx); maxX = Math.max(maxX, rx); minZ = Math.min(minZ, rz); maxZ = Math.max(maxZ, rz); }
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    // 돌린 중심을 세계 좌표로 되돌린다(화면 가로축 = (c, -s) · 카메라 쪽 = (s, c))
    return { w: maxX - minX, d: maxZ - minZ, h, center: new THREE.Vector3(cx * c + cz * s, 0, -cx * s + cz * c) };
  }
  camDist(angle) {
    const fov = this.camera.fov * Math.PI / 180, aspect = this.camera.aspect || 0.5;
    const portrait = aspect < 1;
    const pitch = (portrait ? 62 : 56) * Math.PI / 180;
    const e = this.boardExtent(angle);
    // 여백: 가로 2.4칸(가장자리 자리 원판이 잘리지 않을 만큼) · 세로 4칸
    // 성 꼭대기(e.h)는 화면 세로로 h·cos(기울기)만큼 더 올라온다 — 그만큼 세로 여백에 더한다(가로 여백은 그대로 2.4칸)
    const needV = e.d * Math.sin(pitch) + e.h * Math.cos(pitch) + (portrait ? 4 : 5), needH = e.w + (portrait ? 2.4 : 8);
    const distV = (needV / 2) / Math.tan(fov / 2), distH = (needH / 2) / Math.tan(fov / 2) / aspect;
    return Math.max(distV, distH);
  }
  placeCamera() {
    if (this.lobbyMode) return this.placeLobbyCamera(); // 로비에서는 판이 아니라 모형에 맞춘다
    const aspect = this.camera.aspect;
    const portrait = aspect < 1;
    const pitch = (portrait ? 62 : 56) * Math.PI / 180;
    const dist = this.camDist(this.camAngle) / this.zoom;
    const cy = Math.sin(pitch) * dist, cr = Math.cos(pitch) * dist;
    const off = portrait ? 4.5 : 1.5;
    // look 지점 = 판+성+동굴을 합친 범위의 중심 + 카메라 쪽 오프셋(off — 판을 화면 위쪽에 두는 옛 규칙 그대로)
    const look = this.boardExtent(this.camAngle).center.add(new THREE.Vector3(Math.sin(this.camAngle) * off, 0, Math.cos(this.camAngle) * off));
    this.camera.position.set(look.x + Math.sin(this.camAngle) * cr, cy, look.z + Math.cos(this.camAngle) * cr);
    this.camera.lookAt(look);
    this.camBase.copy(this.camera.position); // 흔들림(shake)의 기준 위치
    this.camQuat = (this.camQuat || new THREE.Quaternion()).copy(this.camera.quaternion); // 흔들림은 이 방향에서 회전만 얹는다
    this.dist = dist;
    // 안개는 껐다(2026-09-06). 남겨 두면(fog 가 있으면) 판 너머(카메라 거리의 1.15배)부터만
    if (this.scene.fog) { this.scene.fog.near = dist * (this.quality <= 0 ? 1.05 : 1.15); this.scene.fog.far = dist * (this.quality <= 0 ? 1.5 : 2.0); }
    this.camera.near = Math.max(1, dist * 0.05); this.camera.far = dist * 3;
    this.camera.updateProjectionMatrix();
  }

  // ---------- 자동 품질(3 최고 … 0 최저) ----------
  // 🔴 2026-09-07: 옛 코드에는 **내리는 길만 있고 올리는 길이 없었다.** 한 판에서 잠깐 버벅이면 그 뒤로 계속
  //    그림자 없는 납작한 화면을 봐야 했다(페이지를 새로 열기 전에는 안 돌아온다).
  // 🔴 게다가 내리는 기준(17ms)이 **60Hz 화면의 정상 프레임(16.7ms)과 거의 붙어 있어** 멀쩡한 기기도 쉽게 떨어졌다.
  //    이제 목표는 60fps — 22ms(45fps)보다 느릴 때만 내리고, 17.5ms(57fps)보다 빠른 상태가 오래 이어지면 올린다.
  //    깜빡임(오르내리기 반복)은 넷으로 막는다: ⑴올리는 기준을 내리는 기준과 4.5ms 떨어뜨리고
  //    ⑵좋은 상태가 10초 이어져야 올리며 ⑶한 번 올렸다 다시 떨어지면 **그 판에서는 다시 안 올리고**
  //    ⑷가장 높은 자리에서 두 판 떨어지면 그 단계를 이 기기의 상한으로 굳힌다.
  watchFrame(dtMs, now) {
    // 🛑 이 함수는 **웨이브가 도는 동안에만** 불린다(main.js: game.wave && !paused).
    //    웨이브 사이의 빈 시간을 "여유로웠던 시간"으로 착각하면 안 되므로, 1초 넘게 끊겼으면 세던 것을 버린다
    if (this.lastWatch && now - this.lastWatch > 1000) { this.frameTimes.length = 0; this.goodSince = 0; }
    this.lastWatch = now;
    if (!this.warmup) this.warmup = now + 4000; // 시작 직후 로딩 스파이크는 재지 않는다
    if (now < this.warmup) return;
    this.frameTimes.push(dtMs); if (this.frameTimes.length > 30) this.frameTimes.shift();
    if (this.frameTimes.length < 30) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    if (avg > 22) { // 느리다 → 한 단계 내린다
      this.goodSince = 0;
      if (this.quality > 0 && now - this.lastDrop > 5000) {
        if (this.raisedOnce) this.qualityLocked = true; // 올렸다가 도로 떨어졌다 = 이 판에서는 다시 안 올린다
        // 가장 높은 자리에서 떨어진 것이 두 판째면 이 기기의 상한을 한 칸 내려 굳힌다(판마다 켰다 끄기를 반복하지 않게).
        // 🛑 한 판에 한 번만 센다 — 안 그러면 3→2→1→0 연속 낙하가 전부 세어져 한 번 무거웠다는 이유로 상한이 바닥에 굳는다
        if (this.quality === this.qualityCap && !this.cappedThisRound) {
          this.cappedThisRound = true;
          if (++this.dropsAtCap >= 2) { this.qualityCap = this.quality - 1; this.dropsAtCap = 0; }
        }
        this.setQuality(this.quality - 1, '낮춤');
        this.lastDrop = now; this.frameTimes.length = 0;
      }
      return;
    }
    if (avg > 17.5) { this.goodSince = 0; return; } // 어중간하면 아무것도 안 한다
    if (this.quality >= this.qualityCap || this.qualityLocked) return;
    if (!this.goodSince) { this.goodSince = now; return; }
    if (now - this.goodSince > 10000 && now - this.lastDrop > 8000) { // 여유가 10초 이어졌다 → 한 단계 올린다
      this.setQuality(this.quality + 1, '올림'); this.raisedOnce = true; this.goodSince = 0; this.frameTimes.length = 0;
      // 🛑 올린 직후 1.5초는 재지 않는다. 빛번짐을 처음 켜는 순간 **셰이더를 컴파일하느라 한 프레임이 크게 튀는데**,
      //    그걸 "이 기기는 못 버틴다"로 오해해서 1.4초 만에 도로 꺼 버렸다(실측하다 발견)
      this.warmup = now + 1500;
    }
  }
  // 단계별 설정을 한곳에 모은다(내릴 때와 올릴 때가 어긋나지 않게).
  // 🔴 2026-09-07 2판 — **순서를 다시 짰다.** 1판에서는 무거워지면 그림자가 꺼졌는데,
  //    화면이 납작해 보이는 가장 큰 원인이 바로 그림자다. 빛번짐을 얻고 그림자를 잃으면 **손해다**(실측 확인).
  // 🔑 그래서 "그림자를 끄는 칸"을 **없앴다.** 대신 그림자를 싸게 만든다 —
  //    우리 해는 움직이지 않고 나무·바위·타워도 안 움직인다. 그런데 three.js 는 그림자를 **매 프레임 다시 굽고 있었다.**
  //    한 번 굽고 고정하면 값이 1/3 이 된다(실측 0.13ms → 0.04ms). 대가는 **움직이는 적의 그림자 하나뿐**이다.
  //   4 = 픽셀 상한  · 그림자 매프레임 · 빛번짐 O   ← 여유가 확인된 기기만 여기까지 올라온다
  //   3 = 픽셀 상한  · 그림자 매프레임 · 빛번짐 X   ← **여기서 시작한다**(빛번짐은 기본 꺼짐)
  //   2 = 픽셀 1.0   · 그림자 매프레임 · 빛번짐 X
  //   1 = 픽셀 1.0   · 그림자 **고정**  · 빛번짐 X   ← 적 그림자만 포기, 배경·타워 그림자는 그대로
  //   0 = 픽셀 0.75  · 그림자 고정      · 빛번짐 X   ← 가장 낮은 칸에서도 그림자는 살아 있다
  //   🛑 그림자를 아예 끄는 것은 **설정에서 사장님이 직접 끌 때뿐**이다(자동으로는 절대 안 끈다).
  // 단계별 픽셀 배율. 예전엔 「3단 이상=상한 · 1~2단=1.0 · 0단=0.75」 세 칸뿐이라
  // 좋은 폰이든 느린 폰이든 거의 같은 흐릿한 화면을 봤다(폰 상한이 1.5 였으므로).
  // 이제 칸마다 다르게 준다 — 폰 2.5 / 2.0 / 1.5 / 1.25 / 1.0 (0단은 그래도 1.0 을 지킨다).
  // 🛑 느린 폰은 watchFrame 이 알아서 칸을 내린다. 여기서 겁먹고 낮게 시작할 이유가 없다.
  pixelFor(q) {
    const cap = this.maxPixelRatio;
    const f = q >= 4 ? 1.0 : q >= 3 ? 0.8 : q >= 2 ? 0.6 : q >= 1 ? 0.5 : 0.4;
    return Math.min(devicePixelRatio, Math.max(1.0, cap * f));
  }
  setQuality(q, why) {
    q = Math.max(0, Math.min(4, q));
    if (q === this.quality) return;
    this.quality = q;
    this.renderer.setPixelRatio(this.pixelFor(q));
    this.setShadowStatic(q <= 1);
    this.postOn = (q >= 4) && !!this.post;
    this.placeCamera();
    console.log('품질 ' + (why || '바꿈') + ' →', q, '픽셀비율', this.renderer.getPixelRatio(),
      '그림자', this.renderer.shadowMap.enabled ? (this.shadowStatic ? '고정' : '매프레임') : '꺼짐', '빛번짐', this.postOn);
  }
  // 그림자를 "한 번 굽고 고정" 으로 바꾼다. 고정 동안에는 움직이는 적이 그림자를 지지 않게 한다 —
  // 안 그러면 적이 지나간 자리에 그림자가 **얼룩처럼 남는다**(그림자 그림이 갱신되지 않으므로)
  setShadowStatic(on) {
    on = !!on;
    if (this.shadowStatic === on) return;
    this.shadowStatic = on;
    this.renderer.shadowMap.autoUpdate = !on;
    if (this.onShadowStatic) this.onShadowStatic(on); // 렌더러가 적 메시의 그림자를 켜고 끈다
    this.markShadowDirty();
  }
  // 판이 바뀌거나 타워를 짓는 등 **그림자에 나올 것이 달라졌을 때** 부른다. 고정 모드에서 딱 한 프레임만 다시 굽는다
  markShadowDirty() { if (this.renderer.shadowMap.enabled) this.renderer.shadowMap.needsUpdate = true; }
  lowerQuality() { this.setQuality(this.quality - 1, '낮춤'); }
  // 새 판이 시작될 때: 품질을 이 기기의 상한까지 되돌리고 측정을 처음부터 다시 한다.
  // 지난 판이 유난히 무거웠을 뿐일 수 있으니 새 판에서 한 번 더 시험해 본다(두 판 연속 실패하면 watchFrame 이 상한을 내린다)
  resetQualityWatch() {
    this.raisedOnce = false; this.qualityLocked = false; this.goodSince = 0; this.cappedThisRound = false;
    this.frameTimes.length = 0; this.warmup = 0; this.lastDrop = 0; this.lastWatch = 0;
    const start = Math.min(this.qualityCap, this.qualityBase);
    if (this.quality < start) this.setQuality(start, '판 시작·되돌림');
  }
  // 매 프레임: 카메라 흔들림 감쇠(camBase + 난수 오프셋) · 성 피격 움찔(성문·깃발) · 그리기
  render() {
    const now = performance.now(), dt = Math.min(0.1, (now - (this.lastT || now)) / 1000); this.lastT = now;
    // 흔들림: trauma 를 시간으로 깎고, 화면에는 그 제곱을 쓴다. 위치는 건드리지 않고 방향만 돌린다
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 1.6); // 약 0.6초면 잦아든다
      const amp = this.trauma * this.trauma * (this.shakeScale === undefined ? 1 : this.shakeScale);
      if (amp > 0.0005 && this.camQuat) {
        if (!this.noise && THREE.SimplexNoise) this.noise = new THREE.SimplexNoise();
        const t = now * 0.021; // 잡음을 훑는 속도 — 높이면 잘고 빠르게, 낮추면 크고 느리게 흔들린다
        const n = this.noise ? (r) => this.noise.noise(t, r) : () => 0;
        const MAX = 0.026; // 라디안(약 1.5°). 화각이 22° 로 좁아 이보다 크면 화면이 휙휙 돈다
        this.camera.quaternion.copy(this.camQuat);
        this.camera.rotateZ(n(11.3) * amp * MAX * 1.35); // roll(화면이 갸우뚱) 이 가장 잘 보인다
        this.camera.rotateX(n(31.7) * amp * MAX);        // pitch
        this.camera.rotateY(n(57.1) * amp * MAX);        // yaw
      }
      this.shaking = true;
    } else if (this.shaking) { if (this.camQuat) this.camera.quaternion.copy(this.camQuat); this.shaking = false; }
    if (this.hitT > 0) {
      this.hitT = Math.max(0, this.hitT - dt);
      const k = this.hitT / 0.3;
      if (this.gateMesh) this.gateMesh.rotation.y = Math.sin(now * 0.05) * 0.14 * k;
      for (const f of this.flagMeshes) f.rotation.z = Math.sin(now * 0.04) * 0.22 * k;
    }
    this.updateDecals(dt); // 잔존물(그을음)이 나이를 먹고 서서히 사라진다
    this.breatheSlots(now); // 빈 자리 금테가 숨 쉰다(인스턴스 색만 갱신 — 그리기 횟수 0 증가)
    if (this.stageMark && this.stageMark.visible) { // 로비 표지: 천천히 돌고 살짝 오르내린다
      this.stageMark.rotation.y += dt * 0.35;
      this.stageMark.position.y = this.stageMarkY + Math.sin(now * 0.0011) * 0.5;
    }
    if (this.postOn && this.post) this.post.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
};
