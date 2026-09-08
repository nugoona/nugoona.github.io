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
// ---------- 녹음된 효과음(2026-09-08) — Kenney CC0 47장, assets/sfx/ ----------
// 왜: 지금까지는 전부 Web Audio 합성음(전자 삑삑)이었다. 녹음을 얹으면 손맛이 달라진다.
// 표의 값 = [변주 개수, 소리 크기]. 크기는 귀가 아니라 **수치로** 맞췄다 —
//   파일마다 실제 음량(dBFS)을 재서 -20dBFS 로 정규화한 뒤, 아래 합성음 표에 이미 들어 있던
//   「상대적 크기 의도」(발사 .18 · 때림 .08 · 대포 .4 · 보스 .4)를 곱하고, 최고점이 -1dBFS 를 넘으면 눌렀다.
// 🛑 녹음이 없거나 브라우저가 그 형식을 못 읽으면 **합성음으로 그대로 돌아간다**(소리가 사라지지 않는다).
NGN.SFX = {
    bolt: [3, 0.316],
    boss: [1, 1.000],
    bossKill: [1, 0.955],
    build: [3, 0.200],
    call: [1, 0.440],
    cannon: [3, 0.300],
    castle: [2, 0.764],
    clear: [1, 0.550],
    gold: [1, 0.810],
    hit: [5, 0.094],
    kill: [3, 0.189],
    lose: [1, 0.543],
    sell: [1, 0.306],
    shot_arcane: [3, 0.226],
    shot_decay: [2, 0.200],
    shot_elemental: [3, 0.158],
    shot_energy: [3, 0.210],
    shot_essence: [2, 0.142],
    shot_physical: [2, 0.188],
    ui: [3, 0.113],
    upgrade: [1, 0.309],
    wave: [1, 1.000],
    win: [1, 0.609],
};
// 오지(.ogg)는 사파리(아이폰)가 못 읽는다 → 못 읽으면 .m4a 로. 둘 다 못 읽으면 null(합성음)
NGN.sfxExt = (() => {
  try {
    const a = document.createElement('audio');
    if (a.canPlayType('audio/ogg; codecs="vorbis"')) return 'ogg';
    if (a.canPlayType('audio/mp4; codecs="mp4a.40.2"')) return 'm4a';
  } catch (e) {}
  return null;
})();

NGN.Sound = class Sound {
  constructor() { this.ctx = null; this.on = true; this.last = new Map(); this.master = null; this.buf = new Map(); this.rr = new Map(); this.loadStarted = false; const wake = () => { this.wake(); }; addEventListener('pointerdown', wake, { passive: true }); addEventListener('keydown', wake); }
  // 소리가 나가는 길: 각 소리 → [저역 강조] → [리미터] → [마스터] → 스피커
  // 🔑 저역 강조(M-4-6, 2026-09-07). 레이븐 소프트웨어 일화 — 총소리의 저음을 12dB 올린 것만으로 그 총이 최고 인기 무기가 됐다.
  //    우리 소리는 전부 Web Audio 로 그 자리에서 만드는데, **저음을 담당하는 것이 아무것도 없었다**(전부 200~2200Hz).
  //    그래서 얇고 가벼웠다. 190Hz 아래를 +6dB 올린다.
  // 🛑 그냥 올리면 파형이 천장을 넘어 찌그러진다(클리핑) — 뒤에 리미터를 둬서 천장을 눌러 준다. 그래야 과감히 올릴 수 있다.
  wake() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        this.ctx = new AC();
        const c = this.ctx;
        this.master = c.createGain(); this.master.gain.value = 0.55; this.master.connect(c.destination);
        const lim = c.createDynamicsCompressor();
        lim.threshold.value = -8; lim.knee.value = 6; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.12;
        lim.connect(this.master);
        const bass = c.createBiquadFilter();
        bass.type = 'lowshelf'; bass.frequency.value = 190; bass.gain.value = 6;
        bass.connect(lim);
        this.bus = bass; // 소리들은 여기에 붙는다
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.loadSamples();   // 첫 터치 뒤에 조용히 받아 둔다. 다 받기 전엔 합성음이 난다
    } catch (e) { this.ctx = null; }
  }
  // 녹음 읽기. 한 번만 돈다. 한 장이 실패해도 나머지는 살린다(그 소리만 합성음으로 남는다)
  loadSamples() {
    if (this.loadStarted || !this.ctx) return; this.loadStarted = true;
    const inline = window.__NGN_SFX__ || null;         // 한 장짜리 빌드(bundle.js)는 여기에 미리 넣어 둔다
    const ext = NGN.sfxExt;
    if (!inline && !ext) return;                        // 못 읽는 브라우저 → 합성음으로 계속
    const base = ((NGN.PATHS && NGN.PATHS.assets) || '../assets/') + 'sfx/';
    const V = window.__NGN_VERSION__ ? '?v=' + window.__NGN_VERSION__ : '';
    for (const name of Object.keys(NGN.SFX)) {
      const n = NGN.SFX[name][0];
      const list = new Array(n).fill(null);
      for (let i = 1; i <= n; i++) {
        const key = name + '_' + i;
        const src = inline ? inline[key] : base + key + '.' + ext + V;
        if (!src) continue;
        fetch(src).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
          .then((ab) => new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej)))
          .then((bf) => { list[i - 1] = bf; this.buf.set(name, list.filter(Boolean)); })
          .catch(() => {});   // 조용히 포기 → 그 소리는 합성음으로 난다
      }
    }
  }
  // 같은 소리가 gap(ms) 안에 겹치는 것을 막는다. 합성음·녹음이 같은 문을 쓴다
  gate(key, gap) {
    const now = performance.now();
    if (now - (this.last.get(key) || 0) < gap) return false;
    this.last.set(key, now); return true;
  }
  // 저음 층만 따로 — 녹음 위에 얹어 무게를 준다(합성음 tone() 안의 것과 같은 것).
  // 🛑 scale: 녹음에는 이미 몸통이 있어서 저음 보강이 덜 필요하다. 안 줄이면 이 층이 소리 크기의 바닥이 돼
  //    녹음 쪽을 아무리 줄여도 대포·건설이 3dB 씩 큰 채로 남았다(2026-09-08 실측으로 잡음).
  subTone(sub, delay, scale) {
    const c = this.ctx, t = c.currentTime + (delay || 0), sd = sub.dur || 0.12;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime((sub.vol || 0.22) * (scale == null ? 1 : scale), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sd); g.connect(this.bus || this.master);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(sub.f0 || 90, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, sub.f1 || 45), t + sd);
    o.connect(g); o.start(t); o.stop(t + sd + 0.02);
  }
  // 녹음 한 장을 낸다. 변주를 돌려 쓴다 — 같은 소리가 연달아 나면 기계음처럼 들린다
  sample(name, o) {
    const list = this.buf.get(name);
    if (!list || !list.length) return false;
    const c = this.ctx, t = c.currentTime + (o.delay || 0);
    const i = (this.rr.get(name) || 0) % list.length; this.rr.set(name, i + 1);
    const src = c.createBufferSource(); src.buffer = list[i];
    if (o.rate) src.playbackRate.value = o.rate;
    const g = c.createGain();
    g.gain.value = (NGN.SFX[name] ? NGN.SFX[name][1] : 0.5) * (o.gain == null ? 1 : o.gain);
    src.connect(g); g.connect(this.bus || this.master); src.start(t);
    return true;
  }
  // 기본 음: type(osc) · f0→f1 주파수 · dur 길이 · vol · 노이즈 섞기
  tone(o) {
    if (!this.on || !this.ctx || this.ctx.state !== 'running') return;
    if (!o.ungated && !this.gate(o.key || o.type + o.f0, o.gap || 40)) return;
    const c = this.ctx, t = c.currentTime + (o.delay || 0), dur = o.dur || 0.12;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || 0.3, t + (o.attack || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); g.connect(this.bus || this.master);
    // 저음 층(M-4-6): 때리는 소리에 짧고 낮은 사인파를 겹친다. 이게 "묵직하다"는 느낌의 정체다 —
    // 위의 저역 강조가 전체를 올린다면, 이건 그 소리에만 배를 채워 넣는 것이다
    if (o.sub) {
      const sd = o.sub.dur || Math.max(0.08, dur * 0.9);
      const sg = c.createGain(); sg.gain.setValueAtTime(0.0001, t); sg.gain.exponentialRampToValueAtTime(o.sub.vol || 0.22, t + 0.006); sg.gain.exponentialRampToValueAtTime(0.0001, t + sd); sg.connect(this.bus || this.master);
      const so = c.createOscillator(); so.type = 'sine';
      so.frequency.setValueAtTime(o.sub.f0 || 90, t); so.frequency.exponentialRampToValueAtTime(Math.max(20, o.sub.f1 || 45), t + sd);
      so.connect(sg); so.start(t); so.stop(t + sd + 0.02);
    }
    if (o.type !== 'noise') { const osc = c.createOscillator(); osc.type = o.type || 'square'; osc.frequency.setValueAtTime(o.f0 || 440, t); osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 || o.f0 || 440), t + dur); osc.connect(g); osc.start(t); osc.stop(t + dur + 0.02); }
    if (o.type === 'noise' || o.noise) { const n = Math.floor(c.sampleRate * dur); const buf = c.createBuffer(1, n, c.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); const src = c.createBufferSource(); src.buffer = buf; const f = c.createBiquadFilter(); f.type = o.filter || 'lowpass'; f.frequency.value = o.fc || 1200; src.connect(f); f.connect(g); src.start(t); }
  }
  // 이름으로 부른다(render.js·main.js). 계열 공격 타입별 발사음이 다르다
  play(name, opt = {}) {
    const T = {
      shot_physical: { sub: { f0: 150, f1: 80, dur: 0.07, vol: 0.06 }, type: 'triangle', f0: 900, f1: 300, dur: 0.08, vol: 0.18, key: 'shot' }, // 화살
      shot_elemental: { sub: { f0: 120, f1: 55, dur: 0.14, vol: 0.10 }, type: 'noise', fc: 900, dur: 0.16, vol: 0.22, key: 'shot' }, // 불
      shot_energy: { type: 'sine', f0: 1200, f1: 1800, dur: 0.1, vol: 0.14, key: 'shot' }, // 얼음·빛
      shot_essence: { type: 'sine', f0: 300, f1: 160, dur: 0.18, vol: 0.16, key: 'shot' }, // 유령
      shot_decay: { type: 'square', f0: 220, f1: 140, dur: 0.1, vol: 0.12, key: 'shot' }, // 독
      shot_arcane: { type: 'sawtooth', f0: 500, f1: 900, dur: 0.1, vol: 0.12, key: 'shot' },
      bolt: { type: 'noise', fc: 3000, filter: 'highpass', dur: 0.14, vol: 0.28, key: 'bolt' }, // 번개
      cannon: { sub: { f0: 110, f1: 38, dur: 0.30, vol: 0.20 }, type: 'noise', fc: 400, dur: 0.22, vol: 0.4, key: 'cannon' },
      hit: { sub: { f0: 130, f1: 62, dur: 0.09, vol: 0.10 }, type: 'square', f0: 200, f1: 120, dur: 0.05, vol: 0.08, key: 'hit', gap: 60 },
      kill: { sub: { f0: 150, f1: 70, dur: 0.14, vol: 0.10 }, type: 'square', f0: 600, f1: 1200, dur: 0.12, vol: 0.18, key: 'kill' },
      gold: { type: 'sine', f0: 1500, f1: 2200, dur: 0.09, vol: 0.14, key: 'gold', gap: 70 },
      build: { sub: { f0: 110, f1: 55, dur: 0.20, vol: 0.12 }, type: 'triangle', f0: 300, f1: 600, dur: 0.18, vol: 0.25, key: 'build' },
      upgrade: { type: 'sine', f0: 500, f1: 1000, dur: 0.25, vol: 0.25, key: 'upgrade' },
      sell: { type: 'triangle', f0: 600, f1: 250, dur: 0.18, vol: 0.2, key: 'sell' },
      wave: { sub: { f0: 100, f1: 50, dur: 0.30, vol: 0.13 }, type: 'sawtooth', f0: 220, f1: 440, dur: 0.35, vol: 0.22, key: 'wave' },
      call: { type: 'sine', f0: 880, f1: 1320, dur: 0.15, vol: 0.2, key: 'call' },
      clear: { type: 'sine', f0: 660, f1: 990, dur: 0.3, vol: 0.25, key: 'clear' },
      boss: { sub: { f0: 70, f1: 30, dur: 0.85, vol: 0.25 }, type: 'sawtooth', f0: 110, f1: 55, dur: 0.9, vol: 0.4, key: 'boss', noise: true, fc: 300 },
      bossKill: { sub: { f0: 80, f1: 28, dur: 0.70, vol: 0.25 }, type: 'noise', fc: 500, dur: 0.8, vol: 0.5, key: 'bossKill' },
      castle: { sub: { f0: 90, f1: 32, dur: 0.45, vol: 0.24 }, type: 'noise', fc: 350, dur: 0.4, vol: 0.45, key: 'castle' },
      lose: { type: 'sawtooth', f0: 300, f1: 80, dur: 0.8, vol: 0.3, key: 'lose' },
      win: { type: 'sine', f0: 523, f1: 1046, dur: 0.6, vol: 0.3, key: 'win' },
      ui: { type: 'sine', f0: 700, f1: 700, dur: 0.05, vol: 0.1, key: 'ui' },
    };
    if (!T[name]) return;
    const o = Object.assign({}, T[name], opt);
    // 부르는 쪽이 vol 을 바꿔 부르면(render.js 의 되살아나기 등) 녹음도 같은 비율로 키우거나 줄인다.
    // 합성음의 vol 은 절대값이라 녹음에 그대로 쓸 수 없다 — 표의 기본값 대비 「몇 배인가」로 옮긴다.
    o.gain = (opt.vol && T[name].vol) ? opt.vol / T[name].vol : (opt.gain == null ? 1 : opt.gain);
    // 녹음이 준비돼 있으면 녹음으로. 문지기는 여기서 한 번만 통과시킨다
    if (this.on && this.ctx && this.ctx.state === 'running' && this.buf.has(name)) {
      if (!this.gate(o.key || name, o.gap || 40)) return;
      this.sample(name, o);
      if (o.sub) this.subTone(o.sub, o.delay || 0, 0.45);   // 무게를 주는 저음을 절반 정도만 얹는다
      return;
    }
    this.tone(o);
    if (name === 'clear' || name === 'win') { this.tone(Object.assign({}, o, { f0: o.f0 * 1.25, f1: o.f1 * 1.25, delay: 0.12, key: name + '2' })); this.tone(Object.assign({}, o, { f0: o.f0 * 1.5, f1: o.f1 * 1.5, delay: 0.24, key: name + '3' })); }
    if (name === 'bossKill') { this.tone({ type: 'sawtooth', f0: 80, f1: 30, dur: 0.9, vol: 0.4, key: 'bossKill2' }); }
  }
};
NGN.sound = new NGN.Sound();
