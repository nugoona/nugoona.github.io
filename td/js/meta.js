'use strict';
// 판 사이에 남는 것(메타): 난이도별 스테이지 별·강화 나무·티켓·뽑은 보상·해금 계열·무한 모드 기록·내 기록·친구 기록·오늘의 판·이름. 브라우저(localStorage)에 저장.
// 규칙은 표가 정한다 — 스테이지·별·강화 나무·난이도·오늘의 판은 data/stages.json, 뽑기(확률·천장·풀)는 data/gacha.json. 여기는 굴리고 쌓기만 한다.
// 강화 나무와 뽑기 보상은 둘 다 perks() 하나로 합쳐져 엔진의 effectiveStats() 한 통로로 들어간다(design.md 6-1·12-4).
//
// 3단계(checklist I-3·I-9·I-10·I-12):
//   별은 난이도마다 따로 센다(starsBy.normal/hard = 금별·붉은별. 쉬움·은별은 2026-09-06 폐지). 뭉뚱그리면 아무도 어려움을 안 한다.
//   기록(records)은 "한 판" 단위 — 이름·모드·종목·난이도·막은 웨이브·남은 생명·쓴 골드·별 총합·날짜. 친구 기록도 같은 모양으로 friends 에 쌓인다.
//   기록 코드(TD-…)와 저장 코드(TDSAVE-…)는 lz-string 압축 + 검사 숫자. 바깥 서비스 없이 단톡방으로 주고받는다.
window.NGN = window.NGN || {};

// ---------- 코드(문자열) 만들기·읽기 ----------
// 접두어 + lz-string 압축(URI 안전 문자만: A-Z a-z 0-9 + - $) + '.' + 검사 숫자 7자(FNV-1a 를 36진수로).
// 손으로 글자를 바꾸면 압축이 안 풀리거나 검사 숫자가 안 맞아 "잘못된 코드"로 걸린다.
NGN.Codes = {
  hash(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36).padStart(7, '0').slice(-7); },
  encode(prefix, obj) {
    const json = JSON.stringify(obj);
    return `${prefix}${LZString.compressToEncodedURIComponent(json)}.${this.hash(json)}`;
  },
  // 돌아오는 값: { ok: true, data } 또는 { ok: false, why }
  decode(prefix, code) {
    const s = String(code || '').replace(/\s+/g, '');
    if (!s) return { ok: false, why: '코드가 비었어요' };
    if (!s.startsWith(prefix)) return { ok: false, why: `${prefix} 로 시작하는 코드가 아니에요` };
    const dot = s.lastIndexOf('.');
    if (dot < 0) return { ok: false, why: '검사 숫자가 없어요 — 코드가 잘린 것 같아요' };
    const body = s.slice(prefix.length, dot), sum = s.slice(dot + 1);
    let json = null;
    try { json = LZString.decompressFromEncodedURIComponent(body); } catch (e) { json = null; }
    if (!json) return { ok: false, why: '잘못된 코드예요 — 글자가 바뀌었거나 잘렸어요' };
    if (this.hash(json) !== sum) return { ok: false, why: '잘못된 코드예요 — 검사 숫자가 안 맞아요(손으로 고친 코드는 안 돼요)' };
    try { return { ok: true, data: JSON.parse(json) }; } catch (e) { return { ok: false, why: '잘못된 코드예요' }; }
  },
};

// 쉬움(easy·'e')은 2026-09-06 폐지 — 옛 저장·옛 친구 코드에 남은 은별은 migrate()·importFriend() 가 조용히 버린다
NGN.DIFF_ORDER = ['normal', 'hard'];
NGN.DIFF_SHORT = { normal: 'n', hard: 'h' };
NGN.DIFF_FROM_SHORT = { n: 'normal', h: 'hard' };

NGN.Meta = class Meta {
  constructor(gacha, stages, families) {
    this.gacha = gacha; this.stages = stages; this.families = families || [];
    this.KEY = 'ngn-td-meta';
    this.state = this.load() || { tickets: 0, pulls: 0, sinceLegendary: 0, sinceEpic: 0, items: [], unlocked: [], best: null, games: 0 };
    this.migrate();
  }
  // 옛 저장을 지금 모양으로. 옛 stars(난이도 없음)는 보통(금별)로 옮긴다. 쉬움(은별)은 폐지 — 별·기록 전부 버린다(강화에 쓴 별이 모자라면 나무를 되돌린다)
  migrate() {
    const s = this.state;
    s.starsBy = s.starsBy || {};
    for (const d of NGN.DIFF_ORDER) s.starsBy[d] = s.starsBy[d] || {};
    if (s.stars) { for (const [id, n] of Object.entries(s.stars)) if (!s.starsBy.normal[id]) s.starsBy.normal[id] = n; delete s.stars; }
    if (s.starsBy.easy) delete s.starsBy.easy;
    if (Array.isArray(s.records)) s.records = s.records.filter((r) => r.d !== 'e');
    if (Array.isArray(s.friends)) s.friends = s.friends.filter((r) => r.d !== 'e');
    s.tree = s.tree || {};            // 강화 갈래 → 찍은 칸 수
    s.records = s.records || [];      // 내 기록(판 단위, 종목마다 최고 하나)
    s.friends = s.friends || [];      // 친구 기록(코드로 받은 것)
    s.daily = s.daily || {};          // 날짜 → 오늘의 판 결과
    s.settings = s.settings || {};
    s.name = s.name || null;
    delete s.lastDeck;                // 덱 편성은 없어졌다(12장)
    // 옛 기록(ngn-td-best)이 있으면 가져온다
    if (!s.best) { try { const b = JSON.parse(localStorage.getItem('ngn-td-best') || 'null'); if (b) s.best = b; } catch (e) { /* 무시 */ } }
    if (this.stages && this.stages.upgradeTree && this.freeStars() < 0) s.tree = {}; // 은별로 찍어 둔 강화가 남아 있으면 되돌린다(별이 음수가 되지 않게)
  }
  load() { try { return JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch (e) { return null; } }
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.state)); } catch (e) { /* 저장이 막힌 브라우저 */ } }

  // ---------- 이름 ----------
  hasName() { return !!(this.state.name && this.state.name.trim()); }
  setName(n) { const v = String(n || '').trim().slice(0, 8); if (!v) return false; this.state.name = v; this.save(); return true; }

  // ---------- 해금 ----------
  // 처음부터 열린 계열 = gacha.json 의 startFamilies.list(덤불·불꽃바위·서리넝쿨 셋). 나머지는 스테이지 2·4·6·8(stages.unlockFamily) 또는 뽑기로 연다
  startFamilies() { return this.gacha.startFamilies.list; }
  isUnlocked(family) { return this.startFamilies().includes(family) || this.state.unlocked.includes(family); }
  unlockedFamilies() { return this.families.filter((f) => this.isUnlocked(f)); } // 전투에 들어가는 카드 = 연 것 전부(덱 편성 없음)

  // ---------- 난이도 ----------
  diffList() { return (this.stages.difficulties && this.stages.difficulties.order) || ['normal']; }
  diff(key) { return (this.stages.difficulties || {})[key] || { name: '보통', hpMul: 1, star: '금별' }; }
  // 어려움은 그 스테이지를 보통으로 깨야 열린다(stages.json difficulties.hard.unlock). 보통은 처음부터
  isDiffOpen(stageId, key) { return key !== 'hard' || this.starsFor(stageId, 'normal') > 0; }

  // ---------- 스테이지 ----------
  stageList() { return this.stages.stages; }
  stage(id) { return this.stages.stages.find((s) => s.id === id) || null; }
  starsFor(id, diff = 'normal') { return (this.state.starsBy[diff] || {})[id] || 0; }
  // 난이도 하나의 별 합(없으면 셋 다)
  totalStars(diff = null) { if (diff) return Object.values(this.state.starsBy[diff] || {}).reduce((a, b) => a + b, 0); return this.diffList().reduce((a, d) => a + this.totalStars(d), 0); }
  maxStars(diff = null) { return this.stages.stages.length * 3 * (diff ? 1 : this.diffList().length); }
  clearedAny(id) { return this.diffList().some((d) => this.starsFor(id, d) > 0); }
  clearedCount() { return this.stages.stages.filter((s) => this.clearedAny(s.id)).length; }
  // 다음에 할 스테이지 = 어느 난이도로도 못 깬 첫 번째. 전부 깼으면 null
  nextStage() { return this.stages.stages.find((s) => !this.clearedAny(s.id)) || null; }
  isStageOpen(id) { const n = this.nextStage(); return this.clearedAny(id) || (n && n.id === id); }
  stageAfter(id) { return this.stage(id + 1); }
  infiniteUnlocked() { return this.clearedAny(this.stages.infiniteUnlockStage); }
  // 별 등급표를 "이 판에서 별 k 를 받으려면 생명 몇 개 이상"으로 푼다. 표는 두 모양을 받는다:
  //   byRatio    — 남은 생명 ÷ 그 판을 시작할 때 들고 있던 생명(startLives = stage.lives + 강화로 얻은 생명). 예 0.9 → 시작 10 이면 9 이상
  //   thresholds — 절대값(옛 모양). 예 18 이상 = 3
  starTiers(stage, startLives) {
    const S = this.stages.star;
    const base = startLives || stage.lives || this.stages.stages[0].lives;
    const tiers = S.byRatio
      ? S.byRatio.map((t) => ({ star: t.star, lives: Math.max(1, Math.ceil(t.ratio * base - 1e-9)) }))
      : (S.thresholds || []).map((t) => ({ star: t.star, lives: t.lives }));
    return tiers.sort((a, b) => b.star - a.star);
  }
  // 남은 생명 → 별
  starsForLives(lives, stage, startLives) {
    let best = 0;
    for (const t of this.starTiers(stage, startLives)) if (lives >= t.lives) best = Math.max(best, t.star);
    return best;
  }
  // 스테이지 한 판 끝. 별은 그 난이도의 최고 기록만 남기고 차액만 더해진다(★1 → ★3 = +2). 티켓: 한 판 +perGame, (어느 난이도든) 첫 클리어 +firstClearTickets
  settleStage(stage, diff, cleared, lives, startLives, spent) {
    const T = this.gacha.tickets; const lines = [];
    const give = (n, why) => { if (n > 0) { this.state.tickets += n; lines.push({ n, why }); } };
    this.state.games++;
    give(T.perGame, '한 판 했다');
    const prevStars = this.starsFor(stage.id, diff);
    const stars = cleared ? this.starsForLives(lives, stage, startLives) : 0;
    const gained = Math.max(0, stars - prevStars);
    const firstClear = cleared && !this.clearedAny(stage.id);
    if (gained > 0) this.state.starsBy[diff][stage.id] = stars;
    if (firstClear) give(stage.firstClearTickets || 0, `스테이지 ${stage.id} 첫 클리어`);
    let unlocked = null;
    const fam = this.stages.unlockFamily[String(stage.id)];
    if (cleared && fam && !this.isUnlocked(fam)) { this.state.unlocked.push(fam); unlocked = fam; }
    // 내 기록(종목 = 스테이지 × 난이도). 별 → 생명 → 쓴 골드 적은 순으로 더 좋은 것만 남긴다
    const rec = this.addRecord({ m: 's', k: stage.id, d: NGN.DIFF_SHORT[diff], w: cleared ? stage.waves : Math.max(0, lives > 0 ? 0 : 0), l: cleared ? lives : 0, g: cleared ? Math.round(spent) : null, c: cleared ? 1 : 0, s: stars });
    this.save();
    return { stars, prevStars, gained, newRecord: gained > 0 && prevStars > 0, firstClear, unlocked, tickets: { lines, total: this.state.tickets }, rec };
  }

  // ---------- 강화 나무(별을 쓰는 곳) ----------
  treeKeys() { return Object.keys(this.stages.upgradeTree).filter((k) => !k.startsWith('_')); }
  treeLevel(k) { return this.state.tree[k] || 0; }
  treeMax(k) { return this.stages.upgradeTree[k].costs.length; }
  treeSpent() { let s = 0; for (const k of this.treeKeys()) for (let i = 0; i < this.treeLevel(k); i++) s += this.stages.upgradeTree[k].costs[i]; return s; }
  freeStars() { return this.totalStars() - this.treeSpent(); }
  treeNextCost(k) { const lv = this.treeLevel(k); return lv < this.treeMax(k) ? this.stages.upgradeTree[k].costs[lv] : null; }
  canBuy(k) { const c = this.treeNextCost(k); return c !== null && this.freeStars() >= c; }
  buy(k) { if (!this.canBuy(k)) return false; this.state.tree[k] = this.treeLevel(k) + 1; this.save(); return true; }
  resetTree() { this.state.tree = {}; this.save(); } // 되돌리기 무료 — 별이 전부 돌아온다
  // 갈래 하나의 현재 효과(perStep × 칸 수)
  treeEffect(k) { const out = {}; const ps = this.stages.upgradeTree[k].perStep; for (const key of Object.keys(ps)) out[key] = ps[key] * this.treeLevel(k); return out; }
  treeEffectText(k) {
    const e = this.treeEffect(k); const parts = [];
    if (e.allDmg) parts.push(`+${Math.round(e.allDmg * 100)}%`);
    if (e.rangeMul) parts.push(`+${Math.round(e.rangeMul * 100)}%`);
    if (e.startGold) parts.push(`+${e.startGold}`);
    if (e.lives) parts.push(`+${e.lives}`);
    if (e.baseTier) parts.push(`${1 + e.baseTier}단부터`); // 기본기(checklist I-6)
    return parts.join(' ');
  }

  // ---------- 뽑은 것 + 강화 나무의 합 → 엔진이 읽는 perks(한 통로) ----------
  perks() {
    const p = NGN.defaultPerks ? NGN.defaultPerks() : { allDmg: 0, familyDmg: {}, rangeMul: 0, startGold: 0, lives: 0, expMul: 0, sellRatio: null, bossDmg: 0, baseTier: 0 };
    for (const it of this.state.items) {
      if (it.type === 'allDmg') p.allDmg += it.value;
      else if (it.type === 'familyDmg') p.familyDmg[it.family] = (p.familyDmg[it.family] || 0) + it.value;
      else if (it.type === 'rangeMul') p.rangeMul += it.value;
      else if (it.type === 'startGold') p.startGold += it.value;
      else if (it.type === 'lives') p.lives += it.value;
      else if (it.type === 'expMul') p.expMul += it.value;
      else if (it.type === 'sellRatio') p.sellRatio = Math.max(p.sellRatio || 0, it.value);
      else if (it.type === 'bossDmg') p.bossDmg += it.value;
    }
    // 강화 나무(별): 같은 칸에 합산한다 — 엔진 통로는 하나뿐
    for (const k of this.treeKeys()) { const e = this.treeEffect(k); for (const key of Object.keys(e)) if (key in p && typeof p[key] === 'number') p[key] += e[key]; }
    return p;
  }
  // 사람이 읽는 요약
  summary(familyName) {
    const p = this.perks(); const out = [];
    if (p.allDmg) out.push(`모든 타워 피해 +${Math.round(p.allDmg * 100)}%`);
    for (const f of Object.keys(p.familyDmg)) out.push(`${familyName[f]} +${Math.round(p.familyDmg[f] * 100)}%`);
    if (p.rangeMul) out.push(`사거리 +${Math.round(p.rangeMul * 100)}%`);
    if (p.startGold) out.push(`시작 골드 +${p.startGold}`);
    if (p.lives) out.push(`생명 +${p.lives}`);
    if (p.expMul) out.push(`경험치 +${Math.round(p.expMul * 100)}%`);
    if (p.sellRatio) out.push('팔 때 전액 환급');
    if (p.bossDmg) out.push(`보스 피해 +${Math.round(p.bossDmg * 100)}%`);
    if (p.baseTier) out.push(`타워가 ${1 + p.baseTier}단부터 지어짐`);
    for (const f of this.state.unlocked) out.push(`${familyName[f]} 해금`);
    return out;
  }

  // ---------- 티켓 ----------
  addTickets(n, why) { if (n > 0) { this.state.tickets += n; this.save(); } return n; }
  // 무한 모드 한 판 끝: 어디까지 갔나 → 티켓. 돌아오는 값 = 내역
  settleGame(clearedWaves, lives, waveCount, mapId) {
    const T = this.gacha.tickets; const lines = [];
    const give = (n, why) => { if (n > 0) { this.state.tickets += n; lines.push({ n, why }); } };
    this.state.games++;
    give(T.perGame, '한 판 했다');
    const milestones = Math.floor(Math.min(clearedWaves, waveCount) / T.everyWaves);
    give(milestones * T.perMilestone, `웨이브 ${T.everyWaves}마다 (${milestones}번)`);
    if (clearedWaves >= waveCount) give(T.clear30, `${waveCount}웨이브 클리어`);
    if (clearedWaves > waveCount) { const inf = Math.floor((clearedWaves - waveCount) / 5); give(inf * T.infiniteEvery5, `무한 구간 5웨이브마다 (${inf}번)`); }
    const prev = mapId ? this.bestFor(mapId) : this.state.best; // 기록 갱신은 그 지도 기준
    const better = !prev || clearedWaves > prev.wave || (clearedWaves === prev.wave && lives > (prev.lives || 0));
    if (better && prev) give(T.newRecord, '기록 갱신');
    this.save();
    return { lines, better };
  }
  setBest(best) { this.state.best = best; this.save(); }
  // 무한 모드 지도별 기록
  bestFor(mapId) { return (this.state.bestByMap || {})[mapId] || null; }
  setBestFor(mapId, best) { this.state.bestByMap = this.state.bestByMap || {}; this.state.bestByMap[mapId] = best; this.save(); }

  // ---------- 오늘의 판 (checklist I-9) ----------
  // 시각(Date) → 한국 날짜 'YYYY-MM-DD' 와 씨앗. 서버 시각(HTTP Date)이 가장 믿을 만하다 — 못 얻으면 dailyClock 이 폰 시계로 넘어간다
  dailyKey(when) {
    if (!when) return null;
    const kst = new Date(when.getTime() + 9 * 3600e3);
    return this.dailyKeyOf(kst.toISOString().slice(0, 10));
  }
  // 어느 시계로 오늘을 정하나(3단 대비). 돌아오는 값에 src: 's' 서버 시각 | 'p' 폰 시계.
  //   ① 서버 시각이 있으면 그것 ② 없으면 폰 시계 — 단, 저장의 '마지막으로 인정한 날짜'(dailyLast)보다 과거면 무시하고 그 날짜를 쓴다(되돌리기 차단).
  //   미래로 돌리면 그 날짜가 '한 것'으로 기록되니 미리 풀어 봐도 그날 몫을 잃는다 — 이득이 없다. 잠그지는 않는다(조카가 못 하는 것보다 낫다).
  dailyClock(serverDate) {
    if (serverDate) { const k = this.dailyKey(serverDate); if (k) k.src = 's'; return k; }
    const phone = this.dailyKey(new Date()); if (!phone) return null;
    const last = this.state.dailyLast || null;
    if (last && phone.date < last) { const k = this.dailyKeyOf(last); k.src = 'p'; k.rolledBack = true; return k; }
    phone.src = 'p'; return phone;
  }
  dailyKeyOf(date) {
    const D = this.stages.daily; if (!D || !date) return null;
    const [y, m, d] = date.split('-').map(Number);
    const [ey, em, ed] = D.epoch.split('-').map(Number);
    const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ey, em - 1, ed)) / 86400e3);
    // 씨앗은 시뮬이 걸러 준 목록(stages.json daily.seeds)에서 날수로 고른다 — 목록 밖 씨앗은 아예 못 깨는 지도가 나올 수 있다
    const seeds = D.seeds || []; const seed = seeds.length ? seeds[((days % seeds.length) + seeds.length) % seeds.length] : 1000 + days;
    return { date, seed, days, label: `${m}월 ${d}일` };
  }
  // 시작만 하고 앱을 꺼도 '한 것'이다 — 안 그러면 판을 보고 나서 앱을 죽이고 다시 시작하는 구멍이 생긴다(미래 날짜를 미리 풀어 보는 것도 같은 구멍)
  dailyPlayed(date) { const d = this.state.daily[date]; return !!(d && (d.done || d.started)); }
  dailyResult(date) { return this.state.daily[date] || null; }
  // 오늘의 판 시작을 표시한다(중간에 껐다 켜도 다시 못 하게 — 하루 한 번). '마지막으로 인정한 날짜'도 앞으로만 움직인다
  dailyStart(date) { this.state.daily[date] = Object.assign({}, this.state.daily[date] || {}, { started: true }); if (!this.state.dailyLast || date > this.state.dailyLast) this.state.dailyLast = date; this.save(); }
  // src: 's' 서버 시각으로 판정 | 'p' 폰 시계로 판정 — 기록 코드에 실려 순위표에서 구분된다
  dailySettle(date, result, src = 's') {
    const D = this.stages.daily; const lines = [];
    this.state.games++;
    if (D.tickets) { this.state.tickets += D.tickets; lines.push({ n: D.tickets, why: '오늘의 판' }); }
    this.state.daily[date] = { done: true, wave: result.wave, lives: result.lives, spent: Math.round(result.spent), cleared: result.cleared ? 1 : 0, src };
    const rec = this.addRecord({ m: 'd', k: date, d: null, w: result.wave, l: result.cleared ? result.lives : 0, g: result.cleared ? Math.round(result.spent) : null, c: result.cleared ? 1 : 0, cs: src });
    this.save();
    return { lines, total: this.state.tickets, rec };
  }

  // ---------- 기록(판 단위) — 순위표·기록 코드의 재료 (checklist I-10) ----------
  // 모양: { n 이름, m 모드('s' 스테이지 | 'i' 무한 | 'd' 오늘), k 종목(스테이지 id | 지도 id | 날짜), d 난이도('e'|'n'|'h'|null),
  //         w 막은 웨이브, l 남은 생명(철벽), g 쓴 골드(알뜰 — 클리어한 판만, 무한은 30웨이브 시점), c 클리어, s 그 판 별, t 별 총합, dt 날짜 }
  recordKey(r) { return `${r.m}:${r.k}:${r.d || ''}`; }
  // 같은 종목의 두 기록 중 어느 것이 좋은가(양수면 a 가 좋다). 웨이브 → 별 → 생명 → 쓴 골드 적음
  better(a, b) {
    if (!b) return 1; if (!a) return -1;
    if ((a.w || 0) !== (b.w || 0)) return (a.w || 0) - (b.w || 0);
    if ((a.s || 0) !== (b.s || 0)) return (a.s || 0) - (b.s || 0);
    if ((a.l || 0) !== (b.l || 0)) return (a.l || 0) - (b.l || 0);
    const ga = a.g === null || a.g === undefined ? Infinity : a.g, gb = b.g === null || b.g === undefined ? Infinity : b.g;
    return gb - ga;
  }
  today() { return new Date().toISOString().slice(0, 10); }
  // 내 기록에 한 판을 넣는다(종목마다 최고 하나). 돌아오는 값 = 저장된 기록(코드로 만들 때 쓴다)
  addRecord(r) {
    const rec = Object.assign({ v: 1, n: this.state.name || '', t: this.totalStars(), dt: this.today() }, r);
    const key = this.recordKey(rec);
    const i = this.state.records.findIndex((x) => this.recordKey(x) === key);
    if (i < 0) this.state.records.push(rec);
    else if (this.better(rec, this.state.records[i]) > 0) this.state.records[i] = rec;
    else { const kept = this.state.records[i]; kept.t = rec.t; kept.n = rec.n; return Object.assign({}, rec, { notBest: true, best: kept }); }
    return rec;
  }
  myRecord(m, k, d = null) { const key = `${m}:${k}:${d || ''}`; return this.state.records.find((x) => this.recordKey(x) === key) || null; }
  myRecords(m) { return this.state.records.filter((x) => x.m === m); }
  // 무한 모드 판 하나를 기록으로(엔진 결과에서). l·g 는 30웨이브 시점 값(못 가면 null)
  addInfiniteRecord(mapId, result) {
    return this.addRecord({ m: 'i', k: mapId, d: null, w: result.wave, l: result.livesAt30 === null || result.livesAt30 === undefined ? null : result.livesAt30, g: result.spentAt30 === null || result.spentAt30 === undefined ? null : Math.round(result.spentAt30), c: result.wave >= 30 ? 1 : 0 });
  }

  // 기록 코드: 이 판 하나 + 내 별 총합. 단톡방에 올리면 친구가 [친구 코드 넣기]로 받는다
  recordCode(rec) { return NGN.Codes.encode('TD-', Object.assign({}, rec, { n: this.state.name || '이름없음', t: this.totalStars(), v: 1 })); }
  // 친구 코드 넣기. 돌아오는 값: { ok, why?, rec?, replaced? }
  importFriend(code) {
    const r = NGN.Codes.decode('TD-', code);
    if (!r.ok) return r;
    const f = r.data;
    if (!f || typeof f !== 'object' || !f.n || !f.m || f.k === undefined) return { ok: false, why: '기록 코드가 아니에요' };
    if (!['s', 'i', 'd'].includes(f.m)) return { ok: false, why: '모르는 모드예요' };
    if (f.d === 'e') return { ok: false, why: '쉬움 난이도 기록이에요 — 쉬움은 없어졌어요' };
    if (this.state.name && f.n === this.state.name) return { ok: false, why: '내 이름과 같은 코드예요 — 친구 이름을 다르게 정해 주세요' };
    const rec = { v: 1, n: String(f.n).slice(0, 8), m: f.m, k: f.k, d: f.d || null, w: Number(f.w) || 0, l: f.l === null || f.l === undefined ? null : Number(f.l), g: f.g === null || f.g === undefined ? null : Number(f.g), c: f.c ? 1 : 0, s: Number(f.s) || 0, t: Number(f.t) || 0, dt: String(f.dt || ''), at: Date.now() };
    if (f.m === 'd') rec.cs = f.cs === 'p' ? 'p' : 's'; // 오늘의 판: 어느 시계로 판정됐나
    const key = this.recordKey(rec);
    const i = this.state.friends.findIndex((x) => x.n === rec.n && this.recordKey(x) === key);
    let replaced = false;
    if (i < 0) this.state.friends.push(rec);
    else { replaced = true; if (this.better(rec, this.state.friends[i]) >= 0) this.state.friends[i] = rec; }
    // 별 총합은 사람 단위 — 그 친구의 다른 기록에도 최신 값을 적는다
    for (const x of this.state.friends) if (x.n === rec.n && x.t < rec.t) x.t = rec.t;
    this.save();
    return { ok: true, rec, replaced };
  }
  friendNames() { return [...new Set(this.state.friends.map((f) => f.n))]; }
  removeFriend(name) { this.state.friends = this.state.friends.filter((f) => f.n !== name); this.save(); }
  // 별 총합 순위: 나 + 친구(이름별 최신 t)
  starRanking() {
    const rows = [{ n: this.state.name || '나', t: this.totalStars(), me: true }];
    for (const name of this.friendNames()) rows.push({ n: name, t: Math.max(0, ...this.state.friends.filter((f) => f.n === name).map((f) => f.t || 0)), me: false });
    return rows.sort((a, b) => b.t - a.t);
  }
  // 종목 하나의 순위표(나 + 친구). 돌아오는 값: 줄 목록 + 부문별 1등 이름
  ranking(m, k, d = null) {
    const key = `${m}:${k}:${d || ''}`;
    const rows = [];
    const mine = this.myRecord(m, k, d);
    if (mine) rows.push(Object.assign({}, mine, { n: this.state.name || '나', me: true }));
    for (const f of this.state.friends) if (this.recordKey(f) === key) rows.push(Object.assign({}, f, { me: false }));
    rows.sort((a, b) => this.better(b, a));
    // 부문 1등(동률이면 전부). 캠페인 종목은 웨이브 대신 별(다 깨면 웨이브가 같으니까)
    const top = (pick, cmp) => { let best = null; for (const r of rows) { const v = pick(r); if (v === null || v === undefined) continue; if (best === null || cmp(v, best) > 0) best = v; } return best === null ? [] : rows.filter((r) => pick(r) === best).map((r) => r.n); };
    const crowns = {
      wave: m === 's' ? top((r) => (r.s ? r.s : null), (a, b) => a - b) : top((r) => r.w, (a, b) => a - b),
      lives: top((r) => (r.c ? r.l : null), (a, b) => a - b),
      gold: top((r) => (r.c && r.g !== null ? r.g : null), (a, b) => b - a),
    };
    return { rows, crowns, waveLabel: m === 's' ? '별' : '웨이브' };
  }

  // ---------- 저장 코드 (checklist I-12) — 폰이 바뀌어도 살아난다 ----------
  exportSave() { return NGN.Codes.encode('TDSAVE-', Object.assign({ _v: 1, _at: this.today() }, this.state)); }
  importSave(code) {
    const r = NGN.Codes.decode('TDSAVE-', code);
    if (!r.ok) return r;
    const s = r.data;
    if (!s || typeof s !== 'object' || !('tickets' in s)) return { ok: false, why: '저장 코드가 아니에요' };
    delete s._v; delete s._at;
    this.state = s; this.migrate(); this.save();
    return { ok: true, stars: this.totalStars(), games: this.state.games || 0 };
  }

  // ---------- 뽑기 한 번 ----------
  // 등급 → 천장 → 풀에서 하나. 무작위는 여기서만 쓴다(rng 를 넣으면 시험 가능)
  pull(rng = Math.random) {
    if (this.state.tickets <= 0) return null;
    this.state.tickets--; this.state.pulls++;
    const G = this.gacha;
    let grade = this.rollGrade(rng);
    // 천장
    if (this.state.sinceLegendary + 1 >= G.pity.pityLegendary) grade = 'legendary';
    else if (grade !== 'legendary' && this.state.sinceEpic + 1 >= G.pity.pityEpic && grade !== 'epic') grade = 'epic';
    if (grade === 'legendary') this.state.sinceLegendary = 0; else this.state.sinceLegendary++;
    if (grade === 'epic' || grade === 'legendary') this.state.sinceEpic = 0; else this.state.sinceEpic++;

    const pool = G.pool[grade];
    let base = pool[Math.floor(rng() * pool.length)];
    let item = { ...base, grade };
    if (item.type === 'familyDmg') { const fams = Object.keys(NGN.FAMILY_NAMES); item.family = fams[Math.floor(rng() * fams.length)]; item.name = `${NGN.FAMILY_NAMES[item.family]} 강화 +${Math.round(item.value * 100)}%`; }
    if (item.type === 'unlock') {
      if (this.isUnlocked(item.family)) { item = { id: 'family_dmg_dup', grade, name: `${NGN.FAMILY_NAMES[item.family]} 강화 +${Math.round(G.unlockFallbackFamilyDmg * 100)}% (이미 열려 있어서)`, type: 'familyDmg', family: item.family, value: G.unlockFallbackFamilyDmg }; }
      else { this.state.unlocked.push(item.family); item.name = `새 계열: ${NGN.FAMILY_NAMES[item.family]}`; }
    }
    this.state.items.push({ id: item.id, grade, type: item.type, value: item.value, family: item.family, name: item.name, at: Date.now() });
    this.save();
    return item;
  }
  rollGrade(rng) {
    const R = this.gacha.rates; const r = rng() * 100;
    if (r < R.legendary) return 'legendary';
    if (r < R.legendary + R.epic) return 'epic';
    if (r < R.legendary + R.epic + R.rare) return 'rare';
    return 'common';
  }
};
