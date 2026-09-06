'use strict';
// AI 플레이어. 골드가 모이면 "지금 살 수 있는 것" 중 점수가 가장 높은 행동(짓기·올리기)을 고른다.
// 전략은 점수 매기는 방식만 다르다.
//   dps      — 골드 1당 얻는 실효 DPS 가 가장 큰 것. 상성은 안 본다(평균 1.0 으로 가정).
//   affinity — 다음 두 웨이브의 방어 타입에 대한 상성 배율을 DPS 에 곱해서 고른다. 단단한 놈(SIF) 앞에서는 정수(유령폐허)가 올라온다.
//   cheap    — 빈 자리가 있으면 제일 싼 1단을 짓고, 자리가 다 차면 제일 싼 승급을 한다.
//   balanced — dps 와 같지만, 자리가 절반 넘게 차면 승급을 1.5배 우대한다(3단을 빨리 본다).
//   adaptive — 이 판에서 각 계열이 "실제로 골드당 얼마나 피해를 냈나"를 재서, 예측치와 반반 섞어 고른다.
//              사람이 판을 거듭하며 배우는 것에 가깝다. 상성도 함께 본다. "완벽하게 하면"의 근사로 쓴다.
//
// 공통 규칙: 덱에 오라 계열(스킹크)이 있으면 자리 2개는 오라용으로 남겨 둔다(사람은 그렇게 한다).
//            지금 못 사는 것이 살 수 있는 최고보다 15% 이상 낫고 무너지고 있지 않으면 저축한다.
//            상성·실측 전략은 자리가 다 찼을 때 상성이 나쁜 타워를 팔고(환급 70%) 다음 웨이브에 맞는 타워로 바꿀 수 있다.

(function () { // 브라우저에서 다른 파일과 이름이 부딪히지 않게 감싼다

// 슬롯 자리값: 그 자리에서 사거리 r 로 지상 경로를 얼마나 덮나(공중 경로는 일부 가중).
function slotValue(map, slotId, range) {
  return map.coverageFor(slotId, range, false) + 0.35 * map.coverageFor(slotId, range, true);
}
const REF_COVER = 2400; // 사거리 800 짜리가 통로 자리에서 덮는 대략의 경로 길이. 자리값을 이걸로 나눠 1.0 근처로 정규화.

// 역할이 사실상 몇 배의 피해를 내나(단일=1). 다음 웨이브가 떼거리면 광역·튕김의 가치를 올린다.
function roleFactor(def, nextKind) {
  const swarmy = nextKind === 'swarm' ? 2.2 : 1.0;
  let f = 1;
  if (def.splash) f += def.splash.ratio * 1.2 * swarmy;
  if (def.bounce) {
    let m = 1, sum = 0;
    for (let k = 0; k < def.bounce.count; k++) { m *= 1 - def.bounce.decay; sum += m; }
    f += sum * 0.7 * swarmy;
  }
  if (def.multishot > 1) f *= 1 + (def.multishot - 1) * 0.65;
  // 감속 = 체류 시간 증가. 자기 피해뿐 아니라 같은 구간을 보는 이웃 타워도 더 때린다(오라 같은 '곱하기' 카드). 실측으로 가중치를 맞춘다.
  if (def.slow) f *= 1 + def.slow.ratio * 2.0;
  return f;
}

// 다음 웨이브들의 방어 타입에 대한 상성 평균 (affinity 전략만 쓴다)
function affinityFactor(game, attackType, lookahead) {
  if (!attackType) return 1;
  const idx = game.currentWave ? game.currentWave.wave - 1 : 0;
  let sum = 0, n = 0, w = 1;
  for (let i = 0; i < lookahead; i++) {
    const wv = game.waveAt(idx + i + 1);
    if (!wv) break;
    // 이번 웨이브에 이미 들어와 있으면 이번 웨이브 비중은 작게
    const weight = i === 0 ? 0.6 * w : w;
    sum += game.affinity[attackType][wv.defense] * weight;
    n += weight;
    w *= 0.7;
  }
  return n ? sum / n : 1;
}

// 실효 DPS: 원본 DPS × 역할 배율 × 자리값 × 상성(옵션) × 오라 보너스
function effectiveDps(game, def, slotId, strategy, auraBonus) {
  if (!def.attackType) return 0;
  const nextKind = game.currentWave ? game.currentWave.kind : 'basic';
  // 자리값은 제곱근으로 완화: 사거리가 넓어도 한 번에 한 놈만 때리니, 덮는 길이에 비례해 세지지는 않는다(실측으로 확인).
  let v = def.dps * roleFactor(def, nextKind) * Math.sqrt(slotValue(game.map, slotId, def.range) / REF_COVER) * (1 + auraBonus);
  if (strategy === 'affinity' || strategy === 'adaptive') v *= affinityFactor(game, def.attackType, 3);
  if (strategy === 'adaptive') {
    // 실측: 이 계열이 지금까지 쓴 골드 1당 낸 피해 ÷ 전체 평균. 1보다 크면 예상보다 잘하는 계열.
    const m = measuredEfficiency(game, def.family);
    if (m !== null) v *= 0.5 + 0.5 * m;
  }
  return v;
}

// 계열별 실측 효율(피해/지출)을 전체 평균으로 나눈 값. 자료가 없으면 null.
function measuredEfficiency(game, family) {
  let spentF = 0, dmgF = 0, spentAll = 0, dmgAll = 0;
  for (const t of game.towersBuilt) {
    if (t.def.aura) continue;
    spentAll += t.paid; dmgAll += t.dmgDone; // 실제로 낸 돈(기본기로 2단을 1단 값에 지었으면 그 값)
    if (t.def.family === family) { spentF += t.paid; dmgF += t.dmgDone; }
  }
  if (spentF < 1 || dmgAll < 1 || spentAll < 1) return null;
  const all = dmgAll / spentAll;
  const f = dmgF / spentF;
  return Math.min(3, Math.max(0.2, f / all));
}

// 오라 타워를 이 자리에 놓으면(또는 올리면) 주변 타워 DPS 가 얼마나 늘어나나
function auraGain(game, slotId, bonus, exclude) {
  const s = game.map.SLOTS[slotId];
  const r2 = game.balance.combat.aura.range ** 2;
  let gain = 0;
  for (const t of game.towersBuilt) {
    if (t === exclude || t.def.aura) continue;
    const dx = t.slot.x - s.x, dy = t.slot.y - s.y;
    if (dx * dx + dy * dy > r2) continue;
    const extra = Math.max(0, bonus - t.auraBonus);
    gain += t.def.dps * roleFactor(t.def, 'basic') * Math.sqrt(slotValue(game.map, t.slotId, t.def.range) / REF_COVER) * extra;
  }
  return gain;
}

// 덱에 오라 계열이 있을 때 오라용으로 남겨 둘 자리 2개: 오라 사거리 안에 이웃 자리가 가장 많은 곳, 둘이 서로 겹치지 않게.
function auraSlots(game) {
  if (game._auraSlots) return game._auraSlots;
  const auraFam = game.deck.find((f) => game.byFamily[f][0].aura);
  if (!auraFam) return (game._auraSlots = []);
  const r = game.byFamily[auraFam][0].aura.range;
  const ranked = game.map.SLOTS.map((s) => ({ id: s.id, n: game.map.neighborsWithin(s.id, r).length })).sort((a, b) => b.n - a.n);
  const picked = [];
  for (const c of ranked) {
    if (picked.length >= 2) break;
    if (picked.some((p) => game.map.neighborsWithin(p, r).some((o) => o.id === c.id))) continue; // 서로 이웃이면 겹치니 건너뜀
    picked.push(c.id);
  }
  return (game._auraSlots = picked);
}

// 3단 갈래 고르기: 두 갈래를 이 자리에서 점수 매겨 높은 쪽(사람도 "이 자리엔 광역이 낫겠다"고 고른다)
function bestBranch(game, def, slotId, strategy, auraBonus) {
  let best = null, bestV = -Infinity;
  for (const b of game.branchKeys()) {
    if (game.forceBranch && b !== game.forceBranch) continue; // 시뮬 비교용(--branch=power|area): 한 갈래만 쓰게

    const v = effectiveDps(game, game.previewDef(def, b), slotId, strategy, auraBonus);
    if (v > bestV) { bestV = v; best = b; }
  }
  return { branch: best, value: bestV };
}

// 떨어진 아이템을 끼운다: 가방이 비거나 빈 칸이 없을 때까지, 피해를 가장 많이 낸 타워부터(사람도 주력 타워에 끼운다)
function equipItems(game) {
  if (!game.inventory.length) return;
  const slots = game.itemSlots();
  const towers = game.towersBuilt.filter((t) => t.def.attackType && t.items.length < slots).sort((a, b) => b.dmgDone - a.dmgDone);
  for (const t of towers) {
    while (t.items.length < slots && game.inventory.length) game.equip(t, game.inventory[0].uid);
    if (!game.inventory.length) return;
  }
}

function makeAi(strategy) {
  return function ai(game) {
    equipItems(game);
    // 3단부터 지어진 타워(기본기 2칸)는 갈래를 공짜로 고른다
    for (const t of game.towersBuilt) if (t.branchPending) game.chooseBranch(t, bestBranch(game, t.def, t.slotId, strategy, t.auraBonus).branch);
    // 골드가 남는 한 계속 산다(한 호출에 여러 번)
    for (let guard = 0; guard < 20; guard++) {
      const action = pick(game, strategy);
      if (!action) return;
      let ok;
      if (action.type === 'build') ok = game.build(action.slotId, action.family);
      else if (action.type === 'upgrade') ok = game.upgrade(action.inst, action.branch || null);
      else { game.sell(action.inst); ok = game.build(action.slotId, action.family); } // 교체 = 팔고 짓기
      if (!ok) return;
      for (const t of game.towersBuilt) if (t.branchPending) game.chooseBranch(t, bestBranch(game, t.def, t.slotId, strategy, t.auraBonus).branch);
    }
  };
}

function pick(game, strategy) {
  const empty = game.emptySlots();
  const filledRatio = 1 - empty.length / game.map.SLOTS.length;
  const candidates = [];

  // 오라 자리 예약: 덱에 오라 계열이 있으면 "이웃 자리가 가장 많은" 자리 2개를 오라용으로 남겨 둔다(사람이 하는 방식).
  // 싼-많이 전략은 오라를 안 쓰므로 예약하지 않는다.
  const reserved = strategy === 'cheap' ? [] : auraSlots(game);

  // 저축 판단을 위해 "지금 골드의 2배까지" 후보를 모은다. affordable=false 인 후보가 최고면 기다린다.
  const budget = strategy === 'cheap' ? game.gold : game.gold * 2;

  // 짓기 후보: 빈 자리 × 덱 계열. 실제로 세워지는 단(기본기 반영)으로 값을 매기고, 값은 늘 1단 값(costToBuild)
  for (const fam of game.deck) {
    const def = game.buildDef(fam), buildCost = game.costToBuild(fam);
    if (buildCost > budget) continue;
    for (const s of empty) {
      if (!def.aura && reserved.includes(s.id)) continue;
      let value;
      // 오라 값: 지금 이웃 타워가 얻는 것 + 아직 빈 이웃 자리가 앞으로 채워질 몫(빈 자리당 1단 평균 DPS 로 어림). 승급까지 덕을 보니 1.5배.
      if (def.aura) {
        const future = game.map.neighborsWithin(s.id, def.aura.range).filter((o) => !game.slots[o.id]).length * 30 * def.aura.damageBonus;
        value = (auraGain(game, s.id, def.aura.damageBonus, null) + future) * 1.5;
      } else {
        // 이 자리에 오라가 닿나
        let aura = 0;
        for (const a of game.towersBuilt) if (a.def.aura) {
          const dx = a.slot.x - s.x, dy = a.slot.y - s.y;
          if (dx * dx + dy * dy <= a.def.aura.range ** 2) aura = Math.max(aura, a.def.aura.damageBonus);
        }
        // 3단부터 지어지면 갈래를 고르게 되니 더 나은 갈래의 값으로
        value = def.tier >= 3 && game.branchKeys().length ? bestBranch(game, def, s.id, strategy, aura).value : effectiveDps(game, def, s.id, strategy, aura);
      }
      candidates.push({ type: 'build', slotId: s.id, family: fam, def, cost: buildCost, value });
    }
  }
  // 교체 후보(상성·실측 전략만): 빈 자리가 없을 때, 다음 웨이브 상성이 나쁜(0.6 이하) '승급 안 한' 타워를 팔고 그 자리에 맞는 것을 세운다.
  // 제한(사람이 하는 상식): 승급 안 한 것만 판다 · 판매 손실 30% 도 비용에 넣는다 · 판당 최대 6번. 제한 없이 두면 매 웨이브 갈아엎다 자멸했다(실측).
  const nextWave = game.currentWave ? game.waveAt(game.currentWave.wave + 1) || game.currentWave : null;
  if ((strategy === 'affinity' || strategy === 'adaptive') && empty.length === 0 && (game.stats.sells || 0) < 6 && nextWave) {
    for (const inst of game.towersBuilt) {
      if (inst.def.aura || inst.def.tier > game.buildDef(inst.def.family).tier) continue;
      if (game.affinity[inst.def.attackType][nextWave.defense] > 0.6) continue;
      const refund = game.refundFor(inst);
      const loss = inst.paid - refund;
      const oldValue = effectiveDps(game, inst.def, inst.slotId, strategy, inst.auraBonus);
      for (const fam of game.deck) {
        const def = game.buildDef(fam), buildCost = game.costToBuild(fam);
        if (def.aura || fam === inst.def.family) continue;
        if (game.affinity[def.attackType][nextWave.defense] < 1.0) continue; // 갈아타는 쪽은 최소 1.0 이어야
        const cost = Math.max(1, buildCost - refund) + loss;
        if (buildCost - refund > budget) continue;
        const value = effectiveDps(game, def, inst.slotId, strategy, inst.auraBonus) - oldValue;
        if (value <= 0) continue;
        candidates.push({ type: 'replace', inst, slotId: inst.slotId, family: fam, def, cost, payCost: buildCost - refund, value });
      }
    }
  }
  // 승급 후보. 3단으로 올릴 때는 두 갈래 중 이 자리에 더 나은 쪽을 골라 후보로
  for (const inst of game.towersBuilt) {
    const next = game.byFamily[inst.def.family][inst.def.tier];
    if (!next) continue;
    const cost = game.costToUpgrade(inst);
    if (cost > budget) continue;
    let value, branch = null;
    if (next.aura) value = auraGain(game, inst.slotId, next.aura.damageBonus, inst) - auraGain(game, inst.slotId, inst.def.aura.damageBonus, inst);
    else {
      const cur = effectiveDps(game, inst.def, inst.slotId, strategy, inst.auraBonus);
      if (next.tier >= 3 && game.branchKeys().length) { const b = bestBranch(game, next, inst.slotId, strategy, inst.auraBonus); branch = b.branch; value = b.value - cur; }
      else value = effectiveDps(game, next, inst.slotId, strategy, inst.auraBonus) - cur;
    }
    candidates.push({ type: 'upgrade', inst, def: next, cost, value, branch });
  }
  if (!candidates.length) return null;

  // 점수
  let best = null, bestScore = -Infinity; // 지금 살 수 있는 것 중 최고
  let dream = null, dreamScore = -Infinity; // 골드가 모자라지만 더 나은 것
  for (const c of candidates) {
    let score;
    if (strategy === 'cheap') {
      // 빈 자리 있으면 싼 신축 우선, 없으면 싼 승급. 값이 같으면 DPS 큰 쪽.
      const tie = c.value / 10000;
      score = (c.type === 'build' ? 1000 : 0) + (1000 / c.cost) + tie;
      if (c.def.aura && c.type === 'build') score -= 500; // 싼-많이 전략은 오라를 잘 안 산다(공격 안 하니까)
    } else {
      score = c.value / c.cost;
      if (strategy === 'balanced' && c.type === 'upgrade' && filledRatio > 0.5) score *= 1.5;
      // 아무 효과도 없는 오라(주변에 타워 없음)는 사지 않는다
      if (c.def.aura && c.value <= 0) continue;
    }
    const pay = c.payCost !== undefined ? c.payCost : c.cost; // 교체는 실제 낼 돈(값 − 환급)이 따로 있다
    if (pay <= game.gold) { if (score > bestScore) { bestScore = score; best = c; } }
    else if (score > dreamScore) { dreamScore = score; dream = c; }
  }
  // 저축: 못 사는 후보가 살 수 있는 최고보다 15% 이상 낫고, 지금 당장 무너지고 있지 않으면 기다린다
  if (dream && (!best || dreamScore > bestScore * 1.15) && !game.underPressure()) return null;
  // dps 계열 전략: 효율이 너무 낮은 행동(예: 덮는 경로가 거의 없는 자리)은 저축한다
  if (best && strategy !== 'cheap' && best.value / best.cost < 0.05) return null;
  return best;
}

const STRATEGIES = ['dps', 'affinity', 'cheap', 'balanced', 'adaptive'];
const STRATEGY_KO = { dps: '최고 DPS 우선', affinity: '상성 우선', cheap: '싼 것 여러 개', balanced: '균형(승급 우대)', adaptive: '실측 학습' };

const api = { makeAi, STRATEGIES, STRATEGY_KO, slotValue, roleFactor, bestBranch, equipItems };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else { window.NGN = window.NGN || {}; Object.assign(window.NGN, api); }
})();
