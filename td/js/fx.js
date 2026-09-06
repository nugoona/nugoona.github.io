'use strict';
// 효과(2026-09-06, checklist J-2): Kenney 입자 팩(CC0) 그림을 쓰는 스프라이트 파티클 + three.js r128 예제의 진짜 번개(LightningStrike, MIT).
// 스프라이트는 THREE.Points 둘(더하기 혼합 / 보통 혼합)로 그린다 — 그리기 2회. 칸 번호로 그림을 고르고, 크기·회전·색·투명도가 알갱이마다 다르다.
// 옛 Particles(점 하나짜리)는 이걸로 대체됐다. emit(at, count, color, opt) 서명은 그대로 두고 opt.cell 로 그림을 고른다.
window.NGN = window.NGN || {};

// assets/fx/particles.png 의 칸 (4×4, 128px). 이름 → 번호
NGN.CELL = { dot: 0, smoke: 1, flame: 2, fire: 3, spark: 4, bolt: 5, star4: 6, star6: 7, snowflake: 8, halo: 9, cross: 10, swirl: 11, debris: 12, burst: 13, streak: 14, ring: 15 };

const VERT = `
attribute float aSize; attribute float aCell; attribute float aAngle; attribute float aAlpha; attribute vec3 aColor;
varying float vCell; varying float vAngle; varying float vAlpha; varying vec3 vColor;
uniform float uScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.5, -mv.z);
  gl_Position = projectionMatrix * mv;
  vCell = aCell; vAngle = aAngle; vAlpha = aAlpha; vColor = aColor;
}`;
const FRAG = `
uniform sampler2D uMap;
varying float vCell; varying float vAngle; varying float vAlpha; varying vec3 vColor;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vAngle), s = sin(vAngle);
  p = vec2(p.x * c - p.y * s, p.x * s + p.y * c) + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) discard;
  vec2 cell = vec2(mod(vCell, 4.0), floor(vCell / 4.0));
  vec4 t = texture2D(uMap, (cell + p) * 0.25);
  float a = t.a * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor * t.rgb, a);
}`;

class SpritePool {
  constructor(root, texture, additive, max) {
    this.max = max; this.n = 0;
    const F = (k) => new Float32Array(max * k);
    this.pos = F(3); this.vel = F(3); this.col = F(3); this.size = F(1); this.cell = F(1); this.ang = F(1); this.alpha = F(1);
    this.size0 = F(1); this.size1 = F(1); this.life = F(1); this.ttl = F(1); this.grav = F(1); this.spin = F(1); this.drag = F(1); this.fadeIn = F(1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aCell', new THREE.BufferAttribute(this.cell, 1));
    geo.setAttribute('aAngle', new THREE.BufferAttribute(this.ang, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({ uniforms: { uMap: { value: texture }, uScale: { value: 300 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(geo, this.mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 5 : 4;
    root.add(this.points); this.geo = geo;
  }
  emit(at, count, color, o) {
    const c = new THREE.Color(color);
    const spd = o.speed === undefined ? 3 : o.speed, up = o.up === undefined ? 2.5 : o.up, ttl = o.ttl || 0.6, grav = o.grav === undefined ? 9 : o.grav, spread = o.spread || 0.15;
    const s0 = o.size === undefined ? 0.9 : o.size, s1 = o.sizeEnd === undefined ? s0 * 0.4 : o.sizeEnd, cell = o.cell || 0, spin = o.spin || 0, drag = o.drag || 0, fadeIn = o.fadeIn || 0;
    const dir = o.dir || null; // 방향이 있으면 그쪽으로(±cone)
    for (let k = 0; k < count; k++) {
      let i; if (this.n < this.max) i = this.n++; else i = Math.floor(Math.random() * this.max);
      this.pos[i * 3] = at.x + (Math.random() - .5) * spread; this.pos[i * 3 + 1] = at.y + (Math.random() - .5) * spread; this.pos[i * 3 + 2] = at.z + (Math.random() - .5) * spread;
      if (dir) { const r = spd * (0.5 + Math.random() * 0.5); this.vel[i * 3] = dir.x * r + (Math.random() - .5) * up; this.vel[i * 3 + 1] = dir.y * r + (Math.random() - .5) * up; this.vel[i * 3 + 2] = dir.z * r + (Math.random() - .5) * up; }
      else { const a = Math.random() * Math.PI * 2, r = Math.random() * spd; this.vel[i * 3] = Math.cos(a) * r; this.vel[i * 3 + 1] = Math.random() * up + up * 0.3; this.vel[i * 3 + 2] = Math.sin(a) * r; }
      const j = 0.85 + Math.random() * 0.3;
      this.col[i * 3] = Math.min(1, c.r * j); this.col[i * 3 + 1] = Math.min(1, c.g * j); this.col[i * 3 + 2] = Math.min(1, c.b * j);
      this.life[i] = 0; this.ttl[i] = ttl * (0.7 + Math.random() * 0.6); this.grav[i] = grav;
      const sj = 0.8 + Math.random() * 0.4; this.size0[i] = s0 * sj; this.size1[i] = s1 * sj; this.size[i] = this.size0[i];
      this.cell[i] = cell; this.ang[i] = o.angle !== undefined ? o.angle : Math.random() * 6.283; this.spin[i] = spin * (Math.random() < 0.5 ? -1 : 1); this.drag[i] = drag; this.fadeIn[i] = fadeIn; this.alpha[i] = fadeIn ? 0 : 1;
    }
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] += dt;
      if (this.life[i] >= this.ttl[i]) {
        const j = --this.n; if (i === j) break;
        for (let k = 0; k < 3; k++) { this.pos[i * 3 + k] = this.pos[j * 3 + k]; this.vel[i * 3 + k] = this.vel[j * 3 + k]; this.col[i * 3 + k] = this.col[j * 3 + k]; }
        for (const a of ['life', 'ttl', 'grav', 'size0', 'size1', 'cell', 'ang', 'spin', 'drag', 'fadeIn']) this[a][i] = this[a][j];
        i--; continue;
      }
      const k = this.life[i] / this.ttl[i];
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      if (this.drag[i]) { const d = Math.max(0, 1 - this.drag[i] * dt); this.vel[i * 3] *= d; this.vel[i * 3 + 1] *= d; this.vel[i * 3 + 2] *= d; }
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.05 && this.grav[i] > 0) { this.pos[i * 3 + 1] = 0.05; this.vel[i * 3 + 1] *= -0.3; }
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * k;
      this.ang[i] += this.spin[i] * dt;
      const fi = this.fadeIn[i]; this.alpha[i] = (fi && k < fi ? k / fi : 1) * (k > 0.6 ? (1 - k) / 0.4 : 1);
    }
    this.geo.setDrawRange(0, this.n);
    for (const a of ['position', 'aColor', 'aSize', 'aCell', 'aAngle', 'aAlpha']) this.geo.attributes[a].needsUpdate = true;
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

// 스프라이트 파티클: 더하기(빛·불·번개·별) + 보통(연기·잔해·안개) 두 풀. 그리기 2회.
NGN.Sprites = class Sprites {
  constructor(root, texture, max = 900) {
    this.add = new SpritePool(root, texture, true, max);
    this.norm = new SpritePool(root, texture, false, Math.floor(max / 2));
  }
  // opt.blend: 'add'(기본) | 'normal'. 나머지는 SpritePool.emit 참고
  emit(at, count, color, opt = {}) { (opt.blend === 'normal' ? this.norm : this.add).emit(at, count, color, opt); }
  // 화면 높이·화각으로 점 크기 배율(픽셀) — 카메라가 멀어져도 세계 단위 크기가 유지된다
  update(dt, camera, heightPx) {
    const sc = heightPx / (2 * Math.tan(camera.fov * Math.PI / 360));
    this.add.mat.uniforms.uScale.value = sc; this.norm.mat.uniforms.uScale.value = sc;
    this.add.update(dt); this.norm.update(dt);
  }
  clear() { this.add.clear(); this.norm.clear(); }
  get count() { return this.add.n + this.norm.n; }
};

// 진짜 번개(three.js r128 examples/js/geometries/LightningStrike.js, MIT). 가지 치는 번개를 매 프레임 다시 만든다 — 0.18초만 살고 사라진다
NGN.Lightning = class Lightning {
  constructor(root) { this.root = root; this.live = []; this.mats = new Map(); this.ok = typeof THREE.LightningStrike === 'function'; }
  mat(color) { if (!this.mats.has(color)) this.mats.set(color, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })); return this.mats.get(color); }
  strike(from, to, color = 0xBFE8FF, opt = {}) {
    if (!this.ok) return null;
    const params = {
      sourceOffset: from.clone(), destOffset: to.clone(),
      radius0: opt.radius || 0.13, radius1: (opt.radius || 0.13) * 0.35, minRadius: 0.03, maxIterations: 6, isEternal: true,
      timeScale: 0.7, propagationTimeFactor: 0.05, vanishingTimeFactor: 0.95, subrayPeriod: 2.5, subrayDutyCycle: 0.3,
      maxSubrayRecursion: 2, ramification: opt.branches || 5, recursionProbability: 0.55, roughness: 0.85, straightness: 0.65,
    };
    const geo = new THREE.LightningStrike(params);
    const mesh = new THREE.Mesh(geo, this.mat(color)); mesh.renderOrder = 6; mesh.frustumCulled = false;
    this.root.add(mesh);
    const L = { mesh, geo, t: 0, dur: opt.dur || 0.18, seed: Math.random() * 100 };
    this.live.push(L);
    return L;
  }
  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const L = this.live[i]; L.t += dt;
      if (L.t >= L.dur) { this.root.remove(L.mesh); L.geo.dispose(); this.live.splice(i, 1); continue; }
      L.geo.update(L.seed + L.t * 4);
    }
  }
  clear() { for (const L of this.live) { this.root.remove(L.mesh); L.geo.dispose(); } this.live = []; }
};

// ---------- 효과음(2026-09-06, checklist D) — 파일 없이 Web Audio 합성 ----------
// 표준 TD 에 당연히 있는 것. 발사(계열 타입별 음색)·맞음·처치·골드·건설·승급·웨이브 시작·보스·성 피해·미리 부르기·클리어.
// 폰은 첫 터치 뒤에만 소리가 난다(브라우저 규칙) → 첫 pointerdown 에서 AudioContext 를 켠다. 설정에서 끌 수 있다(meta.state.settings.sound === false).
// 같은 소리는 0.04초 안에 겹치지 않게 막는다(떼거리 웨이브에서 발사음이 수십 개 겹치면 귀가 아프다)
NGN.Sound = class Sound {
  constructor() { this.ctx = null; this.on = true; this.last = new Map(); this.master = null; const wake = () => { this.wake(); }; addEventListener('pointerdown', wake, { passive: true }); addEventListener('keydown', wake); }
  wake() { try { if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(this.ctx.destination); } if (this.ctx.state === 'suspended') this.ctx.resume(); } catch (e) { this.ctx = null; } }
  // 기본 음: type(osc) · f0→f1 주파수 · dur 길이 · vol · 노이즈 섞기
  tone(o) {
    if (!this.on || !this.ctx || this.ctx.state !== 'running') return;
    const now = performance.now(), key = o.key || o.type + o.f0; if (now - (this.last.get(key) || 0) < (o.gap || 40)) return; this.last.set(key, now);
    const c = this.ctx, t = c.currentTime + (o.delay || 0), dur = o.dur || 0.12;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || 0.3, t + (o.attack || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); g.connect(this.master);
    if (o.type !== 'noise') { const osc = c.createOscillator(); osc.type = o.type || 'square'; osc.frequency.setValueAtTime(o.f0 || 440, t); osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 || o.f0 || 440), t + dur); osc.connect(g); osc.start(t); osc.stop(t + dur + 0.02); }
    if (o.type === 'noise' || o.noise) { const n = Math.floor(c.sampleRate * dur); const buf = c.createBuffer(1, n, c.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); const src = c.createBufferSource(); src.buffer = buf; const f = c.createBiquadFilter(); f.type = o.filter || 'lowpass'; f.frequency.value = o.fc || 1200; src.connect(f); f.connect(g); src.start(t); }
  }
  // 이름으로 부른다(render.js·main.js). 계열 공격 타입별 발사음이 다르다
  play(name, opt = {}) {
    const T = {
      shot_physical: { type: 'triangle', f0: 900, f1: 300, dur: 0.08, vol: 0.18, key: 'shot' }, // 화살
      shot_elemental: { type: 'noise', fc: 900, dur: 0.16, vol: 0.22, key: 'shot' }, // 불
      shot_energy: { type: 'sine', f0: 1200, f1: 1800, dur: 0.1, vol: 0.14, key: 'shot' }, // 얼음·빛
      shot_essence: { type: 'sine', f0: 300, f1: 160, dur: 0.18, vol: 0.16, key: 'shot' }, // 유령
      shot_decay: { type: 'square', f0: 220, f1: 140, dur: 0.1, vol: 0.12, key: 'shot' }, // 독
      shot_arcane: { type: 'sawtooth', f0: 500, f1: 900, dur: 0.1, vol: 0.12, key: 'shot' },
      bolt: { type: 'noise', fc: 3000, filter: 'highpass', dur: 0.14, vol: 0.28, key: 'bolt' }, // 번개
      cannon: { type: 'noise', fc: 400, dur: 0.22, vol: 0.4, key: 'cannon' },
      hit: { type: 'square', f0: 200, f1: 120, dur: 0.05, vol: 0.08, key: 'hit', gap: 60 },
      kill: { type: 'square', f0: 600, f1: 1200, dur: 0.12, vol: 0.18, key: 'kill' },
      gold: { type: 'sine', f0: 1500, f1: 2200, dur: 0.09, vol: 0.14, key: 'gold', gap: 70 },
      build: { type: 'triangle', f0: 300, f1: 600, dur: 0.18, vol: 0.25, key: 'build' },
      upgrade: { type: 'sine', f0: 500, f1: 1000, dur: 0.25, vol: 0.25, key: 'upgrade' },
      sell: { type: 'triangle', f0: 600, f1: 250, dur: 0.18, vol: 0.2, key: 'sell' },
      wave: { type: 'sawtooth', f0: 220, f1: 440, dur: 0.35, vol: 0.22, key: 'wave' },
      call: { type: 'sine', f0: 880, f1: 1320, dur: 0.15, vol: 0.2, key: 'call' },
      clear: { type: 'sine', f0: 660, f1: 990, dur: 0.3, vol: 0.25, key: 'clear' },
      boss: { type: 'sawtooth', f0: 110, f1: 55, dur: 0.9, vol: 0.4, key: 'boss', noise: true, fc: 300 },
      bossKill: { type: 'noise', fc: 500, dur: 0.8, vol: 0.5, key: 'bossKill' },
      castle: { type: 'noise', fc: 350, dur: 0.4, vol: 0.45, key: 'castle' },
      lose: { type: 'sawtooth', f0: 300, f1: 80, dur: 0.8, vol: 0.3, key: 'lose' },
      win: { type: 'sine', f0: 523, f1: 1046, dur: 0.6, vol: 0.3, key: 'win' },
      ui: { type: 'sine', f0: 700, f1: 700, dur: 0.05, vol: 0.1, key: 'ui' },
    };
    const o = T[name]; if (!o) return;
    this.tone(Object.assign({}, o, opt));
    if (name === 'clear' || name === 'win') { this.tone(Object.assign({}, o, { f0: o.f0 * 1.25, f1: o.f1 * 1.25, delay: 0.12, key: name + '2' })); this.tone(Object.assign({}, o, { f0: o.f0 * 1.5, f1: o.f1 * 1.5, delay: 0.24, key: name + '3' })); }
    if (name === 'bossKill') { this.tone({ type: 'sawtooth', f0: 80, f1: 30, dur: 0.9, vol: 0.4, key: 'bossKill2' }); }
  }
};
NGN.sound = new NGN.Sound();
