'use strict';
// 뽑기 화면과 이펙트. 에셋 없이 CSS 로 — 카드 뒤집기·등급 색 빛 번짐·파티클 폭발·전설은 화면 흔들림 + 플래시 + 금빛 광선.
// 규칙(확률·천장·풀)은 data/gacha.json, 굴리기·저장은 meta.js. 여기는 보여주는 것만.
window.NGN = window.NGN || {};

const $g = (id) => document.getElementById(id);

NGN.GachaUI = class GachaUI {
  constructor(meta, data, onChange) {
    this.meta = meta; this.data = data; this.onChange = onChange || (() => {});
    this.busy = false;
    $g('pullBtn').addEventListener('click', () => this.pull(1));
    $g('pull10Btn').addEventListener('click', () => this.pull(10));
    $g('gachaClose').addEventListener('click', () => this.hide());
  }
  show() { $g('gachaScreen').hidden = false; this.refresh(); this.resetCard(); }
  hide() { if (this.busy) return; $g('gachaScreen').hidden = true; this.onChange(); }

  refresh() {
    const s = this.meta.state, G = this.data.gacha;
    $g('ticketCount').textContent = `티켓 ${s.tickets}장`;
    $g('pullBtn').disabled = s.tickets < 1 || this.busy;
    $g('pull10Btn').disabled = s.tickets < 10 || this.busy;
    const toLeg = G.pity.pityLegendary - s.sinceLegendary, toEpic = G.pity.pityEpic - s.sinceEpic;
    $g('pityInfo').innerHTML = `전설 확정까지 <b>${toLeg}</b>번 · 희귀 확정까지 <b>${toEpic}</b>번 · 지금까지 ${s.pulls}번 뽑음`;
    const sum = this.meta.summary(NGN.FAMILY_NAMES);
    $g('perkSummary').innerHTML = sum.length ? `<b>내 강화</b> · ${sum.join(' · ')}` : '<span class="dim">아직 강화 없음 — 뽑으면 여기에 쌓인다</span>';
  }
  resetCard() {
    const card = $g('gachaCard');
    card.className = 'card3d';
    card.querySelector('.front .grade').textContent = '';
    card.querySelector('.front .name').textContent = '';
    card.style.removeProperty('--grade');
    $g('gachaBurst').innerHTML = '';
  }

  // n 장 연속 뽑기. 카드가 뒤집히며 하나씩 나오고, 마지막에 가장 좋은 등급의 이펙트를 크게
  async pull(n) {
    if (this.busy) return;
    const items = [];
    this.busy = true; this.refresh();
    const order = ['common', 'rare', 'epic', 'legendary'];
    for (let i = 0; i < n; i++) {
      const it = this.meta.pull();
      if (!it) break;
      items.push(it);
      await this.reveal(it, n > 1 ? 520 : 900);
      this.log(it);
      this.refresh(); // 티켓 수·천장까지 남은 횟수를 카드마다 갱신
      if (i < n - 1) await this.sleep(n > 1 ? 260 : 500);
    }
    if (items.length > 1) {
      const best = items.slice().sort((a, b) => order.indexOf(b.grade) - order.indexOf(a.grade))[0];
      await this.sleep(200);
      await this.reveal(best, 1000, true);
    }
    this.busy = false; this.refresh(); this.onChange();
  }

  // 카드 하나 뒤집기 + 이펙트
  reveal(item, dur, finale = false) {
    return new Promise((done) => {
      const G = this.data.gacha, color = G.gradeColor[item.grade];
      const card = $g('gachaCard');
      this.resetCard();
      card.style.setProperty('--grade', color);
      card.querySelector('.front .grade').textContent = G.gradeKo[item.grade];
      card.querySelector('.front .name').textContent = item.name;
      // 뒤집기
      requestAnimationFrame(() => {
        card.classList.add('flip', 'g-' + item.grade);
        // 뒤집히는 중간쯤에 폭발
        setTimeout(() => {
          const count = { common: 10, rare: 18, epic: 34, legendary: 64 }[item.grade] * (finale ? 1.5 : 1);
          this.burst(color, Math.round(count), item.grade === 'legendary' ? 1.6 : 1);
          if (item.grade === 'legendary' || (finale && item.grade === 'epic')) this.shake(item.grade === 'legendary' ? 700 : 350);
          if (item.grade === 'legendary') { this.flash(color); card.classList.add('rays'); }
          if (navigator.vibrate) navigator.vibrate(item.grade === 'legendary' ? [60, 40, 120] : item.grade === 'epic' ? 60 : 20);
        }, 300);
        setTimeout(done, dur);
      });
    });
  }
  // 파티클 폭발: span 들이 카드 중심에서 등급 색으로 사방으로 튄다
  burst(color, count, scale) {
    const host = $g('gachaBurst');
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      const ang = Math.random() * Math.PI * 2, dist = (60 + Math.random() * 160) * scale;
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
    const G = this.data.gacha;
    const li = document.createElement('div');
    li.className = 'glog g-' + item.grade;
    li.innerHTML = `<span class="gtag" style="background:${G.gradeColor[item.grade]}">${G.gradeKo[item.grade]}</span> ${item.name}`;
    const host = $g('gachaLog'); host.prepend(li);
    while (host.children.length > 12) host.lastChild.remove();
  }
  sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
};
