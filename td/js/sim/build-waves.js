'use strict';
// 웨이브 생성기. balance.json + enemies.json 의 규칙으로 "웨이브 n 의 구성"을 만든다.
//   waveFor(n, balance, enemiesDef) — 웨이브 번호 하나 → 구성. 31 이상도 같은 공식으로 계속 만든다(무한 모드용).
//   buildWaves(balance, enemiesDef) — 1 ~ waveCount 를 펼친 배열(data/waves.json 저장용, 시뮬레이터가 읽는다)
// 게임(브라우저)도 이 파일을 그대로 읽어 30 이후 웨이브를 만든다.
// 실행: node sim/build-waves.js   (balance.json 을 고친 뒤 꼭 다시 돌릴 것)

(function () {
const isNode = typeof module !== 'undefined' && module.exports;

// 스테이지마다 적이 나오는 순서를 다르게 만든다 (checklist I-2).
// 안 그러면 20판이 전부 "기본·기본·기본·빠른·보스·떼거리·단단한·공중" 으로 시작해 같은 판이 된다(실측).
// 같은 스테이지는 언제나 같은 순서다(번호가 곧 씨앗) — 그래야 다시 해도 같은 판이고 기록 비교가 된다.
// 지키는 규칙 셋: (1)첫 3웨이브는 기본(튜토리얼) (2)보스는 5의 배수 그대로(리듬) (3)종류마다 최소 한 번은 나온다
function kindsForStage(stageId, waveCount, balance) {
  const T = balance.waveTemplate;
  const kinds = Object.keys(T.kinds).filter((k) => k.charAt(0) !== '_'); // _설명 같은 주석 키는 뺀다
  const out = {}; for (const k of kinds) out[k] = [];

  const slots = [];
  for (let w = T.defenseCycle.tutorial.length + 1; w <= waveCount; w++) if (w % T.bossEvery !== 0) slots.push(w);

  const quota = kinds.map((k) => Math.max(1, Math.round(T.kinds[k].length / balance.waveCount * waveCount)));
  let sum = quota.reduce((a, b) => a + b, 0);
  while (sum > slots.length) { quota[quota.indexOf(Math.max(...quota))]--; sum--; }

  // Math.imul 로 곱한다 — 그냥 곱하면 자릿수가 넘쳐 하위 비트가 날아가고 씨앗이 달라도 같은 결과가 나온다
  let s = (Math.imul(stageId, 2654435761) + 12345) >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const pool = slots.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  let p = 0;
  kinds.forEach((k, i) => { for (let n = 0; n < quota[i]; n++) out[k].push(pool[p++]); });
  for (const k of kinds) out[k].sort((a, b) => a - b);
  return out;
}

// 그 스테이지 전용 balance (적 순서만 갈아끼운 사본 + 스테이지 번호). 원본은 건드리지 않는다
function balanceForStage(stageId, waveCount, balance) {
  // 처음 세 판은 섞지 않는다 — 배우는 구간이라 순서가 정해져 있어야 한다.
  // (섞으면 첫 판 4웨이브에 공중이 나와 대공 타워를 모르는 조카가 그냥 막힌다)
  const b = Object.assign({}, balance, { _stageId: stageId }); // 번호는 성질(special)을 정할 때도 쓴다
  if (stageId <= 3) return b;
  b.waveTemplate = Object.assign({}, balance.waveTemplate, { kinds: kindsForStage(stageId, waveCount, balance) });
  return b;
}

// 진행도(스테이지 × 4) → 성질이 붙을 확률. 표(chanceByProgress)의 구간을 직선으로 잇는다
function chanceAt(table, progress) {
  const pts = Object.keys(table).filter((k) => k.charAt(0) !== '_').map(Number).sort((a, b) => a - b);
  if (!pts.length) return 0;
  if (progress <= pts[0]) return table[pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (progress <= pts[i]) { const a = pts[i - 1], b = pts[i]; return table[a] + (table[b] - table[a]) * (progress - a) / (b - a); }
  }
  return table[pts[pts.length - 1]];
}

// 웨이브 w 에 붙는 적 성질 하나(없으면 null). checklist I-8. 규칙은 data/wave_specials.json 의 _규칙·_환산 그대로:
//   · 한 웨이브에 최대 1종 (그래서 group 배타 규칙은 저절로 지켜진다)
//   · 스테이지 1~3 은 없다(배우는 구간) · 첫 3웨이브(튜토리얼)와 보스 웨이브도 없다
//   · 진행도(progress): fromProgress 가 그 이하인 것만, freq 를 가중치로. 진행도는 모드마다 다르게 센다(아래 progressFor)
//   · sizes 가 'air' 면 공중 웨이브에만
// 🛑 난수를 쓰지 않는다 — 씨앗(스테이지 번호 또는 지도 씨앗) × 웨이브 번호가 씨앗. 같은 판은 언제나 같다(시뮬·기록 겨루기의 기반). Math.imul 필수.
function specialForWave(seed, w, kind, specials, balance, progress) {
  if (!specials || !seed || progress === null || progress === undefined) return null;
  const T = balance.waveTemplate;
  if (w <= T.defenseCycle.tutorial.length || w % T.bossEvery === 0) return null;
  const chance = chanceAt(specials.chanceByProgress || {}, progress);
  let s = (Math.imul(seed, 2246822519) ^ Math.imul(w, 3266489917) ^ 0x9e3779b9) >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  rnd();
  if (rnd() >= chance) return null;
  const pool = specials.specials.filter((sp) => sp.fromProgress <= progress && (sp.sizes === 'all' || (sp.sizes === 'air' && kind === 'flyer')));
  if (!pool.length) return null;
  const total = pool.reduce((a, sp) => a + sp.freq, 0);
  let r = rnd() * total;
  for (const sp of pool) { if (r < sp.freq) return sp; r -= sp.freq; }
  return pool[pool.length - 1];
}

// 이 웨이브의 성질 씨앗과 진행도. 모드마다 진행도를 다르게 센다(wave_specials.json 의 _환산):
//   스테이지(_stageId)      — 진행도 = 스테이지 번호 × progressPerStage(4). 스테이지 1~3 은 없다(notBeforeStage)
//   무한 모드(_infiniteSeed) — 진행도 = 웨이브 번호 그대로. 원본(YouTD 2)이 80웨이브 한 판이라 fromProgress·chanceByProgress 가 원본 규칙 그대로 맞는다.
//                            씨앗은 지도 씨앗(같은 지도 = 같은 성질 배치, 기록 겨루기가 공정하다)
//   오늘의 판(_dailySeed)    — 진행도 = 웨이브 × progressPerWave(stages.json daily). 20웨이브 안에 9종이 다 나올 수 있게
function progressFor(w, balance) {
  const S = balance._specials; if (!S) return null;
  if (balance._stageId) {
    if (balance._stageId < (S.notBeforeStage || 4)) return null;
    return { seed: balance._stageId, progress: balance._stageId * (S.progressPerStage || 4) };
  }
  if (balance._infiniteSeed) return { seed: 100000 + balance._infiniteSeed, progress: w };
  if (balance._dailySeed) return { seed: 200000 + balance._dailySeed, progress: w * (balance._dailyProgressPerWave || 4) };
  return null;
}

// 지도의 성질 씨앗. 생성 지도는 씨앗 그대로, 엄선 지도(seed 없음)는 id 글자를 섞어 만든다 — 같은 지도면 언제나 같다
function seedOfMap(map) {
  if (!map) return 1;
  if (map.seed) return map.seed | 0;
  let h = 7; for (const ch of String(map.id || 'x')) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return (h % 90000) + 1000;
}

// 웨이브 n 의 구성 하나
function waveFor(w, balance, enemiesDef) {
  const T = balance.waveTemplate;
  const E = enemiesDef.enemies;

  // 1) 이 웨이브의 주인공 적 종류. 표에 적힌 번호 뒤(31~)는 표의 마지막 주기(5웨이브 단위)를 반복한다.
  let kind = 'basic';
  if (w % T.bossEvery === 0) kind = 'boss';
  else {
    for (const k of Object.keys(T.kinds)) if (T.kinds[k].includes(w)) kind = k;
    if (kind === 'basic' && w > balance.waveCount) {
      // 표 밖: 마지막 주기(waveCount-4 .. waveCount)의 패턴을 5웨이브마다 반복
      const period = T.bossEvery;
      const ref = balance.waveCount - period + ((w - 1) % period) + 1;
      for (const k of Object.keys(T.kinds)) if (T.kinds[k].includes(ref)) kind = k;
    }
  }

  // 2) 방어 타입: 튜토리얼 3웨이브는 ZOD, 그 뒤 4방향 순환. 단단한 놈은 SIF 강제.
  let defense = w <= T.defenseCycle.tutorial.length
    ? T.defenseCycle.tutorial[w - 1]
    : T.defenseCycle.cycle[(w - 1 - T.defenseCycle.tutorial.length) % T.defenseCycle.cycle.length];
  if (E[kind].forcedDefense) defense = E[kind].forcedDefense;

  // 3) 마리 수·체력·보상. 30(waveCount)까지는 본 곡선, 그 뒤(무한 모드)는 30웨이브 값에서 infinite 곡선으로 이어 간다
  const W0 = balance.waveCount;
  const inf = balance.infinite;
  const wCap = inf && w > W0 ? W0 : w; // 본 곡선은 30 에서 멈춘다
  let baseCount = T.count.base + T.count.perWave * (wCap - 1);
  let hpBase = balance.hp.wave1Hp * Math.pow(balance.hp.growth, wCap - 1);
  // 후반 추가 조임(lateBoost): fromWave 부터 매 웨이브 ×mulPerWave 를 더 곱한다
  const lb = balance.hp.lateBoost;
  if (lb && wCap >= lb.fromWave) hpBase *= Math.pow(lb.mulPerWave, wCap - lb.fromWave + 1);
  let rewardBase = balance.reward.wave1Reward * Math.pow(balance.reward.growth, wCap - 1);
  if (inf && w > W0) {
    const k = w - W0;
    hpBase *= (inf.entryJump || 1) * Math.pow(inf.hpGrowth, k);
    rewardBase *= Math.pow(inf.rewardGrowth, k);
    baseCount = baseCount + inf.countPerWave * k;
  }
  // 마리 수 상한(무한 구간): 떼거리는 원래 많으니 상한도 1.5배
  const capCount = (n, isSwarm) => (inf && w > W0 ? Math.min(n, Math.round(inf.maxCount * (isSwarm ? 1.5 : 1))) : n);

  // 적 하나를 잡으면 주는 경험치(성장 층). growth.json 이 있으면 웨이브 번호 × 종류 계수. 없으면 0
  const G = balance._growth || null;
  const group = (k, count) => {
    const e = E[k];
    return {
      kind: k,
      kindKo: e.이름,
      count,
      exp: G ? Math.round(G.exp.perWave * w * (G.exp.kindMul[k] || 1) * 10) / 10 : 0,
      hp: Math.round(hpBase * e.hpMul),
      speed: Math.round(balance.speed.base * e.speedMul),
      reward: Math.round(rewardBase * e.rewardMul * 10) / 10,
      livesCost: e.livesCost,
      flying: !!e.flying,
      interval: k === 'swarm' ? balance.spawn.intervalSwarm : balance.spawn.intervalBasic,
    };
  };

  const groups = [];
  if (kind === 'boss') {
    const escort = capCount(Math.round(baseCount * T.bossEscort.escortRatio), false);
    if (escort > 0) groups.push(group('basic', escort));
    groups.push(group('boss', 1));
  } else if (kind === 'swarm') groups.push(group('swarm', capCount(Math.round(baseCount * T.count.swarmMul), true)));
  else if (kind === 'tank') groups.push(group('tank', capCount(Math.max(2, Math.round(baseCount * 0.5)), false)));
  else if (kind === 'flyer') groups.push(group('flyer', capCount(Math.round(baseCount * 0.8), false)));
  else groups.push(group(kind, capCount(Math.round(baseCount), false)));

  const totalHp = groups.reduce((s, g) => s + g.hp * g.count, 0);
  const totalReward = groups.reduce((s, g) => s + g.reward * g.count, 0);
  const clearBonus = Math.round(balance.reward.clearBonusBase * Math.pow(balance.reward.clearBonusGrowth, wCap - 1) * (inf && w > W0 ? Math.pow(inf.rewardGrowth, w - W0) : 1));

  // 적 성질(있으면). 어느 모드든 호출자가 balance 에 _specials 와 씨앗·진행도 규칙을 넣어 준다(progressFor)
  const pr = progressFor(w, balance);
  const sp = pr ? specialForWave(pr.seed, w, kind, balance._specials || null, balance, pr.progress) : null;
  const special = sp ? { id: sp.id, 이름: sp.이름, hpMul: sp.hpMul, 효과: sp.효과, color: sp.color, _설명: sp._설명 } : null;

  return { wave: w, kind, kindKo: E[kind].이름, defense, enemies: groups, clearBonus, totalHp, totalReward: Math.round(totalReward), special };
}

function buildWaves(balance, enemiesDef) {
  const waves = [];
  for (let w = 1; w <= balance.waveCount; w++) waves.push(waveFor(w, balance, enemiesDef));
  return waves;
}

function main() {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.resolve(__dirname, '..');
  const balance = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/balance.json'), 'utf8'));
  const enemiesDef = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/enemies.json'), 'utf8'));
  const growthPath = path.join(ROOT, 'data/growth.json');
  if (fs.existsSync(growthPath)) balance._growth = JSON.parse(fs.readFileSync(growthPath, 'utf8'));
  const waves = buildWaves(balance, enemiesDef);
  const out = {
    _설명: '웨이브 구성(1~waveCount). sim/build-waves.js 가 balance.json + enemies.json 에서 생성. 손으로 고치지 말고 balance.json 을 고칠 것. 그 뒤 웨이브는 게임이 같은 생성기(waveFor)로 이어서 만든다.',
    waveCount: waves.length,
    lives: balance.lives,
    startGold: balance.startGold,
    waves,
  };
  fs.writeFileSync(path.join(ROOT, 'data/waves.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');

  console.log('웨이브  종류      방어  구성                         마리당체력  총체력    보상(마리)  클리어보너스  총보상');
  for (const wv of waves) {
    const comp = wv.enemies.map((g) => `${g.kindKo}×${g.count}`).join(' + ');
    const hp = wv.enemies.map((g) => g.hp).join('/');
    const rw = wv.enemies.map((g) => g.reward).join('/');
    console.log(
      String(wv.wave).padStart(4) + '    ' + wv.kindKo.padEnd(6, '　') + ' ' + wv.defense.padEnd(4) + '  ' + comp.padEnd(28, ' ') +
      ' ' + hp.padStart(10) + '  ' + String(wv.totalHp).padStart(7) + '   ' + rw.padStart(9) + '   ' + String(wv.clearBonus).padStart(6) +
      '       ' + String(wv.totalReward + wv.clearBonus).padStart(5),
    );
  }
  const sumReward = waves.reduce((s, w) => s + w.totalReward + w.clearBonus, 0);
  console.log(`\n→ data/waves.json 저장 (${waves.length}웨이브). 전부 막았을 때 총 수입 ≈ ${sumReward + balance.startGold} 골드 (시작 ${balance.startGold} 포함)`);
  // 무한 모드 미리보기
  for (const w of [30, 31, 35, 40, 50, 60]) { const v = waveFor(w, balance, enemiesDef); console.log(`   (이어서) 웨이브 ${w}: ${v.kindKo} ${v.defense} ${v.enemies.map((g) => g.count + '마리×' + g.hp).join('+')} 총체력 ${v.totalHp} 보상 ${v.totalReward + v.clearBonus}`); }
}

const api = { waveFor, buildWaves, kindsForStage, balanceForStage, specialForWave, chanceAt, progressFor, seedOfMap };
if (isNode) { module.exports = api; if (require.main === module) main(); }
else { window.NGN = window.NGN || {}; Object.assign(window.NGN, api); }
})();
