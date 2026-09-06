'use strict';
// 판 사이에 남는 것(메타): 난이도별 스테이지 별·강화 나무·티켓·뽑은 보상·해금 계열·무한 모드 기록·내 기록·친구 기록·오늘의 판·이름. 브라우저(localStorage)에 저장.
// 규칙은 표가 정한다 — 스테이지·별·강화 나무·난이도·오늘의 판은 data/stages.json, 뽑기(확률·천장·풀)는 data/gacha.json. 여기는 굴리고 쌓기만 한다.
// 강화 나무와 뽑기 보상은 둘 다 perks() 하나로 합쳐져 엔진의 effectiveStats() 한 통로로 들어간다(design.md 6-1·12-4).
//
// 3단계(checklist I-3·I-9·I-10·I-12):
//   별은 난이도마다 따로 센다(starsBy.normal/hard = 금별·붉은별. 쉬움·은별은 2026-09-06 폐지). 뭉뚱그리면 아무도 어려움을 안 한다.
//   기록(records)은 "한 판" 단위 — 이름·모드·종목·난이도·막은 웨이브·남은 생명·쓴 골드·별 총합·날짜. 친구 기록도 같은 모양으로 friends 에 쌓인다.
//   기록 코드(TD-…)와 저장 코드(TDSAVE-…)는 lz-string 압축 + 검사 숫자. 바깥 서비스 없이 단톡방으로 주고받는다.
// 로비(checklist J-11, design.md 12-15): 일일 미션(하루 3개·안 쌓임·벌칙 없음)·출석(연속 보너스만, 끊겨도 잃는 것 없음)·월별 시즌(점수만 초기화, 재화는 그대로)·도감 새 계열 알림·프리미엄 팩.
//   규칙 숫자는 data/lobby.json. 날짜는 dailyClock(서버 시각 우선)으로 — 폰 시계를 돌려도 이득이 없다.
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
  constructor(gacha, stages, families, lobby) {
    this.gacha = gacha; this.stages = stages; this.families = families || []; this.lobby = lobby || null;
    this.KEY = 'ngn-td-meta';
    this.state = this.load() || { tickets: 0, pulls: 0, sinceLegendary: 0, sinceRare: 0, items: [], unlocked: [], famLevel: {}, best: null, games: 0 };
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
    s.famLevel = s.famLevel || {};    // 뽑기 중복 → 계열 레벨(2026-09-06 뽑기 개편, design.md 12-13)
    if (s.sinceRare === undefined) { s.sinceRare = s.sinceEpic || 0; delete s.sinceEpic; } // 옛 등급 이름(epic) → rare
    s.tree = s.tree || {};            // 강화 갈래 → 찍은 칸 수
    s.records = s.records || [];      // 내 기록(판 단위, 종목마다 최고 하나)
    s.friends = s.friends || [];      // 친구 기록(코드로 받은 것)
    s.daily = s.daily || {};          // 날짜 → 오늘의 판 결과
    s.settings = s.settings || {};
    s.name = s.name || null;
    s.missions = s.missions || null;   // 오늘의 일일 미션 { date, list[], bonusClaimed } (J-11)
    s.attend = s.attend || { streak: 0, last: null, total: 0 }; // 출석
    s.season = s.season || null;       // 이번 달 시즌 { key, base, pts, infBest }
    s.seasonHistory = s.seasonHistory || []; // 지난 시즌 결과(최근 12개)
    s.codexSeen = s.codexSeen || [];   // 도감에서 본 계열(새 계열 빨간 점)
    s.premiumPulls = s.premiumPulls || 0; // 시즌 2·3등 프리미엄 팩 남은 횟수
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
  // 스테이지 한 판 끝. 별은 그 난이도의 최고 기록만 남기고 차액만 더해진다(★1 → ★3 = +2).
  // 티켓(2026-09-06 2차 밸런스 설계 고침 A — 실패에도 값을 매긴다):
  //   첫 클리어 = 한 판 1 + firstClearTickets · 다시 깨서 등급 오름 = 1 + 별 차액 · 등급 그대로 = 1 + 막은 웨이브 everyWaves(5)마다 perMilestone(1)장(gacha.json 에 있던 규칙 — 전엔 스테이지 정산에서 안 쓰였다)
  //   실패 = 막은 웨이브 ÷ 3 내림 + 1장(20웨이브 판에서 15까지 갔으면 6장). 전엔 웨이브 18까지 버티나 1에서 죽으나 똑같이 1장이었다
  // 기록: 🔴 전엔 실패하면 w 가 무조건 0 이었다(`Math.max(0, lives > 0 ? 0 : 0)`) — 웨이브 18까지 갔어도 기록이 0. 이제 실패한 판도 막은 웨이브(wavesHeld)를 남긴다.
  //   progress = 지난 기록과 이번의 눈금("지난번 12웨이브 → 이번 15웨이브, 최고 기록!") — 결과 화면이 띄운다
  settleStage(stage, diff, cleared, lives, startLives, spent, wavesHeld = 0) {
    const T = this.gacha.tickets; const lines = [];
    const give = (n, why) => { if (n > 0) { this.state.tickets += n; lines.push({ n, why }); } };
    this.state.games++;
    const prevStars = this.starsFor(stage.id, diff);
    const stars = cleared ? this.starsForLives(lives, stage, startLives) : 0;
    const gained = Math.max(0, stars - prevStars);
    const firstClear = cleared && !this.clearedAny(stage.id);
    const prevRec = this.myRecord('s', stage.id, NGN.DIFF_SHORT[diff]);
    const held = cleared ? stage.waves : Math.max(0, Math.min(stage.waves, Math.floor(wavesHeld) || 0));
    if (!cleared) give(Math.floor(held / 3) + 1, held > 0 ? `웨이브 ${held}까지 막았다 (${held}÷3+1)` : '한 판 했다');
    else {
      give(T.perGame, '한 판 했다');
      if (gained > 0) { this.state.starsBy[diff][stage.id] = stars; this.seasonAdd('star', gained); this.missionProgress('star', gained); }
      this.missionProgress('clearStage', 1);
      if (diff === 'hard') this.missionProgress('hardClear', 1);
      if (firstClear) give(stage.firstClearTickets || 0, `스테이지 ${stage.id} 첫 클리어`);
      else if (gained <= 0) { const m = Math.floor(held / T.everyWaves); give(m * T.perMilestone, `웨이브 ${T.everyWaves}마다 (${m}번)`); }
    }
    let unlocked = null;
    const fam = this.stages.unlockFamily[String(stage.id)];
    if (cleared && fam && !this.isUnlocked(fam)) { this.state.unlocked.push(fam); unlocked = fam; }
    // 내 기록(종목 = 스테이지 × 난이도). 웨이브 → 별 → 생명 → 쓴 골드 적은 순으로 더 좋은 것만 남긴다(실패 기록은 클리어 기록을 절대 못 이긴다 — 클리어는 w 가 판의 웨이브 수)
    const rec = this.addRecord({ m: 's', k: stage.id, d: NGN.DIFF_SHORT[diff], w: held, l: cleared ? lives : 0, g: cleared ? Math.round(spent) : null, c: cleared ? 1 : 0, s: stars });
    const prevWave = prevRec ? (prevRec.w || 0) : null;
    const progress = { firstTry: prevWave === null, prevWave, prevCleared: !!(prevRec && prevRec.c), wave: held, best: prevWave === null || held > prevWave };
    this.save();
    return { stars, prevStars, gained, newRecord: gained > 0 && prevStars > 0, firstClear, unlocked, tickets: { lines, total: this.state.tickets }, rec, progress };
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
    // 뽑기 중복 → 계열 레벨(피해 +dupLevelDmg × 레벨) — 같은 familyDmg 칸으로 들어간다(엔진 effectiveStats 한 통로)
    for (const f of Object.keys(this.state.famLevel || {})) { const b = this.famLevelDmg(f); if (b) p.familyDmg[f] = (p.familyDmg[f] || 0) + b; }
    // 강화 나무(별): 같은 칸에 합산한다 — 엔진 통로는 하나뿐
    for (const k of this.treeKeys()) { const e = this.treeEffect(k); for (const key of Object.keys(e)) if (key in p && typeof p[key] === 'number') p[key] += e[key]; }
    return p;
  }
  famLevel(f) { return (this.state.famLevel && this.state.famLevel[f]) || 0; }
  famLevelDmg(f) { const TP = this.gacha.towerPool; return this.famLevel(f) * ((TP && TP.dupLevelDmg) || 0); }
  // 사람이 읽는 요약
  summary(familyName) {
    const p = this.perks(); const out = [];
    if (p.allDmg) out.push(`모든 타워 피해 +${Math.round(p.allDmg * 100)}%`);
    for (const f of Object.keys(this.state.famLevel || {})) if (this.famLevel(f)) out.push(`${familyName[f]} Lv.${this.famLevel(f)} (+${Math.round(this.famLevelDmg(f) * 100)}%)`);
    for (const f of Object.keys(p.familyDmg)) { const rest = p.familyDmg[f] - this.famLevelDmg(f); if (rest > 1e-9) out.push(`${familyName[f]} +${Math.round(rest * 100)}%`); }
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
    // 오늘의 판 = 티켓 D.tickets(데이터 담당이 3 으로 맞춤, 2026-09-06), 깨면 +2(2차 밸런스 설계 — 강화가 안 통하는 유일한 판 = 뒤처진 아이의 무대. 클리어 보너스도 stages.json daily.clearBonus 에서 읽는다 — 2026-09-07 상수에서 데이터로 옮김)
    const base = D.tickets || 0;
    if (base > 0) { this.state.tickets += base; lines.push({ n: base, why: '오늘의 판' }); }
    const bonus = D.clearBonus === undefined ? NGN.DAILY_CLEAR_BONUS : D.clearBonus;
    if (result.cleared && bonus > 0) { this.state.tickets += bonus; lines.push({ n: bonus, why: '오늘의 판 클리어' }); }
    this.state.daily[date] = { done: true, wave: result.wave, lives: result.lives, spent: Math.round(result.spent), cleared: result.cleared ? 1 : 0, src };
    this.seasonAdd('daily', result.wave, result.cleared); this.missionProgress('daily', 1);
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
    this.seasonAdd('inf', result.wave); this.missionProgress('infinite', 1);
    return this.addRecord({ m: 'i', k: mapId, d: null, w: result.wave, l: result.livesAt30 === null || result.livesAt30 === undefined ? null : result.livesAt30, g: result.spentAt30 === null || result.spentAt30 === undefined ? null : Math.round(result.spentAt30), c: result.wave >= 30 ? 1 : 0 });
  }

  // 기록 코드: 이 판 하나 + 내 별 총합. 단톡방에 올리면 친구가 [친구 코드 넣기]로 받는다
  recordCode(rec) { const s = this.state.season; return NGN.Codes.encode('TD-', Object.assign({}, rec, { n: this.state.name || '이름없음', t: this.totalStars(), v: 1, sk: s ? s.key : undefined, sp: s ? this.seasonScore(s) : undefined })); }
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
    if (f.sk && f.sp !== undefined) { rec.sk = String(f.sk).slice(0, 7); rec.sp = Math.max(0, Number(f.sp) || 0); } // 시즌(J-11 ⑤): 그 달의 점수
    const key = this.recordKey(rec);
    const i = this.state.friends.findIndex((x) => x.n === rec.n && this.recordKey(x) === key);
    let replaced = false;
    if (i < 0) this.state.friends.push(rec);
    else { replaced = true; if (this.better(rec, this.state.friends[i]) >= 0) this.state.friends[i] = rec; }
    // 별 총합은 사람 단위 — 그 친구의 다른 기록에도 최신 값을 적는다
    for (const x of this.state.friends) if (x.n === rec.n && x.t < rec.t) x.t = rec.t;
    if (rec.sk) for (const x of this.state.friends) if (x.n === rec.n && x.sk === rec.sk && (x.sp || 0) < rec.sp) x.sp = rec.sp; // 같은 달 점수는 사람 단위로 최신·최대
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

  // ---------- 뽑기 한 번 (2026-09-06 개편, design.md 12-13) ----------
  // 등급(흔함 52 · 고급 28 · 희귀 15 · 전설 5) → 천장(전설 40회 · 희귀 8회) → 고급·희귀·전설은 towerPool 의 새 계열, 흔함은 pool.common 의 숫자 상품.
  // 이미 가진 계열이 또 나오면 그 계열 레벨 +1(피해 +dupLevelDmg, 상한 dupLevelMax). 그 등급의 계열을 다 모으고 레벨도 꽉 찼으면 숫자 상품으로.
  // 돌아오는 값: { kind: 'tower', grade, family, isNew, level } 또는 { kind: 'perk', grade, id, name, type, value }. 무작위는 여기서만 쓴다(rng 를 넣으면 시험 가능)
  // premium = true 면 시즌 2·3등 프리미엄 팩(gacha.json premiumPack: 고급 30·희귀 45·전설 25, 흔함 없음). 티켓 대신 premiumPulls 를 쓰고 천장 카운터는 안 건드린다
  pull(rng = Math.random, premium = false) {
    let grade;
    if (premium) {
      if ((this.state.premiumPulls || 0) <= 0) return null;
      this.state.premiumPulls--; this.state.pulls++;
      grade = this.rollGradeFrom((this.gacha.premiumPack && this.gacha.premiumPack.rates) || this.gacha.rates, rng);
    } else {
      if (this.state.tickets <= 0) return null;
      this.state.tickets--; this.state.pulls++;
      const P = this.gacha.pity;
      grade = this.rollGrade(rng);
      if (this.state.sinceLegendary + 1 >= P.pityLegendary) grade = 'legendary';
      else if (grade !== 'legendary' && grade !== 'rare' && this.state.sinceRare + 1 >= P.pityRare) grade = 'rare';
      if (grade === 'legendary') this.state.sinceLegendary = 0; else this.state.sinceLegendary++;
      if (grade === 'rare' || grade === 'legendary') this.state.sinceRare = 0; else this.state.sinceRare++;
    }
    const item = (grade === 'common' ? null : this.pullTower(grade, rng)) || this.pullPerk(grade, rng);
    item.premium = !!premium;
    this.missionProgress('pull', 1);
    this.save();
    return item;
  }
  rollGradeFrom(R, rng) {
    const r = rng() * 100; let acc = 0;
    for (const g of ['legendary', 'rare', 'uncommon']) { acc += R[g] || 0; if (r < acc) return g; }
    return R.common ? 'common' : 'uncommon';
  }
  rollGrade(rng) {
    const R = this.gacha.rates; const r = rng() * 100; let acc = 0;
    for (const g of ['legendary', 'rare', 'uncommon']) { acc += R[g] || 0; if (r < acc) return g; }
    return 'common';
  }
  pullTower(grade, rng) {
    const TP = this.gacha.towerPool; if (!TP) return null;
    const max = TP.dupLevelMax || 10;
    const cands = (TP[grade] || []).filter((f) => this.families.includes(f) && (!this.isUnlocked(f) || this.famLevel(f) < max));
    if (!cands.length) return null;
    const f = cands[Math.floor(rng() * cands.length)];
    if (!this.isUnlocked(f)) { this.state.unlocked.push(f); return { kind: 'tower', grade, family: f, isNew: true, level: 0, name: `새 타워: ${NGN.FAMILY_NAMES[f]}` }; }
    const lv = this.famLevel(f) + 1; this.state.famLevel[f] = lv;
    return { kind: 'tower', grade, family: f, isNew: false, level: lv, name: `${NGN.FAMILY_NAMES[f]} Lv.${lv} (피해 +${Math.round(lv * TP.dupLevelDmg * 100)}%)` };
  }
  pullPerk(grade, rng) {
    const pool = this.gacha.pool.common; const base = pool[Math.floor(rng() * pool.length)];
    const item = { kind: 'perk', grade, id: base.id, name: base.name, type: base.type, value: base.value };
    this.state.items.push({ id: item.id, grade, type: item.type, value: item.value, name: item.name, at: Date.now() });
    return item;
  }

  // ---------- 로비(checklist J-11): 날짜가 바뀌면 여기서 한 번에 정리한다 ----------
  lobbyRules() { return this.lobby || {}; }
  missionRules() { return this.lobbyRules().missions || { pool: [], perDay: 3, allClearBonus: 0 }; }
  attendRules() { return this.lobbyRules().attendance || { cycle: [1] }; }
  seasonRules() { return this.lobbyRules().season || { scoring: {}, minPeople: 3 }; }
  seasonKeyOf(date) { return String(date || '').slice(0, 7); }
  dateShift(date, days) { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d) + days * 86400e3).toISOString().slice(0, 10); }
  // 로비에 들어올 때 부른다(dk = dailyClock 결과). 돌아오는 값 = 화면이 알릴 것들(출석 보상·미션 갱신·늦게 준 보상·시즌 정산)
  lobbyDay(dk) {
    const out = { attended: null, missionsReset: false, paidLate: 0, seasonRolled: null };
    if (!dk || !dk.date) return out;
    const date = dk.date;
    out.seasonRolled = this.seasonRoll(date); // ① 월이 바뀌었으면 지난달 정산
    // ② 미션: 날짜가 바뀌었으면 어제 미수령 보상은 자동으로 주고(벌칙 없음) 오늘 것을 새로 고른다 — 밀린 미션은 없다(안 쌓인다)
    const M = this.state.missions;
    if (!M || M.date !== date) {
      if (M && Array.isArray(M.list)) {
        for (const m of M.list) if (m.done && !m.claimed) { out.paidLate += m.reward; this.state.tickets += m.reward; }
        if (M.list.length && M.list.every((m) => m.done) && !M.bonusClaimed) { const b = this.missionRules().allClearBonus || 0; out.paidLate += b; this.state.tickets += b; }
      }
      this.state.missions = { date, list: this.pickMissions(date), bonusClaimed: false };
      out.missionsReset = true;
    }
    // ③ 출석: 오늘 처음이면 도장 + 티켓. 어제도 왔으면 연속 +1, 아니면 1일차부터 — 잃는 것은 없다(보너스 칸을 다시 걸어갈 뿐)
    const A = this.state.attend;
    if (A.last !== date) {
      A.streak = A.last === this.dateShift(date, -1) ? (A.streak || 0) + 1 : 1;
      A.last = date; A.total = (A.total || 0) + 1;
      const cycle = this.attendRules().cycle || [1];
      const reward = cycle[(A.streak - 1) % cycle.length] || 1;
      this.state.tickets += reward;
      out.attended = { reward, streak: A.streak, day: ((A.streak - 1) % cycle.length) + 1, cycleLen: cycle.length };
    }
    this.save();
    return out;
  }
  attendInfo() { const A = this.state.attend, cycle = this.attendRules().cycle || [1]; const streak = A.streak || 0; return { streak, total: A.total || 0, last: A.last, cycle, day: streak ? ((streak - 1) % cycle.length) + 1 : 0 }; }
  // 오늘의 미션 3개 — 날짜가 씨앗이라 같은 날은 모두 같은 미션. needs 조건이 안 열린 사람에겐 그 미션이 안 나온다
  pickMissions(date) {
    const R = this.missionRules();
    const pool = (R.pool || []).filter((m) => !m.needs || (m.needs === 'infinite' && this.infiniteUnlocked()) || (m.needs === 'hard' && this.hardOpenedAny()));
    let seed = 7; for (const ch of date) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
    const rng = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const arr = pool.slice();
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr.slice(0, R.perDay || 3).map((m) => ({ id: m.id, name: m.name, type: m.type, goal: m.goal, reward: m.reward, n: 0, done: false, claimed: false }));
  }
  hardOpenedAny() { return this.stages.stages.some((s) => this.isDiffOpen(s.id, 'hard')); }
  missions() { return this.state.missions; }
  // 진행 올리기(판 끝·뽑기·별). 완료되면 시즌 점수도. 돌아오는 값 = 이번에 완료된 미션들
  missionProgress(type, n = 1) {
    const M = this.state.missions; if (!M || !(n > 0)) return [];
    const done = [];
    for (const m of M.list) {
      if (m.type !== type || m.done) continue;
      m.n = Math.min(m.goal, (m.n || 0) + n);
      if (m.n >= m.goal) { m.done = true; done.push(m); this.seasonAdd('mission', 1); }
    }
    if (done.length) this.save();
    return done;
  }
  missionClaim(i) {
    const M = this.state.missions; if (!M) return 0;
    const m = M.list[i]; if (!m || !m.done || m.claimed) return 0;
    m.claimed = true; this.state.tickets += m.reward;
    let got = m.reward;
    if (M.list.every((x) => x.claimed) && !M.bonusClaimed) { const b = this.missionRules().allClearBonus || 0; M.bonusClaimed = true; this.state.tickets += b; got += b; }
    this.save();
    return got;
  }
  missionUnclaimed() { const M = this.state.missions; return M ? M.list.filter((m) => m.done && !m.claimed).length : 0; }

  // ---------- 월별 시즌(J-11 ⑤) — 점수만 매달 0, 재화·타워·강화는 그대로 ----------
  seasonNew(key) { const inf = this.state.best ? this.state.best.wave : 0; return { key, base: { inf }, pts: { star: 0, daily: 0, dailyN: 0, mission: 0 }, infBest: inf }; }
  season() { return this.state.season; }
  seasonScore(s = this.state.season) { return s ? this.seasonBreakdown(s).reduce((a, b) => a + b.pts, 0) : 0; }
  // 항목별 내역 — 화면이 그대로 보여 준다("이번 달에 얼마나 늘었나")
  seasonBreakdown(s = this.state.season) {
    if (!s) return [];
    const S = this.seasonRules().scoring || {};
    const inf = Math.max(0, (s.infBest || 0) - (s.base.inf || 0));
    return [
      { name: '새로 딴 별', n: s.pts.star || 0, unit: '개', pts: (s.pts.star || 0) * (S.starPts || 0) },
      { name: '오늘의 판', n: s.pts.dailyN || 0, unit: '판', pts: s.pts.daily || 0 },
      { name: '무한 기록 갱신', n: inf, unit: '웨이브', pts: inf * (S.infWavePts || 0) },
      { name: '일일 미션', n: s.pts.mission || 0, unit: '개', pts: (s.pts.mission || 0) * (S.missionPts || 0) },
    ];
  }
  seasonAdd(kind, n, extra) {
    const s = this.state.season; if (!s) return;
    const S = this.seasonRules().scoring || {};
    if (kind === 'star') s.pts.star = (s.pts.star || 0) + n;
    else if (kind === 'daily') { s.pts.daily = (s.pts.daily || 0) + n * (S.dailyWavePts || 0) + (extra ? (S.dailyClearPts || 0) : 0); s.pts.dailyN = (s.pts.dailyN || 0) + 1; }
    else if (kind === 'mission') s.pts.mission = (s.pts.mission || 0) + n;
    else if (kind === 'inf') s.infBest = Math.max(s.infBest || 0, n);
  }
  // 월이 바뀌었으면 지난달을 정산하고 새 달을 연다. 2·3등이면 프리미엄 팩(gacha.json premiumPack.pulls). 나까지 minPeople 명이 안 되면 팩 없음
  seasonRoll(date) {
    const key = this.seasonKeyOf(date); if (!key) return null;
    const s = this.state.season;
    if (!s) { this.state.season = this.seasonNew(key); return null; }
    if (s.key === key) return null;
    const result = this.seasonRank(s.key, this.seasonScore(s));
    const packs = (this.gacha.premiumPack && this.gacha.premiumPack.pulls) || {};
    let prize = 0;
    if (result.people >= (this.seasonRules().minPeople || 3)) prize = result.rank === 2 ? (packs['2등'] || 0) : result.rank === 3 ? (packs['3등'] || 0) : 0;
    if (prize) this.state.premiumPulls = (this.state.premiumPulls || 0) + prize;
    const rec = { key: s.key, score: this.seasonScore(s), rank: result.rank, people: result.people, prize, rows: result.rows, seenAt: null };
    this.state.seasonHistory = [rec, ...(this.state.seasonHistory || [])].slice(0, 12);
    this.state.season = this.seasonNew(key);
    return rec;
  }
  // 시즌 순위: 나 + 친구(코드에 실린 sk 가 그 달인 사람). 친구 점수는 코드를 받은 시점의 값
  seasonRank(key, myScore) {
    const rows = [{ n: this.state.name || '나', p: myScore, me: true }];
    for (const name of this.friendNames()) { const ps = this.state.friends.filter((x) => x.n === name && x.sk === key).map((x) => Number(x.sp) || 0); if (ps.length) rows.push({ n: name, p: Math.max(...ps), me: false }); }
    rows.sort((a, b) => b.p - a.p);
    return { rows, people: rows.length, rank: rows.findIndex((r) => r.me) + 1 };
  }
  seasonUnseen() { const h = this.state.seasonHistory || []; return h.length && !h[0].seenAt ? h[0] : null; }
  seasonMarkSeen() { const h = this.state.seasonHistory || []; if (h.length && !h[0].seenAt) { h[0].seenAt = this.today(); this.save(); } }

  // ---------- 도감(J-11 ③): 새로 열린 계열 → 로비 [타워] 탭 빨간 점 ----------
  codexNew() { const seen = new Set(this.state.codexSeen || []); return this.unlockedFamilies().filter((f) => !seen.has(f)); }
  codexMarkSeen() { const s = new Set(this.state.codexSeen || []); let changed = false; for (const f of this.unlockedFamilies()) if (!s.has(f)) { s.add(f); changed = true; } if (changed) { this.state.codexSeen = [...s]; this.save(); } }
};
NGN.GRADES = ['common', 'uncommon', 'rare', 'legendary'];
NGN.DAILY_CLEAR_BONUS = 2; // 옛 데이터에 clearBonus 칸이 없을 때만 쓰는 대비값. 정본은 stages.json daily.clearBonus (2026-09-07)
