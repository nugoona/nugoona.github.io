'use strict';
// 도감(checklist J-11 ③, design.md 12-15) — 로비 [타워] 탭. 게임의 심장인 상성을 배우는 곳.
// 사장님: "텍스트 주렁주렁에 화면을 가리고" → 전투 화면의 학습 요소(설명 문장·상성 목록·성질 설명)를 여기로 옮겼다. 전투엔 숫자와 칩만 남는다.
// 네 갈래: [상성표](6×6, 값은 data/affinity.json 을 그대로 읽는다 — 숫자를 여기 다시 적지 않는다) · [타워](30계열, 등급 이름·색은 gacha.json gradeKo/gradeColor) ·
//          [적](6종 + 성질 9종(wave_specials.json) + 방어 타입 6) · [아이템](24종, items.json).
// 새로 열린 계열은 [타워] 탭을 열 때까지 로비 탭에 빨간 점(meta.codexNew).
window.NGN = window.NGN || {};

const $c = (id) => document.getElementById(id);
const escC = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hexC = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

NGN.CodexUI = class CodexUI {
  constructor(meta, data, ui, opts = {}) {
    this.meta = meta; this.data = data; this.ui = ui;
    this.towerImage = opts.towerImage || null; this.preview = opts.preview || null;
    this.sub = 'affinity';
    this.gradeKo = Object.assign({ basic: '기본', common: '흔함', uncommon: '고급', rare: '희귀', legendary: '전설' }, (data.gacha && data.gacha.gradeKo) || {});
    this.gradeColor = Object.assign({ basic: '#7C8A96', common: '#9AA7B4', uncommon: '#3FA46A', rare: '#3E7BD6', legendary: '#E0A32E' }, (data.gacha && data.gacha.gradeColor) || {});
    $c('codexTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { this.sub = b.dataset.sub; this.render(); } });
  }
  show(sub) {
    if (sub) this.sub = sub;
    this.ui.hideAll(); $c('codexScreen').hidden = false;
    this.render();
    if (this.ui.showTabs) this.ui.showTabs('tower');
    this.ui.cb.onMenu(true);
  }
  render() {
    for (const b of $c('codexTabs').children) b.classList.toggle('on', b.dataset.sub === this.sub);
    const body = $c('codexBody');
    body.innerHTML = this.sub === 'affinity' ? this.affinity() : this.sub === 'towers' ? this.towers() : this.sub === 'enemies' ? this.enemies() : this.items();
    body.querySelectorAll('[data-fam]').forEach((el) => el.addEventListener('click', () => this.detail(el.dataset.fam)));
    if (this.sub === 'towers') { this.meta.codexMarkSeen(); if (this.ui.refreshDots) this.ui.refreshDots(); }
    body.scrollTop = 0;
  }

  // ---------- 상성을 그림으로 (checklist K-2-7) ----------
  // 조카(초6·중1)가 6×6 숫자 표를 한눈에 못 읽는다 → 「약점 바퀴」를 표 앞에 둔다. 표는 없애지 않고 뒤에 그대로 남긴다.
  // 🛑 숫자도, 어느 공격이 어느 방패를 이기는지도 여기 적지 않는다. data/affinity.json 을 읽어 구조를 스스로 알아낸다:
  //   ⑴ 어느 방패에나 값이 같은 공격      = 「무난한 공격」 (지금 데이터로는 정수)
  //   ⑵ 어느 공격에나 값이 같은 방패      = 「무난한 방패」 (조드)
  //   ⑶ 가장 센 방패가 딱 하나인 공격     = 바퀴에 들어간다 (물리·부패·에너지·원소)
  //   ⑷ 가장 센 방패가 여럿인 공격        = 「두루 센 공격」 (비전)
  //   ⑸ 바퀴에도 무난에도 못 드는 방패    = 「까다로운 방패」 (시프)
  // 데이터가 바뀌면 그림도 따라 바뀐다. 어느 갈래도 성립하지 않으면 그 부분은 통째로 안 그린다.
  wheelData() {
    const A = this.data.affinity, atk = A.attackTypes, def = A.defenseTypes, T = A.table;
    const eq = (x, y) => Math.abs(x - y) < 1e-6;
    const row = (a) => def.map((d) => T[a][d]);
    const col = (d) => atk.map((a) => T[a][d]);
    const flat = (v) => v.every((x) => eq(x, v[0]));
    const flatAtk = atk.filter((a) => flat(row(a)));
    const flatDef = def.filter((d) => flat(col(d)));
    const bestOf = (a) => { const r = row(a), mx = Math.max(...r); return def.filter((d, i) => eq(r[i], mx)); };
    const ringAtk = atk.filter((a) => !flatAtk.includes(a) && bestOf(a).length === 1 && !flatDef.includes(bestOf(a)[0]));
    const ringDef = ringAtk.map((a) => bestOf(a)[0]);
    const wideAtk = atk.filter((a) => !flatAtk.includes(a) && !ringAtk.includes(a));
    const hardDef = def.filter((d) => !flatDef.includes(d) && !ringDef.includes(d));
    // 바퀴 한 칸 = 방패 하나 + 그 방패에 가장 센 공격 + 가장 약한 공격 (바퀴에 든 공격들 안에서만 비교한다)
    const nodes = ringDef.map((d) => {
      const vs = ringAtk.map((a) => ({ a, v: T[a][d] })).sort((p, q) => q.v - p.v);
      return { def: d, hi: vs[0], lo: vs[vs.length - 1] };
    });
    // 이웃 칸 배율: 바퀴에 든 공격이 전부 「1등 - 2등 - 3등 - 꼴찌」를 같은 값으로 갖는지 확인 — 그래야 "옆 칸은 ×N" 이라고 한 줄로 말할 수 있다
    // 🛑 바퀴에 든 방패들만 놓고 비교한다 — 6개 방패 전부를 세면 바퀴 밖(무난·까다로운 방패) 값이 섞여 "옆 칸" 설명이 틀린다
    const sortedVals = ringAtk.map((a) => ringDef.map((d) => T[a][d]).sort((x, y) => y - x));
    const sameShape = sortedVals.length > 1 && sortedVals.every((v) => v.every((x, i) => eq(x, sortedVals[0][i])));
    const mids = sameShape ? sortedVals[0].filter((v) => v < sortedVals[0][0] && v > sortedVals[0][sortedVals[0].length - 1]) : [];
    return { atk, def, T, flatAtk, flatDef, ringAtk, ringDef, wideAtk, hardDef, nodes, mids, eq };
  }
  // 방패 그림 + 이름 (한 칸)
  wheelNode(n) {
    const K = NGN.DEFENSE_KO, AK = this.data.affinity.한국어 || NGN.ATTACK_KO, S = NGN.SVG;
    const chip = (o, cls, arrow) => `<span class="wa ${cls}">${arrow}${escC(AK[o.a] || o.a)} ×${o.v}</span>`;
    return `<div class="wnode">
      <span class="sh">${S.shield(hexC(NGN.DEFENSE_COLOR[n.def]))}</span>
      <b class="dn">${escC(K[n.def] || n.def)}</b>
      ${chip(n.hi, 'hi', S.arrowUp)}${chip(n.lo, 'lo', S.arrowDown)}</div>`;
  }
  wheel() {
    const W = this.wheelData();
    if (W.nodes.length < 3) return ''; // 바퀴가 성립하지 않는 데이터면 그림을 그리지 않는다(숫자 표만 남는다)
    const K = NGN.DEFENSE_KO, AK = this.data.affinity.한국어 || NGN.ATTACK_KO, S = NGN.SVG, T = W.T;
    // 十자 자리(위·왼·오른·아래)에 넣는다. 다섯 칸 이상이면 앞의 넷만 바퀴에 놓고 나머지는 아래 줄에
    const [n0, n1, n2, n3] = W.nodes;
    const mid = `<div class="wmid">${S.turn}${W.mids.length ? `<span>옆 칸부터<br>×${W.mids.join(' · ×')} 로<br>약해진다</span>` : ''}</div>`;
    const cell = (n) => (n ? this.wheelNode(n) : '<i></i>');
    const grid = `<div class="wheel"><i></i>${cell(n0)}<i></i>${cell(n3)}${mid}${cell(n1)}<i></i>${cell(n2)}<i></i></div>`;
    const extra = W.nodes.slice(4).map((n) => this.wheelNode(n)).join('');
    // 예외 방패 카드: 무난한 방패(어느 공격이든 그대로) · 까다로운 방패(한 공격만 제값)
    const cards = [
      ...W.flatDef.map((d) => `<div class="wcard"><span class="sh">${S.shield(hexC(NGN.DEFENSE_COLOR[d]))}</span><span><b>${escC(K[d] || d)}</b>어느 공격이든 ×${T[W.atk[0]][d]}</span></div>`),
      ...W.hardDef.map((d) => {
        const vs = W.atk.map((a) => ({ a, v: T[a][d] })).sort((p, q) => q.v - p.v);
        const ok = vs.filter((x) => W.eq(x.v, vs[0].v)).map((x) => escC(AK[x.a] || x.a)).join('·');
        return `<div class="wcard"><span class="sh">${S.shield(hexC(NGN.DEFENSE_COLOR[d]))}</span><span><b>${escC(K[d] || d)}</b>${ok} 말고는 ×${vs[vs.length - 1].v} — 거의 안 통한다</span></div>`;
      }),
    ].join('');
    // 예외 공격 줄: 무난한 공격(어디든 같다) · 두루 센 공격
    const lines = [
      ...W.flatAtk.map((a) => `<div class="wrow"><span class="ak">${escC(AK[a] || a)}</span><span>어느 방패든 ×${T[a][W.def[0]]} — 세지도 약하지도 않아 어디에나 쓸 수 있다</span></div>`),
      ...W.wideAtk.map((a) => {
        const vs = W.def.map((d) => ({ d, v: T[a][d] })).sort((p, q) => q.v - p.v);
        const top = vs.filter((x) => W.eq(x.v, vs[0].v)).map((x) => escC(K[x.d] || x.d));
        const bad = vs.filter((x) => W.eq(x.v, vs[vs.length - 1].v)).map((x) => escC(K[x.d] || x.d));
        return `<div class="wrow"><span class="ak">${escC(AK[a] || a)}</span><span>${top.join('·')} 에 ×${vs[0].v} 로 두루 세다. 다만 ${bad.join('·')} 에는 ×${vs[vs.length - 1].v}</span></div>`;
      }),
    ].join('');
    return `<div class="panel cx-wheel">
      <div class="rhead">약점 바퀴 <small>방패마다 잘 드는 공격이 따로 있다</small></div>
      ${grid}${extra ? `<div class="wheel">${extra}</div>` : ''}
      ${cards ? `<div class="wexc">${cards}</div>` : ''}
      ${lines ? `<div class="watk">${lines}</div>` : ''}
    </div>`;
  }

  // ---------- 상성표 6×6 (그림 뒤에 그대로 남는다) ----------
  // 행 = 타워의 공격 타입(6), 열 = 적의 방어 타입(6). 값은 affinity.table 그대로. 색은 1 보다 크면 초록, 작으면 빨강, 1 이면 회색 — 색만이 아니라 숫자도 적는다(글자 규칙 3)
  affinity() {
    const A = this.data.affinity, AK = A.한국어 || NGN.ATTACK_KO;
    const cell = (v) => { const cls = v > 1.01 ? 'up' : v < 0.99 ? 'down' : 'even'; return `<td class="${cls}"><b>×${v}</b></td>`; };
    const head = A.defenseTypes.map((d) => `<th><span class="dsh" style="background:${hexC(NGN.DEFENSE_COLOR[d])}"></span>${escC(NGN.DEFENSE_KO[d])}</th>`).join('');
    const rows = A.attackTypes.map((a) => `<tr><th><span class="ak">${escC(AK[a] || a)}</span></th>${A.defenseTypes.map((d) => cell(A.table[a][d])).join('')}</tr>`).join('');
    // 내 타워가 어느 공격 타입인지 — 열린 계열만, 공격 타입별로 묶어서
    const byAtk = {};
    for (const f of this.meta.unlockedFamilies()) { const t = this.data.byFamily[f][0]; if (t.attackType) (byAtk[t.attackType] ||= []).push(t); }
    const mine = A.attackTypes.filter((a) => byAtk[a]).map((a) => `<div class="cx-row"><span class="ak">${escC(AK[a] || a)}</span><span class="grow">${byAtk[a].map((t) => `<span class="spc" style="background:${hexC(NGN.ELEMENT_COLOR[t.element])}">${escC(t.familyName)}</span>`).join(' ')}</span></div>`).join('');
    return `<div class="panel cx-note"><b>타워의 공격 타입 × 적의 방어 타입 = 피해 배율.</b> 웨이브마다 적의 방어가 다르니(전투 화면 방패 색) 그 방어에 센 타워를 세우면 같은 타워로 두세 배를 낸다. 초록은 세고 빨강은 약하다.</div>
      ${this.wheel()}
      <div class="panel cx-table"><table class="aff"><colgroup><col class="first"></colgroup><thead><tr><th class="corner">공격＼방어</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      <div class="panel cx-list"><div class="rhead">내 타워는 어느 공격 타입인가 <small>열린 계열만</small></div>${mine || '<div class="dim">열린 타워가 없어요</div>'}</div>
      <div class="panel cx-note small">시프·조드가 왜 다른지, 비전이 왜 두루 통하는지는 위 「약점 바퀴」에 값과 함께 나온다 — 여기에 숫자를 다시 적으면 표와 어긋난다(K-2-7).</div>`;
  }

  // ---------- 타워 30계열 — 등급별로 묶어서 ----------
  howToGet(f) {
    const G = this.data.gacha, S = this.data.stages;
    if (G.startFamilies && G.startFamilies.list.includes(f)) return '처음부터';
    const st = Object.keys(S.unlockFamily || {}).find((k) => !k.startsWith('_') && S.unlockFamily[k] === f);
    if (st) return `스테이지 ${st} 깨기`; // 카드 폭(130px)에 들어가게 짧게
    const TP = G.towerPool || {};
    for (const g of ['uncommon', 'rare', 'legendary']) if ((TP[g] || []).includes(f)) return `뽑기 · ${this.gradeKo[g]}`;
    return '뽑기';
  }
  gradeOf(f) { return NGN.FAMILY_INFO[f].grade || 'basic'; }
  // 등급 배지 (checklist K-2-5): 색만 다르던 글자 칩에 등급마다 다른 모양(돌 → 육각 → 보석 → 수정 → 왕관)을 붙였다.
  // 색맹이거나 글자를 아직 잘 못 읽는 조카도 모양으로 등급을 안다(색만으로 알리지 않는다 — 글자 규칙 3)
  gradeTag(g, ko, color) {
    const mk = (NGN.SVG.grade && (NGN.SVG.grade[g] || NGN.SVG.grade.legendary)) || null;
    return `<span class="gtag" style="background:${color}">${mk ? mk('#fff') : ''}${escC(ko)}</span>`;
  }
  towers() {
    const order = ['basic', 'uncommon', 'rare', 'legendary'];
    const groups = {}; for (const f of this.data.families) (groups[this.gradeOf(f)] ||= []).push(f);
    const owned = new Set(this.meta.unlockedFamilies());
    const total = this.data.families.length;
    const sections = order.filter((g) => groups[g]).map((g) => {
      const cards = groups[g].map((f) => {
        const tiers = this.data.byFamily[f], t1 = tiers[0], t3 = tiers[tiers.length - 1], has = owned.has(f);
        const img = this.towerImage ? this.towerImage(t3) : null;
        const lv = this.meta.famLevel ? this.meta.famLevel(f) : 0;
        return `<button class="cx-card ${has ? '' : 'locked'}" data-fam="${f}" style="--el:${hexC(NGN.ELEMENT_COLOR[t1.element])};--gc:${this.gradeColor[g]}">
          <span class="art">${img ? `<img src="${img}" alt="">` : `<span class="ro">${NGN.SVG.role[t1.role] || ''}</span>`}</span>
          <b class="nm">${escC(t1.familyName)}</b>
          <span class="tags"><span class="spc" style="background:${hexC(NGN.ELEMENT_COLOR[t1.element])}">${escC(t1.elementKo)}</span><span class="spc gray">${escC(this.data.roleKo[t1.role] || t1.role)}</span></span>
          ${has ? (lv ? `<span class="lv">Lv.${lv}</span>` : '') : `<span class="how">${NGN.SVG.lock} ${escC(this.howToGet(f))}</span>`}
        </button>`;
      }).join('');
      return `<div class="cx-sec"><div class="rhead">${this.gradeTag(g, this.gradeKo[g], this.gradeColor[g])} ${groups[g].length}계열 <small>${groups[g].filter((f) => owned.has(f)).length} 열림</small></div><div class="cx-grid">${cards}</div></div>`;
    }).join('');
    return `<div class="panel cx-note"><b>타워 ${owned.size}/${total}계열.</b> 누르면 3단 모습·숫자·설명이 나와요. 안 연 타워는 얻는 법이 적혀 있어요.</div>${sections}`;
  }
  // 상세: 돌아가는 3D 모형 + 설명 + 3단 표 + 승급 설명 + 갈래 + 이 타워의 상성 한 줄 + 얻는 법
  detail(f) {
    const tiers = this.data.byFamily[f], t1 = tiers[0], t3 = tiers[tiers.length - 1], g = this.gradeOf(f);
    const A = this.data.affinity, AK = A.한국어 || NGN.ATTACK_KO;
    const B = this.data.balance && this.data.balance.tier3Branches ? Object.keys(this.data.balance.tier3Branches).filter((k) => !k.startsWith('_')).map((k) => this.data.balance.tier3Branches[k]) : [];
    const stat = (t) => t.attackType ? `${Math.round(t.dmgMin)}~${Math.round(t.dmgMax)} 피해 · ${t.attackCd}초마다 · 사거리 ${t.range}<br><b>초당 ${Math.round(t.dps)}</b>` : `주변 타워 +${Math.round(t.aura.damageBonus * 100)}% · 범위 ${t.aura.range}`;
    const aff = t1.attackType ? `<div class="cx-affline">${A.defenseTypes.map((d) => { const v = A.table[t1.attackType][d]; return `<span class="${v > 1.01 ? 'up' : v < 0.99 ? 'down' : 'even'}"><span class="dsh" style="background:${hexC(NGN.DEFENSE_COLOR[d])}"></span>${escC(NGN.DEFENSE_KO[d])} ×${v}</span>`; }).join('')}</div>` : '';
    const m = $c('codeModal'); m.hidden = false;
    m.innerHTML = `<div class="panel modal tdetail cx-detail">
      <div class="head"><b>${escC(t1.familyName)}</b><div class="tags">${this.gradeTag(g, this.gradeKo[g], this.gradeColor[g])}<span class="spc" style="background:${hexC(NGN.ELEMENT_COLOR[t1.element])}">${escC(t1.elementKo)}</span><span class="spc gray">${escC(this.data.roleKo[t1.role] || t1.role)}${t1.attackType ? ' · ' + escC(AK[t1.attackType] || t1.attackType) : ''}</span></div></div>
      <div class="view" id="cxView"></div>
      <p class="desc">${escC(t1.desc || '')}</p>
      ${aff}
      <div class="tiers">${tiers.map((t) => { const img = this.towerImage ? this.towerImage(t) : null; return `<div class="tier" style="background:${hexC(NGN.ELEMENT_COLOR[t.element])}"><span class="lv">${t.tier}단</span>${img ? `<img src="${img}" alt="">` : ''}<b>${escC(t.name)}</b><br><span class="st">${stat(t)}</span><span class="st">${NGN.SVG.coin} ${t.cost}</span></div>`; }).join('')}</div>
      <p class="up">${escC(t1.upgradeDesc || '')}</p>
      ${t1.aura || !B.length ? '' : `<div class="branches">${B.map((b) => `<span style="background:${escC(b.color)}"><b>3단 ${escC(b.name)}</b><br>${escC(b.설명)}</span>`).join('')}</div>`}
      <div class="cx-how">${this.meta.isUnlocked(f) ? `<b style="color:#2E7D32">열려 있음</b>${this.meta.famLevel && this.meta.famLevel(f) ? ` · Lv.${this.meta.famLevel(f)} (피해 +${Math.round(this.meta.famLevelDmg(f) * 100)}%)` : ''}` : `${NGN.SVG.lock} 얻는 법: <b>${escC(this.howToGet(f))}</b>`}</div>
      <div class="row"><button class="btn gray" id="codeClose">닫기</button></div></div>`;
    let live = false;
    if (this.preview) { try { live = this.preview.attach($c('cxView'), f, t3.tier, t3.element, Math.min(220, innerWidth - 80)); } catch (e) { live = false; } }
    if (!live) { const img = this.towerImage ? this.towerImage(t3) : null; $c('cxView').innerHTML = img ? `<img src="${img}" alt="" style="width:160px;height:160px">` : ''; }
    const close = () => { m.hidden = true; if (this.preview) this.preview.detach(); };
    $c('codeClose').addEventListener('click', close);
  }

  // ---------- 적 6종 · 성질 9종 · 방어 타입 6 ----------
  // 데이터 설명에 남은 방어 코드(ZOD·SIF…)를 한글(조드·시프…)로 — 조카는 코드를 모른다
  koDefense(text) { let t = String(text); for (const k of Object.keys(NGN.DEFENSE_KO)) t = t.split(k).join(NGN.DEFENSE_KO[k]); return t; }
  enemies() {
    const E = this.data.enemies;
    const cards = Object.keys(E).filter((k) => !k.startsWith('_')).map((k) => {
      const e = E[k];
      return `<div class="cx-enemy"><span class="ico">${NGN.SVG.foe[k] || ''}</span><div class="grow"><b>${escC(e.이름)}</b>${e.flying ? ' <span class="spc gray">공중</span>' : ''}${e.forcedDefense ? ` <span class="spc" style="background:${hexC(NGN.DEFENSE_COLOR[e.forcedDefense])};color:#222;text-shadow:none">${escC(NGN.DEFENSE_KO[e.forcedDefense])} 방어 고정</span>` : ''}<br><span class="sub">${escC(this.koDefense(e.설명 || ''))}</span><br><span class="nums">체력 ×${e.hpMul} · 속도 ×${e.speedMul} · 보상 ×${e.rewardMul} · 새면 생명 −${e.livesCost}</span></div></div>`;
    }).join('');
    const S = (this.data.specials && this.data.specials.specials) || [];
    const spec = S.map((s) => `<div class="cx-row"><span class="spc" style="background:${escC(s.color || '#888')}">${escC(s.이름)}</span><span class="grow">${escC(s._설명 || '')} <small>· 체력 ×${s.hpMul}</small></span></div>`).join('');
    const def = this.data.affinity.defenseTypes.map((d) => `<div class="cx-row"><span class="dsh big" style="background:${hexC(NGN.DEFENSE_COLOR[d])}"></span><b class="dn">${escC(NGN.DEFENSE_KO[d])}</b><span class="grow small">${this.data.affinity.attackTypes.filter((a) => this.data.affinity.table[a][d] > 1.01).map((a) => `<span class="up">${escC((this.data.affinity.한국어 || NGN.ATTACK_KO)[a] || a)} ×${this.data.affinity.table[a][d]}</span>`).join(' ') || '<span class="dim">센 공격 없음 — 전부 ×1</span>'}</span></div>`).join('');
    return `<div class="panel cx-list"><div class="rhead">적 6종 <small>보스는 5의 배수 웨이브</small></div>${cards}</div>
      <div class="panel cx-list"><div class="rhead">성질 9종 <small>스테이지 4부터 웨이브에 붙는다 · 적 발밑 색 고리</small></div>${spec || '<div class="dim">없음</div>'}</div>
      <div class="panel cx-list"><div class="rhead">방어 타입 6 — 무엇이 센가 <small>방패 색 = 그 웨이브의 방어</small></div>${def}</div>`;
  }

  // ---------- 아이템 24종 — 등급별 ----------
  items() {
    const I = (this.data.items && this.data.items.items) || [], D = this.data.items && this.data.items.drop;
    const order = ['common', 'uncommon', 'rare', 'unique'];
    const nameKo = { common: '흔함', uncommon: '고급', rare: '희귀', unique: '유일' };
    const color = { common: '#9AA7B4', uncommon: '#3FA46A', rare: '#3E7BD6', unique: '#E0A32E' };
    const groups = {}; for (const it of I) (groups[it.등급] ||= []).push(it);
    const secs = order.filter((g) => groups[g]).map((g) => `<div class="panel cx-list"><div class="rhead">${this.gradeTag(g, (groups[g][0] && groups[g][0].등급이름) || nameKo[g], color[g])} ${groups[g].length}종</div>${groups[g].map((it) => `<div class="cx-row"><b class="dn">${escC(it.이름)}</b><span class="grow">${escC(it.설명 || '')}</span></div>`).join('')}</div>`).join('');
    return `<div class="panel cx-note"><b>아이템 ${I.length}종.</b> 적을 잡다 보면 떨어진다(${D ? `${D.chance * 100}%·보스는 언제나` : ''}). 타워를 눌러 끼우면 그 타워가 세진다(타워당 ${D ? D.slotsPerTower : 3}칸). 판이 끝나면 사라진다.</div>${secs}`;
  }
};
