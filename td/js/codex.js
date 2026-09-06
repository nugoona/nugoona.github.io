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

  // ---------- 상성표 6×6 ----------
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
      <div class="panel cx-table"><table class="aff"><colgroup><col class="first"></colgroup><thead><tr><th class="corner">공격＼방어</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      <div class="panel cx-list"><div class="rhead">내 타워는 어느 공격 타입인가 <small>열린 계열만</small></div>${mine || '<div class="dim">열린 타워가 없어요</div>'}</div>
      <div class="panel cx-note small">시프(회색 방패)는 정수 공격만 제값을 받는 단단한 놈의 방어. 조드(흰 방패)는 어느 공격이든 그대로. 비전 공격은 시프만 빼고 전부 1.5배라 어디에나 통한다.</div>`;
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
      return `<div class="cx-sec"><div class="rhead"><span class="gtag" style="background:${this.gradeColor[g]}">${escC(this.gradeKo[g])}</span> ${groups[g].length}계열 <small>${groups[g].filter((f) => owned.has(f)).length} 열림</small></div><div class="cx-grid">${cards}</div></div>`;
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
      <div class="head"><b>${escC(t1.familyName)}</b><div class="tags"><span class="gtag" style="background:${this.gradeColor[g]}">${escC(this.gradeKo[g])}</span><span class="spc" style="background:${hexC(NGN.ELEMENT_COLOR[t1.element])}">${escC(t1.elementKo)}</span><span class="spc gray">${escC(this.data.roleKo[t1.role] || t1.role)}${t1.attackType ? ' · ' + escC(AK[t1.attackType] || t1.attackType) : ''}</span></div></div>
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
    const secs = order.filter((g) => groups[g]).map((g) => `<div class="panel cx-list"><div class="rhead"><span class="gtag" style="background:${color[g]}">${escC((groups[g][0] && groups[g][0].등급이름) || nameKo[g])}</span> ${groups[g].length}종</div>${groups[g].map((it) => `<div class="cx-row"><b class="dn">${escC(it.이름)}</b><span class="grow">${escC(it.설명 || '')}</span></div>`).join('')}</div>`).join('');
    return `<div class="panel cx-note"><b>아이템 ${I.length}종.</b> 적을 잡다 보면 떨어진다(${D ? `${D.chance * 100}%·보스는 언제나` : ''}). 타워를 눌러 끼우면 그 타워가 세진다(타워당 ${D ? D.slotsPerTower : 3}칸). 판이 끝나면 사라진다.</div>${secs}`;
  }
};
