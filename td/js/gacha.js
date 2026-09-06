'use strict';
// 뽑기 화면과 이펙트(2026-09-06 개편, design.md 12-13 — 주력 상품이 새 타워 계열). 에셋 없이 CSS 로 — 카드 뒤집기·등급 색 빛 번짐·파티클 폭발.
// 등급이 오를수록 화려하게: 흔함 = 조용히 · 고급 = 파란 폭발 · 희귀 = 보라 폭발 + 짧은 흔들림 · 전설 = 화면 흔들림 + 금빛 플래시 + 광선 + "전설!" 배너 + 그 타워의 3D 모형이 카드 안에서 돈다.
// 결과 카드에 그 타워가 어떤 것인지(이름·속성·역할·3단 성능·설명)를 같이 보여 준다 — 조카가 "뭐 나왔어?"를 바로 알 수 있게.
// 규칙(확률·천장·풀)은 data/gacha.json, 굴리기·저장은 meta.js. 여기는 보여주는 것만.
window.NGN = window.NGN || {};

const $g = (id) => document.getElementById(id);
const escG = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 등급 이름·색은 data/gacha.json 의 gradeKo/gradeColor(2026-09-06 데이터 담당이 새 키 common·uncommon·rare·legendary 로 맞췄다). 표가 없을 때만 아래 예비값
const GRADE_KO = { common: '흔함', uncommon: '고급', rare: '희귀', legendary: '전설' };
const GRADE_COLOR = { common: '#9BA3A8', uncommon: '#4FA3E8', rare: '#B15BE8', legendary: '#F2B632' };
const GRADE_RANK = { common: 0, uncommon: 1, rare: 2, legendary: 3 };

NGN.GachaUI = class GachaUI {
  constructor(meta, data, onChange, opts = {}) {
    this.meta = meta; this.data = data; this.onChange = onChange || (() => {});
    this.towerImage = opts.towerImage || null; this.preview = opts.preview || null;
    const G = data.gacha || {};
    for (const g of Object.keys(GRADE_KO)) { if (G.gradeKo && G.gradeKo[g]) GRADE_KO[g] = G.gradeKo[g]; if (G.gradeColor && G.gradeColor[g]) GRADE_COLOR[g] = G.gradeColor[g]; }
    this.busy = false;
    $g('pullBtn').addEventListener('click', () => this.pull(1));
    $g('pull10Btn').addEventListener('click', () => this.pull(10));
    // 프리미엄 팩(J-11 ⑤): 시즌 2·3등 상품. 있을 때만 버튼이 보인다
    const pb = $g('pullPremiumBtn'); if (pb) pb.addEventListener('click', () => this.pull(1, true));
    $g('gachaClose').addEventListener('click', () => this.hide());
  }
  show() { $g('gachaScreen').hidden = false; this.refresh(); this.resetCard(); }
  hide() { if (this.busy) return; this.resetCard(); $g('gachaScreen').hidden = true; this.onChange(); }

  refresh() {
    const s = this.meta.state, G = this.data.gacha, R = G.rates;
    $g('ticketCount').innerHTML = `${NGN.SVG ? NGN.SVG.ticket : ''}<span class="num">${s.tickets}</span>`;
    $g('pullBtn').disabled = s.tickets < 1 || this.busy;
    $g('pull10Btn').disabled = s.tickets < 10 || this.busy;
    const pb = $g('pullPremiumBtn'); if (pb) { pb.hidden = !(s.premiumPulls > 0); pb.disabled = this.busy; pb.innerHTML = `프리미엄 팩 <span class="num">${s.premiumPulls || 0}</span>회`; }
    const toLeg = G.pity.pityLegendary - s.sinceLegendary, toRare = G.pity.pityRare - s.sinceRare;
    $g('pityInfo').innerHTML = `<span class="pity"><b style="color:${GRADE_COLOR.legendary}">전설</b> 확정까지 <b>${toLeg}</b>번 · <b style="color:${GRADE_COLOR.rare}">희귀</b> 확정까지 <b>${toRare}</b>번</span>`
      + `<span class="rates">${['common', 'uncommon', 'rare', 'legendary'].map((g) => `<span class="gtag" style="background:${GRADE_COLOR[g]}">${GRADE_KO[g]} ${R[g]}%</span>`).join('')}</span>`;
    const owned = this.meta.unlockedFamilies().length, all = this.data.families.length;
    const sum = this.meta.summary(NGN.FAMILY_NAMES);
    $g('perkSummary').innerHTML = `<b>타워 ${owned}/${all}계열</b> · 지금까지 ${s.pulls}번 뽑음` + (sum.length ? `<br><b>내 강화</b> · ${sum.map(escG).join(' · ')}` : '<br><span class="dim">아직 강화 없음 — 뽑으면 여기에 쌓인다</span>');
  }
  resetCard() {
    const card = $g('gachaCard');
    card.className = 'card3d';
    for (const k of ['grade', 'name', 'tags', 'badge', 'tiers', 'desc']) card.querySelector('.front .' + k).innerHTML = '';
    card.querySelector('.front .art').innerHTML = '';
    card.style.removeProperty('--grade');
    $g('gachaBurst').innerHTML = '';
    $g('gachaLegend').hidden = true;
    if (this.preview) this.preview.detach();
  }

  // n 장 연속 뽑기. 카드가 뒤집히며 하나씩 나오고, 여러 장이면 마지막에 가장 좋은 것을 한 번 더 크게
  async pull(n, premium = false) {
    if (this.busy) return;
    const items = [];
    this.busy = true; this.refresh();
    for (let i = 0; i < n; i++) {
      const it = this.meta.pull(Math.random, premium);
      if (!it) break;
      items.push(it);
      await this.reveal(it, n > 1 ? (it.grade === 'legendary' ? 1600 : 700) : (it.grade === 'legendary' ? 2400 : 1300));
      this.log(it);
      this.refresh(); // 티켓 수·천장까지 남은 횟수를 카드마다 갱신
      if (i < n - 1) await this.sleep(n > 1 ? 220 : 400);
    }
    if (items.length > 1) {
      const best = items.slice().sort((a, b) => GRADE_RANK[b.grade] - GRADE_RANK[a.grade] || (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0))[0];
      await this.sleep(200);
      await this.reveal(best, 1400, true);
    }
    this.busy = false; this.refresh(); this.onChange();
  }

  // 카드 앞면 채우기: 타워면 그림(3단) + 이름 + 속성·역할 칩 + 새 타워/레벨 + 3단 성능 + 설명, 숫자 상품이면 이름만
  fillFront(item) {
    const card = $g('gachaCard'), F = (k) => card.querySelector('.front .' + k);
    const color = GRADE_COLOR[item.grade];
    card.style.setProperty('--grade', color);
    F('grade').textContent = GRADE_KO[item.grade];
    F('art').innerHTML = '';
    if (item.kind === 'tower') {
      const tiers = this.data.byFamily[item.family] || [], t1 = tiers[0], t3 = tiers[tiers.length - 1];
      if (!t1) { F('name').textContent = item.name; return; }
      const elColor = '#' + (NGN.ELEMENT_COLOR[t1.element] || 0x888888).toString(16).padStart(6, '0');
      F('name').textContent = t1.familyName;
      F('tags').innerHTML = `<span class="spc" style="background:${elColor}">${escG(t1.elementKo)}</span><span class="spc" style="background:#5C666D">${escG(this.data.roleKo[t1.role] || t1.role)}${t1.attackType ? ' · ' + escG(NGN.ATTACK_KO[t1.attackType]) : ''}</span>`;
      F('badge').innerHTML = item.isNew ? `<span class="new">새 타워!</span>` : `<span class="lvup">Lv.${item.level} · 피해 +${Math.round(item.level * (this.data.gacha.towerPool.dupLevelDmg || 0) * 100)}%</span>`;
      F('tiers').innerHTML = tiers.map((t) => `<span><b>${t.tier}단</b> ${t.attackType ? `초당 ${Math.round(t.dps)}` : `주변 +${Math.round(t.aura.damageBonus * 100)}%`}</span>`).join('');
      F('desc').textContent = t1.desc || '';
      // 그림: 전설은 돌아가는 3D 모형(3단), 나머지는 3단 카드 그림
      const host = F('art');
      let live = false;
      if (item.grade === 'legendary' && this.preview) { try { live = this.preview.attach(host, item.family, t3.tier, t3.element, 150); } catch (e) { live = false; } }
      if (!live) { const img = this.towerImage ? this.towerImage(t3) : null; host.innerHTML = img ? `<img src="${img}" alt="">` : (NGN.SVG ? `<span class="ro">${NGN.SVG.role[t1.role] || ''}</span>` : ''); }
    } else {
      F('name').textContent = item.name;
      F('tags').innerHTML = `<span class="spc" style="background:#5C666D">강화</span>`;
      F('badge').innerHTML = ''; F('tiers').innerHTML = ''; F('desc').textContent = '모든 판에 늘 적용된다';
      F('art').innerHTML = NGN.SVG ? `<span class="ro">${NGN.SVG.tree.attack}</span>` : '';
    }
  }
  // 카드 하나 뒤집기 + 등급별 이펙트
  reveal(item, dur, finale = false) {
    return new Promise((done) => {
      const color = GRADE_COLOR[item.grade];
      const card = $g('gachaCard');
      this.resetCard();
      this.fillFront(item);
      requestAnimationFrame(() => {
        card.classList.add('flip', 'g-' + item.grade);
        // 뒤집히는 중간쯤에 폭발
        setTimeout(() => {
          const count = { common: 8, uncommon: 18, rare: 36, legendary: 70 }[item.grade] * (finale ? 1.5 : 1);
          this.burst(color, Math.round(count), item.grade === 'legendary' ? 1.7 : item.grade === 'rare' ? 1.2 : 1);
          if (item.grade === 'legendary') this.shake(900); else if (item.grade === 'rare') this.shake(350);
          if (item.grade === 'legendary') { this.flash(color); card.classList.add('rays'); this.legendBanner(); if (NGN.sound) NGN.sound.play('win'); }
          else if (item.grade === 'rare') { if (NGN.sound) NGN.sound.play('upgrade'); }
          else if (NGN.sound) NGN.sound.play(item.grade === 'uncommon' ? 'build' : 'ui');
          const vib = this.meta.state.settings && this.meta.state.settings.vibrate === false;
          if (navigator.vibrate && !vib) { try { navigator.vibrate(item.grade === 'legendary' ? [80, 40, 160, 40, 80] : item.grade === 'rare' ? 70 : 20); } catch (e) { /* 무시 */ } }
        }, 300);
        setTimeout(done, dur);
      });
    });
  }
  legendBanner() { const b = $g('gachaLegend'); b.hidden = false; b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); }
  // 파티클 폭발: span 들이 카드 중심에서 등급 색으로 사방으로 튄다
  burst(color, count, scale) {
    const host = $g('gachaBurst');
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      const ang = Math.random() * Math.PI * 2, dist = (70 + Math.random() * 180) * scale;
      s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      s.style.setProperty('--dy', Math.sin(ang) * dist - 40 + 'px');
      s.style.setProperty('--c', color);
      s.style.setProperty('--d', (0.6 + Math.random() * 0.6) + 's');
      s.style.setProperty('--sz', (4 + Math.random() * 8) * scale + 'px');
      s.style.animationDelay = Math.random() * 0.12 + 's';
      host.appendChild(s);
      setTimeout(() => s.remove(), 1400);
    }
  }
  shake(ms) { document.body.classList.add('shake'); setTimeout(() => document.body.classList.remove('shake'), ms); }
  flash(color) { const f = $g('gachaFlash'); f.style.background = color; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
  log(item) {
    const li = document.createElement('div');
    li.className = 'glog g-' + item.grade;
    li.innerHTML = `<span class="gtag" style="background:${GRADE_COLOR[item.grade]}">${GRADE_KO[item.grade]}</span> ${escG(item.name)}${item.kind === 'tower' && item.isNew ? ' <b class="newmark">새 타워</b>' : ''}`;
    const host = $g('gachaLog'); host.prepend(li);
    while (host.children.length > 12) host.lastChild.remove();
  }
  sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
};
NGN.GACHA_GRADE_KO = GRADE_KO; NGN.GACHA_GRADE_COLOR = GRADE_COLOR;
