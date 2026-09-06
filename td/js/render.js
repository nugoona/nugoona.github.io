'use strict';
// 연출: 엔진 상태(타워·적)를 3D 로 그리고, 엔진 이벤트(발사·피격·처치·레벨업·건설)를 효과로 바꾼다. 외부 파일 없이 전부 코드로.
// 타워 계열마다 다르게(FAMILY_SHOT, 2026-09-06) — 덤불 초록 화살 · 불꽃바위 불덩이+폭발 링 · 서리넝쿨 얼음 결정+서리 꼬리 · 유령폐허 보라 구 · 보급더미 쇠 포탄 · 태양기둥 금빛 구 ·
// 폭풍기둥 번개(투사체 없음) · 설인 눈덩이 · 어둠화덕 독 방울. 튕김=번개가 이어지는 선. 발사 순간 총구 섬광 + 타워 반동, 피격 파티클, 적은 튀어오르며 사라지고, 타워는 솟아오르며 지어진다.
// 타워 = 몸통 + 어두운 속성색 외곽선 + 발밑 빛(design.md 12-10). 사거리는 원판+굵은 테두리(타워 누름·자리 미리보기).
// 파티클은 THREE.Points 하나(최대 600개)로 그려 그리기 1회.
window.NGN = window.NGN || {};

const lam = (color, opts) => new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));
const glow = (color, opts) => new THREE.MeshLambertMaterial(Object.assign({ color, emissive: color, emissiveIntensity: 0.55 }, opts || {}));
// 공격 타입별 색·투사체 모양(계열 표에 없는 계열의 기본값)
const SHOT = {
  physical: { color: 0xF2E6C8, kind: 'arrow', speed: 46 },
  elemental: { color: 0xFF7A2A, kind: 'fireball', speed: 26 },
  energy: { color: 0x7FD6FF, kind: 'crystal', speed: 40 },
  essence: { color: 0xB07CFF, kind: 'orb', speed: 22 },
  decay: { color: 0xC050C0, kind: 'blob', speed: 32 },
  arcane: { color: 0xFF80E0, kind: 'orb', speed: 30 },
};
// 계열마다 다른 투사체(2026-09-06 사장님 지적 "효과가 없어서 다 같은 타워같아"). 같은 공격 타입이라도 계열이 다르면 모양·색·맞을 때 효과가 갈린다.
//   덤불=초록 잎 화살 · 불꽃바위=불덩이+폭발 링 · 서리넝쿨=얼음 결정+서리 알갱이 · 유령폐허=보라 유령 구 · 보급더미=쇠 포탄(크고 느림)
//   태양기둥=금빛 구+번개 튕김 · 폭풍기둥=번개(투사체 없이 바로 꽂힘) · 설인=눈덩이 · 어둠화덕=자줏빛 독 방울 연사
// 2026-09-06(J-2) Kenney 입자 팩 그림으로 계열 10종 전부 다르게: muzzle=발사 순간 그림 · trail=날아가는 꼬리 · 맞을 때는 impact() 가 계열별로
const C = () => NGN.CELL || {};
const FAMILY_SHOT = {
  shrub: { color: 0x9CF06A, kind: 'arrow', speed: 46, hit: 0x9CF06A, muzzle: 'cross' },
  fiery: { color: 0xFF7A2A, kind: 'fireball', speed: 26, hit: 0xFF9A3A, muzzle: 'flame', trail: [{ cell: 'fire', color: 0xFFB040, size: 1.0, ttl: 0.3, add: true }, { cell: 'smoke', color: 0x333333, size: 0.9, sizeEnd: 1.8, ttl: 0.7, add: false, every: 2 }] },
  frost: { color: 0xA8ECFF, kind: 'crystal', speed: 40, hit: 0xD8F6FF, muzzle: 'star4', trail: [{ cell: 'snowflake', color: 0xBFEFFF, size: 0.7, sizeEnd: 1.1, ttl: 0.6, add: true, spin: 2 }] },
  haunted: { color: 0xB07CFF, kind: 'orb', speed: 22, hit: 0xC8A0FF, float: true, muzzle: 'swirl', trail: [{ cell: 'swirl', color: 0xA070FF, size: 1.2, sizeEnd: 0.4, ttl: 0.5, add: true, spin: 4 }] },
  heap: { color: 0xC9D0D8, kind: 'cannonball', speed: 30, hit: 0xE0E0E0, spark: 0xFFE9A8, muzzle: 'flame', trail: [{ cell: 'smoke', color: 0x5A5A5A, size: 0.8, sizeEnd: 1.6, ttl: 0.6, add: false }] },
  sun: { color: 0xFFD54A, kind: 'orb', speed: 34, hit: 0xFFE38A, muzzle: 'halo', trail: [{ cell: 'star6', color: 0xFFE38A, size: 0.9, sizeEnd: 0.2, ttl: 0.4, add: true }] },
  storm: { color: 0xBFE8FF, kind: 'bolt', speed: 999, hit: 0xDFF4FF, muzzle: 'spark' },
  snowman: { color: 0xFFFFFF, kind: 'snowball', speed: 28, hit: 0xFFFFFF, muzzle: 'dot', trail: [{ cell: 'dot', color: 0xFFFFFF, size: 0.5, sizeEnd: 0.1, ttl: 0.35, add: false }] },
  firepit: { color: 0xD060D0, kind: 'blob', speed: 36, hit: 0xE070E0, muzzle: 'swirl', trail: [{ cell: 'smoke', color: 0x7A3E8C, size: 0.7, sizeEnd: 1.4, ttl: 0.6, add: false, every: 2 }] },
};

// 파티클 풀: 위치·속도·색·수명을 배열로 들고 Points 하나로 그린다
class Particles {
  constructor(root, max = 600) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.ttl = new Float32Array(max); this.grav = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setDrawRange(0, 0);
    // 카메라가 60 쯤 떨어져 있어 점이 작아 보인다 — 크게(2.2) 그리고 더하기 혼합으로 빛나게
    const mat = new THREE.PointsMaterial({ size: 2.2, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(geo, mat); this.points.frustumCulled = false; this.points.renderOrder = 4;
    root.add(this.points);
    this.geo = geo;
  }
  emit(at, count, color, opt = {}) {
    const c = new THREE.Color(color);
    const spd = opt.speed || 3, up = opt.up === undefined ? 2.5 : opt.up, ttl = opt.ttl || 0.6, grav = opt.grav === undefined ? 9 : opt.grav, spread = opt.spread || 0.15;
    for (let k = 0; k < count; k++) {
      let i;
      if (this.n < this.max) i = this.n++; else i = Math.floor(Math.random() * this.max); // 꽉 차면 덮어쓴다
      this.pos[i * 3] = at.x + (Math.random() - .5) * spread; this.pos[i * 3 + 1] = at.y + (Math.random() - .5) * spread; this.pos[i * 3 + 2] = at.z + (Math.random() - .5) * spread;
      const a = Math.random() * Math.PI * 2, r = Math.random() * spd;
      this.vel[i * 3] = Math.cos(a) * r; this.vel[i * 3 + 1] = Math.random() * up + up * 0.3; this.vel[i * 3 + 2] = Math.sin(a) * r;
      const j = 0.85 + Math.random() * 0.3;
      this.col[i * 3] = Math.min(1, c.r * j); this.col[i * 3 + 1] = Math.min(1, c.g * j); this.col[i * 3 + 2] = Math.min(1, c.b * j);
      this.life[i] = 0; this.ttl[i] = ttl * (0.7 + Math.random() * 0.6); this.grav[i] = grav; this.size[i] = 1;
    }
  }
  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.n; i++) {
      this.life[i] += dt;
      if (this.life[i] >= this.ttl[i]) { // 죽은 것은 마지막 것과 자리를 바꿔 촘촘하게
        const j = --this.n; if (i === j) break;
        for (let k = 0; k < 3; k++) { this.pos[i * 3 + k] = this.pos[j * 3 + k]; this.vel[i * 3 + k] = this.vel[j * 3 + k]; this.col[i * 3 + k] = this.col[j * 3 + k]; }
        this.life[i] = this.life[j]; this.ttl[i] = this.ttl[j]; this.grav[i] = this.grav[j]; i--; continue;
      }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.05) { this.pos[i * 3 + 1] = 0.05; this.vel[i * 3 + 1] *= -0.3; }
      alive++;
    }
    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
    return alive;
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

// 적 머리 위·발밑 표시를 적 전체가 나눠 쓰는 InstancedMesh 넷(방어 고리 · 성질 고리 · 체력 막대 뒤판 · 앞판)으로 그린다 — 적 하나마다 4회씩 그리던 것을 전체 4회로(2026-09-06 성능 실측: 적 35마리에서 그리기 340회·22ms).
// 색은 인스턴스 색(instanceColor)으로, 위치·크기는 매 프레임 행렬로. 막대는 카메라를 본다
class EnemyOverlays {
  constructor(root, geo, cap = 256) {
    const mk = (g, mat) => { const m = new THREE.InstancedMesh(g, mat, cap); m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, new THREE.Color(1, 1, 1)); m.instanceColor.setUsage(THREE.DynamicDrawUsage); root.add(m); return m; };
    this.ring = mk(geo.ring, new THREE.MeshBasicMaterial({ color: 0xFFFFFF }));
    this.ring2 = mk(geo.ring, new THREE.MeshBasicMaterial({ color: 0xFFFFFF }));
    this.glow = mk(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: geo.glowTex, color: 0xFFFFFF, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glow.renderOrder = 1;
    this.back = mk(geo.hp, new THREE.MeshBasicMaterial({ color: 0x3A1F1F }));
    this.front = mk(geo.hp, new THREE.MeshBasicMaterial({ color: 0xFFFFFF }));
    this.ring.renderOrder = 1; this.ring2.renderOrder = 1; this.back.renderOrder = 2; this.front.renderOrder = 3;
    this.n = { ring: 0, ring2: 0, back: 0, front: 0, glow: 0 };
    this._o = new THREE.Object3D(); this._c = new THREE.Color(); this._right = new THREE.Vector3();
  }
  begin() { this.n.ring = this.n.ring2 = this.n.back = this.n.front = this.n.glow = 0; }
  glowAt(pos, size, colorHex) { this.put(this.glow, 'glow', pos, EnemyOverlays.FLATN, size, size, size, colorHex); }
  put(mesh, key, pos, quat, sx, sy, sz, colorHex) { const i = this.n[key]++; if (i >= mesh.count && i >= 256) return; const o = this._o; o.position.copy(pos); o.quaternion.copy(quat); o.scale.set(sx, sy, sz); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); mesh.setColorAt(i, this._c.setHex(colorHex)); }
  // 발밑 고리(납작하게)
  ringAt(pos, r, colorHex, second = false) { const q = EnemyOverlays.FLAT; this.put(second ? this.ring2 : this.ring, second ? 'ring2' : 'ring', pos, q, r, r, r, colorHex); }
  // 체력 막대: 카메라를 보는 막대 두 장. 앞판은 왼쪽 정렬(비율만큼 짧아진다)
  barAt(pos, camera, w, ratio, colorHex) {
    this.put(this.back, 'back', pos, camera.quaternion, w, 1, 1, 0x3A1F1F);
    this._right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const fw = w * Math.max(0, ratio); const p = pos.clone().addScaledVector(this._right, -(w - fw) / 2).addScaledVector(camera.getWorldDirection(new THREE.Vector3()), -0.02);
    this.put(this.front, 'front', p, camera.quaternion, Math.max(0.001, fw), 1.02, 1.02, colorHex);
  }
  end() { for (const k of ['ring', 'ring2', 'back', 'front', 'glow']) { const m = this[k]; m.count = this.n[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } }
  clear() { this.begin(); this.end(); }
}
EnemyOverlays.FLAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
EnemyOverlays.FLATN = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); // 평면은 +Z 가 앞 — 위를 보게

NGN.Renderer = class Renderer {
  constructor(world, data, models = null) {
    this.world = world; this.data = data;
    this.models = models && models.ready ? models : null;
    this.towerMeshes = new Map(); this.enemyMeshes = new Map();
    this.shots = []; this.fx = []; this.dying = []; this.bolts = [];
    this.geo = {
      eye: new THREE.SphereGeometry(0.085, 8, 6), ring: new THREE.TorusGeometry(0.55, 0.07, 6, 20), hp: new THREE.BoxGeometry(1, 0.1, 0.1),
      arrow: new THREE.CylinderGeometry(0.07, 0.16, 1.6, 5), fireball: new THREE.SphereGeometry(0.42, 8, 6), crystal: new THREE.OctahedronGeometry(0.38, 0), orb: new THREE.SphereGeometry(0.38, 8, 6), blob: new THREE.SphereGeometry(0.3, 6, 5),
      cannonball: new THREE.SphereGeometry(0.5, 8, 6), snowball: new THREE.SphereGeometry(0.46, 8, 6),
      flash: new THREE.PlaneGeometry(1, 1), burstRing: new THREE.RingGeometry(0.6, 0.8, 24),
    };
    this.mat = {
      eye: new THREE.MeshBasicMaterial({ color: 0xFFF2C4 }), eyeRed: new THREE.MeshBasicMaterial({ color: 0xFF4040 }),
      hpBack: new THREE.MeshBasicMaterial({ color: 0x3A1F1F }), hpFront: new THREE.MeshBasicMaterial({ color: 0x5FD36B }), hpMid: new THREE.MeshBasicMaterial({ color: 0xF2C230 }), hpLow: new THREE.MeshBasicMaterial({ color: 0xE84A3A }),
      slowed: lam(0x9FD8F0), wood: lam(0x7A5A3A), gold: glow(0xE8C34A, { emissiveIntensity: 0.3 }),
      bolt: new THREE.LineBasicMaterial({ color: 0xBFE8FF, transparent: true, opacity: 0.95 }),
    };
    // 색마다 재질 하나(투사체·섬광·링·외곽선·발밑 빛). 계열 색이 10개라 재질도 그만큼만 생긴다
    this._matCache = new Map();
    this.shotMat = (c) => this.cachedMat('shot', c, () => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flashMat = (c) => this.cachedMat('flash', c, () => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    // 상시 발광 테두리(J-3, 2026-09-06): 참고 게임(레이드 러시)의 노란 발광 테두리를 속성색으로. 같은 지오메트리를 1.06배 키워 뒷면만 밝은 속성색으로 한 번 더 그린다(+1 그리기).
    // 🛑 OutlinePass 는 쓰지 않는다 — 씬을 2번 더 그려 +7~12ms(checklist J-3). 어두운 먹선(×0.42)이었던 것을 밝게(흰색 쪽으로 35%) 바꿨다
    this.outlineMat = (c) => this.cachedMat('outline', c, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).lerp(new THREE.Color(0xFFFFFF), 0.35), side: THREE.BackSide, transparent: true, opacity: 0.92, depthWrite: false }));
    this.glowTex = null;
    this.foeMat = { basic: lam(0x7B3FB5), fast: lam(0xE8A23A), tank: lam(0x3F5566), swarm: lam(0x5FA85A), flyer: lam(0xE6E1D3), boss: lam(0x8B1E2B) };
    this.defMat = {};
    for (const k of Object.keys(NGN.DEFENSE_COLOR)) this.defMat[k] = glow(NGN.DEFENSE_COLOR[k], { emissiveIntensity: 0.35 });
    this.rangeRing = null; this.time = 0;
    this.floatQueue = []; this.floatBudget = 0;
    this.makeFx();
    this._tmpObj = new THREE.Object3D();
    this.onNotice = null; // (글) => void — 아이템 드롭 같은 엔진 사건을 화면 글로 알릴 때 main.js 가 채운다
    this.onLeak = null; // (적) => void — 적이 성에 닿았다(생명 알약 연출, main.js)
    this.onDanger = null; // (켜짐) => void — 적이 성 가까이 왔다/물러났다(화면 가장자리 경고, main.js)
    this.onBossKill = null; // (적) => void — 보스를 잡았다(배너, main.js)
    this.dangerOn = false; // (글) => void — 아이템 드롭 같은 사건을 화면 글로 알릴 때 main.js 가 채운다
    // 적 성질(checklist I-8) 표시색: 적 발밑에 그 색 고리를 더 그린다
    this.specialMat = {};
    this.specialColor = {};
    for (const sp of (data.specials && data.specials.specials) || []) { this.specialMat[sp.id] = glow(new THREE.Color(sp.color || '#ffffff').getHex(), { emissiveIntensity: 0.8 }); this.specialColor[sp.id] = new THREE.Color(sp.color || '#ffffff').getHex(); }
    this.branchColor = {};
    const B = (data.balance && data.balance.tier3Branches) || {};
    for (const k of Object.keys(B)) if (!k.startsWith('_')) this.branchColor[k] = { hex: new THREE.Color(B[k].color || '#E8C34A').getHex(), css: B[k].color || '#E8C34A', name: B[k].name };
  }
  reset() {
    for (const g of this.towerMeshes.values()) this.world.root.remove(g);
    for (const g of this.enemyMeshes.values()) this.world.root.remove(g);
    for (const d of this.dying) this.world.root.remove(d.g);
    for (const s of this.shots) this.world.root.remove(s.mesh);
    for (const f of this.fx) this.world.root.remove(f.mesh);
    for (const b of this.bolts) this.world.root.remove(b.line);
    this.towerMeshes.clear(); this.enemyMeshes.clear(); this.dying = []; this.shots = []; this.fx = []; this.bolts = [];
    this.showRange(null); this.floatQueue.length = 0;
    // 지도가 바뀌면 파티클도 새 root 에
    this.makeFx();
  }
  // 파티클: 입자 그림(Kenney)이 있으면 스프라이트 시스템(fx.js), 없으면 옛 점 파티클. 번개도 여기서
  makeFx() {
    if (this.lightning) this.lightning.clear();
    this.particles = this.models && this.models.fxTexture && NGN.Sprites ? new NGN.Sprites(this.world.root, this.models.fxTexture) : new Particles(this.world.root);
    if (this.overlays) for (const k of ['ring', 'ring2', 'back', 'front']) this.world.root.remove(this.overlays[k]);
    if (!this.glowTex) this.glowSprite(0xffffff, 1); this.geo.glowTex = this.glowTex;
    this.overlays = new EnemyOverlays(this.world.root, this.geo);
    this.lightning = NGN.Lightning ? new NGN.Lightning(this.world.root) : null;
  }
  // 그림 칸 번호(fx.js CELL). 옛 점 파티클이면 무시된다
  cell(name) { return (NGN.CELL && NGN.CELL[name]) || 0; }

  // ---------- 타워 ----------
  // 타워 머리 위 표찰: 레벨 + (3단이면) 갈래 이름을 갈래 색으로. 어느 갈래인지 지어진 타워 위에서 보인다(checklist I-7)
  levelBadge(level, branch) {
    const b = branch ? this.branchColor[branch] : null;
    const c = document.createElement('canvas'); c.width = 192; c.height = 48;
    const ctx = c.getContext('2d');
    const text = (level > 1 ? 'Lv.' + level : '') + (b ? (level > 1 ? ' · ' : '') + b.name : '');
    ctx.font = 'bold 26px Jua, Malgun Gothic, sans-serif';
    const w = Math.min(184, ctx.measureText(text).width + 28), x0 = (192 - w) / 2;
    ctx.fillStyle = 'rgba(20,24,30,.85)'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, 4, w, 40, 12); else ctx.rect(x0, 4, w, 40); ctx.fill();
    ctx.strokeStyle = b ? b.css : '#F2B632'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 96, 25);
    const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.scale.set(3.6, 0.9, 1); sp.renderOrder = 5;
    return sp;
  }
  // 3단 갈래 깃발: 깃대(나무색)와 천(갈래색)을 꼭짓점 색으로 칠한 지오메트리 하나. 갈래 색마다 한 번만 만든다
  flagGeometry(colorHex) {
    this._flagGeo = this._flagGeo || new Map(); if (this._flagGeo.has(colorHex)) return this._flagGeo.get(colorHex);
    const pole = new THREE.CylinderGeometry(0.05, 0.05, 2.0, 5).toNonIndexed(), cloth = new THREE.PlaneGeometry(0.9, 0.55).toNonIndexed();
    cloth.translate(0.45, 0.7, 0);
    const pos = [], nor = [], col = []; const wood = new THREE.Color(0x7A5A3A), c = new THREE.Color(colorHex).multiplyScalar(1.25);
    const push = (g, color, both) => { const p = g.attributes.position, n = g.attributes.normal; const put = (i, flip) => { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i) * (flip ? -1 : 1), n.getY(i) * (flip ? -1 : 1), n.getZ(i) * (flip ? -1 : 1)); col.push(color.r, color.g, color.b); }; for (let i = 0; i < p.count; i += 3) { put(i); put(i + 1); put(i + 2); if (both) { put(i, true); put(i + 2, true); put(i + 1, true); } } };
    push(pole, wood, false); push(cloth, c, true); // 천은 양면
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this._flagGeo.set(colorHex, geo); return geo;
  }
  flagMat() { return this._flagMat = this._flagMat || new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xFFFFFF, emissiveIntensity: 0.12 }); }
  cachedMat(kind, color, make) { const k = kind + ':' + color; if (!this._matCache.has(k)) this._matCache.set(k, make()); return this._matCache.get(k); }
  // 발밑 빛: 가운데가 밝고 가장자리로 사라지는 원(캔버스 한 장을 모두가 나눠 쓴다)
  glowSprite(color, size) {
    if (!this.glowTex) {
      const c = document.createElement('canvas'); c.width = c.height = 128; const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.45, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
      this.glowTex = new THREE.CanvasTexture(c);
    }
    const mat = this.cachedMat('glow', color, () => new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    const sp = new THREE.Sprite(mat); sp.scale.set(size, size, 1); sp.renderOrder = 2;
    return sp;
  }
  // 타워 하나 = 몸통(그리기 1회) + 속성색 외곽선(뒤집은 껍질, 1회) + 발밑 빛(1회) + [3단: 갈래 깃발] + 표찰.
  // 외곽선은 참고 게임(레이드 러시)의 "노란 발광 테두리"를 속성색으로 — 멀리서도 타워가 도드라지고 계열이 색으로 갈린다(2026-09-06)
  towerMesh(def, branch = null) {
    const M = this.world.M;
    const wrap = new THREE.Group();
    const add = (geo, mat, x, y, z, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; wrap.add(m); return m; };
    const tier = def.tier, ec = NGN.ELEMENT_COLOR[def.element];
    let body = this.models ? this.models.buildTower(def.family, def.tier, { element: def.element }) : null;
    if (!body) body = this.towerMeshCoded(def);
    wrap.add(body);
    const height = body.userData.height || 3;
    // 발광 테두리(J-3): 몸통·머리 각각 같은 지오메트리(바깥면만 남긴 것)를 1.06배 키워 뒷면만 밝은 속성색으로. 몸통보다 먼저 그려 뒤에서 테두리만 남는다.
    // 머리 껍질은 머리 축(pivot)의 자식이라 머리가 돌면 같이 돈다
    const hulls = [];
    const shell = (m, parent) => { const h = new THREE.Mesh(m.geometry.userData.outline || m.geometry, this.outlineMat(ec)); h.position.copy(m.position); h.scale.set(1.06, 1.04, 1.06); h.position.y -= 0.01; h.renderOrder = -1; parent.add(h); hulls.push(h); };
    if (body.userData.bodyMesh) shell(body.userData.bodyMesh, body); else body.children.forEach((m) => { if (m.isMesh) shell(m, body); });
    if (body.userData.headMesh) shell(body.userData.headMesh, body.userData.head);
    const glowSize = 4.2 + tier * 0.3, glowColor = ec; // 발밑 빛은 오버레이 인스턴스가 매 프레임 그린다(update)
    if (tier >= 3) {
      // 3단 표식: 갈래 깃발(화력 빨강 / 광역 파랑, balance.json 색). 갈래 안 고른 3단은 금색. 2단까지는 표식 없음 — 높이가 말해 준다
      const bc = branch && this.branchColor[branch] ? this.branchColor[branch].hex : 0xE8C34A;
      // 깃대+천을 한 지오메트리(꼭짓점 색)로 — 타워마다 그리기 2회이던 것을 1회로(2026-09-06 성능)
      add(this.flagGeometry(bc), this.flagMat(), 1.35, 1.3, -0.9, false);
    }
    const anim = {};
    if (def.aura) { anim.spin = add(new THREE.TorusGeometry(1.7 + tier * 0.15, 0.06, 6, 30), glow(0xA8E06A, { emissiveIntensity: 0.6 }), 0, 1.4, 0, false); anim.spin.rotation.x = Math.PI / 2.4; }
    wrap.userData = { glowSize, glowColor, anim, starCount: -1, height, body, hulls, head: body.userData.head || null, headAnim: body.userData.headAnim || null, headBaseY: body.userData.headBaseY || 0, fx: body.userData.fx || [], baseScale: body.scale.x, recoil: 0, born: this.time, family: def.family, fxAt: 0 };
    return wrap;
  }
  // 코드로 그린 실루엣(Kenney 를 못 읽을 때의 폴백)
  towerMeshCoded(def) {
    const color = NGN.ELEMENT_COLOR[def.element];
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.54, 1.3 + def.tier * 0.3, 8), lam(color)); body.position.y = 0.65 + def.tier * 0.15; body.castShadow = true; g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.9, 8), lam(new THREE.Color(color).multiplyScalar(0.62))); roof.position.y = 1.75 + def.tier * 0.3; roof.castShadow = true; g.add(roof);
    g.scale.setScalar(1.3); g.userData.height = (2.2 + def.tier * 0.3) * 1.3;
    return g;
  }
  setBadge(g, level, branch) {
    const u = g.userData, key = level + ':' + (branch || ''); if (u.starCount === key) return; u.starCount = key;
    if (u.badge) { g.remove(u.badge); u.badge = null; }
    if (level >= 1 || branch) { const b = this.levelBadge(level + 1, branch); b.position.y = u.height + 0.9; g.add(b); u.badge = b; }
  }
  syncTowers(game) {
    const seen = new Set();
    for (const inst of game.towersBuilt) {
      seen.add(inst.id);
      let g = this.towerMeshes.get(inst.id);
      const key = inst.def.id + ':' + (inst.branch || '');
      if (!g || g.userData.defId !== key) {
        if (g) this.world.root.remove(g);
        g = this.towerMesh(inst.def, inst.branch);
        g.userData.defId = key;
        g.position.copy(this.world.toWorld(inst.slot.x, inst.slot.y, 0.3));
        this.world.root.add(g);
        this.towerMeshes.set(inst.id, g);
        // 건설·승급: 솟아오르며 커지고 발밑에 빛 링
        g.userData.born = this.time; g.scale.setScalar(0.01);
        this.ringFx(g.position.clone().setY(0.4), NGN.ELEMENT_COLOR[inst.def.element], 2.6, 0.5);
        this.particles.emit(g.position.clone().setY(1), 18, NGN.ELEMENT_COLOR[inst.def.element], { speed: 2.5, up: 3, ttl: 0.7 });
      }
      if (!inst.def.aura) this.setBadge(g, inst.level - 1, inst.branch);
    }
    for (const [id, g] of this.towerMeshes) if (!seen.has(id)) { this.world.root.remove(g); this.towerMeshes.delete(id); }
  }
  // 사거리: 반투명 원판 + 굵은 테두리(속성색). 그전에는 폭 0.12 짜리 흰 선 하나(투명도 0.35)라 폰에서 안 보였다(사장님 지적 2026-09-06 "사거리 범위도 안 나오고").
  // 지어진 타워를 눌렀을 때와, 카드를 고르고 자리를 눌러 미리 볼 때 둘 다 이걸 쓴다. ghost 를 주면 그 자리에 지을 타워의 반투명 모형도 함께
  showRange(slot, range, opts = {}) {
    if (this.rangeRing) { this.world.root.remove(this.rangeRing); this.rangeRing = null; }
    if (this.ghost) { this.world.root.remove(this.ghost); this.ghost = null; }
    if (!slot || !range) return;
    const r = range * NGN.SCALE, color = opts.color || 0xFFFFFF;
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }));
    const edge = new THREE.Mesh(new THREE.RingGeometry(r - 0.42, r, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    const edge2 = new THREE.Mesh(new THREE.RingGeometry(r - 0.55, r - 0.42, 64), new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.7, depthWrite: false }));
    for (const m of [disc, edge, edge2]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 3; g.add(m); }
    g.position.copy(this.world.toWorld(slot.x, slot.y, 0.4));
    this.world.root.add(g); this.rangeRing = g;
    if (opts.ghost) {
      const body = this.models ? this.models.buildTower(opts.ghost.family, opts.ghost.tier, { element: opts.ghost.element }) : this.towerMeshCoded(opts.ghost);
      body.traverse((o) => { if (o.isMesh) { o.material = this.cachedMat('ghost', NGN.ELEMENT_COLOR[opts.ghost.element], () => new THREE.MeshBasicMaterial({ color: NGN.ELEMENT_COLOR[opts.ghost.element], transparent: true, opacity: 0.45, depthWrite: false })); o.castShadow = false; } });
      body.position.copy(this.world.toWorld(slot.x, slot.y, 0.3));
      this.world.root.add(body); this.ghost = body;
    }
  }

  // ---------- 적 ----------
  // 2026-09-06 적 6종이 전부 다른 창고 캐릭터(오크·여우·코끼리·병아리·앵무새·사자)로 — 뼈대 애니메이션(걷기·달리기)이 돈다(models.buildEnemy).
  // 종류별 코드 동작(kenney_parts.enemies.motion): 떼거리 hop 종종걸음 · 단단한 놈 stomp 쿵쿵 · 공중 hover 떠서 흔들림 · 빠른 놈 dash(먼지) · 보스 stomp + 붉은 기운
  // 적 하나 = 몸(스키닝 1회) + 방어 고리 1회 + 체력 막대 2회 (+ 성질 고리 1회 + 성질 소품 1회 + 보스 발밑 빛 1회)
  enemyMesh(e) {
    const g = new THREE.Group();
    const G = this.geo;
    const kBody = this.models ? this.models.buildEnemy(e.kind) : null;
    let scale = 1.3, height = 1.2, width = 1;
    const spec = (this.data.kenneyParts && this.data.kenneyParts.enemies[e.kind]) || {};
    if (kBody) {
      g.add(kBody); scale = 1; height = kBody.userData.height; width = kBody.userData.width;
      const u = kBody.userData; const act = u.actions[u.anim] || u.actions.walk || u.actions.run || Object.values(u.actions)[0];
      if (act) { act.play(); act.timeScale = u.animSpeed; act.time = Math.random() * act.getClip().duration; kBody.userData.action = act; }
    } else { const fm = this.foeMat[e.kind] || this.foeMat.basic; const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 9), fm); body.position.y = 0.45; body.castShadow = true; g.add(body); scale = 1.6 * (e.kind === 'boss' ? 2.6 : e.kind === 'tank' ? 1.55 : e.kind === 'swarm' ? 0.95 : 1.25); }
    const rs = Math.max(0.7, width * 0.55);
    // 방어 고리·성질 고리·체력 막대는 EnemyOverlays(인스턴스)가 매 프레임 그린다 — 여기서는 색·크기만 기억
    const ringColor = NGN.DEFENSE_COLOR[e.defense] || 0xFFFFFF;
    const spColor = e.special && this.specialColor[e.special] !== undefined ? this.specialColor[e.special] : null;
    if (kBody && (e.kind === 'swarm' || e.kind === 'fast' || e.kind === 'flyer')) kBody.userData.mesh.castShadow = false; // 작은 적 그림자 없음 — 떼거리 40마리가 그림자 패스를 40회 더 먹는다
    // 적 성질(checklist I-8): 몸에 소품(갑옷=둥근 방패 · 중갑=네모 방패 · 부활=깃발). 파티클은 syncEnemies 가 성질별로
    if (e.special && kBody && this.models && this.data.kenneyParts.specialProps && this.data.kenneyParts.specialProps[e.special]) {
      const P = this.data.kenneyParts.specialProps[e.special]; const prop = this.models.enemyProp(P);
      // 소품은 몸 크기에 맞춰 옆구리(방패)·등 뒤(깃발)에. 뼈에 매달지 않고 몸통 그룹에 고정 — 종류마다 뼈 위치가 달라 뼈 기준으로는 코끼리 몸속에 파묻혔다(실측)
      if (prop) { const T = this.models.enemyTemplate(e.kind), sz = T.size, ph = this.models.size(P.p); const k = (sz.y * (P.h || 0.6)) / Math.max(1e-3, ph.y); prop.scale.setScalar(k); prop.position.set(sz.x * (P.x === undefined ? 0.6 : P.x), sz.y * (P.y === undefined ? 0.5 : P.y), sz.z * (P.z || 0)); if (P.ry) prop.rotation.y = P.ry; kBody.userData.inner.add(prop); }
    }
    // 보스 발밑 붉은 빛은 오버레이 인스턴스(syncEnemies)
    g.userData = { barW: e.boss ? 2.4 : 1.2, barY: height + 0.45, rs, ringColor, spColor, bob: (e.id * 1.7) % 6.28, kind: e.kind, hitFlash: 0, fresh: true, mesh: kBody, body: kBody, height, motion: spec.motion || 'none', mixer: kBody ? kBody.userData.mixer : null, action: kBody ? kBody.userData.action : null, bones: kBody ? kBody.userData.bones : {}, fxAt: 0 };
    g.scale.setScalar(scale);
    if (e.boss && this.world.shake) this.world.shake(0.8); // 보스 등장: 땅이 울린다
    return g;
  }
  // alpha = 다음 엔진 틱까지 얼마나 왔나(0~1). 직전 틱(px,py)과 현재 틱(x,y) 사이를 이어 그린다 — 엔진은 10Hz 지만 화면은 매 프레임 움직인다
  syncEnemies(game, now, alpha = 1, dt = 0) {
    const seen = new Set();
    const a = Math.max(0, Math.min(1, alpha));
    const waveTime = game.wave ? game.wave.time : 0;
    let danger = false; const P = this.particles, c = (n) => this.cell(n);
    const OV = this.overlays; if (!this._ovBegun) OV.begin(); this._ovBegun = false; this.frameNo = (this.frameNo || 0) + 1;
    const many = game.enemies.length > 16; // 적이 많으면 뼈대 애니메이션을 한 프레임 걸러(30Hz) — CPU 4배 감속 폰 기준
    for (const e of game.enemies) {
      seen.add(e.id);
      let g = this.enemyMeshes.get(e.id);
      if (!g) { g = this.enemyMesh(e); this.world.root.add(g); this.enemyMeshes.set(e.id, g); }
      const u = g.userData;
      const slowed = e.slowUntil > waveTime && e.slowRatio > 0;
      const ix = (e.px === undefined ? e.x : e.px) + (e.x - (e.px === undefined ? e.x : e.px)) * a;
      const iy = (e.py === undefined ? e.y : e.py) + (e.y - (e.py === undefined ? e.y : e.py)) * a;
      // 종류별 동작
      const t = now + u.bob; let h = e.flying ? 3.2 : 0.02; let tilt = 0, roll = 0;
      if (u.motion === 'hop') h += Math.abs(Math.sin(t * 13)) * 0.28; // 병아리: 종종 뛴다
      else if (u.motion === 'stomp') { roll = Math.sin(t * 4.2) * 0.05; h += Math.max(0, Math.sin(t * 4.2)) * 0.04; } // 코끼리·사자: 좌우로 무겁게
      else if (u.motion === 'hover') { h += Math.sin(t * 2.6) * 0.35 + Math.sin(t * 7.1) * 0.08; roll = Math.sin(t * 2.6) * 0.12; } // 앵무새: 떠서 흔들림
      else if (u.motion === 'dash') { tilt = -0.08; }
      const p = this.world.toWorld(ix, iy, h);
      g.position.copy(p);
      // 뼈대 애니메이션: 감속되면 반으로
      if (u.mixer && dt > 0) { if (u.action) u.action.timeScale = (u.body.userData.animSpeed || 1) * (slowed ? 0.45 : 1); if (!many) u.mixer.update(dt); else if ((this.frameNo + e.id) % 2 === 0) u.mixer.update(dt * 2); }
      // 앵무새 날개: 클립에 날갯짓이 약해 코드로 더 펄럭인다
      if (u.motion === 'hover' && u.bones['wing-left']) { const f = Math.sin(now * 22) * 0.8; u.bones['wing-left'].rotation.z = 0.4 + f; u.bones['wing-right'].rotation.z = -0.4 - f; }
      // 회전: 진행 방향을 목표로 부드럽게(사원수 보간) + 동작 기울기
      const ahead = NGN.map.positionAt(e.path, e.s + 60);
      const q = this.world.toWorld(ahead[0], ahead[1], p.y);
      if (q.distanceToSquared(p) > 1e-4) { this._tmpObj.position.copy(p); this._tmpObj.lookAt(q); g.quaternion.slerp(this._tmpObj.quaternion, u.fresh ? 1 : 0.18); u.fresh = false; }
      if (u.body) { u.body.rotation.z = roll; u.body.rotation.x = tilt; }
      const ratio = Math.max(0, e.hp / e.maxHp);
      // 오버레이: 발밑 방어 고리(+성질 고리) · 머리 위 체력 막대(초록→노랑→빨강)
      const feet = this._feet = this._feet || new THREE.Vector3(); feet.set(p.x, e.flying ? 0.08 : p.y + 0.08, p.z);
      if (e.boss) OV.glowAt(feet, u.rs * 6, 0xFF3030);
      OV.ringAt(feet, u.rs, u.ringColor);
      if (u.spColor !== null) { feet.y += 0.04; OV.ringAt(feet, u.rs * 1.35, u.spColor, true); }
      const barPos = this._bar = this._bar || new THREE.Vector3(); barPos.set(p.x, p.y + u.barY, p.z);
      OV.barAt(barPos, this.world.camera, u.barW, ratio, ratio > 0.5 ? 0x5FD36B : ratio > 0.25 ? 0xF2C230 : 0xE84A3A);
      // 재생(적 성질): 체력이 차오르는 동안 0.5초마다 초록 알갱이가 위로 — 체력바만으로는 "왜 안 줄지?"를 못 알아본다
      if (e.regenPerSec && e.hp > 0 && ratio < 0.995 && now - (u.regenAt || 0) > 0.5) { u.regenAt = now; P.emit(p.clone().setY(p.y + u.height * 0.6), 4, 0x3DBB5C, { cell: c('cross'), size: 0.6, sizeEnd: 0.2, speed: 0.6, up: 2.2, ttl: 0.6, grav: 0 }); }
      // 성질·상태별 상시 파티클(0.12초마다): 감속=서리 눈꽃 · 날쌤/질주/여우=발밑 먼지 · 부활=보라 기운 · 분열=분홍 방울 · 미끄러움=물방울 · 보스=붉은 불씨
      if (now - u.fxAt > 0.12) {
        u.fxAt = now;
        if (slowed) P.emit(p.clone().setY(p.y + u.height * 0.5), 1, 0xBFEFFF, { cell: c('snowflake'), size: 0.9, sizeEnd: 1.3, ttl: 0.5, speed: 0.4, up: 0.6, grav: 0, spin: 2, spread: 0.6 });
        if ((e.special === 'swift' || e.special === 'blitz' || u.motion === 'dash') && !e.flying) P.emit(p.clone().setY(0.15), 1, 0xC9B28A, { cell: c('smoke'), size: 0.7, sizeEnd: 1.4, ttl: 0.45, speed: 0.5, up: 0.5, grav: -0.3, blend: 'normal', spread: 0.4 });
        if (e.special === 'revive' && !e.revived) P.emit(p.clone().setY(p.y + u.height * 0.7), 1, 0xB15BE8, { cell: c('swirl'), size: 1.0, sizeEnd: 0.3, ttl: 0.7, speed: 0.3, up: 1.2, grav: -0.5, spin: 3, spread: 0.5 });
        if (e.special === 'flock') P.emit(p.clone().setY(p.y + u.height * 0.5), 1, 0xFF5FB0, { cell: c('dot'), size: 0.5, sizeEnd: 0.1, ttl: 0.5, speed: 1.2, up: 1.0, grav: 1, spread: 0.5 });
        if (e.special === 'slippery') P.emit(p.clone().setY(p.y + u.height * 0.4), 1, 0x7FE0FF, { cell: c('dot'), size: 0.4, sizeEnd: 0.1, ttl: 0.5, speed: 0.8, up: 0.3, grav: 6, spread: 0.5 });
        if (e.boss) P.emit(p.clone().setY(p.y + 0.4), 2, 0xFF5030, { cell: c('fire'), size: 1.2, sizeEnd: 0.3, ttl: 0.6, speed: 1.2, up: 2.2, grav: -1, spread: 1.6 });
      }
      // 맞으면 잠깐 움찔(작아졌다 돌아옴)
      if (u.hitFlash > 0) { u.hitFlash -= 1 / 60; const s = g.scale.x; g.scale.setScalar(s * (1 - u.hitFlash * 0.25)); u.hitFlash = Math.max(0, u.hitFlash); g.scale.setScalar(s); }
      u.lastPos = p;
      if (e.s > e.path.length * 0.82) danger = true; // 성 가까이 온 적 — 화면 가장자리 경고
    }
    OV.end();
    if (danger !== this.dangerOn) { this.dangerOn = danger; if (this.onDanger) this.onDanger(danger); }
    for (const [id, g] of this.enemyMeshes) if (!seen.has(id)) { this.enemyMeshes.delete(id); this.dying.push({ g, t: 0, kind: g.userData.kind, leaked: g.userData.leaked, mixer: g.userData.mixer }); }
  }

  // ---------- 효과 ----------
  ringFx(at, color, maxScale, dur) {
    const m = new THREE.Mesh(this.geo.burstRing, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.copy(at); this.world.root.add(m);
    this.fx.push({ mesh: m, t: 0, dur, maxScale, kind: 'ring' });
  }
  flashFx(at, color, size) {
    const m = new THREE.Mesh(this.geo.flash, this.flashMat(color).clone()); // 투명도를 개별로 줄이므로 복제
    m.position.copy(at); m.scale.setScalar(size); m.lookAt(this.world.camera.position); this.world.root.add(m);
    this.fx.push({ mesh: m, t: 0, dur: 0.09, kind: 'flash' });
  }
  bolt(from, to) { // 번개: 지그재그 선 하나
    const pts = [from.clone()]; const n = 6;
    for (let i = 1; i < n; i++) { const p = from.clone().lerp(to, i / n); p.x += (Math.random() - .5) * 0.7; p.y += (Math.random() - .5) * 0.7; p.z += (Math.random() - .5) * 0.7; pts.push(p); }
    pts.push(to.clone());
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, this.mat.bolt); this.world.root.add(line);
    this.bolts.push({ line, t: 0 });
  }
  consume(game) {
    for (const ev of game.events) {
      if (ev.type === 'shot') {
        const tw = ev.tower, type = tw.def.attackType || 'physical', S = FAMILY_SHOT[tw.def.family] || SHOT[type] || SHOT.physical;
        const g = this.towerMeshes.get(tw.id);
        const top = g ? g.position.clone().setY(g.position.y + (g.userData.height || 3) * 0.75) : this.world.toWorld(tw.slot.x, tw.slot.y, 2.4);
        const to = this.world.toWorld(ev.target.x, ev.target.y, ev.target.flying ? 3.2 : 0.7);
        // 총구 섬광(계열별 그림) + 반동
        this.flashFx(top, S.color, 1.6 + (tw.def.tier - 1) * 0.4);
        if (NGN.sound) NGN.sound.play(S.kind === 'bolt' ? 'bolt' : S.kind === 'cannonball' ? 'cannon' : 'shot_' + type);
        if (S.muzzle) this.particles.emit(top, 1, S.color, { cell: this.cell(S.muzzle), size: 2.2 + tw.def.tier * 0.4, sizeEnd: 0.6, ttl: 0.16, speed: 0, up: 0, grav: 0, spread: 0, spin: 0 });
        if (g) { g.userData.recoil = 1; g.userData.aim = Math.atan2(to.x - g.position.x, to.z - g.position.z); }
        if (S.kind === 'bolt') { // 폭풍기둥: 투사체 없이 진짜 번개(LightningStrike)가 바로 꽂힌다 + 맞는 자리에 링. 번개 라이브러리가 없으면 지그재그 선
          if (this.lightning && this.lightning.ok) { this.lightning.strike(top, to, 0xCFEBFF, { radius: 0.1 + tw.def.tier * 0.03, branches: 3 + tw.def.tier * 2 }); }
          else { this.bolt(top, to); this.bolt(top, to); }
          this.impact({ to, type, family: tw.def.family, splash: tw.def.splash, S });
          continue;
        }
        // 투사체(계열별 모양)
        const mesh = new THREE.Mesh(this.geo[S.kind] || this.geo.orb, this.shotMat(S.color));
        mesh.position.copy(top);
        if (S.kind === 'arrow') { mesh.lookAt(to); mesh.rotateX(Math.PI / 2); }
        this.world.root.add(mesh);
        this.shots.push({ mesh, from: top, to, t: 0, dur: Math.max(0.08, top.distanceTo(to) / S.speed), type, family: tw.def.family, target: ev.target, splash: tw.def.splash, kind: S.kind, S });
      } else if (ev.type === 'bounce') {
        const from = this.world.toWorld(ev.from.x, ev.from.y, 0.9), to = this.world.toWorld(ev.target.x, ev.target.y, 0.9);
        this.bolt(from, to);
        this.particles.emit(to, 5, 0xBFE8FF, { speed: 2, up: 2, ttl: 0.4, grav: 4 });
      } else if (ev.type === 'hit') {
        const g = this.enemyMeshes.get(ev.enemy.id); if (g) g.userData.hitFlash = 1;
        const big = ev.dmg >= ev.enemy.maxHp * 0.12;
        if ((big || this.floatBudget > 0) && ev.dmg >= 1 && this.floatQueue.length < 12) { this.floatQueue.push({ x: ev.enemy.x, y: ev.enemy.y, h: ev.enemy.flying ? 3.6 : 1.6, dmg: ev.dmg, big }); this.floatBudget--; }
      } else if (ev.type === 'kill') {
        const at = this.world.toWorld(ev.enemy.x, ev.enemy.y, ev.enemy.flying ? 3.2 : 0.9);
        this.particles.emit(at, ev.enemy.boss ? 60 : 16, ev.enemy.boss ? 0xFF6060 : 0xFFE9A8, { speed: ev.enemy.boss ? 6 : 3.5, up: 4, ttl: 0.8 });
        // 골드가 튀어나온다(표준 TD): 금화 알갱이가 위로 튀고 "+N" 금색 글자. 새끼(분열)는 보상 0 이라 안 뜬다
        if (NGN.sound) { NGN.sound.play('kill'); if (ev.enemy.reward > 0) NGN.sound.play('gold', { delay: 0.06 }); }
        if (ev.enemy.reward > 0) { this.particles.emit(at, ev.enemy.boss ? 18 : 5, 0xFFD34D, { cell: this.cell('dot'), size: 0.55, sizeEnd: 0.25, speed: 2.2, up: 4.5, ttl: 0.7, grav: 12, spread: 0.3 }); if (this.floatQueue.length < 14) this.floatQueue.push({ x: ev.enemy.x, y: ev.enemy.y, h: ev.enemy.flying ? 4.2 : 2.4, text: '+' + Math.round(ev.enemy.reward), gold: true }); }
        if (ev.enemy.boss) { if (NGN.sound) NGN.sound.play('bossKill'); this.bossExplosion(at); this.floatQueue.push({ x: ev.enemy.x, y: ev.enemy.y, h: 3.4, kill: true, text: '보스 처치!' }); if (this.onBossKill) this.onBossKill(ev.enemy); }
      } else if (ev.type === 'leak') { // 적이 성에 닿았다: 성문에 폭발·불꽃·잔해, 성이 움찔, 화면 흔들림, 생명 알약(main.js onLeak)
        const g = this.enemyMeshes.get(ev.enemy.id); if (g) g.userData.leaked = true;
        this.castleHitFx(ev.enemy); if (NGN.sound) NGN.sound.play('castle');
        if (this.onLeak) this.onLeak(ev.enemy);
      } else if (ev.type === 'levelup') {
        const g = this.towerMeshes.get(ev.tower.id);
        if (g) { this.particles.emit(g.position.clone().setY(g.position.y + 2), 24, 0xF2B632, { speed: 2, up: 4, ttl: 0.9, grav: 5 }); this.ringFx(g.position.clone().setY(0.4), 0xF2B632, 3, 0.6); }
      } else if (ev.type === 'drop') { // 아이템(checklist I-11): 금빛 파티클 + "아이템!" 글자 + 안내
        const at = this.world.toWorld(ev.enemy.x, ev.enemy.y, ev.enemy.flying ? 3.2 : 0.9);
        this.particles.emit(at, 30, 0xFFD34D, { speed: 2.5, up: 5, ttl: 1.0, grav: 4 });
        this.floatQueue.push({ x: ev.enemy.x, y: ev.enemy.y, h: 2.4, item: true, text: '아이템!' });
        if (this.onNotice) this.onNotice(`${ev.item.이름} 획득 — 타워를 눌러 끼우세요`);
      } else if (ev.type === 'revive') { if (NGN.sound) NGN.sound.play('shot_essence', { vol: 0.3, key: 'revive' }); // 부활: 보라 링 + 파티클 + "부활!" 글자 — 조카가 "왜 안 죽지?"를 알아야 한다
        const at = this.world.toWorld(ev.enemy.x, ev.enemy.y, 0.4);
        this.ringFx(at, 0xB15BE8, 3, 0.5); this.particles.emit(at.clone().setY(0.9), 12, 0xB15BE8, { speed: 2, up: 3, ttl: 0.6 });
        this.floatQueue.push({ x: ev.enemy.x, y: ev.enemy.y, h: ev.enemy.flying ? 3.6 : 2.0, text: '부활!', item: true });
      } else if (ev.type === 'spawn' && ev.split) { // 분열: 새끼가 태어나는 자리에 분홍 파티클 + "분열!" 글자(둘 중 첫째에만)
        const at = this.world.toWorld(ev.enemy.x, ev.enemy.y, ev.enemy.flying ? 3.2 : 0.9);
        this.particles.emit(at, 10, 0xFF5FB0, { speed: 2.5, up: 2.5, ttl: 0.5 });
        if (!this._splitTick || this._splitTick !== game.time) { this._splitTick = game.time; this.floatQueue.push({ x: ev.enemy.x, y: ev.enemy.y, h: ev.enemy.flying ? 3.8 : 2.0, text: '분열!', item: true }); }
      } else if (ev.type === 'branch' || ev.type === 'equip') { // 갈래 고름·아이템 끼움: 타워 발밑 링
        const g = this.towerMeshes.get(ev.tower.id);
        if (g) this.ringFx(g.position.clone().setY(0.4), ev.type === 'branch' ? 0xFFFFFF : 0xFFD34D, 2.6, 0.5);
      }
    }
    game.events.length = 0;
  }
  // 타워가 가만히 있을 때도 계열이 보이게(0.09초마다 한 번). 파티클은 전부 한 시스템이라 그리기 횟수는 안 는다
  idleFx(g, u) {
    const P = this.particles, at = this._tmpV = this._tmpV || new THREE.Vector3();
    for (const f of u.fx) {
      at.set(g.position.x + f.x, g.position.y + f.y, g.position.z + f.z);
      if (f.kind === 'flame') { P.emit(at, 2, 0xFF8A2A, { cell: this.cell('fire'), size: 1.2, sizeEnd: 0.3, ttl: 0.45, speed: 0.3, up: 2.4, grav: -1, spread: 0.4 }); if (Math.random() < 0.35) P.emit(at, 1, 0x2A2A2A, { cell: this.cell('smoke'), size: 0.8, sizeEnd: 1.8, ttl: 1.1, speed: 0.2, up: 1.6, grav: -0.5, blend: 'normal', spread: 0.3 }); }
      else if (f.kind === 'spark') { if (Math.random() < 0.45) P.emit(at, 1, 0xBFE8FF, { cell: this.cell('spark'), size: 1.3, sizeEnd: 0.5, ttl: 0.2, speed: 0.4, up: 0.6, grav: 0, spread: 0.5, spin: 6 }); }
      else if (f.kind === 'mist') { if (Math.random() < 0.5) P.emit(at, 1, 0x9B5CFF, { cell: this.cell('swirl'), size: 1.4, sizeEnd: 0.4, ttl: 0.9, speed: 0.5, up: 0.8, grav: -0.6, spread: 1.0, spin: 2 }); }
    }
    if (u.family === 'skink' && Math.random() < 0.5) { at.copy(g.position).setY(g.position.y + 0.6); P.emit(at, 1, 0xB8FF70, { cell: this.cell('dot'), size: 0.45, sizeEnd: 0.1, ttl: 1.2, speed: 1.2, up: 1.5, grav: -0.8, spread: 1.6 }); }
  }
  // 보스 처치: 흰→노랑→붉은 폭발 세 겹 + 불 + 검은 연기 + 잔해 + 링 셋 + 화면 흔들림
  bossExplosion(at) {
    const P = this.particles, c = (n) => this.cell(n);
    P.emit(at, 1, 0xFFFFFF, { cell: c('burst'), size: 4, sizeEnd: 9, ttl: 0.18, speed: 0, up: 0, grav: 0, spread: 0 });
    P.emit(at, 1, 0xFFE060, { cell: c('burst'), size: 5, sizeEnd: 12, ttl: 0.32, speed: 0, up: 0, grav: 0, spread: 0 });
    P.emit(at, 1, 0xFF5030, { cell: c('burst'), size: 6, sizeEnd: 14, ttl: 0.5, speed: 0, up: 0, grav: 0, spread: 0 });
    P.emit(at, 30, 0xFF8A3A, { cell: c('fire'), size: 1.8, sizeEnd: 0.4, ttl: 0.9, speed: 6, up: 6, grav: -1, spread: 0.8 });
    P.emit(at, 16, 0x2B2B2B, { cell: c('smoke'), size: 2.0, sizeEnd: 5, ttl: 1.6, speed: 2.5, up: 3, grav: -0.6, blend: 'normal', spread: 1.0, fadeIn: 0.15 });
    P.emit(at, 24, 0x8A6A5A, { cell: c('debris'), size: 1.0, sizeEnd: 0.5, ttl: 1.1, speed: 8, up: 7, grav: 14, blend: 'normal', spread: 0.5, spin: 6 });
    P.emit(at, 40, 0xFFD34D, { cell: c('star4'), size: 0.9, sizeEnd: 0.2, ttl: 1.0, speed: 7, up: 6, grav: 8, spread: 0.5 });
    this.ringFx(at.clone().setY(0.4), 0xFF6060, 8, 0.8); this.ringFx(at.clone().setY(0.5), 0xFFE060, 5, 0.6); this.ringFx(at.clone().setY(0.6), 0xFFFFFF, 3, 0.4);
    if (this.world.shake) this.world.shake(1.2);
  }
  // 적이 성에 닿았을 때: 성문 자리에 폭발·불꽃·돌조각, 성이 움찔, 화면 흔들림. 성이 없으면(폴백) 그 적의 자리
  castleHitFx(enemy) {
    const P = this.particles, c = (n) => this.cell(n);
    const at = (this.world.castleGate ? this.world.castleGate.clone() : this.world.toWorld(enemy.x, enemy.y, 0)).setY(0.9);
    P.emit(at, 1, 0xFFE060, { cell: c('burst'), size: 2.5, sizeEnd: 5, ttl: 0.25, speed: 0, up: 0, grav: 0, spread: 0 });
    P.emit(at, 10, 0xFF8A3A, { cell: c('fire'), size: 1.3, sizeEnd: 0.3, ttl: 0.6, speed: 2.5, up: 3.5, grav: -1, spread: 0.6 });
    P.emit(at, 8, 0x8A8A8A, { cell: c('debris'), size: 0.9, sizeEnd: 0.4, ttl: 0.8, speed: 4, up: 5, grav: 14, blend: 'normal', spread: 0.6, spin: 5 });
    P.emit(at, 5, 0x333333, { cell: c('smoke'), size: 1.4, sizeEnd: 3, ttl: 1.2, speed: 1, up: 2, grav: -0.6, blend: 'normal', spread: 0.6, fadeIn: 0.1 });
    this.ringFx(at.clone().setY(0.4), 0xFF6060, 4, 0.5);
    if (this.world.castleHit) this.world.castleHit();
    if (this.world.shake) this.world.shake(0.6);
  }
  // 상시 랜드마크 효과(0.1초마다): 입구 포탈의 보라 소용돌이 · 성이 상한 단계만큼 불꽃·연기(world.castleFireSpots) · 용암 지도의 불 자리(world.fireSpots)
  landmarkFx(dt) {
    this.lmAt = (this.lmAt || 0) + dt; if (this.lmAt < 0.1) return; this.lmAt = 0;
    const P = this.particles, c = (n) => this.cell(n), W = this.world;
    if (W.portal) { P.emit(W.portal, 2, 0x9B5CFF, { cell: c('swirl'), size: 1.6, sizeEnd: 0.5, ttl: 0.9, speed: 0.4, up: 0.5, grav: -0.3, spin: 4, spread: 1.0 }); if (Math.random() < 0.4) P.emit(W.portal, 1, 0x5A2AAA, { cell: c('smoke'), size: 1.6, sizeEnd: 3, ttl: 1.4, speed: 0.3, up: 0.8, grav: -0.4, blend: 'normal', spread: 0.8, fadeIn: 0.2 }); }
    for (const at of W.castleFireSpots || []) { P.emit(at, 2, 0xFF8A2A, { cell: c('fire'), size: 1.4, sizeEnd: 0.3, ttl: 0.5, speed: 0.3, up: 2.6, grav: -1, spread: 0.5 }); if (Math.random() < 0.5) P.emit(at, 1, 0x222222, { cell: c('smoke'), size: 1.2, sizeEnd: 3.2, ttl: 1.6, speed: 0.2, up: 1.8, grav: -0.5, blend: 'normal', spread: 0.4, fadeIn: 0.15 }); }
    for (const at of W.fireSpots || []) { if (Math.random() < 0.7) P.emit(at, 1, 0xFF7A2A, { cell: c('fire'), size: 1.1, sizeEnd: 0.3, ttl: 0.45, speed: 0.3, up: 2.2, grav: -1, spread: 0.4 }); }
  }
  // 웨이브 시작: 입구에 빛 기둥과 링
  waveStart() {
    const e = this.world.entry; if (!e) return;
    this.ringFx(e.clone().setY(0.3), 0xFFFFFF, 5, 0.9);
    this.particles.emit(e.clone().setY(0.5), 40, 0xFFF3B0, { speed: 1.5, up: 7, ttl: 1.2, grav: 3, spread: 1.2 });
  }
  // 투사체가 닿았을 때: 타입별 피격 효과
  // 계열 10종이 전부 다르게 맞는다(J-2). 그림은 Kenney 입자 팩(fx.js CELL):
  //   덤불=잎 조각 · 불꽃바위=흰→노랑→주황 폭발 + 불 + 검은 연기 · 서리넝쿨=천천히 퍼지며 도는 눈꽃 · 유령폐허=위로 흩어지는 보라 소용돌이·안개 · 보급더미=잔해 + 연기 + 불꽃
  //   태양기둥=금빛 후광 + 별 · 폭풍기둥=번개 스파크 + 링 · 설인=흩날리는 눈 · 어둠화덕=위로 뜨는 독 안개 · (스킹크는 안 쏜다 — 홀씨가 idleFx 에서)
  impact(s) {
    const at = s.to, type = s.type, S = s.S || SHOT[type] || SHOT.physical, hit = S.hit || S.color, fam = s.family, P = this.particles, c = (n) => this.cell(n);
    const splashRing = (col) => { if (s.splash) this.ringFx(at.clone().setY(0.4), col, (s.splash.radius * NGN.SCALE) * 2, 0.35); };
    if (fam === 'fiery') {
      P.emit(at, 1, 0xFFFFFF, { cell: c('burst'), size: 1.6, sizeEnd: 3.2, ttl: 0.12, speed: 0, up: 0, grav: 0, spread: 0 });
      P.emit(at, 1, 0xFFE060, { cell: c('burst'), size: 2.2, sizeEnd: 4.0, ttl: 0.22, speed: 0, up: 0, grav: 0, spread: 0 });
      P.emit(at, 1, 0xFF7A2A, { cell: c('burst'), size: 2.6, sizeEnd: 4.6, ttl: 0.32, speed: 0, up: 0, grav: 0, spread: 0 });
      P.emit(at, 8, 0xFF9A3A, { cell: c('fire'), size: 1.2, sizeEnd: 0.3, ttl: 0.5, speed: 3, up: 3, grav: -2, spread: 0.4 });
      P.emit(at, 4, 0x2B2B2B, { cell: c('smoke'), size: 1.2, sizeEnd: 2.6, ttl: 0.9, speed: 1.2, up: 2, grav: -0.8, blend: 'normal', spread: 0.5, fadeIn: 0.15 });
      splashRing(0xFF7A2A);
    } else if (fam === 'frost') { // 서리: 느리게 퍼지며 회전
      P.emit(at, 7, 0xD8F6FF, { cell: c('snowflake'), size: 0.9, sizeEnd: 2.0, ttl: 0.9, speed: 1.6, up: 0.8, grav: 0, drag: 2.5, spin: 1.5, spread: 0.3 });
      P.emit(at, 1, 0xBFEFFF, { cell: c('halo'), size: 1.5, sizeEnd: 4.0, ttl: 0.4, speed: 0, up: 0, grav: 0, spread: 0 });
      splashRing(0xA8ECFF);
    } else if (fam === 'storm') {
      P.emit(at, 6, 0xDFF4FF, { cell: c('spark'), size: 1.6, sizeEnd: 0.4, ttl: 0.25, speed: 2.5, up: 2, grav: 0, spread: 0.3, spin: 8 });
      P.emit(at, 1, 0xFFFFFF, { cell: c('star4'), size: 3.0, sizeEnd: 0.5, ttl: 0.14, speed: 0, up: 0, grav: 0, spread: 0 });
      this.ringFx(at.clone().setY(0.4), 0xBFE8FF, s.splash ? (s.splash.radius * NGN.SCALE) * 2 : 2, 0.3);
    } else if (fam === 'heap') { // 포탄: 폭발 + 잔해 + 연기 궤적
      P.emit(at, 1, 0xFFE9A8, { cell: c('burst'), size: 2.0, sizeEnd: 3.4, ttl: 0.18, speed: 0, up: 0, grav: 0, spread: 0 });
      P.emit(at, 8, 0x8A7A6A, { cell: c('debris'), size: 0.9, sizeEnd: 0.5, ttl: 0.6, speed: 4, up: 3.5, grav: 12, blend: 'normal', spread: 0.3, spin: 5 });
      P.emit(at, 5, 0x6A6A6A, { cell: c('smoke'), size: 1.0, sizeEnd: 2.4, ttl: 0.8, speed: 1.5, up: 1.5, grav: -0.5, blend: 'normal', spread: 0.5, fadeIn: 0.1 });
      P.emit(at, 5, 0xFFE9A8, { cell: c('spark'), size: 0.8, sizeEnd: 0.2, ttl: 0.3, speed: 4, up: 3, grav: 6, spread: 0.2 });
    } else if (fam === 'sun') {
      P.emit(at, 1, 0xFFE38A, { cell: c('halo'), size: 1.4, sizeEnd: 3.6, ttl: 0.35, speed: 0, up: 0, grav: 0, spread: 0 });
      P.emit(at, 6, 0xFFD54A, { cell: c('star6'), size: 1.1, sizeEnd: 0.2, ttl: 0.5, speed: 2.5, up: 2.5, grav: 2, spread: 0.3 });
    } else if (fam === 'snowman') {
      P.emit(at, 10, 0xFFFFFF, { cell: c('dot'), size: 0.6, sizeEnd: 0.2, ttl: 0.55, speed: 3, up: 2.2, grav: 6, blend: 'normal', spread: 0.3 });
      P.emit(at, 2, 0xE8F6FF, { cell: c('snowflake'), size: 1.2, sizeEnd: 1.8, ttl: 0.5, speed: 0.6, up: 0.6, grav: 1, spin: 2, spread: 0.3 });
    } else if (fam === 'haunted' || type === 'essence') { // 유령: 위로 흩어지는 보라
      P.emit(at, 5, 0xC8A0FF, { cell: c('swirl'), size: 1.3, sizeEnd: 2.2, ttl: 0.7, speed: 1.2, up: 1.6, grav: -1.2, spin: 3, spread: 0.4 });
      P.emit(at, 3, 0x5A3A8A, { cell: c('smoke'), size: 1.0, sizeEnd: 2.2, ttl: 0.9, speed: 0.8, up: 1.4, grav: -0.8, blend: 'normal', spread: 0.4, fadeIn: 0.15 });
    } else if (fam === 'firepit' || type === 'decay') { // 독: 위로 뜨는 안개
      P.emit(at, 5, 0x9BE050, { cell: c('smoke'), size: 1.1, sizeEnd: 2.4, ttl: 1.0, speed: 0.8, up: 1.6, grav: -1.0, blend: 'normal', spread: 0.5, fadeIn: 0.15 });
      P.emit(at, 4, 0xE070E0, { cell: c('dot'), size: 0.6, sizeEnd: 0.1, ttl: 0.5, speed: 2, up: 1.8, grav: 1, spread: 0.3 });
    } else if (fam === 'shrub') { // 잎 조각
      P.emit(at, 7, 0x9CF06A, { cell: c('cross'), size: 0.8, sizeEnd: 0.3, ttl: 0.45, speed: 2.5, up: 2.2, grav: 4, blend: 'normal', spread: 0.2, spin: 6 });
    } else if (type === 'elemental') { P.emit(at, 14, 0xFF9A3A, { cell: c('fire'), speed: 3.5, up: 3, ttl: 0.5 }); splashRing(0xFF7A2A); }
    else if (type === 'energy') { P.emit(at, 10, 0x9FE0FF, { cell: c('star4'), speed: 2.5, up: 2, ttl: 0.45, grav: 3 }); splashRing(0x7FD6FF); }
    else P.emit(at, 6, hit, { speed: 2.5, up: 2, ttl: 0.35 });
  }
  update(dt, game, alpha = 1) {
    this.time += dt;
    this.floatBudget = 2;
    // 투사체
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]; s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      // 목표가 아직 있으면 따라간다
      const g = this.enemyMeshes.get(s.target.id); if (g && g.userData.lastPos) s.to.copy(g.userData.lastPos);
      s.mesh.position.lerpVectors(s.from, s.to, k);
      if (s.kind === 'fireball' || s.kind === 'orb' || s.kind === 'snowball') s.mesh.position.y += Math.sin(k * Math.PI) * 0.8; // 살짝 포물선
      if (s.kind === 'cannonball') s.mesh.position.y += Math.sin(k * Math.PI) * 1.6; // 포탄은 높이 떠서 떨어진다
      if (s.kind === 'crystal') s.mesh.rotation.y += dt * 12;
      // 꼬리(계열별 그림): 불덩이=불+검은 연기 · 서리=도는 눈꽃 · 유령=보라 소용돌이 · 포탄=회색 연기 · 태양=금빛 별 · 눈덩이=흰 점 · 독=자줏빛 연기
      if (s.S && s.S.trail) { s.tick = (s.tick || 0) + 1; for (const T of s.S.trail) if (s.tick % (T.every || 1) === 0) this.particles.emit(s.mesh.position, 1, T.color, { cell: this.cell(T.cell), size: T.size, sizeEnd: T.sizeEnd, ttl: T.ttl, speed: 0.3, up: T.add ? 0.4 : 0.8, grav: T.add ? 0 : -0.6, spread: 0.12, spin: T.spin || 0, blend: T.add ? 'add' : 'normal' }); }
      if (s.kind === 'arrow') s.mesh.lookAt(s.to), s.mesh.rotateX(Math.PI / 2);
      if (k >= 1) { this.impact(s); this.world.root.remove(s.mesh); this.shots.splice(i, 1); }
    }
    // 섬광·링
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.t += dt; const k = f.t / f.dur;
      if (f.kind === 'ring') { f.mesh.scale.setScalar(0.3 + k * f.maxScale); f.mesh.material.opacity = 0.85 * (1 - k); }
      else { f.mesh.material.opacity = 0.9 * (1 - k); f.mesh.scale.multiplyScalar(1 + dt * 8); }
      if (k >= 1) { this.world.root.remove(f.mesh); f.mesh.material.dispose(); this.fx.splice(i, 1); }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) { const b = this.bolts[i]; b.t += dt; if (b.t > 0.12) { this.world.root.remove(b.line); b.line.geometry.dispose(); this.bolts.splice(i, 1); } }
    // 죽는 적: 튀어오르며 작아진다(샌 적은 그냥 사라진다)
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i]; d.t += dt;
      if (d.leaked) { this.world.root.remove(d.g); this.dying.splice(i, 1); continue; }
      const dur = d.kind === 'boss' ? 0.9 : 0.45, k = d.t / dur;
      if (d.mixer) d.mixer.update(dt * 0.5);
      d.g.position.y += (3.5 - k * 9) * dt * (d.kind === 'boss' ? 0.6 : 1); d.g.rotation.y += dt * (d.kind === 'boss' ? 4 : 9); d.g.scale.multiplyScalar(Math.max(0.01, 1 - dt * (d.kind === 'boss' ? 1.6 : 3.5)));
      if (k >= 1) { this.world.root.remove(d.g); this.dying.splice(i, 1); }
    }
    // 타워: 건설 솟아오름(0.35초 바운스)·반동·고리 회전 (+ 발밑 빛을 오버레이에)
    this.overlays.begin(); this._ovBegun = true;
    for (const g of this.towerMeshes.values()) {
      const u = g.userData;
      if (u.glowSize) { const gp = this._glowP = this._glowP || new THREE.Vector3(); gp.set(g.position.x, 0.26, g.position.z); this.overlays.glowAt(gp, u.glowSize * g.scale.x, u.glowColor); }
      const age = this.time - u.born;
      if (age < 0.4) { const k = age / 0.4; const s = k < 0.7 ? k / 0.7 * 1.12 : 1.12 - (k - 0.7) / 0.3 * 0.12; g.scale.setScalar(Math.max(0.01, s)); }
      else if (g.scale.x !== 1) g.scale.setScalar(1);
      // 🔴 반동은 기준 배율(Kenney 모형 2.3~3.1배) 위에 곱한다. 그전에는 1 로 덮어써서 한 번 쏜 타워가 1/3 크기로 쪼그라들었다 — 적이 먼저 지나는 앞줄만 먼저 쏘니
      //    "앞쪽 타워가 작다"(사장님 지적 2026-09-06)로 보였다. 카메라 문제가 아니라 이 한 줄이 원인이었다
      if (u.recoil > 0) { const k = u.baseScale || 1; u.recoil = Math.max(0, u.recoil - dt * 8); u.body.position.y = -0.18 * u.recoil; u.body.scale.set(k * (1 + 0.06 * u.recoil), k * (1 - 0.08 * u.recoil), k * (1 + 0.06 * u.recoil)); }
      // 조준: 머리가 있으면 머리만(포탑·접시·설인·발리스타·화염방사기), 없으면(코드 폴백) 몸통이 돈다. 마지막 목표 방향으로 부드럽게
      if (u.head && u.headAnim === 'aim') { if (u.aim !== undefined) { let d = u.aim - u.head.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); u.head.rotation.y += d * Math.min(1, dt * 10); } }
      else if (u.head && u.headAnim === 'bob') { u.head.position.y = u.headBaseY + Math.sin(this.time * 2.6 + g.position.x) * 0.1; u.head.rotation.y = Math.sin(this.time * 0.9 + g.position.z) * 0.5; } // 유령: 둥실
      else if (u.head && u.headAnim === 'spin') u.head.rotation.y += dt * 1.1; // 수정·눈꽃: 천천히 돈다
      else if (!u.head && u.aim !== undefined) { let d = u.aim - u.body.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); u.body.rotation.y += d * Math.min(1, dt * 10); }
      // 발광 테두리가 숨 쉬듯 1.05~1.08 배 사이를 오간다(J-3 "상시 발광")
      if (u.hulls) { const s = 1.065 + Math.sin(this.time * 3 + g.position.x * 0.7) * 0.015; for (const h of u.hulls) h.scale.set(s, 1.03 + (s - 1.065), s); }
      if (u.anim.spin) u.anim.spin.rotation.z += dt * 1.5;
      // 상시 효과(부품 표의 fx): 어둠화덕 불꽃 · 폭풍기둥 스파크 · 유령 안개 · 스킹크 홀씨
      if (this.time - u.fxAt > 0.09) { u.fxAt = this.time; this.idleFx(g, u); }
    }
    this.particles.update(dt, this.world.camera, this.world.renderer.domElement.height);
    if (this.lightning) this.lightning.update(dt);
    this.syncTowers(game);
    this.syncEnemies(game, this.time, alpha, dt);
    this.landmarkFx(dt);
  }
};
