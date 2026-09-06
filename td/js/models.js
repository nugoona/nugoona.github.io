'use strict';
// Kenney 부품(GLB) 불러오기 — 2026-09-06 여러 팩을 섞는다(checklist J-1). 팩마다 텍스처(colormap)가 다르고 space·nature 팩은 텍스처 없이 재질 색만 있다.
// 그래서 불러온 뒤 텍스처를 전부 한 장(아틀라스 1024², 회색조 칸 + 원색 칸 + 흰 칸)으로 합치고 UV 를 옮겨 적는다 → 타워 하나가 여전히 그리기 1회(머리는 +1).
//   ⑴ 번들(단일 HTML): window.__NGN_MODELS__['팩/이름'] 에 data URI, ['팩/Textures/colormap.png'] 에 텍스처
//   ⑵ 나눔 빌드·개발: NGN.PATHS.assets + 'kenney/팩/이름.glb'
// 부품은 바운딩 박스를 재 두고 바닥·중심을 맞춰 쌓는다(팩마다 원점이 달라서 — space 팩은 (1.5,0,1) 에 놓여 있다). 못 불러오면 render.js 가 코드로 그린 폴백을 쓴다.
window.NGN = window.NGN || {};

// 부품 표(kenney_parts.json) 어디에 있든 { p: '팩/이름' } · { model: '팩/이름' } 을 전부 모은다. '_' 로 시작하는 설명 칸은 건너뛴다
NGN.collectPieces = function collectPieces(obj, set = new Set()) {
  if (Array.isArray(obj)) { for (const v of obj) { if (typeof v === 'string' && v.includes('/')) set.add(v); else collectPieces(v, set); } return [...set]; }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('_')) continue;
      if ((k === 'p' || k === 'model') && typeof v === 'string' && v.includes('/')) set.add(v);
      else collectPieces(v, set);
    }
  }
  return [...set];
};

NGN.Models = class Models {
  constructor(parts) {
    this.parts = parts; // data/kenney_parts.json
    this.templates = new Map(); // '팩/이름' → { scene, size, min, center }
    this.ready = false; this.failed = false;
    this.fxTexture = null;
  }
  // 표에 나오는 부품 전부 — 표 어디에 있든 '팩/이름' 꼴의 p·model 값을 재귀로 모은다(타워 stack · 적 model·props · 장식 scenery · 성·입구 landmarks).
  // game/build.js·bundle.js 도 같은 규칙으로 복사한다(NGN.collectPieces 와 동일)
  pieceList() { return NGN.collectPieces(this.parts); }
  async loadAll(onProgress) {
    if (!this.parts || typeof THREE.GLTFLoader === 'undefined') { this.failed = true; return false; }
    const inline = window.__NGN_MODELS__ || null;
    const base = (NGN.PATHS && NGN.PATHS.assets) || '../assets/';
    const names = this.pieceList();
    const total = names.length + 1;
    let done = 0;
    const t0 = performance.now();
    const step = (label) => { done++; if (onProgress) onProgress(done, total, label); };
    // 팩마다 로더 하나 — GLB 가 참조하는 'Textures/colormap.png' 를 그 팩의 텍스처로 돌린다(번들이면 data URI)
    const loaders = new Map();
    const loaderFor = (pack) => {
      if (loaders.has(pack)) return loaders.get(pack);
      const manager = new THREE.LoadingManager();
      const texKey = pack + '/Textures/colormap.png';
      manager.setURLModifier((url) => (/colormap\.png$/i.test(url) ? (inline && inline[texKey] ? inline[texKey] : base + 'kenney/' + texKey) : url));
      const loader = new THREE.GLTFLoader(manager);
      loaders.set(pack, loader);
      return loader;
    };
    const loadOne = (name) => new Promise((resolve) => {
      const pack = name.split('/')[0];
      const url = inline && inline[name] ? inline[name] : base + 'kenney/' + name + '.glb';
      loaderFor(pack).load(url, (gltf) => {
        const scene = gltf.scene;
        scene.updateMatrixWorld(true);
        scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        const box = new THREE.Box3().setFromObject(scene);
        this.templates.set(name, { scene, size: box.getSize(new THREE.Vector3()), min: box.min.clone(), center: box.getCenter(new THREE.Vector3()), anims: gltf.animations || [] }); // anims: 캐릭터 팩의 걷기·달리기·죽기 클립(적에 쓴다)
        step(name); resolve(true);
      }, undefined, (err) => { console.warn('모델 못 읽음', name, err && err.message); step(name); resolve(false); });
    });
    // 효과 그림(입자 아틀라스)
    const loadFx = () => new Promise((resolve) => {
      const key = 'fx/particles.png';
      const url = inline && inline[key] ? inline[key] : base + key;
      new THREE.TextureLoader().load(url, (t) => { t.flipY = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; this.fxTexture = t; step('fx'); resolve(true); }, undefined, () => { step('fx'); resolve(false); });
    });
    const results = await Promise.all([...names.map(loadOne), loadFx()]);
    this.buildAtlas();
    this.ready = results.filter(Boolean).length >= names.length * 0.8;
    this.failed = !this.ready;
    this.loadMs = Math.round(performance.now() - t0);
    return this.ready;
  }
  // 모든 팩의 colormap 을 한 장(1024², 256 칸 16개)으로: 팩마다 [회색조 칸, 원색 칸], 마지막에 흰 칸(텍스처 없는 재질용).
  // 회색조는 밝기·명암만 남기고 색은 꼭짓점 색(속성색)이 정한다 — Kenney 원색(보라·주황)이 속성색을 묻어 버려서(design.md 12-10)
  buildAtlas() {
    // 2026-09-06 팩이 10 → 17개로 늘어(적 캐릭터·장식·성) 4×4=16 칸을 넘친다 → 8×8=64 칸(2048²). 칸 크기 256 은 그대로(Kenney colormap 은 512² 팔레트라 축소해도 색이 안 뭉개진다)
    const CELL = 256, N = 8;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = CELL * N;
    const ctx = canvas.getContext('2d');
    // 🔴 팩 이름으로 묶는다 — GLB 파일마다 같은 colormap 을 따로 읽어 Image 객체가 다 달라서, 이미지로 묶으면 파일 60개가 칸 16개를 넘쳐 뒤쪽 팩이 흰 칸으로 떨어졌다(실측 2026-09-06)
    this.cells = new Map(); // 팩 → { gray: n, color: n }
    let n = 0;
    const place = (img, gray) => {
      const idx = n++; const x = (idx % N) * CELL, y = Math.floor(idx / N) * CELL;
      ctx.drawImage(img, x, y, CELL, CELL);
      if (gray) { const d = ctx.getImageData(x, y, CELL, CELL); const a = d.data; for (let i = 0; i < a.length; i += 4) { const l = 0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2]; const v = Math.min(255, l * 0.6 + 80); a[i] = a[i + 1] = a[i + 2] = v; } ctx.putImageData(d, x, y); }
      return idx;
    };
    for (const [name, { scene }] of this.templates) {
      const pack = name.split('/')[0]; if (this.cells.has(pack)) continue;
      let img = null; scene.traverse((o) => { if (!img && o.isMesh && o.material && o.material.map && o.material.map.image) img = o.material.map.image; });
      if (!img || n > N * N - 3) continue;
      this.cells.set(pack, { gray: place(img, true), color: place(img, false) });
    }
    ctx.fillStyle = '#fff'; ctx.fillRect((n % N) * CELL, Math.floor(n / N) * CELL, CELL, CELL); this.whiteCell = n++;
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false; tex.encoding = THREE.sRGBEncoding; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    this.atlas = tex; this.atlasCell = 1 / N; this.atlasN = N;
  }
  has(name) { return this.templates.has(name); }
  size(name) { const t = this.templates.get(name); return t ? t.size : null; }

  // 장식·성·입구용 조각 하나 → { geometry, material }. 바닥이 y=0, 중심이 x/z=0, 배율 1(배율·위치는 InstancedMesh 행렬로).
  // P = { p: '팩/이름', raw?: 원색 유지(기본 true — 장식은 Kenney 원색이 예쁘다), tint?: '#색'(회색조 칸 × 이 색 — 눈 테마의 흰 나무 등), recolor?: {재질이름: 색} (텍스처 없는 nature·space 팩) }
  // 같은 조각·같은 색은 한 번만 만들어 나눠 쓴다. 재질은 아틀라스 하나(꼭짓점 색) — 종류가 달라도 재질은 같아 셰이더 전환이 없다. world.js 가 InstancedMesh 로 그린다
  pieceGeometry(P) {
    if (typeof P === 'string') P = { p: P };
    if (!this.atlas || !this.templates.has(P.p)) return null;
    this.pieceGeo = this.pieceGeo || new Map();
    const key = P.p + '|' + (P.tint || '') + '|' + (P.raw === false ? 'g' : 'r') + '|' + JSON.stringify(P.recolor || null);
    if (!this.pieceGeo.has(key)) {
      const Q = { p: P.p, raw: P.raw !== false && !P.tint, tint: P.tint, recolor: P.recolor };
      const placed = this.place(Q, 0); if (!placed) return null;
      const g = new THREE.Group(); g.add(placed.obj);
      const merged = this.mergeGroup(g, { outline: false, accent: new THREE.Color(P.tint || 0xffffff), base: new THREE.Color(P.tint || 0xffffff) });
      this.sceneryMat = this.sceneryMat || new THREE.MeshLambertMaterial({ map: this.atlas, vertexColors: true });
      this.pieceGeo.set(key, merged.body ? { geometry: merged.body, material: this.sceneryMat, height: placed.height, size: this.templates.get(P.p).size.clone() } : null);
    }
    return this.pieceGeo.get(key);
  }

  // 여러 조각 메시를 하나로(같은 아틀라스 재질을 쓰므로 가능). 조각마다 userData.piece(표의 객체)·userData.family 로 색·칸을 정한다.
  // 머리(piece.head)로 표시된 조각은 별도 지오메트리로 모은다(적을 향해 돌리려고). 돌려주는 값: { body, head, headPivot }
  mergeGroup(group, ctx = {}) {
    const acc = () => ({ pos: [], nor: [], uv: [], col: [], piece: [], pieceCenter: [], pieceNo: 0 });
    const B = acc(), H = acc();
    let headPivot = null;
    group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const white = new THREE.Color(1, 1, 1);
    group.traverse((o) => {
      if (!o.isMesh || !o.geometry.attributes.position) return;
      let P = null, root = null; for (let a = o; a && a !== group; a = a.parent) if (a.userData && a.userData.piece) { P = a.userData.piece; root = a; break; }
      P = P || {};
      let isHead = false;
      if (P.head) {
        if (!P.headNode) isHead = true;
        else for (let a = o; a && a !== root; a = a.parent) if (a.name === P.headNode || a.name === 'Mesh_' + P.headNode) { isHead = true; break; }
      }
      const A = isHead ? H : B;
      if (isHead && !headPivot && root) headPivot = root.userData.pivot.clone();
      const mat = o.material;
      // 칸·색
      let cell, color;
      const pack = P.p ? P.p.split('/')[0] : null;
      if (mat.map && pack && this.cells.has(pack)) {
        const c = this.cells.get(pack);
        cell = P.raw ? c.color : c.gray;
        color = P.raw ? white : (P.tint ? new THREE.Color(P.tint) : (P.accent || isHead || P.head) ? ctx.accent : ctx.base) || white;
      } else {
        cell = this.whiteCell;
        const rc = (P.recolor && (P.recolor[mat.name] || P.recolor['*'])) || (ctx.recolor && (ctx.recolor[mat.name] || ctx.recolor['*']));
        color = rc ? (rc === 'tint' ? ctx.accent : new THREE.Color(rc)) : (P.tint ? new THREE.Color(P.tint) : mat.color || white);
      }
      const cx = (cell % this.atlasN) * this.atlasCell, cy = Math.floor(cell / this.atlasN) * this.atlasCell, cs = this.atlasCell;
      // 🔴 graveyard·holiday·survival·castle 팩은 KHR_texture_transform 으로 팔레트 칸을 고른다(UV 는 그대로, 재질의 offset/repeat 가 옮긴다).
      //    그 변환을 UV 에 미리 곱하지 않으면 전부 같은 칸(흰색)을 찍는다 — 실측 2026-09-06, 타워 여럿이 하얗게 나왔다
      let uvM = null; if (mat.map) { mat.map.updateMatrix(); uvM = mat.map.matrix; }
      const uv2 = new THREE.Vector2();
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      const nm = new THREE.Matrix3().getNormalMatrix(m);
      const p = g.attributes.position, nrm = g.attributes.normal, u = g.attributes.uv;
      const v = new THREE.Vector3();
      const flip = m.determinant() < 0; // 좌우 반전(음수 배율) 조각은 삼각형 앞뒤가 뒤집힌다
      const box = new THREE.Box3();
      const off = isHead ? headPivot : null;
      for (let tri = 0; tri < p.count; tri += 3) {
        const order = flip ? [tri, tri + 2, tri + 1] : [tri, tri + 1, tri + 2];
        for (const i of order) {
          v.fromBufferAttribute(p, i).applyMatrix4(m); if (off) v.sub(off);
          A.pos.push(v.x, v.y, v.z); box.expandByPoint(v); A.piece.push(A.pieceNo);
          if (nrm) { v.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize(); A.nor.push(v.x, v.y, v.z); } else A.nor.push(0, 1, 0);
          if (u) { uv2.set(u.getX(i), u.getY(i)); if (uvM) uv2.applyMatrix3(uvM); } else uv2.set(0.5, 0.5);
          const uu = Math.min(1, Math.max(0, uv2.x)), vv = Math.min(1, Math.max(0, uv2.y));
          A.uv.push(cx + uu * cs, cy + vv * cs);
          A.col.push(color.r, color.g, color.b);
        }
      }
      A.pieceCenter[A.pieceNo] = box.getCenter(new THREE.Vector3()); A.pieceNo++;
    });
    const toGeo = (A) => {
      if (!A.pos.length) return null;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(A.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(A.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(A.col, 3));
      if (ctx.outline !== false) geo.userData.outline = this.outlineGeometry(A.pos, A.piece, A.pieceCenter); // 외곽선용(바깥면 한 장). 적은 외곽선이 없어 건너뛴다 — 수만 개 문자열 키를 만드는 계산이라 새 종류가 처음 나올 때 1초 멈추던 원인
      return geo;
    };
    return { body: toGeo(B), head: toGeo(H), headPivot };
  }
  // Kenney 모델은 삼각형이 앞·뒤 두 장씩 겹친 양면 지오메트리(실측: 타워 하나 288개 중 144쌍). 그대로 "뒷면만 그리기"를 하면 앞면도 그려져 외곽선이 몸통을 덮는다.
  // 그래서 외곽선에는 겹친 쌍 중 조각 중심에서 바깥을 향한 한 장만 남긴 지오메트리를 쓴다
  outlineGeometry(pos, piece, pieceCenter) {
    const key = (i) => `${pos[i * 3].toFixed(4)},${pos[i * 3 + 1].toFixed(4)},${pos[i * 3 + 2].toFixed(4)}`;
    const groups = new Map();
    const triCount = pos.length / 9;
    for (let t = 0; t < triCount; t++) { const k = [key(t * 3), key(t * 3 + 1), key(t * 3 + 2)].sort().join('|'); (groups.get(k) || groups.set(k, []).get(k)).push(t); }
    const out = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3(), toC = new THREE.Vector3();
    const outward = (t) => {
      a.fromArray(pos, t * 9); b.fromArray(pos, t * 9 + 3); c.fromArray(pos, t * 9 + 6);
      fn.copy(b).sub(a).cross(c.clone().sub(a));
      const ctr = pieceCenter[piece[t * 3]] || { x: 0, y: 0, z: 0 };
      toC.set((a.x + b.x + c.x) / 3 - ctr.x, (a.y + b.y + c.y) / 3 - ctr.y, (a.z + b.z + c.z) / 3 - ctr.z);
      return fn.dot(toC);
    };
    for (const ts of groups.values()) {
      let best = ts[0], bestD = -Infinity;
      for (const t of ts) { const d = outward(t); if (d > bestD) { bestD = d; best = t; } }
      for (let i = 0; i < 9; i++) out.push(pos[best * 9 + i]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    return g;
  }
  // 계열 재질(아틀라스 × 꼭짓점 색 + 속성색 발광 아주 조금 — 0.2 를 넘기면 명암이 날아간다). 계열당 하나
  towerMaterial(family, element) {
    this.towerMats = this.towerMats || new Map();
    const key = family + ':' + (element || '');
    if (!this.towerMats.has(key)) {
      const glowHex = (NGN.ELEMENT_COLOR && element && NGN.ELEMENT_COLOR[element]) || 0xFFFFFF;
      this.towerMats.set(key, new THREE.MeshLambertMaterial({ map: this.atlas, vertexColors: true, emissive: glowHex, emissiveIntensity: 0.1 })); // 0.07 → 0.1(2026-09-06 진하게). 0.2 를 넘기면 명암이 날아간다(실측)
    }
    return this.towerMats.get(key);
  }
  // 조각 하나 놓기: 바닥을 y 에, 중심을 (x,z) 에. 원본 s 배율. 표의 객체를 userData.piece 에 달아 mergeGroup 이 읽는다
  place(P, y) {
    const t = this.templates.get(P.p); if (!t) return null;
    const obj = t.scene.clone(true);
    const s = P.s || 1;
    obj.scale.setScalar(s);
    if (P.ry) obj.rotation.y = P.ry;
    obj.position.set(-t.center.x * s + (P.x || 0), y - t.min.y * s + (P.y || 0), -t.center.z * s + (P.z || 0));
    obj.userData.piece = P;
    obj.userData.pivot = new THREE.Vector3(P.x || 0, y + (P.y || 0), P.z || 0); // 머리가 도는 축(조각 바닥 중심)
    return { obj, top: y + (P.y || 0) + t.size.y * s, height: t.size.y * s };
  }
  // 부품 표에 없는 계열(뽑기로 얻는 20종 — 2026-09-06 gacha.json towerPool. 전용 실루엣은 다음 차례)은 같은 속성의 기본 계열 실루엣을 빌린다.
  //   같은 속성 + 같은 역할 > 같은 속성 > 같은 공격 타입 > 첫 번째. 등급(NGN.FAMILY_INFO.grade)에 따라 색·크기를 달리해 구별한다(borrowStyle)
  borrowFamily(family) {
    if (this.parts.towers[family]) return family;
    const I = NGN.FAMILY_INFO || {}; const me = I[family]; if (!me) return null;
    const cands = Object.keys(this.parts.towers).filter((k) => !k.startsWith('_') && I[k]);
    return cands.find((k) => I[k].element === me.element && I[k].role === me.role) || cands.find((k) => I[k].element === me.element) || cands.find((k) => I[k].attackType === me.attackType) || cands[0] || null;
  }
  // 등급별 변형: 고급 = 색상을 살짝 돌리고 받침을 밝게 · 희귀(수호자) = 받침이 은빛, 꼭대기는 속성 원색 · 전설 = 금빛이 섞인 꼭대기 + 12% 크게
  borrowStyle(family) {
    const g = ((NGN.FAMILY_INFO || {})[family] || {}).grade || 'basic';
    if (g === 'uncommon') return { hue: -0.05, stoneMix: 0.2, stone: 0xCFC7B8, scale: 1 };
    if (g === 'rare') return { hue: 0, stoneMix: 0.55, stone: 0xDCE3EA, scale: 1.04 };
    if (g === 'legendary') return { hue: 0, stoneMix: 0.15, stone: 0x6E5A2A, gold: 0.45, scale: 1.12 };
    return { hue: 0, stoneMix: 0.2, stone: 0xB4AEA4, scale: 1 };
  }
  // 타워 조립: 계열·단 → { body, head } 메시가 든 그룹. 같은 계열·단은 지오메트리를 한 번만 만들어 나눠 쓴다(카드 그림·미리보기가 여러 번 불러도 비용 0)
  buildTower(family, tier, opts = {}) {
    const src0 = this.borrowFamily(family);
    const spec = src0 ? this.parts.towers[src0] : null;
    if (!spec || !this.atlas) return null;
    const key = family + ':' + tier;
    this.towerGeo = this.towerGeo || new Map();
    if (!this.towerGeo.has(key)) {
      const stack = (spec.stack[String(tier)] || spec.stack['3']).map((e) => (typeof e === 'string' ? { p: e } : e));
      const st = this.borrowStyle(family);
      // 몸통 속성색을 진하게(2026-09-06 화면 설계 2판): 받침의 돌빛 섞임 35% → 20%. 빌린 계열은 등급 스타일대로
      const accent = new THREE.Color(spec.tint), stone = new THREE.Color(st.stone);
      if (st.hue) accent.offsetHSL(st.hue, 0.05, 0);
      if (st.gold) accent.lerp(new THREE.Color(0xFFD54A), st.gold);
      const base = accent.clone().lerp(stone, st.stoneMix);
      const g = new THREE.Group();
      let y = 0, top = 0; const fx = []; let headAnim = null, headTop = 0;
      for (let i = 0; i < stack.length; i++) {
        const P = stack[i];
        const placed = this.place(P, y);
        if (!placed) { console.warn('부품 없음', P.p); continue; }
        g.add(placed.obj);
        top = Math.max(top, placed.top);
        if (P.head) { headAnim = P.anim || 'aim'; headTop = placed.top; }
        if (P.fx) fx.push({ kind: P.fx, x: P.x || 0, y: placed.top - placed.height * 0.15, z: P.z || 0 });
        const r = P.r !== undefined ? P.r : (P.head || P.anim ? 0 : 1);
        y += placed.height * r;
      }
      const merged = this.mergeGroup(g, { accent, base, recolor: spec.recolor });
      this.towerGeo.set(key, { body: merged.body, head: merged.head, headPivot: merged.headPivot, material: this.towerMaterial(family, opts.element), height: top, headAnim, headTop, fx, gradeScale: st.scale });
    }
    const src = this.towerGeo.get(key);
    const out = new THREE.Group();
    const scale = (opts.scale || this.parts.towerScale) * (src.gradeScale || 1);
    if (src.body) { const mesh = new THREE.Mesh(src.body, src.material); mesh.castShadow = true; mesh.receiveShadow = true; out.add(mesh); out.userData.bodyMesh = mesh; }
    if (src.head) {
      const pivot = new THREE.Group(); pivot.position.copy(src.headPivot);
      const mesh = new THREE.Mesh(src.head, src.material); mesh.castShadow = true; mesh.receiveShadow = true; pivot.add(mesh);
      out.add(pivot); out.userData.head = pivot; out.userData.headMesh = mesh; out.userData.headAnim = src.headAnim; out.userData.headBaseY = src.headPivot.y;
    }
    out.scale.setScalar(scale);
    out.userData.height = src.height * scale;
    out.userData.fx = src.fx.map((f) => ({ kind: f.kind, x: f.x * scale, y: f.y * scale, z: f.z * scale }));
    return out;
  }
  // ---------- 적: 창고 캐릭터 팩(뼈대 애니메이션) ----------
  // 2026-09-06 적 6종을 UFO 하나 돌려쓰던 것에서 캐릭터 팩(mini-dungeon 오크 · cube-pets 여우·코끼리·병아리·앵무새·사자)으로. 사장님: "몹이 다 똑같아. 외형이 다 똑같단 말이야."
  // 창고 캐릭터는 걷기·달리기 클립이 들어 있다. 두 종류가 섞여 있다 — 미니 팩은 진짜 스킨(뼈 7개, SkinnedMesh 2장), 큐브펫은 부위별 메시(몸통·꼬리·다리 4개가 노드 애니메이션).
  // 둘 다 "뼈 하나 + SkinnedMesh 하나"로 통일한다: 부위 메시는 그 노드를 뼈로 삼아 가중치 100% 로 붙인다. 그러면 적 하나 = 그리기 1회, 애니메이션은 GPU 스키닝.
  // 색은 아틀라스 원색 칸 × 꼭짓점 색(spec.tint — 부위 이름별로 곱하는 색). 눈·코 같은 어두운 부분은 그대로 남고 밝은 부분만 물든다.
  enemyTemplate(kind) {
    const spec = this.parts.enemies[kind] || this.parts.enemies.basic;
    this.enemyTpl = this.enemyTpl || new Map();
    if (this.enemyTpl.has(kind)) return this.enemyTpl.get(kind);
    const t = this.templates.get(spec.model); if (!t || !this.atlas) return null;
    const scene = t.scene; scene.updateMatrixWorld(true);
    const pack = spec.model.split('/')[0];
    const cellNo = this.cells.has(pack) ? this.cells.get(pack).color : this.whiteCell;
    const cx = (cellNo % this.atlasN) * this.atlasCell, cy = Math.floor(cellNo / this.atlasN) * this.atlasCell, cs = this.atlasCell;
    // 뼈 = 장면의 모든 노드(부위 메시 노드 포함). 순서를 고정해 복제본이 같은 번호를 쓴다
    const bones = []; scene.traverse((o) => { if (o !== scene) bones.push(o); });
    const idx = new Map(bones.map((b, i) => [b, i]));
    const tints = spec.tint && typeof spec.tint === 'object' ? spec.tint : { '*': spec.tint || '#ffffff' };
    const tintFor = (name) => new THREE.Color(tints[name] || tints['*'] || '#ffffff');
    const pos = [], nor = [], uv = [], col = [], si = [], sw = [];
    const v = new THREE.Vector3(), n3 = new THREE.Matrix3(), uv2 = new THREE.Vector2();
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry.attributes.position) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
      const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
      // 스킨 메시: 원본 bindMatrix 를 위치에 곱하고 뼈 번호를 우리 번호로 옮긴다. 부위 메시: 그 노드의 세계 행렬을 곱하고 자기 노드에 100% 붙인다
      const m = o.isSkinnedMesh ? o.bindMatrix.clone() : o.matrixWorld.clone(); n3.getNormalMatrix(m);
      const boneMap = o.isSkinnedMesh ? o.skeleton.bones.map((b) => idx.get(b)) : null;
      const self = idx.get(o);
      const color = tintFor(o.name);
      let uvM = null; if (o.material.map) { o.material.map.updateMatrix(); uvM = o.material.map.matrix; }
      const flip = m.determinant() < 0;
      for (let tri = 0; tri < P.count; tri += 3) {
        const order = flip ? [tri, tri + 2, tri + 1] : [tri, tri + 1, tri + 2];
        for (const i of order) {
          v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
          if (N) { v.fromBufferAttribute(N, i).applyMatrix3(n3).normalize(); nor.push(v.x, v.y, v.z); } else nor.push(0, 1, 0);
          if (U) { uv2.set(U.getX(i), U.getY(i)); if (uvM) uv2.applyMatrix3(uvM); } else uv2.set(0.5, 0.5);
          uv.push(cx + Math.min(1, Math.max(0, uv2.x)) * cs, cy + Math.min(1, Math.max(0, uv2.y)) * cs);
          col.push(color.r, color.g, color.b);
          if (SI && boneMap) { si.push(boneMap[SI.getX(i)] || 0, boneMap[SI.getY(i)] || 0, boneMap[SI.getZ(i)] || 0, boneMap[SI.getW(i)] || 0); sw.push(SW.getX(i), SW.getY(i), SW.getZ(i), SW.getW(i)); }
          else { si.push(self, 0, 0, 0); sw.push(1, 0, 0, 0); }
        }
      }
    });
    if (!pos.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    geo.computeBoundingSphere();
    // 뼈 역행렬: 스킨 메시의 뼈는 원본 skeleton 것을, 나머지는 세계 행렬의 역
    const inverses = bones.map((b) => b.matrixWorld.clone().invert());
    scene.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.bones.forEach((b, i) => { inverses[idx.get(b)] = o.skeleton.boneInverses[i].clone(); }); });
    // 뼈대 복제용 표(이름·부모·자세)
    const tree = bones.map((b) => ({ name: b.name, parent: b.parent === scene ? -1 : idx.get(b.parent), p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
    const clips = {}; for (const c of t.anims) clips[c.name] = c;
    const tpl = { geometry: geo, inverses, tree, clips, spec, size: t.size.clone(), min: t.min.clone(), center: t.center.clone() };
    this.enemyTpl.set(kind, tpl);
    return tpl;
  }
  // 적 하나: 뼈대 복제 + SkinnedMesh + AnimationMixer. 발바닥이 y=0, 중심이 x/z=0. 돌려주는 그룹의 userData 에 mixer·actions·bones(이름→노드)·height 가 있다
  buildEnemy(kind) {
    const T = this.enemyTemplate(kind); if (!T) return null;
    const spec = T.spec;
    this.enemyMat = this.enemyMat || new THREE.MeshLambertMaterial({ map: this.atlas, vertexColors: true, skinning: true }); // r128 은 skinning 플래그가 있어야 뼈 셰이더가 붙는다
    const inner = new THREE.Group(); inner.position.set(-T.center.x, -T.min.y, -T.center.z);
    const bones = T.tree.map((e) => { const b = new THREE.Bone(); b.name = e.name; b.position.copy(e.p); b.quaternion.copy(e.q); b.scale.copy(e.s); return b; });
    T.tree.forEach((e, i) => { if (e.parent < 0) inner.add(bones[i]); else bones[e.parent].add(bones[i]); });
    const mesh = new THREE.SkinnedMesh(T.geometry, this.enemyMat); mesh.castShadow = true; mesh.frustumCulled = false;
    inner.add(mesh); inner.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones, T.inverses), new THREE.Matrix4());
    const mixer = new THREE.AnimationMixer(inner);
    const actions = {}; for (const [name, clip] of Object.entries(T.clips)) actions[name] = mixer.clipAction(clip);
    const byName = {}; for (const b of bones) byName[b.name] = b;
    const g = new THREE.Group(); g.add(inner);
    const scale = this.parts.enemyScale * (spec.scale || 1);
    g.scale.setScalar(scale);
    g.userData = { mixer, actions, bones: byName, inner, mesh, height: T.size.y * scale, width: Math.max(T.size.x, T.size.z) * scale, anim: spec.anim || 'walk', animSpeed: spec.animSpeed || 1, spec };
    return g;
  }
  // 적에게 붙이는 소품(갑옷 방패 등): 장식 조각을 뼈에 매단다. 그리기 +1
  enemyProp(P) {
    const pg = this.pieceGeometry(P); if (!pg) return null;
    const m = new THREE.Mesh(pg.geometry, pg.material); m.castShadow = true; return m;
  }
};

// ---------- 타워 그림 렌더러 (카드 그림 · 상세 미리보기) ----------
// 참고 게임(레이드 러시)의 카드는 타워 3D 모델 그림이다. 작은 별도 WebGL 화면(160×160) 하나로:
//   ⑴ snapshot(family, tier) — 한 번 그려 data URL 로 캐시한다(카드마다 매 프레임 그리지 않는다)
//   ⑵ attach(host, family, tier) / detach() — 상세 화면이 열린 동안만 이 캔버스를 그 자리에 붙이고 천천히 돌린다(초당 30번)
NGN.TowerPreview = class TowerPreview {
  constructor(models) {
    this.models = models; this.cache = new Map(); this.live = null;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(160, 160, false);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xFFFFFF, 0x66705A, 0.9));
    const sun = new THREE.DirectionalLight(0xFFF3DD, 1.0); sun.position.set(3, 6, 4); this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    this.holder = new THREE.Group(); this.scene.add(this.holder);
  }
  place(family, tier, element) {
    while (this.holder.children.length) this.holder.remove(this.holder.children[0]);
    const body = this.models.buildTower(family, tier, { element, scale: 1 });
    if (!body) return null;
    if (body.userData.head) body.userData.head.rotation.y = 0.5;
    const box = new THREE.Box3().setFromObject(body);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    body.position.set(-center.x, -box.min.y, -center.z);
    this.holder.add(body);
    const h = Math.max(size.y * 1.15, size.x * 1.25, size.z * 1.25);
    const d = (h / 2) / Math.tan(this.camera.fov * Math.PI / 360) * 1.3;
    this.camera.position.set(0, size.y * 0.5 + d * 0.6, d * 0.8);
    this.camera.lookAt(0, size.y * 0.45, 0);
    this.camera.updateProjectionMatrix();
    return body;
  }
  snapshot(family, tier, element) {
    const key = family + ':' + tier;
    if (this.cache.has(key)) return this.cache.get(key);
    if (!this.place(family, tier, element)) return null;
    this.holder.rotation.y = -0.6;
    this.renderer.setSize(160, 160, false);
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.cache.set(key, url);
    return url;
  }
  attach(host, family, tier, element, px = 220) {
    this.detach();
    if (!this.place(family, tier, element)) return false;
    this.renderer.setSize(px, px, false);
    const c = this.renderer.domElement; c.style.width = c.style.height = px + 'px'; host.appendChild(c);
    this.live = { t: 0, last: 0 };
    this.holder.rotation.y = -0.6;
    this.renderer.render(this.scene, this.camera);
    return true;
  }
  detach() { const c = this.renderer.domElement; if (c.parentNode) c.parentNode.removeChild(c); this.live = null; }
  tick(dt, now) {
    if (!this.live) return;
    if (now - this.live.last < 33) return;
    this.live.last = now; this.holder.rotation.y += dt * 0.9;
    this.renderer.render(this.scene, this.camera);
  }
};
