'use strict';
// 3D 세계: 지형·길·타워 자리·나무·바위·조명·카메라. 외부 파일 없이 코드로 그린다(테마 색은 NGN.THEMES).
// 좌표: sim/map.js 의 지도 단위(원본 사거리 단위)를 1/100 로 줄여 그대로 쓴다. 길 길이·자리·줄 간격이 곧 밸런스라 바꾸지 않는다.
//
// 성능(폰): 타일·언덕·나무·바위·꽃·점선·자리 점은 전부 InstancedMesh — 종류마다 그리기 1회. 픽셀 비율 상한 1.5, 폰은 안티앨리어싱 끔, 그림자맵 1024.
// 자동 품질: 프레임 시간이 20ms 를 30프레임 연속 넘으면 단계를 낮춘다(픽셀 비율 → 그림자 끄기 → 시야 줄이기).
window.NGN = window.NGN || {};

NGN.SCALE = 1 / 100;

NGN.C = {
  sky: 0xA8CFE0, fog: 0xB4D3DF,
  grass: 0x6BA34A, grassAlt: 0x5A8F3C, cliff: 0x9A8462,
  road: 0xA8814D, roadEdge: 0x7E5F35,
  stone: 0x8F8A80, stoneDark: 0x6B6760, slot: 0x9C9587, slotHover: 0xE8C34A,
  wood: 0x7A5A3A, leaf: 0x437A2E, leafAlt: 0x356524, trunk: 0x6B4E33,
  air: 0xD9EEF7, flagIn: 0x4FA36B, flagOut: 0xC94B3D,
  shot: 0xFFD34D, spark: 0xFFE9A8, water: 0x5FA8D8,
};
NGN.THEMES = {
  grass: {},
  snow: { sky: 0xC9DDEA, fog: 0xD6E4EE, grass: 0xE9F1F6, grassAlt: 0xD7E4EC, cliff: 0x9FB3C4, road: 0xB9C6D0, roadEdge: 0x8FA3B4, leaf: 0x4F7A62, leafAlt: 0x3E6650, trunk: 0x5A4634, slot: 0xB4BFC8, air: 0xFFFFFF, water: 0x8FC4E8 },
  desert: { sky: 0xF2D9B0, fog: 0xF0DCC0, grass: 0xE0C287, grassAlt: 0xD2B276, cliff: 0xB0603A, road: 0xC48A5A, roadEdge: 0x8E5A36, leaf: 0x7FA34A, leafAlt: 0x6B8E3C, trunk: 0x7A5A3A, slot: 0xB89C78, air: 0xFFF3E0, water: 0x5FA8D8 },
  lava: { sky: 0x3A2A33, fog: 0x4A3038, grass: 0x5A4650, grassAlt: 0x4C3A44, cliff: 0x2A1E24, road: 0xE0602A, roadEdge: 0x8A2E10, leaf: 0x6A3A2A, leafAlt: 0x502A20, trunk: 0x3A2420, slot: 0x8A7A80, air: 0xFFB070, water: 0xFF7A30 },
};
NGN.ELEMENT_COLOR = { nature: 0x4FA36B, fire: 0xE0612F, ice: 0x6FC3E8, darkness: 0x6B3FA0, iron: 0x8E9AA5, astral: 0xE8C34A, storm: 0x3D6FD6 };
NGN.ELEMENT_KO = { nature: '자연', fire: '불', ice: '얼음', darkness: '어둠', iron: '강철', astral: '천체', storm: '폭풍' };
NGN.DEFENSE_COLOR = { LUA: 0xE8C34A, SOL: 0xE0612F, HEL: 0x4FA36B, MYT: 0x8E5BD6, SIF: 0xC9D1D9, ZOD: 0xF2EFE6 };
NGN.DEFENSE_KO = { LUA: '루아', SOL: '솔', HEL: '헬', MYT: '미트', SIF: '시프', ZOD: '조드' };
NGN.ATTACK_KO = { physical: '물리', decay: '부패', energy: '에너지', elemental: '원소', essence: '정수', arcane: '비전' };

// 여러 인스턴스를 한 번에 그리는 도우미: 위치·회전·크기 목록 → InstancedMesh
function instanced(geo, mat, items, root) {
  if (!items.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  const o = new THREE.Object3D();
  items.forEach((it, i) => {
    o.position.set(it.x, it.y, it.z); o.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
    const s = it.s === undefined ? 1 : it.s; o.scale.set(it.sx || s, it.sy || s, it.sz || s);
    o.updateMatrix(); m.setMatrixAt(i, o.matrix);
  });
  m.castShadow = !!items[0].cast; m.receiveShadow = true; m.instanceMatrix.needsUpdate = true;
  root.add(m);
  return m;
}

NGN.World = class World {
  constructor(stage) {
    this.stage = stage;
    this.isMobile = ('ontouchstart' in window) || innerWidth < 700;
    this.quality = 3; // 3 최고 … 0 최저
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xB4D3DF, 60, 120);

    // 화각 22° — 좁은 화각 + 멀리서 당겨 찍기(망원). 42° 였을 때는 화면 위쪽 줄이 거의 수직으로 내려다보여 납작하고 작게,
    // 아래쪽 줄은 옆이 보여 크게 나왔다(사장님 지적 2026-09-06 "앞쪽 타워는 왜 작게 나와"). 좁히면 판 전체가 같은 각도로 보인다
    this.camera = new THREE.PerspectiveCamera(22, 1, 1, 800);
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.isMobile, powerPreference: 'high-performance' });
    this.maxPixelRatio = this.isMobile ? 1.5 : 2; // 폰은 3배로 그리면 픽셀이 9배 — 상한을 둔다
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.maxPixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.86;
    stage.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xCDE6F2, 0x46552F, 0.46));
    const sun = new THREE.DirectionalLight(0xFFF0D2, 0.92);
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
    addEventListener('resize', () => this.resize());
    this.setMap(NGN.map);
  }

  // 지도를 (다시) 만든다. 지도마다 테마 색·길·자리가 다르다. 이전 지도의 3D 는 전부 지운다
  setMap(map) {
    NGN.map = map;
    while (this.root.children.length) this.root.remove(this.root.children[0]);
    const C = Object.assign({}, NGN.C, NGN.THEMES[map.theme] || {});
    this.C = C;
    this.scene.background = new THREE.Color(C.sky);
    this.scene.fog.color = new THREE.Color(C.fog);
    const mat = (color, opts) => new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));
    this.M = {
      grass: mat(C.grass), grassAlt: mat(C.grassAlt), cliff: mat(C.cliff), road: mat(C.road), roadEdge: mat(C.roadEdge),
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
    this.buildGround();
    this.buildPaths();
    this.buildSlots();
    this.buildScenery();
    this.resize();
  }
  toWorld(x, y, h = 0) { return new THREE.Vector3((x - this.cx) * NGN.SCALE, h, (y - this.cz) * NGN.SCALE); }

  // 지형: 바닥 한 장 + 체커 타일(인스턴스 1회) + 가장자리 언덕(인스턴스 2회).
  // 땅은 판보다 훨씬 넓게(가로 +40 · 세로 +70 칸) — 세로 폰에서 정사각 판은 가로에 막혀 위아래가 남는데, 거기가 하늘색으로 비면 "지도가 작다"로 보인다.
  // 참고 게임(레이드 러시)처럼 땅이 화면을 끝까지 채우게 한다(2026-09-06)
  buildGround() {
    const W = this.width + 40, D = this.depth + 70;
    const ground = new THREE.Mesh(new THREE.BoxGeometry(W, 1, D), this.M.grass);
    ground.position.y = -0.5; ground.receiveShadow = true; this.root.add(ground);
    const TILE = 3, tiles = [];
    for (let x = -W / 2 + TILE / 2; x < W / 2; x += TILE) for (let z = -D / 2 + TILE / 2; z < D / 2; z += TILE) {
      if ((Math.round(x / TILE) + Math.round(z / TILE)) % 2) continue;
      tiles.push({ x, y: 0.03, z });
    }
    instanced(new THREE.BoxGeometry(TILE, 0.06, TILE), this.M.grassAlt, tiles, this.root);
    const hillsA = [], hillsB = [];
    for (let i = 0; i < 60; i++) {
      const ang = i / 60 * Math.PI * 2;
      const x = Math.cos(ang) * (W / 2 - 1.2), z = Math.sin(ang) * (D / 2 - 1.2);
      if (Math.abs(x) < W / 2 - 3.2 && Math.abs(z) < D / 2 - 3.2) continue;
      const h = 0.8 + ((i * 7) % 5) * 0.35;
      (i % 2 ? hillsA : hillsB).push({ x, y: h / 2, z, sx: 1, sy: h, sz: 1, cast: true });
    }
    const hill = new THREE.BoxGeometry(TILE, 1, TILE);
    instanced(hill, this.M.cliff, hillsA, this.root); instanced(hill, this.M.grassAlt, hillsB, this.root);
  }

  // 길: 폴리라인 구간마다 상자(구간 수만큼) + 입구·출구 깃발 + 공중 점선(인스턴스 1회)
  buildPaths() {
    const road = NGN.map.GROUND_PATH, ROAD_W = 2.2;
    for (let i = 0; i < road.length - 1; i++) {
      const a = this.toWorld(road[i][0], road[i][1]), b = this.toWorld(road[i + 1][0], road[i + 1][1]);
      const len = a.distanceTo(b);
      const rot = -Math.atan2(b.z - a.z, b.x - a.x);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(len + ROAD_W, 0.12, ROAD_W), this.M.road);
      seg.position.copy(a).lerp(b, 0.5); seg.position.y = 0.06; seg.rotation.y = rot; seg.receiveShadow = true; this.root.add(seg);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(len + ROAD_W + 0.5, 0.08, ROAD_W + 0.5), this.M.roadEdge);
      edge.position.copy(seg.position); edge.position.y = 0.02; edge.rotation.y = rot; edge.receiveShadow = true; this.root.add(edge);
    }
    this.flag(this.toWorld(road[0][0], road[0][1]), NGN.C.flagIn);
    this.flag(this.toWorld(road[road.length - 1][0], road[road.length - 1][1]), NGN.C.flagOut);
    const air = NGN.map.air.points, dots = [];
    for (let i = 0; i < air.length; i += 6) { const p = this.toWorld(air[i][0], air[i][1], 3.2); dots.push({ x: p.x, y: p.y, z: p.z }); }
    instanced(new THREE.SphereGeometry(0.16, 6, 4), this.M.air, dots, this.root);
    this.entry = this.toWorld(road[0][0], road[0][1], 0.2);
  }
  flag(pos, color) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5), this.M.wood);
    pole.position.copy(pos); pole.position.y = 1.2; pole.castShadow = true;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
    cloth.position.set(pos.x + 0.45, 2.05, pos.z);
    this.root.add(pole, cloth);
  }

  // 자리: 원판(개별 — 선택 색이 바뀐다) + 금색 점(인스턴스 1회, 길을 덮는 정도 1~3개)
  buildSlots() {
    this.slotMeshes = [];
    const geo = new THREE.CylinderGeometry(1.5, 1.65, 0.3, 10);
    const pips = [];
    for (const s of NGN.map.SLOTS) {
      const m = new THREE.Mesh(geo, this.M.slot.clone());
      m.position.copy(this.toWorld(s.x, s.y, 0.15));
      m.castShadow = true; m.receiveShadow = true; m.userData.slotId = s.id;
      const cover = NGN.map.coverageFor(s.id, 800, false);
      const n = cover > 2600 ? 3 : cover > 1900 ? 2 : 1;
      for (let i = 0; i < n; i++) pips.push({ x: m.position.x + (i - (n - 1) / 2) * 0.45, y: 0.34, z: m.position.z + 0.95 });
      this.root.add(m); this.slotMeshes.push(m);
    }
    instanced(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 8), this.M.pip, pips, this.root);
  }
  setSlotHighlight(slotId, on) {
    const m = this.slotMeshes[slotId]; if (!m) return;
    m.material.color.setHex(on ? NGN.C.slotHover : this.C.slot);
    m.material.emissive.setHex(on ? 0x443300 : 0x000000);
  }

  // 풍경: 침엽수·둥근 나무·바위·꽃·연못. 길·자리와 안 겹치는 곳에 고정 시드로. 전부 인스턴스
  buildScenery() {
    const road = NGN.map.ground.points, slots = NGN.map.SLOTS, B = NGN.map.BOUNDS;
    const free = (x, y) => {
      for (const p of road) if ((p[0] - x) ** 2 + (p[1] - y) ** 2 < 220 ** 2) return false;
      for (const s of slots) if ((s.x - x) ** 2 + (s.y - y) ** 2 < 260 ** 2) return false;
      return true;
    };
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
  boardExtent(angle) {
    const c = Math.cos(angle), s = Math.sin(angle), hw = this.width / 2, hd = this.depth / 2;
    let x = 0, z = 0;
    for (const [px, pz] of [[hw, hd], [hw, -hd], [-hw, hd], [-hw, -hd]]) { x = Math.max(x, Math.abs(px * c - pz * s)); z = Math.max(z, Math.abs(px * s + pz * c)); }
    return { w: x * 2, d: z * 2 };
  }
  camDist(angle) {
    const fov = this.camera.fov * Math.PI / 180, aspect = this.camera.aspect || 0.5;
    const portrait = aspect < 1;
    const pitch = (portrait ? 62 : 56) * Math.PI / 180;
    const e = this.boardExtent(angle);
    // 여백: 가로 2.4칸(가장자리 자리 원판이 잘리지 않을 만큼) · 세로 4칸
    const needV = e.d * Math.sin(pitch) + (portrait ? 4 : 5), needH = e.w + (portrait ? 2.4 : 8);
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
    const look = new THREE.Vector3(Math.sin(this.camAngle) * off, 0, Math.cos(this.camAngle) * off);
    this.camera.position.set(look.x + Math.sin(this.camAngle) * cr, cy, look.z + Math.cos(this.camAngle) * cr);
    this.camera.lookAt(look);
    this.dist = dist;
    // 안개는 판 너머(카메라 거리의 1.15배)부터 — 판 위 물체는 안개에 안 먹는다. 카메라 거리로 정해야 화각을 바꿔도 뿌예지지 않는다
    this.scene.fog.near = dist * (this.quality <= 0 ? 1.05 : 1.15); this.scene.fog.far = dist * (this.quality <= 0 ? 1.5 : 2.0);
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
    if (avg > 20) { this.lowerQuality(); this.lastDrop = now; this.frameTimes.length = 0; }
  }
  lowerQuality() {
    this.quality--;
    if (this.quality === 2) this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.0));
    else if (this.quality === 1) { this.renderer.shadowMap.enabled = false; this.sun.castShadow = false; this.root.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
    else if (this.quality <= 0) { this.renderer.setPixelRatio(Math.min(devicePixelRatio, 0.75)); this.placeCamera(); }
    console.log('품질 낮춤 →', this.quality, '픽셀비율', this.renderer.getPixelRatio(), '그림자', this.renderer.shadowMap.enabled);
  }
  render() { this.renderer.render(this.scene, this.camera); }
};
