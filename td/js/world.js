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

// 명도 세 층(2026-09-06 화면 설계 2판 — 사장님 "뿌옇고 길이 또렷하게 안 보여"): 길(road) = 가장 밝게 + 어두운 테두리(roadEdge) · 판 안 잔디(grass) = 중간 · 판 밖(outer) = 어둡게.
// 전에는 길과 잔디의 명도가 거의 같았다(풀밭 흙길 0xA8814D vs 잔디 0x6BA34A · 눈은 둘 다 흰색). 테마마다 세 층의 밝기 차가 확실히 나게 골랐다
NGN.C = {
  sky: 0x4A6B3F, fog: 0xB4D3DF,
  grass: 0x7FA76A, grassAlt: 0x789F63, outer: 0x4A6B3F, outerAlt: 0x45643B, cliff: 0x8A7452,
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
const DEG = Math.PI / 180;

NGN.World = class World {
  constructor(stage) {
    this.stage = stage;
    this.isMobile = ('ontouchstart' in window) || innerWidth < 700;
    this.quality = 3; // 3 최고 … 0 최저
    this.scene = new THREE.Scene();
    // 🔴 안개를 끈다(2026-09-06 화면 설계 2판). 카메라가 판에서 229 떨어져 있는데 안개가 263 부터 껴서 판 뒤쪽이 하늘색 안개에 잠겼다(배포본 실측 234~407).
    //    땅이 화면 끝까지 채우므로 안개 없이도 지평선이 안 보인다. 판이 안개에 잠기면 안 된다
    this.scene.fog = null;

    // 화각 22° — 좁은 화각 + 멀리서 당겨 찍기(망원). 42° 였을 때는 화면 위쪽 줄이 거의 수직으로 내려다보여 납작하고 작게,
    // 아래쪽 줄은 옆이 보여 크게 나왔다(사장님 지적 2026-09-06 "앞쪽 타워는 왜 작게 나와"). 좁히면 판 전체가 같은 각도로 보인다
    this.camera = new THREE.PerspectiveCamera(22, 1, 1, 800);
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.isMobile, powerPreference: 'high-performance' });
    this.maxPixelRatio = this.isMobile ? 1.5 : 2; // 폰은 3배로 그리면 픽셀이 9배 — 상한을 둔다
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.maxPixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    // 🔴 톤매핑을 끈다(2026-09-06 화면 설계 2판). ACES 는 실사 영화용 — 색을 부드럽게 뭉개서 카툰풍엔 정반대였고 노출 0.86 으로 전체가 어두웠다.
    //    끄면 꼭짓점 색(속성색)이 그대로 나온다. "노출 1.0~1.1" 은 톤매핑이 없으면 적용이 안 되니 조명 세기를 그만큼 올린다(0.46→0.55 · 0.92→1.0)
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    stage.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xE4F0F8, 0x46552F, 0.55));
    const sun = new THREE.DirectionalLight(0xFFF0D2, 1.0);
    sun.position.set(20, 30, 14);
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

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.camAngle = 0;
    this.zoom = 1;
    this.frameTimes = []; this.lastDrop = 0;
    // 창고 모델(attachModels 로 들어온다) · 카메라 흔들림 · 성 피격 · 불 자리(렌더러가 읽는다)
    this.models = null; this.parts = null;
    this.camBase = new THREE.Vector3(); this.shakeT = 0; this.shakeS = 0; this.hitT = 0;
    this.fireSpots = []; this.castleFireSpots = []; this.flagMeshes = []; this.castleFires = [[], [], []]; this.damageStage = 0;
    addEventListener('resize', () => this.resize());
    this.setMap(NGN.map);
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
    const C = Object.assign({}, NGN.C, NGN.THEMES[map.theme] || {});
    this.C = C; this.theme = NGN.THEMES[map.theme] ? map.theme : 'grass';
    this.scene.background = new THREE.Color(C.sky);
    if (this.scene.fog) this.scene.fog.color = new THREE.Color(C.fog);
    const mat = (color, opts) => new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));
    this.M = {
      grass: mat(C.grass), grassAlt: mat(C.grassAlt), outer: mat(C.outer), outerAlt: mat(C.outerAlt), cliff: mat(C.cliff), road: mat(C.road), roadEdge: mat(C.roadEdge),
      stone: mat(C.stone), stoneDark: mat(C.stoneDark), slot: mat(C.slot), wood: mat(C.wood),
      leaf: mat(C.leaf), leafAlt: mat(C.leafAlt), trunk: mat(C.trunk),
      air: new THREE.MeshBasicMaterial({ color: C.air, transparent: true, opacity: 0.55 }),
      shot: new THREE.MeshBasicMaterial({ color: C.shot }), spark: new THREE.MeshBasicMaterial({ color: C.spark }),
      water: new THREE.MeshLambertMaterial({ color: C.water, transparent: true, opacity: 0.85 }),
      pip: new THREE.MeshLambertMaterial({ color: 0xE8C34A, emissive: 0xE8C34A, emissiveIntensity: 0.35 }),
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
    if (pack === 'nature' || pack === 'space') { const base = (this.parts.scenery && this.parts.scenery.natureColors && this.parts.scenery.natureColors[this.theme]) || {}; Q.recolor = Object.assign({}, base, P.recolor || {}); }
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
    const board = new THREE.Mesh(new THREE.BoxGeometry(BW, 0.3, BD), this.M.grass);
    board.position.y = -0.15; board.receiveShadow = true; this.root.add(board);
    const TILE = 3, tiles = [], outerTiles = [];
    for (let x = -W / 2 + TILE / 2; x < W / 2; x += TILE) for (let z = -D / 2 + TILE / 2; z < D / 2; z += TILE) {
      if ((Math.round(x / TILE) + Math.round(z / TILE)) % 2) continue;
      const inside = Math.abs(x) < BW / 2 - TILE * 0.6 && Math.abs(z) < BD / 2 - TILE * 0.6;
      (inside ? tiles : outerTiles).push({ x, y: inside ? 0.02 : -0.47, z });
    }
    instanced(new THREE.BoxGeometry(TILE, 0.06, TILE), this.M.grassAlt, tiles, this.root);
    instanced(new THREE.BoxGeometry(TILE, 0.06, TILE), this.M.outerAlt, outerTiles, this.root);
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
    const C = this.C, cliffP = this.theme === 'snow' ? { p: 'nature/cliff_block_stone', recolor: { grass: hexOf(C.outerAlt), stone: hexOf(C.cliff) } } : { p: 'nature/cliff_block_rock', recolor: { grass: hexOf(C.outerAlt), dirt: hexOf(C.cliff) } };
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
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
    cloth.position.set(pos.x + 0.45, 2.05, pos.z);
    this.root.add(pole, cloth);
  }

  // 자리(2026-09-06 화면 설계 2판): 흰 원판 + 금색 테두리 링. 원판은 InstancedMesh 하나(색으로 선택 표시), 금테는 조명을 안 받는 Basic 재질 InstancedMesh 하나 — 자리 수와 무관하게 그리기 2회.
  // 비어 있는 자리는 금테가 은은히 숨 쉰다(render 에서 인스턴스 색 밝기를 사인파로) — "여기 지으라고". 타워가 서면(setSlotBuilt) 숨쉬기를 멈추고 얌전한 금색으로
  buildSlots() {
    this.slotMeshes = [];
    const geo = new THREE.CylinderGeometry(1.5, 1.65, 0.3, 14);
    const pips = [], discs = [], rings = [];
    this.slotBuilt = []; this.slotHi = [];
    for (const s of NGN.map.SLOTS) {
      const p = this.toWorld(s.x, s.y, 0.15);
      discs.push({ x: p.x, y: p.y, z: p.z, cast: true }); rings.push({ x: p.x, y: 0.32, z: p.z });
      this.slotBuilt[s.id] = false; this.slotHi[s.id] = false;
      const cover = NGN.map.coverageFor(s.id, 800, false);
      const n = cover > 2600 ? 3 : cover > 1900 ? 2 : 1;
      for (let i = 0; i < n; i++) pips.push({ x: p.x + (i - (n - 1) / 2) * 0.45, y: 0.34, z: p.z + 0.95 });
    }
    this.slotDisc = instanced(geo, this.M.slot, discs, this.root);
    const ringGeo = new THREE.RingGeometry(1.32, 1.62, 40); ringGeo.rotateX(-Math.PI / 2);
    this.slotRing = instanced(ringGeo, new THREE.MeshBasicMaterial({ color: 0xFFFFFF }), rings, this.root);
    if (this.slotRing) this.slotRing.castShadow = false;
    const white = new THREE.Color(0xFFFFFF), gold = new THREE.Color(this.C.slotEdge);
    for (let i = 0; i < discs.length; i++) { if (this.slotDisc) this.slotDisc.setColorAt(i, white); if (this.slotRing) this.slotRing.setColorAt(i, gold); }
    if (this.slotDisc && this.slotDisc.instanceColor) this.slotDisc.instanceColor.needsUpdate = true;
    if (this.slotRing && this.slotRing.instanceColor) this.slotRing.instanceColor.needsUpdate = true;
    instanced(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 8), this.M.pip, pips, this.root);
    this._slotC = new THREE.Color();
  }
  setSlotHighlight(slotId, on) {
    if (!this.slotDisc || slotId >= this.slotBuilt.length) return;
    this.slotHi[slotId] = !!on;
    this.slotDisc.setColorAt(slotId, this._slotC.setHex(on ? NGN.C.slotHover : 0xFFFFFF)); this.slotDisc.instanceColor.needsUpdate = true;
  }
  // 렌더러(syncTowers)가 판의 자리 상태를 알려 준다 — 빈 자리만 숨 쉰다
  setSlotBuilt(slotId, built) { if (this.slotBuilt) this.slotBuilt[slotId] = !!built; }
  breatheSlots(now) {
    if (!this.slotRing || !this.slotRing.instanceColor) return;
    const gold = this.C.slotEdge, c = this._slotC; let any = false;
    for (let i = 0; i < this.slotBuilt.length; i++) {
      const k = this.slotHi[i] ? 1.25 : this.slotBuilt[i] ? 0.85 : 0.72 + 0.4 * (0.5 + 0.5 * Math.sin(now * 0.0028 + i * 0.9));
      c.setHex(gold).multiplyScalar(k); this.slotRing.setColorAt(i, c); any = true;
    }
    if (any) this.slotRing.instanceColor.needsUpdate = true;
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
  shake(strength) { this.shakeT = 0.55; this.shakeS = Math.max(this.shakeS, strength || 0.8); }

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
    const counts = new Map();
    const pick = (pool) => {
      let tot = 0; const c = [];
      for (const it of pool) { if (it.max && (counts.get(it) || 0) >= it.max) continue; c.push(it); tot += it.n || 1; }
      if (!c.length) return null;
      let r = rnd() * tot; for (const it of c) { r -= it.n || 1; if (r <= 0) return it; }
      return c[c.length - 1];
    };
    const footprint = (it) => {
      if (it.r) return it.r;
      const p = it.p || (it.parts && it.parts[0] && it.parts[0].p); const sz = p && this.models.size(p);
      return sz ? Math.max(sz.x, sz.z) / 2 : 0.4;
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
    const genEdge = () => { const x = -hw - EDGE_W + rnd() * (2 * hw + 2 * EDGE_W), z = -hd - EDGE_W + rnd() * (2 * hd + 2 * EDGE_W); if (this.insideBoard(x, z, 0.4)) return null; return freeAt(x, z, 0.5) ? { x, z, zone: 'edge' } : null; };
    const genFar = () => {
      const x = -(hw + 18) + rnd() * (2 * hw + 36), z = -(hd + 33) + rnd() * (2 * hd + 66);
      if (Math.abs(x) < hw + EDGE_W && Math.abs(z) < hd + EDGE_W) return null; // 판 둘레는 edge 몫
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
    // ② 판 둘레 230 · 먼 땅 300
    for (let i = 0, n = 0; i < 5000 && n < 230; i++) { const sp = genEdge(); if (!sp) continue; const it = pick(pools.edge); if (!it) break; if (put(it, sp)) n++; }
    for (let i = 0, n = 0; i < 6000 && n < 300; i++) { const sp = genFar(); if (!sp) continue; const it = pick(pools.far); if (!it) break; if (put(it, sp)) n++; }
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
    const autumn = new THREE.MeshLambertMaterial({ color: 0xC9803A }), autumn2 = new THREE.MeshLambertMaterial({ color: 0xA8A03A });
    instanced(new THREE.SphereGeometry(0.75, 9, 7), autumn, rounds1, this.root);
    instanced(new THREE.SphereGeometry(0.75, 9, 7), autumn2, rounds2, this.root);
    const rockGeo = new THREE.DodecahedronGeometry(0.42, 0);
    instanced(rockGeo, this.M.stone, rocks1, this.root); instanced(rockGeo, this.M.stoneDark, rocks2, this.root);
    const flowerGeo = new THREE.SphereGeometry(0.14, 6, 5);
    [0xE86A8A, 0xF2D25A, 0xF2F2F2, 0x9B6FE0].forEach((c, i) => instanced(flowerGeo, new THREE.MeshLambertMaterial({ color: c }), flowers[i], this.root));
    this.sceneryCount = placed;
  }

  // ---------- 카메라 ----------
  resize() {
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.placeCamera();
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
    this.dist = dist;
    // 안개는 껐다(2026-09-06). 남겨 두면(fog 가 있으면) 판 너머(카메라 거리의 1.15배)부터만
    if (this.scene.fog) { this.scene.fog.near = dist * (this.quality <= 0 ? 1.05 : 1.15); this.scene.fog.far = dist * (this.quality <= 0 ? 1.5 : 2.0); }
    this.camera.near = Math.max(1, dist * 0.05); this.camera.far = dist * 3;
    this.camera.updateProjectionMatrix();
  }

  // ---------- 자동 품질: 프레임 시간이 20ms 를 30프레임 연속 넘으면 한 단계 낮춘다(5초에 한 번) ----------
  watchFrame(dtMs, now) {
    if (!this.warmup) this.warmup = now + 4000; // 시작 직후 로딩 스파이크는 재지 않는다
    if (now < this.warmup) return;
    this.frameTimes.push(dtMs); if (this.frameTimes.length > 30) this.frameTimes.shift();
    if (this.frameTimes.length < 30 || now - this.lastDrop < 5000 || this.quality <= 0) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / 30;
    if (avg > 17) { this.lowerQuality(); this.lastDrop = now; this.frameTimes.length = 0; }
  }
  lowerQuality() {
    this.quality--;
    if (this.quality === 2) this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.0));
    else if (this.quality === 1) { this.renderer.shadowMap.enabled = false; this.sun.castShadow = false; this.root.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
    else if (this.quality <= 0) { this.renderer.setPixelRatio(Math.min(devicePixelRatio, 0.75)); this.placeCamera(); }
    console.log('품질 낮춤 →', this.quality, '픽셀비율', this.renderer.getPixelRatio(), '그림자', this.renderer.shadowMap.enabled);
  }
  // 매 프레임: 카메라 흔들림 감쇠(camBase + 난수 오프셋) · 성 피격 움찔(성문·깃발) · 그리기
  render() {
    const now = performance.now(), dt = Math.min(0.1, (now - (this.lastT || now)) / 1000); this.lastT = now;
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const k = this.shakeS * (this.shakeT / 0.55) * 0.5;
      this.camera.position.set(this.camBase.x + (Math.random() - 0.5) * k, this.camBase.y + (Math.random() - 0.5) * k * 0.6, this.camBase.z + (Math.random() - 0.5) * k);
      this.shaking = true;
    } else if (this.shaking) { this.camera.position.copy(this.camBase); this.shaking = false; this.shakeS = 0; }
    if (this.hitT > 0) {
      this.hitT = Math.max(0, this.hitT - dt);
      const k = this.hitT / 0.3;
      if (this.gateMesh) this.gateMesh.rotation.y = Math.sin(now * 0.05) * 0.14 * k;
      for (const f of this.flagMeshes) f.rotation.z = Math.sin(now * 0.04) * 0.22 * k;
    }
    this.breatheSlots(now); // 빈 자리 금테가 숨 쉰다(인스턴스 색만 갱신 — 그리기 횟수 0 증가)
    this.renderer.render(this.scene, this.camera);
  }
};
