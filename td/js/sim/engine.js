'use strict';
// 전투 엔진: 한 판을 0.1초 단위로 굴린다. 시뮬레이터(node)와 게임(브라우저)이 이 파일을 똑같이 쓴다.
// 핵심은 "적이 사거리 안에 머무는 시간 × 그 구간의 초당 피해 ≥ 적 체력" — 이걸 틱 단위로 그대로 계산한다.
// 역할별 특성: 광역(주 목표 주변에도), 튕김(이어지는 적에게 감쇠하며), 연사(여러 목표 동시), 오라(주변 타워 강화), 감속.
// 난수를 쓰지 않는다(피해는 최소·최대의 평균, 아이템 드롭은 처치 횟수로). 같은 입력이면 항상 같은 결과가 나와 비교가 쉽다.
//
// 쓰는 법 둘:
//   시뮬레이터 — game.run()                       : 30웨이브를 한 번에 돌린다 (AI 가 사고 판다)
//   게임       — game.startWave(w) → step() 반복 → waveOver() 면 endWave() : 한 틱씩. 사람이 사고 판다.
// step() 이 일어난 일을 game.events 에 쌓는다(발사·피격·처치·누수·부활·드롭). 게임 화면이 그걸 읽어 연출하고 비운다.
//
// 육성 층(checklist I-6·7·8·11·13, design.md 12-8):
//   기본기(perks.baseTier)  — 별로 산 "시작 단계". 타워가 2단·3단부터 지어지되 값은 1단 값. 판 값(refund)은 실제로 낸 돈 기준.
//   3단 갈림길(inst.branch) — 3단으로 올릴 때 화력/광역 중 하나. balance.json 의 tier3Branches.
//   적 성질(wave.special)   — 웨이브 생성기가 붙여 준다(build-waves.js). 여기서는 스폰·피해·회복·부활·분열을 처리.
//   아이템(inst.items)      — 처치 수로 떨어지고(난수 없음) 타워에 끼운다. data/items.json.
//   레벨당 공격속도          — growth.json 의 aspdPerLevel.

(function () { // 브라우저에서 다른 파일과 이름이 부딪히지 않게 감싼다

const DT = 0.1; // 틱(초)
const AI_INTERVAL = 1.0; // 웨이브 중 AI 가 골드를 다시 살펴보는 간격(초)

// 판 사이 성장(별 강화·뽑기)이 엔진으로 들어오는 칸. 시뮬(run.js)·게임(meta.js) 이 같은 모양을 만든다
const DEFAULT_PERKS = { allDmg: 0, familyDmg: {}, rangeMul: 0, startGold: 0, lives: 0, expMul: 0, sellRatio: null, bossDmg: 0, baseTier: 0 };
const defaultPerks = () => ({ allDmg: 0, familyDmg: {}, rangeMul: 0, startGold: 0, lives: 0, expMul: 0, sellRatio: null, bossDmg: 0, baseTier: 0 });
const NO_ITEMS = { dmg: 0, aspd: 0, boss: 0, air: 0, exp: 0, gold: 0 };

class Game {
  constructor({ towers, waves, affinity, balance, deck, ai, hpMul = 1.0, log = null, waveSource = null, growth = null, perks = null, map = null, items = null, seed = 0 }) {
    // 지도(data/maps.json 의 하나를 sim/map.js 가 만든 객체). 지도가 곧 밸런스라 판마다 골라 넣는다. 브라우저에서는 NGN.map 이 기본
    this.map = map || (typeof window !== 'undefined' ? window.NGN.map : null);
    if (!this.map) throw new Error('지도가 없다: Game 에 map 을 넣어야 한다');
    this.growth = growth; // 성장 층(data/growth.json): 타워 레벨업. null 이면 레벨업 없음(옛 밸런스 그대로)
    // 판 사이 성장(별 강화 + 뽑기, data/stages.json·gacha.json 의 합): 없으면 전부 0
    this.perks = Object.assign(defaultPerks(), perks || {});
    this.itemsDef = items || null; // data/items.json. 없으면 아이템이 안 떨어진다
    this.seed = seed | 0; // 아이템이 무엇이 나올지 정하는 씨앗(스테이지 번호). 난수가 아니라 이 값과 처치 순서로 결정된다
    this.towerDefs = towers; // id → 정의
    this.byFamily = {};
    for (const t of Object.values(towers)) (this.byFamily[t.family] ||= [])[t.tier - 1] = t;
    this.waves = waves; // 미리 펼쳐진 웨이브(시뮬은 이것만 돈다)
    // 웨이브 n 을 주는 함수. 배열 밖(31~)은 waveSource 가 만들어 준다(게임의 무한 모드). 없으면 배열이 끝이다.
    this.waveSource = waveSource;
    this.affinity = affinity.table;
    this.balance = balance;
    this.deck = deck; // 계열 key 5개
    this.ai = ai || null; // (game) => void — 골드를 보고 사고/올린다. 게임(사람)에서는 null
    this.hpMul = hpMul; // 난이도 스윕용 체력 배율
    this.log = log;

    this.gold = balance.startGold + this.perks.startGold;
    this.lives = balance.lives + this.perks.lives;
    this.spent = 0;
    this.slots = this.map.SLOTS.map(() => null); // 슬롯 → 타워 인스턴스
    this.towersBuilt = [];
    this.inventory = []; // 떨어졌지만 아직 안 끼운 아이템(판 안 전용 — 판이 끝나면 사라진다)
    this.kills = 0; this.drops = 0;
    this.stats = {
      reachedWave: 0, cleared: false, leaksByWave: [], goldByWave: [], spentByWave: [],
      builds: {}, upgrades: {}, spentByFamily: {}, maxTierByFamily: {}, dmgByFamily: {}, branches: {}, drops: 0,
    };
    this.time = 0;
    this.events = [];
    this.wave = null; // 진행 중인 웨이브 상태 (startWave 가 만든다)
    this.nextId = 1;
  }

  // ---------- 건설/승급/판매 (AI 또는 사람이 부른다) ----------
  // 기본기(별 강화): 타워가 몇 단부터 지어지나. 0 = 1단, 1 = 2단, 2 = 3단
  baseTierIndex() { return Math.max(0, Math.min(2, Math.round(this.perks.baseTier || 0))); }
  // 지금 지으면 실제로 세워지는 정의(기본기 반영). 값은 costToBuild 가 따로 — 늘 1단 값이다
  buildDef(familyKey) { const chain = this.byFamily[familyKey]; return chain[Math.min(this.baseTierIndex(), chain.length - 1)]; }
  // 🛑 기본기가 있어도 값은 1단 값. 제값(2단 140)을 받으면 타워를 4개밖에 못 지어 오히려 스테이지 10에서 실패한다(조사자 실측, checklist I-6)
  costToBuild(familyKey) { return this.byFamily[familyKey][0].cost; }
  costToUpgrade(inst) {
    const next = this.byFamily[inst.def.family][inst.def.tier];
    if (!next) return Infinity;
    return this.balance.upgrade.payDifference ? next.cost - inst.def.cost : next.cost;
  }
  // 환급 = 이 타워에 실제로 낸 돈 × 환급률. (단의 정가가 아니다 — 기본기로 2단을 30골드에 지었으면 30 기준. 안 그러면 짓고 팔아 돈이 복사된다)
  refundFor(inst) { return Math.floor(inst.paid * (this.perks.sellRatio !== null ? this.perks.sellRatio : this.balance.upgrade.sellRatio)); }
  build(slotId, familyKey) {
    const chain = this.byFamily[familyKey];
    if (!chain || this.slots[slotId] || !this.deck.includes(familyKey)) return false;
    const cost = this.costToBuild(familyKey);
    if (this.gold < cost) return false;
    const def = this.buildDef(familyKey);
    const inst = { id: this.nextId++, def, slot: this.map.SLOTS[slotId], slotId, cd: 0, auraBonus: 0, dmgDone: 0, level: 1, exp: 0, paid: cost, branch: null, branchPending: false, items: [] };
    // 3단부터 지어진 타워는 승급 단계가 없으니 갈래를 공짜로 한 번 고른다(chooseBranch)
    if (def.tier >= 3 && !def.aura && this.branchKeys().length) inst.branchPending = true;
    this.slots[slotId] = inst;
    this.towersBuilt.push(inst);
    this.pay(cost, familyKey);
    this.stats.builds[familyKey] = (this.stats.builds[familyKey] || 0) + 1;
    this.stats.maxTierByFamily[familyKey] = Math.max(this.stats.maxTierByFamily[familyKey] || 0, def.tier);
    this.refreshAuras();
    this.events.push({ type: 'build', tower: inst });
    if (this.log) this.log(`  [건설] ${def.name}(${cost}골드) → 자리 ${slotId}  잔고 ${this.gold.toFixed(0)}`);
    return true;
  }
  // 승급. 3단으로 올릴 때(오라 타워 제외)는 갈래(branch: 'power' | 'area')를 반드시 골라야 한다 — 없으면 거절
  upgrade(inst, branch = null) {
    const next = this.byFamily[inst.def.family][inst.def.tier];
    const cost = this.costToUpgrade(inst);
    if (!next || this.gold < cost) return false;
    const needsBranch = next.tier >= 3 && !next.aura && this.branchKeys().length > 0;
    if (needsBranch) { if (!this.branchDef(branch)) return false; inst.branch = branch; this.stats.branches[branch] = (this.stats.branches[branch] || 0) + 1; }
    inst.def = next;
    inst.paid += cost;
    this.pay(cost, next.family);
    this.stats.upgrades[next.family] = (this.stats.upgrades[next.family] || 0) + 1;
    this.stats.maxTierByFamily[next.family] = Math.max(this.stats.maxTierByFamily[next.family] || 0, next.tier);
    this.refreshAuras();
    this.events.push({ type: 'upgrade', tower: inst });
    if (this.log) this.log(`  [승급] ${next.name}${branch ? '·' + this.branchDef(branch).name : ''}(${cost}골드) 자리 ${inst.slotId}  잔고 ${this.gold.toFixed(0)}`);
    return true;
  }
  // 3단부터 지어진 타워의 갈래 고르기(무료, 한 번). 바꾸려면 팔고 다시 짓는다 — 승급으로 고른 것과 같은 규칙
  chooseBranch(inst, branch) {
    if (!inst.branchPending || !this.branchDef(branch)) return false;
    inst.branch = branch; inst.branchPending = false;
    this.stats.branches[branch] = (this.stats.branches[branch] || 0) + 1;
    this.events.push({ type: 'branch', tower: inst });
    if (this.log) this.log(`  [갈래] ${inst.def.name} → ${this.branchDef(branch).name} 자리 ${inst.slotId}`);
    return true;
  }
  branchKeys() { const B = this.balance.tier3Branches; return B ? Object.keys(B).filter((k) => !k.startsWith('_')) : []; }
  branchDef(key) { const B = this.balance.tier3Branches; return key && B && B[key] && !key.startsWith('_') ? B[key] : null; }
  // 판매: 실제로 낸 돈 × 환급률을 돌려받고 자리를 비운다. 끼운 아이템은 가방으로 돌아온다
  sell(inst) {
    const refund = this.refundFor(inst);
    this.gold += refund;
    this.slots[inst.slotId] = null;
    this.towersBuilt.splice(this.towersBuilt.indexOf(inst), 1);
    for (const it of inst.items) this.inventory.push(it);
    inst.items = [];
    this.stats.dmgByFamily[inst.def.family] = (this.stats.dmgByFamily[inst.def.family] || 0) + inst.dmgDone;
    this.stats.sells = (this.stats.sells || 0) + 1;
    this.refreshAuras();
    this.events.push({ type: 'sell', tower: inst });
    if (this.log) this.log(`  [판매] ${inst.def.name} 자리 ${inst.slotId} → +${refund}골드  잔고 ${this.gold.toFixed(0)}`);
    return refund;
  }
  pay(cost, family) {
    this.gold -= cost;
    this.spent += cost;
    this.stats.spentByFamily[family] = (this.stats.spentByFamily[family] || 0) + cost;
  }
  // 오라 타워(스킹크) 주변 타워의 공격력 보너스를 다시 계산. 여러 오라가 겹치면 가장 큰 것 하나만(중첩 금지 — 정한 것).
  refreshAuras() {
    for (const t of this.towersBuilt) t.auraBonus = 0;
    for (const a of this.towersBuilt) {
      if (!a.def.aura) continue;
      const r2 = a.def.aura.range * a.def.aura.range;
      for (const t of this.towersBuilt) {
        if (t === a || t.def.aura) continue;
        const dx = t.slot.x - a.slot.x, dy = t.slot.y - a.slot.y;
        if (dx * dx + dy * dy <= r2) t.auraBonus = Math.max(t.auraBonus, a.def.aura.damageBonus);
      }
    }
  }
  emptySlots() { return this.map.SLOTS.filter((s) => !this.slots[s.id]); }
  // 웨이브 n(1부터)의 구성. 배열에 있으면 배열, 없으면 생성기, 그것도 없으면 null(= 끝)
  waveAt(n) {
    if (n >= 1 && n <= this.waves.length) return this.waves[n - 1];
    return this.waveSource ? this.waveSource(n) : null;
  }

  // ---------- 아이템 (checklist I-11) ----------
  // 떨어지는 시점은 난수가 아니다: 누적 처치 수가 (1/확률) 의 배수일 때, 그리고 보스는 언제나. 무엇이 나올지는 씨앗 × 몇 번째 드롭인지로 정한다.
  maybeDrop(e) {
    const I = this.itemsDef; if (!I) return;
    const every = Math.max(1, Math.round(1 / I.drop.chance));
    const due = this.kills % every === 0 || (e.boss && I.drop.bossAlwaysDrops);
    if (!due) return;
    const item = this.rollItem(this.drops++);
    this.inventory.push(item);
    this.stats.drops++;
    this.events.push({ type: 'drop', item, enemy: e });
    if (this.log) this.log(`  [아이템] ${item.이름}(${item.등급이름}) 떨어짐 — 처치 ${this.kills}번째`);
  }
  // n 번째 드롭이 무엇인가. Math.imul 로 섞는다(그냥 곱하면 자릿수가 넘쳐 씨앗이 달라도 같은 결과 — build-waves 에서 겪은 함정)
  rollItem(n) {
    const I = this.itemsDef;
    let s = (Math.imul(this.seed + 1, 2654435761) ^ Math.imul(n + 1, 40503) ^ 0x5bd1e995) >>> 0;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    rnd(); rnd();
    const R = I.drop.gradeRates; const grades = Object.keys(R);
    const total = grades.reduce((a, g) => a + R[g], 0);
    let r = rnd() * total, grade = grades[grades.length - 1];
    for (const g of grades) { if (r < R[g]) { grade = g; break; } r -= R[g]; }
    const pool = I.items.filter((it) => it.등급 === grade);
    const base = pool[Math.floor(rnd() * pool.length)] || I.items[0];
    return Object.assign({ uid: this.nextId++ }, base);
  }
  itemSlots() { return this.itemsDef ? this.itemsDef.drop.slotsPerTower : 0; }
  // 가방의 아이템(uid)을 타워에 끼운다. 오라 타워는 못 끼운다(공격을 안 하니까)
  equip(inst, uid) {
    if (!inst || inst.def.aura || inst.items.length >= this.itemSlots()) return false;
    const i = this.inventory.findIndex((it) => it.uid === uid);
    if (i < 0) return false;
    const [item] = this.inventory.splice(i, 1);
    inst.items.push(item);
    this.events.push({ type: 'equip', tower: inst, item });
    return true;
  }
  unequip(inst, uid) {
    const i = inst.items.findIndex((it) => it.uid === uid);
    if (i < 0) return false;
    const [item] = inst.items.splice(i, 1);
    this.inventory.push(item);
    this.events.push({ type: 'unequip', tower: inst, item });
    return true;
  }
  // 끼운 아이템 효과의 합
  itemSum(inst) {
    if (!inst.items || !inst.items.length) return NO_ITEMS;
    const s = { dmg: 0, aspd: 0, boss: 0, air: 0, exp: 0, gold: 0 };
    for (const it of inst.items) for (const k of Object.keys(it.효과)) if (k in s) s[k] += it.효과[k];
    return s;
  }

  // ---------- 3단 갈림길 (checklist I-7) ----------
  // 갈래가 정의(def)의 어떤 값을 바꾸나. effectiveStats 와 AI 의 미리보기(previewDef)가 같은 함수를 쓴다 — 계산 지점 하나
  applyBranch(def, branch) {
    const B = this.branchDef(branch);
    if (!B) return { dmgMul: 1, rangeMul: 1, splash: def.splash };
    let splash = def.splash;
    if (B.splash) splash = def.splash ? { radius: Math.round(def.splash.radius * (B.splashRadiusMulIfHas || 1)), ratio: def.splash.ratio } : B.splash;
    return { dmgMul: B.dmgMul || 1, rangeMul: B.rangeMul || 1, splash };
  }
  // "이 정의를 이 갈래로 올리면 어떤 타워가 되나" — AI 점수 매기기·UI 미리보기용 정의 사본
  previewDef(def, branch) {
    const m = this.applyBranch(def, branch);
    return Object.assign({}, def, { dps: def.dps * m.dmgMul, range: def.range * m.rangeMul, splash: m.splash, dmgMin: def.dmgMin * m.dmgMul, dmgMax: def.dmgMax * m.dmgMul, branch });
  }

  // ★ 타워의 '최종 능력'을 계산하는 유일한 자리. 전투·UI·연출·AI 가 전부 여기를 거친다.
  // 표(towers.json) 값 × 오라 × 레벨(피해·공격속도) × 별 강화·뽑기(perks) × 아이템 × 3단 갈래.
  effectiveStats(inst) {
    const d = inst.def;
    const G = this.growth;
    const P = this.perks;
    const lv = inst.level - 1;
    const levelMul = G ? 1 + G.tower.dmgPerLevel * lv : 1; // 레벨당 피해 +4%
    const levelAspd = G ? (G.tower.aspdPerLevel || 0) * lv : 0; // 레벨당 공격속도 +1% (checklist I-13)
    const perkMul = 1 + P.allDmg + (P.familyDmg[d.family] || 0); // 별 강화 + 뽑기: 모든 타워 + 이 계열
    const it = this.itemSum(inst);
    const br = this.applyBranch(d, inst.branch);
    const dmgMul = (1 + inst.auraBonus) * levelMul * perkMul * (1 + it.dmg) * br.dmgMul;
    const dmgMin = d.dmgMin * dmgMul, dmgMax = d.dmgMax * dmgMul;
    const aspdMul = 1 + levelAspd + it.aspd;
    const attackCd = d.attackCd ? d.attackCd / aspdMul : d.attackCd;
    const range = d.range * (G ? 1 + G.tower.rangePerLevel * lv : 1) * (1 + P.rangeMul) * br.rangeMul;
    return {
      dmgMin, dmgMax, attackCd, range,
      dps: attackCd ? ((dmgMin + dmgMax) / 2) / attackCd : 0,
      splash: br.splash, bounce: d.bounce, multishot: d.multishot || 1, slow: d.slow, aura: d.aura,
      dmgToBoss: (d.dmgToBoss || 0) + P.bossDmg + it.boss, dmgToAir: it.air, expMul: P.expMul + it.exp, goldMul: it.gold,
      attackType: d.attackType, level: inst.level, exp: inst.exp, levelMul, perkMul, aspdMul, itemMul: 1 + it.dmg, branch: inst.branch,
      expToNext: G ? this.expForLevel(inst.level + 1) : null, expForThis: G ? this.expForLevel(inst.level) : 0,
    };
  }
  // 레벨 n 이 되는 데 필요한 누적 경험치 (원본 exp_for_level.csv). 표 밖이면 null(최고 레벨)
  expForLevel(n) {
    const G = this.growth;
    if (!G || n > G.tower.maxLevel) return null;
    return G.tower.expTable[n];
  }
  // 잡은 적의 경험치를 나눈다. killerShare 는 마지막으로 때린 타워가(길목 타워가 빨리 큰다),
  // 나머지는 그 적을 때린 모든 타워가 낸 피해 비율로(뒤쪽 타워도 조금은 큰다). 비율은 growth.json.
  shareExp(e) {
    const G = this.growth;
    if (!G || !e.exp) return;
    const share = G.exp.killerShare;
    if (e.lastHitBy) this.gainExp(e.lastHitBy, e.exp * share);
    if (share < 1 && e.dmgBy) {
      let total = 0;
      for (const v of e.dmgBy.values()) total += v;
      if (total > 0) for (const [tw, v] of e.dmgBy) this.gainExp(tw, e.exp * (1 - share) * v / total);
    }
  }
  // 경험치 획득 → 레벨업. 오라 타워는 공격을 안 하니 크지 않는다(정한 것). 경험치 보너스 = 뽑기(perks) + 아이템
  gainExp(inst, amount) {
    if (!this.growth || !inst || inst.def.aura || amount <= 0) return;
    inst.exp += amount * (1 + this.perks.expMul + this.itemSum(inst).exp);
    let leveled = false;
    while (inst.level < this.growth.tower.maxLevel && inst.exp >= this.growth.tower.expTable[inst.level + 1]) { inst.level++; leveled = true; }
    if (leveled) { this.events.push({ type: 'levelup', tower: inst }); this.stats.levelUps = (this.stats.levelUps || 0) + 1; }
  }
  // 지금 무너지고 있나 — 이 웨이브에서 이미 적이 샜거나, 바로 앞 웨이브에서 샜으면 저축하지 말고 산다
  underPressure() {
    const n = this.stats.leaksByWave.length;
    return (this.wave && this.wave.leaks > 0) || (n > 0 && this.stats.leaksByWave[n - 1] > 0);
  }

  // ---------- 한 판 (시뮬레이터) ----------
  run() {
    for (const wave of this.waves) {
      if (this.log) this.log(`\n=== 웨이브 ${wave.wave} (${wave.kindKo}${wave.special ? ' · ' + wave.special.이름 : ''}, 방어 ${wave.defense}, 총체력 ${Math.round(wave.totalHp * this.hpMul * (wave.special ? wave.special.hpMul : 1))}) 골드 ${this.gold} 생명 ${this.lives}`);
      this.startWave(wave);
      if (this.ai) this.ai(this); // 웨이브 시작 전에 사고/올린다
      while (!this.waveOver() && this.lives > 0 && this.wave.time <= 600) { this.step(); this.events.length = 0; } // 시뮬은 연출이 없으니 이벤트를 바로 버린다
      const leaks = this.endWave();
      if (this.log) this.log(`--- 웨이브 ${wave.wave} 끝: 누수 ${leaks}, 골드 ${this.gold}, 생명 ${this.lives}`);
      if (this.lives <= 0) { this.stats.cleared = false; return this.finish(); }
    }
    this.stats.cleared = true;
    return this.finish();
  }
  finish() {
    this.stats.goldLeft = this.gold;
    this.stats.livesLeft = Math.max(0, this.lives);
    this.stats.spent = this.spent;
    for (const t of this.towersBuilt) this.stats.dmgByFamily[t.def.family] = (this.stats.dmgByFamily[t.def.family] || 0) + t.dmgDone;
    this.stats.finalTowers = this.towersBuilt.map((t) => t.def.id);
    this.stats.finalLevels = this.towersBuilt.map((t) => t.level);
    this.stats.finalTiers = this.towersBuilt.map((t) => t.def.tier);
    this.stats.finalBranches = this.towersBuilt.map((t) => t.branch);
    this.stats.itemsEquipped = this.towersBuilt.reduce((a, t) => a + t.items.length, 0);
    this.stats.kills = this.kills;
    return this.stats;
  }

  // ---------- 웨이브를 틱 단위로 ----------
  // 웨이브 준비: 스폰 큐 만들기(그룹 순서대로, 그룹 안에서는 간격대로)
  startWave(wave) {
    const queue = [];
    let t = 0;
    for (const g of wave.enemies) {
      for (let i = 0; i < g.count; i++) {
        queue.push({ at: t, g });
        t += g.interval;
      }
    }
    this.stats.reachedWave = wave.wave;
    this.currentWave = wave;
    this.wave = { def: wave, queue, qi: 0, enemies: [], leaks: 0, time: 0, nextAi: AI_INTERVAL, isBossWave: wave.kind === 'boss', special: wave.special || null };
  }
  waveOver() { return !this.wave || (this.wave.qi >= this.wave.queue.length && this.wave.enemies.length === 0); }
  get enemies() { return this.wave ? this.wave.enemies : []; }

  // 적 하나 만들기. 웨이브의 성질(special)이 있으면 체력 보정·이동·받는 피해·회복·부활·분열을 붙인다 (checklist I-8)
  makeEnemy(g, W, s = 0, override = null) {
    const S = W.special, fx = S ? S.효과 || {} : {};
    const path = g.flying ? this.map.air : this.map.ground;
    const hp = override && override.hp !== undefined ? override.hp : g.hp * this.hpMul * (S ? S.hpMul : 1);
    const p = this.map.positionAt(path, s);
    return {
      id: this.nextId++, kind: g.kind, hp, maxHp: hp, speed: g.speed * (fx.speedMul || 1), s, path,
      defense: W.def.defense, flying: g.flying, livesCost: g.livesCost,
      reward: override && override.reward !== undefined ? override.reward : g.reward, exp: override && override.exp !== undefined ? override.exp : (g.exp || 0),
      slowRatio: 0, slowUntil: 0, x: p[0], y: p[1], px: p[0], py: p[1], boss: g.kind === 'boss',
      special: S ? S.id : null, dmgTakenMul: fx.dmgTakenMul || 1, regenPerSec: fx.regenPerSec || 0,
      reviveHp: override && override.noRevive ? 0 : (fx.reviveHp || 0), revived: false,
      splitInto: override && override.noSplit ? 0 : (fx.splitInto || 0), splitHp: fx.splitHp || 0, child: !!(override && override.child),
    };
  }

  // 한 틱(0.1초)
  step() {
    const W = this.wave;
    if (!W) return;
    const enemies = W.enemies;
    const waveTime = W.time;
    // 스폰
    while (W.qi < W.queue.length && W.queue[W.qi].at <= waveTime) {
      const g = W.queue[W.qi++].g;
      const e = this.makeEnemy(g, W, 0);
      enemies.push(e);
      this.events.push({ type: 'spawn', enemy: e });
    }
    // 이동. px/py 는 '직전 틱 위치'(렌더링 보간 전용 — 규칙에는 안 쓴다. 엔진은 10Hz, 화면은 60Hz 라 그 사이를 화면이 이어 그린다)
    for (const e of enemies) {
      const slow = waveTime < e.slowUntil ? e.slowRatio : 0;
      e.px = e.x; e.py = e.y;
      e.s += e.speed * (1 - slow) * DT;
      const p = this.map.positionAt(e.path, e.s);
      e.x = p[0]; e.y = p[1];
      if (e.regenPerSec && e.hp > 0 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.regenPerSec * DT); // 재생: 초마다 최대 체력의 n%
    }
    // 타워 공격
    for (const tw of this.towersBuilt) {
      if (!tw.def.attackType) continue; // 오라 타워는 공격 안 함
      tw.cd -= DT;
      if (tw.cd > 0) continue;
      const d = this.effectiveStats(tw); // 최종 능력(오라·레벨·강화·아이템·갈래 반영)
      const r2 = d.range * d.range;
      const inRange = [];
      for (const e of enemies) {
        if (e.hp <= 0) continue;
        const dx = e.x - tw.slot.x, dy = e.y - tw.slot.y;
        if (dx * dx + dy * dy <= r2) inRange.push(e);
      }
      if (!inRange.length) continue;
      // 출구에 가까운 놈부터. 감속 타워는 '아직 안 느려진 놈'을 먼저 쏜다(한 놈만 계속 때리면 감속이 한 마리에만 걸린다 — 정한 것).
      if (d.slow) inRange.sort((a, b) => ((a.slowUntil > waveTime) - (b.slowUntil > waveTime)) || (b.s - a.s));
      else inRange.sort((a, b) => b.s - a.s);
      tw.cd += d.attackCd;
      const base = (d.dmgMin + d.dmgMax) / 2; // 오라·레벨·아이템·갈래 보너스는 effectiveStats 가 이미 곱했다
      const targets = inRange.slice(0, d.multishot); // 연사: 여러 목표
      for (const target of targets) {
        this.events.push({ type: 'shot', tower: tw, target });
        this.hit(tw, target, base, waveTime, d);
        // 광역: 주 목표 주변
        if (d.splash) {
          const sr2 = d.splash.radius * d.splash.radius;
          for (const e of enemies) {
            if (e === target || e.hp <= 0) continue;
            const dx = e.x - target.x, dy = e.y - target.y;
            if (dx * dx + dy * dy <= sr2) this.hit(tw, e, base * d.splash.ratio, waveTime, d);
          }
        }
        // 튕김: 가까운 다른 적으로 이어지며 감쇠
        if (d.bounce) {
          let from = target;
          let mult = 1;
          const used = new Set([target]);
          const br2 = this.balance.combat.bounceRange * this.balance.combat.bounceRange;
          for (let k = 0; k < d.bounce.count; k++) {
            mult *= (1 - d.bounce.decay);
            let best = null, bestD = Infinity;
            for (const e of enemies) {
              if (used.has(e) || e.hp <= 0) continue;
              const dx = e.x - from.x, dy = e.y - from.y;
              const dd = dx * dx + dy * dy;
              if (dd <= br2 && dd < bestD) { bestD = dd; best = e; }
            }
            if (!best) break;
            used.add(best);
            this.events.push({ type: 'bounce', from, target: best });
            this.hit(tw, best, base * mult, waveTime, d);
            from = best;
          }
        }
      }
    }
    // 처치·누수 정리
    const born = []; // 분열로 생긴 새끼(이 틱에 추가)
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.hp <= 0) {
        // 부활: 한 번, 체력 n% 로 다시 일어난다. 감속은 풀린다
        if (e.reviveHp && !e.revived) { e.revived = true; e.hp = e.maxHp * e.reviveHp; e.slowRatio = 0; e.slowUntil = 0; this.events.push({ type: 'revive', enemy: e }); continue; }
        const killer = e.lastHitBy;
        this.gold += e.reward * (1 + (killer ? this.itemSum(killer).gold : 0)); // 골드 아이템: 잡은 타워의 보너스
        enemies.splice(i, 1);
        this.kills++;
        this.shareExp(e); // 경험치: 마지막 타격 타워 몫 + 때린 타워들이 피해 비율로 나눠 갖는 몫
        this.events.push({ type: 'kill', enemy: e, by: killer });
        // 분열: 죽으면 n 마리로 나뉜다(새끼는 보상·경험치 없음, 다시 나뉘지 않음). 같은 자리에 살짝 벌려서
        if (e.splitInto) {
          const g = { kind: e.kind, hp: 0, speed: e.speed, reward: 0, exp: 0, livesCost: e.livesCost, flying: e.flying };
          for (let k = 0; k < e.splitInto; k++) {
            const c = this.makeEnemy(g, W, Math.max(0, e.s - 30 * k), { hp: e.maxHp * e.splitHp, reward: 0, exp: 0, noSplit: true, noRevive: true, child: true });
            c.speed = e.speed; // makeEnemy 가 speedMul 을 또 곱하지 않게 부모 속도 그대로
            born.push(c);
          }
        }
        this.maybeDrop(e);
        continue;
      }
      if (e.s >= e.path.length) { W.leaks++; this.lives -= e.livesCost; enemies.splice(i, 1); this.events.push({ type: 'leak', enemy: e }); }
    }
    for (const c of born) { enemies.push(c); this.events.push({ type: 'spawn', enemy: c, split: true }); }
    W.time += DT;
    this.time += DT;
    if (this.ai && W.time >= W.nextAi) { W.nextAi += AI_INTERVAL; this.ai(this); }
  }

  // 웨이브 마무리: 클리어 보너스(하나도 안 새면 전액, 새면 절반), 통계. 돌아오는 값 = 샌 적 수
  endWave() {
    const W = this.wave;
    const leaks = W.leaks;
    this.gold = Math.round(this.gold * 10) / 10;
    this.stats.leaksByWave.push(leaks);
    const bonus = leaks === 0 ? W.def.clearBonus : Math.floor(W.def.clearBonus / 2);
    this.gold += bonus;
    this.stats.goldByWave.push(this.gold);
    this.stats.spentByWave.push(this.spent);
    (this.stats.livesByWave ||= []).push(Math.max(0, this.lives)); // 웨이브 끝 시점 생명 — 순위표 '철벽' 부문(무한 모드는 30웨이브 시점)이 읽는다
    this.events.push({ type: 'waveEnd', wave: W.def, leaks, bonus });
    this.wave = null;
    return leaks;
  }

  // 실제 피해 적용: 상성 × 보스 추가피해 × 공중 추가피해(아이템) × 적의 '받는 피해' 성질. 감속도 여기서 건다.
  // d = effectiveStats(tw) — 보스·공중 보너스도 거기서 온다(성장 층이 바꾸는 값은 전부 그 한 곳에)
  hit(tw, e, amount, now, d) {
    d = d || this.effectiveStats(tw);
    let dmg = amount * this.affinity[d.attackType][e.defense];
    if (e.boss) dmg *= 1 + d.dmgToBoss;
    if (e.flying && d.dmgToAir) dmg *= 1 + d.dmgToAir;
    if (e.dmgTakenMul !== 1) dmg *= e.dmgTakenMul;
    const applied = Math.min(e.hp, dmg);
    e.hp -= dmg;
    e.lastHitBy = tw;
    if (this.growth) { if (!e.dmgBy) e.dmgBy = new Map(); e.dmgBy.set(tw, (e.dmgBy.get(tw) || 0) + applied); }
    tw.dmgDone += applied;
    if (d.slow && e.hp > 0) {
      if (d.slow.ratio >= e.slowRatio) { e.slowRatio = d.slow.ratio; e.slowUntil = now + d.slow.duration; }
    }
    this.events.push({ type: 'hit', enemy: e, dmg: applied, tower: tw });
    return applied;
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { Game, DT, AI_INTERVAL, defaultPerks, DEFAULT_PERKS };
else { window.NGN = window.NGN || {}; Object.assign(window.NGN, { Game, DT, AI_INTERVAL, defaultPerks }); }
})();
