'use strict';
// 화면 UI(HTML). 흐름(design.md 12장): 메인 메뉴 → 월드맵(길 위의 점 20개, 다음 것만 열림) → 점 누르면 바로 전투(덱 편성 없음) → 결과(별) → 월드맵.
// 무한 모드는 스테이지 10 을 깨면 열리고, 거기서만 지도를 고른다. 순위표(records.js)는 캠페인·무한·오늘의 판 셋 다 — 진입 조건 없음(3단계 I-10).
// 3단계: 월드맵 점 → 난이도 고르기(쉬움/보통/어려움, 별은 은·금·붉은으로 따로) · 결과 화면에 기록 코드 · 설정에 저장 코드 · 첫 화면에 홈 화면 추가 안내 · 메뉴에 오늘의 판.
// 전투 화면(2026-09-06 참고: 레이드 러시): 상단 얇은 한 줄([←] · 웨이브 진행 막대 · 생명·골드 알약) · 예고 줄 상시 표시 없음(막대를 누르면 펼침, 웨이브 시작 배너에 적 아이콘) ·
// 하단은 판 아래 빈 땅에 카드 한 줄(타워 3D 그림 + 값, 이름은 고른 카드 위에만) + 큰 ▶(웨이브 중엔 배속). 카드를 길게 누르거나 위로 밀면 상세(돌아가는 모형·설명·3단·갈래).
// 웨이브는 저절로 온다(main.js 카운트다운). 막대 아래 카운트다운 줄("다음 8초" + 적 아이콘·보스/성질 칩)이 그걸 알리고, ▶ 는 「미리 부르기」(보너스 골드 칩 "+N").
// 그 아래 보스 체력 막대(보스가 살아 있을 때만). 생명이 깎이면 알약이 튀고 가장자리가 붉게 번쩍, 적이 출구 가까이 오면 붉은 비네트가 깜빡. [⏸] 일시정지 오버레이.
// 카드 → 빈 자리 = 사거리 원판 + 반투명 모형 미리보기 → [짓기]. 지어진 타워를 누르면 사거리 원판 + 팝.
// 이모지 없음, 아이콘은 SVG. 규칙은 sim/engine.js, 3D 는 world.js/render.js.
window.NGN = window.NGN || {};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 10000 ? Math.round(n / 1000) + 'K' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(Math.floor(n)));

const SVG = {
  coin: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#F5B301"/><circle cx="12" cy="12" r="7" fill="#FFD84D"/></svg>',
  ticket: '<svg class="i" viewBox="0 0 24 24"><path fill="#B15BE8" d="M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V7z"/><path d="M9 7v12" stroke="#fff" stroke-width="1.5" stroke-dasharray="2 2"/></svg>',
  shield: (c) => `<svg class="i" viewBox="0 0 24 24"><path fill="${c}" stroke="#222" stroke-width="1.5" d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3z"/></svg>`,
  up: '<svg class="i" viewBox="0 0 24 24"><path fill="#fff" d="M12 4 4 12h5v8h6v-8h5z"/></svg>',
  sell: '<svg class="i" viewBox="0 0 24 24"><path fill="#fff" d="M12 3 8 7h8l-4-4zM6 9h12l1 12H5L6 9z"/><path d="M12 12v6M10 14h3a1 1 0 0 1 0 2h-2" stroke="#B8860B" stroke-width="1.6" fill="none"/></svg>',
  info: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#fff"/><path fill="#555" d="M11 10h2v7h-2zM11 7h2v2h-2z"/></svg>',
  lock: '<svg class="i" viewBox="0 0 24 24"><path fill="currentColor" d="M17 9V7A5 5 0 0 0 7 7v2H5v13h14V9h-2zM9 7a3 3 0 0 1 6 0v2H9V7z"/></svg>',
  trophy: '<svg class="i" viewBox="0 0 24 24"><path fill="#F5B301" d="M6 3h12v3h3v3a5 5 0 0 1-4.2 4.9A6 6 0 0 1 13 17.9V20h4v2H7v-2h4v-2.1A6 6 0 0 1 7.2 13.9 5 5 0 0 1 3 9V6h3V3zm-1 5v1a3 3 0 0 0 2 2.8V8H5zm14 0h-2v3.8A3 3 0 0 0 19 9V8z"/></svg>',
  // 별: on = 금색, 아니면 회색
  star: (on = true) => `<svg class="i" viewBox="0 0 24 24"><path d="M12 2l3 6.6 7 .8-5.2 4.8 1.5 7L12 17.7 5.7 21.2l1.5-7L2 9.4l7-.8z" fill="${on ? '#FFC93C' : '#6B6F73'}" stroke="${on ? '#7A4E00' : '#3A3E42'}" stroke-width="1.5"/></svg>`,
  infinity: '<svg class="i" viewBox="0 0 24 24"><path d="M6.5 8.5c-2 0-3.5 1.6-3.5 3.5s1.5 3.5 3.5 3.5c3 0 5-7 11-7 2 0 3.5 1.6 3.5 3.5s-1.5 3.5-3.5 3.5c-3 0-5-7-11-7z" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
  play: '<svg class="i" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>',
  calendar: '<svg class="i" viewBox="0 0 24 24"><path fill="currentColor" d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm-1 8v10h12V10H6zm2 2h3v3H8v-3z"/></svg>',
  tree: {
    attack: '<svg class="i" viewBox="0 0 24 24"><path fill="#C0392B" d="M4 20l1.5-1.5L4 17l-1 1zM6.5 16.5 17 6l1 1L7.5 17.5zM14 3l7 7-2 2-7-7z"/><path fill="#8E6B3A" d="M4 17l3 3 2-2-3-3z"/></svg>',
    range: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#1D5FA0" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="#3AA0F0"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="#1D5FA0" stroke-width="2"/></svg>',
    gold: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#F5B301"/><circle cx="12" cy="12" r="7" fill="#FFD84D"/><path d="M12 7v10M9.5 9.5h4a1.75 1.75 0 0 1 0 3.5h-3a1.75 1.75 0 0 0 0 3.5h4" stroke="#B8860B" stroke-width="1.8" fill="none"/></svg>',
    life: '<svg class="i" viewBox="0 0 24 24"><path fill="#E8443A" d="M12 21s-7.5-4.6-9.5-9.3C1 8 3.4 4.5 7 4.5c2 0 3.6 1.1 5 2.8 1.4-1.7 3-2.8 5-2.8 3.6 0 6 3.5 4.5 7.2C19.5 16.4 12 21 12 21z"/></svg>',
    // 기본기: 망치와 벽돌(타워가 처음부터 높이 지어진다)
    basics: '<svg class="i" viewBox="0 0 24 24"><path fill="#8E6B3A" d="M3 20h18v2H3z"/><path fill="#C49A63" d="M5 14h6v6H5zM13 14h6v6h-6zM9 8h6v6H9z"/><path fill="#5C666D" d="M14 2l6 3-1.5 2.5L14 5l-1 1.5-2-1.2z"/><path fill="#8E6B3A" d="M12.2 5.6 6 14l1.8 1.1 6.1-8.4z"/></svg>',
  },
  bag: '<svg class="i" viewBox="0 0 24 24"><path fill="#8E6B3A" d="M7 8V6a5 5 0 0 1 10 0v2h3l-1 13H5L4 8h3zm2 0h6V6a3 3 0 0 0-6 0v2z"/><path fill="#C49A63" d="M6 10h12l-.8 9H6.8z"/></svg>',
  foe: {
    basic: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" fill="#8E5BD6" stroke="#222" stroke-width="1.5"/><circle cx="9" cy="12" r="1.5" fill="#fff"/><circle cx="15" cy="12" r="1.5" fill="#fff"/></svg>',
    fast: '<svg viewBox="0 0 24 24"><path d="M3 12 21 5l-5 7 5 7z" fill="#F0A030" stroke="#222" stroke-width="1.5"/></svg>',
    tank: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="14" rx="2" fill="#5B7080" stroke="#222" stroke-width="1.5"/><rect x="7" y="3" width="10" height="5" fill="#8FA0B0" stroke="#222" stroke-width="1.5"/></svg>',
    swarm: '<svg viewBox="0 0 24 24"><circle cx="8" cy="9" r="4" fill="#5FA85A" stroke="#222"/><circle cx="16" cy="9" r="4" fill="#5FA85A" stroke="#222"/><circle cx="12" cy="16" r="4" fill="#5FA85A" stroke="#222"/></svg>',
    flyer: '<svg viewBox="0 0 24 24"><path d="M2 12c4-6 8-6 10 0 2-6 6-6 10 0-4 2-8 4-10 8-2-4-6-6-10-8z" fill="#E6E1D3" stroke="#222" stroke-width="1.5"/></svg>',
    boss: '<svg viewBox="0 0 24 24"><circle cx="12" cy="14" r="8" fill="#B02A3A" stroke="#222" stroke-width="1.5"/><path d="M6 8 4 2l5 4zM18 8l2-6-5 4z" fill="#D8C8B0" stroke="#222"/><circle cx="9" cy="13" r="1.6" fill="#FF3030"/><circle cx="15" cy="13" r="1.6" fill="#FF3030"/></svg>',
  },
  role: {
    single: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="#fff"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="#fff" stroke-width="2"/></svg>',
    splash: '<svg viewBox="0 0 24 24"><path fill="#fff" d="m12 2 2.5 5.5L20 6l-3 5 5 2-5.5 2.5L18 21l-5-3-1 5-2.5-5.5L4 20l3-5-5-2 5.5-2.5L6 4l5 3z"/></svg>',
    bounce: '<svg viewBox="0 0 24 24"><path fill="#fff" d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>',
    multishot: '<svg viewBox="0 0 24 24"><path fill="#fff" d="M4 6l7 6-7 6zM10 6l7 6-7 6zM16 6l6 6-6 6z"/></svg>',
    aura: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="1.5" fill="#fff"/></svg>',
  },
};
NGN.SVG = SVG;

NGN.UI = class UI {
  constructor(data, cb) {
    this.data = data; this.cb = cb;
    this.pickFam = null; this.selectedSlot = null;
    this.mapId = null;
    this.genCount = 12;
    this.lastGold = null;
    this.cdSec = null; this.cdWave = null; this.cdBonus = 0; this.bossPct = null; // 카운트다운 줄·보스 막대의 마지막 표시값(바뀔 때만 DOM 을 만진다)
    // 메뉴
    $('menuPlay').addEventListener('click', () => this.showWorld());
    $('menuInfinite').addEventListener('click', () => { if (this.meta.infiniteUnlocked()) this.showMapScreen(); else this.toast(`스테이지 ${this.data.stages.infiniteUnlockStage}을 깨면 열립니다`); });
    $('menuDaily').addEventListener('click', () => cb.onStartDaily());
    $('menuGacha').addEventListener('click', () => cb.onGacha());
    $('menuRecords').addEventListener('click', () => this.showRecords());
    $('menuSettings').addEventListener('click', () => this.showSettings());
    $('a2hsClose').addEventListener('click', () => { this.meta.state.settings.a2hsDismissed = true; this.meta.save(); $('a2hs').hidden = true; });
    $('a2hsMore').addEventListener('click', () => this.a2hsHelp());
    // 난이도 고르기(월드맵 점을 누르면)
    $('diffClose').addEventListener('click', () => { $('diffModal').hidden = true; });
    // 월드맵 · 강화
    $('worldBack').addEventListener('click', () => this.showMenu());
    $('worldUpgrade').addEventListener('click', () => this.showUpgrade());
    $('upgradeBack').addEventListener('click', () => this.showWorld());
    $('treeReset').addEventListener('click', () => { if (!this.meta.treeSpent()) return this.toast('찍은 것이 없습니다'); this.meta.resetTree(); this.toast('별을 전부 되돌렸습니다'); this.renderTree(); });
    // 무한 모드 지도 선택
    $('mapBack').addEventListener('click', () => this.showMenu());
    $('mapMore').addEventListener('click', () => { this.genCount += 12; this.buildMapGrid(); });
    $('mapStart').addEventListener('click', () => { if (this.mapId) cb.onStartInfinite(this.mapId); });
    $('recordBack').addEventListener('click', () => this.showMenu());
    $('settingBack').addEventListener('click', () => this.showMenu());
    $('endCode').addEventListener('click', () => this.showEndCode());
    // 전투: ▶ 는 「미리 부르기」(카운트다운 중 누르면 바로 시작 + 보너스 골드 — main.js callWave), 웨이브 중에는 배속(1→2→3×)
    $('waveBtn').addEventListener('click', () => { if (this.game && this.game.wave) cb.onSpeed(); else cb.onWaveStart(); });
    $('rotateBtn').addEventListener('click', () => cb.onRotate());
    $('btnMenu').addEventListener('click', () => cb.onQuit());
    // 일시정지: [⏸] → 오버레이. [계속]/[나가기(기존 onQuit — confirm 을 취소하면 일시정지가 그대로 남는다)]
    $('pauseBtn').addEventListener('click', () => cb.onPause());
    $('pauseResume').addEventListener('click', () => cb.onResume());
    $('pauseQuit').addEventListener('click', () => cb.onQuit());
    $('waveBar').addEventListener('click', () => { $('nextDetail').hidden = !$('nextDetail').hidden; this.setPreview(); });
    // 결과
    $('endNext').addEventListener('click', () => cb.onNextStage());
    $('endRetry').addEventListener('click', () => cb.onRetry());
    $('endWorld').addEventListener('click', () => { cb.onLeave(); this.showWorld(); });
    $('endMenu').addEventListener('click', () => { cb.onLeave(); this.showMenu(); });
    $('endGacha').addEventListener('click', () => cb.onGacha());
    $('endRecords').addEventListener('click', () => { cb.onLeave(); this.showRecords('daily'); });
  }
  hideAll() { for (const id of ['menu', 'worldScreen', 'upgradeScreen', 'mapScreen', 'recordScreen', 'settingScreen', 'endScreen', 'game', 'diffModal', 'codeModal']) $(id).hidden = true; }

  // ---------- 상성 ----------
  mul(attackType, defense) { return attackType ? this.data.affinity.table[attackType][defense] : null; }
  affBadge(attackType, defense) { const m = this.mul(attackType, defense); if (m === null || m === 1) return ''; return m > 1 ? `<span class="aff up"><svg viewBox="0 0 24 24"><path fill="#fff" d="M12 3 4 12h5v9h6v-9h5z"/></svg></span>` : `<span class="aff down"><svg viewBox="0 0 24 24"><path fill="#fff" d="M12 21l8-9h-5V3H9v9H4z"/></svg></span>`; }
  elColor(element) { return hex(NGN.ELEMENT_COLOR[element]); }

  // ---------- 메인 메뉴 ----------
  showMenu(meta) {
    this.meta = meta || this.meta;
    this.hideAll(); $('menu').hidden = false;
    const m = this.meta;
    $('menuTickets').innerHTML = `${SVG.ticket}<span class="num">${m.state.tickets}</span>`;
    // 별은 난이도별로 따로(금·붉은). 상단 알약엔 둘의 합 / 120
    $('menuStars').innerHTML = `${m.diffList().map((d) => NGN.starOf(d)).join('')}<span class="num gold">${m.totalStars()}/${m.maxStars()}</span>`;
    const b = m.state.best;
    $('menuBest').innerHTML = `${SVG.trophy}<span class="num">${b ? '무한 ' + b.wave : '무한 —'}</span>`;
    $('menuGachaDot').hidden = m.state.tickets < 1;
    const next = m.nextStage();
    $('menuPlay').innerHTML = next ? `<span>${SVG.play} 스테이지 ${next.id}</span><span class="sub">${esc(next.name)}</span>` : `<span>${SVG.play} 월드맵</span><span class="sub">모두 클리어</span>`;
    const inf = m.infiniteUnlocked();
    $('menuInfinite').classList.toggle('locked', !inf);
    $('menuInfinite').innerHTML = inf ? `<span>${SVG.infinity} 무한 모드</span><span class="sub">끝없이 — 지도별 기록</span>` : `<span>${SVG.lock} 무한 모드</span><span class="sub">스테이지 ${this.data.stages.infiniteUnlockStage}을 깨면 열립니다</span>`;
    // 오늘의 판(I-9): 서버 시각이 있으면 그것, 없으면 폰 시계(작게 표시). 잠그지 않는다
    const dk = this.cb.dailyClock ? this.cb.dailyClock() : null;
    const done = dk && m.dailyPlayed(dk.date);
    $('menuDaily').classList.toggle('locked', !dk);
    const clockNote = dk && dk.src === 'p' ? ' · <span class="clock">폰 날짜로 판단하는 중</span>' : '';
    $('menuDaily').innerHTML = dk ? `<span>${SVG.calendar} 오늘의 판 · ${esc(dk.label)}</span><span class="sub">${done ? (m.dailyResult(dk.date).done ? `오늘은 했어요 — 웨이브 ${m.dailyResult(dk.date).wave}` : '오늘 판은 시작했다가 끊겼어요 — 내일 새 판') : '매일 새 지도 · 강화 없이 같은 조건 · 하루 한 번'}${clockNote}</span>` : `<span>${SVG.lock} 오늘의 판</span><span class="sub">준비 중</span>`;
    this.a2hsBanner();
    this.cb.onMenu(true);
  }
  // 저장 지킴이(I-12): 아이폰 사파리는 7일 안 들어오면 저장을 통째로 지운다. 홈 화면에 추가한 웹앱은 면제(애플 공식). 홈 화면 앱이 아니면 첫 화면에 안내
  isStandalone() { return (navigator.standalone === true) || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); }
  a2hsBanner() {
    const s = this.meta.state.settings;
    const show = !this.isStandalone() && !s.a2hsDismissed && location.protocol !== 'file:';
    $('a2hs').hidden = !show;
  }
  a2hsHelp() {
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
    const m = $('codeModal'); m.hidden = false;
    m.innerHTML = `<div class="panel modal"><h3>홈 화면에 추가하면 기록이 안 지워져요</h3><p class="note">${ios
      ? '아이폰 사파리는 <b>7일 동안 안 들어온 사이트의 저장을 통째로 지웁니다.</b> 별·기록·티켓이 전부 날아가요.<br>홈 화면에 추가한 앱은 이 규칙에서 빠집니다.<br><br><b>방법</b>: 아래 <b>공유</b> 버튼(네모에 화살표) → <b>홈 화면에 추가</b> → 추가.<br>그 뒤로는 홈 화면의 아이콘으로 들어오세요.'
      : '홈 화면에 추가하면 앱처럼 열리고 저장이 오래 남습니다.<br><br><b>방법</b>: 브라우저 메뉴(⋮) → <b>홈 화면에 추가</b>(또는 앱 설치).<br><br>아이폰이라면 사파리 <b>공유</b> 버튼 → <b>홈 화면에 추가</b>.'}<br><br>혹시 모르니 설정의 <b>저장 코드 내보내기</b>로 기록을 따로 적어 두세요.</p><div class="row"><button class="btn gray" id="codeClose">닫기</button></div></div>`;
    $('codeClose').addEventListener('click', () => { m.hidden = true; });
  }

  // ---------- 월드맵: 길 위의 점 20개 ----------
  showWorld() {
    this.hideAll(); $('worldScreen').hidden = false;
    const m = this.meta;
    $('worldStars').innerHTML = m.diffList().map((d) => `${NGN.starOf(d)}<span class="num ${d === 'hard' ? 'red' : 'gold'}">${m.totalStars(d)}</span>`).join('');
    const free = m.freeStars();
    $('worldUpgrade').innerHTML = `${SVG.star()} 강화${free ? ` <span class="num">${free}</span>` : ''}`;
    this.buildWorld();
    this.cb.onMenu(true);
  }
  // 점 i(0부터)의 위치. 세로로 내려가며 좌우로 굽이친다(viewBox 360×1900)
  nodePos(i) { return { x: 180 + Math.sin(i * 1.05) * 105, y: 90 + i * 92 }; }
  buildWorld() {
    const host = $('world'); host.innerHTML = '';
    const stages = this.meta.stageList(); const next = this.meta.nextStage();
    const pts = stages.map((_, i) => this.nodePos(i));
    // 길: 점들을 잇는 부드러운 곡선(위 → 아래). 밑에 넓은 흙길, 위에 점선
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; const my = (a.y + b.y) / 2; d += ` C${a.x},${my} ${b.x},${my} ${b.x},${b.y}`; }
    const bands = [['#5E9E42', 0], ['#8FBF6A', 0.18], ['#E9F1F6', 0.24], ['#E0C287', 0.30], ['#5E9E42', 0.36], ['#3B5E3A', 0.48], ['#2F3A48', 0.62], ['#4A3038', 0.80], ['#8A2E10', 1]];
    host.innerHTML = `<svg class="road" viewBox="0 0 360 1900" preserveAspectRatio="none">
      <defs><linearGradient id="worldBg" x1="0" y1="0" x2="0" y2="1">${bands.map(([c, o]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient></defs>
      <rect x="0" y="0" width="360" height="1900" fill="url(#worldBg)" opacity=".55"/>
      <path d="${d}" fill="none" stroke="#7E5F35" stroke-width="30" stroke-linecap="round" opacity=".9"/>
      <path d="${d}" fill="none" stroke="#C49A63" stroke-width="20" stroke-linecap="round"/>
      <path d="${d}" fill="none" stroke="#FFF7E6" stroke-width="3" stroke-dasharray="8 12" stroke-linecap="round" opacity=".8"/>
    </svg>`;
    let focus = null;
    const diffs = this.meta.diffList();
    stages.forEach((s, i) => {
      const p = pts[i]; const cleared = this.meta.clearedAny(s.id);
      const state = cleared ? 'cleared' : (next && next.id === s.id) ? 'next' : 'locked';
      const b = document.createElement('button'); b.className = `node ${state}`; b.dataset.id = s.id;
      b.style.left = (p.x / 360 * 100) + '%'; b.style.top = (p.y / 1900 * 100) + '%';
      const circ = state === 'locked' ? SVG.lock : state === 'next' ? SVG.play : String(s.id);
      // 별은 난이도별로 세 줄(은·금·붉은) — 세 종류가 다 보여야 어려움을 할 이유가 생긴다(I-3)
      const stars = diffs.map((d) => `<span class="srow">${NGN.starsRow(d, this.meta.starsFor(s.id, d))}</span>`).join('');
      b.innerHTML = `<span class="circ">${circ}</span><span class="stars3">${stars}</span><span class="nm">${s.id}. ${esc(s.name)}</span>`;
      if (state === 'locked') { b.disabled = true; b.addEventListener('click', () => this.toast('앞 스테이지를 먼저 깨세요')); }
      else b.addEventListener('click', () => this.showDiffPick(s));
      host.appendChild(b);
      if (state === 'next' || (!next && i === stages.length - 1)) focus = b;
    });
    // 다음 스테이지가 화면 가운데 오게
    if (focus) requestAnimationFrame(() => focus.scrollIntoView({ block: 'center' }));
  }
  // 난이도 고르기(I-3): 보통 ×1 금별 · 어려움 ×2 붉은별(쉬움은 2026-09-06 폐지). 어려움은 그 스테이지를 보통으로 깨야 열린다
  showDiffPick(stage) {
    const m = this.meta;
    $('diffTitle').innerHTML = `<b>스테이지 ${stage.id}</b> ${esc(stage.name)} <span class="sub">${stage.waves}웨이브 · 생명 ${stage.lives}</span>`;
    const host = $('diffList'); host.innerHTML = '';
    for (const d of m.diffList()) {
      const D = m.diff(d), open = m.isDiffOpen(stage.id, d), got = m.starsFor(stage.id, d);
      const b = document.createElement('button'); b.className = `diffbtn ${d} ${open ? '' : 'locked'}`; b.disabled = !open;
      b.innerHTML = `<span class="dname">${open ? '' : SVG.lock + ' '}${esc(D.name)}</span><span class="dsub">적 체력 ×${D.hpMul} · ${esc(D.star)}</span><span class="dstars">${NGN.starsRow(d, got)}</span>${open ? '' : `<span class="dlock">보통으로 깨면 열려요</span>`}`;
      if (open) b.addEventListener('click', () => { $('diffModal').hidden = true; this.cb.onStartStage(stage, d); });
      host.appendChild(b);
    }
    $('diffModal').hidden = false;
  }

  // ---------- 강화 나무 ----------
  showUpgrade() { this.hideAll(); $('upgradeScreen').hidden = false; this.renderTree(); }
  renderTree() {
    const m = this.meta, T = this.data.stages.upgradeTree;
    $('upgradeStars').innerHTML = `${SVG.star()}<span class="num gold">${m.freeStars()}</span><span class="sub" style="color:#6B5A48">/ ${m.totalStars()}</span>`;
    const host = $('tree'); host.innerHTML = '';
    for (const k of m.treeKeys()) {
      const br = T[k], lv = m.treeLevel(k), can = m.canBuy(k);
      const row = document.createElement('div'); row.className = 'panel branch';
      const steps = br.costs.map((c, i) => {
        const cls = i < lv ? 'done' : (i === lv && can) ? 'can' : i === lv ? 'nextstep' : 'far';
        return `<button class="step ${cls}" data-k="${k}" data-i="${i}" ${i === lv && can ? '' : 'disabled'}>${SVG.star(i < lv || cls === 'can')}<span>${c}</span></button>`;
      }).join('');
      const eff = m.treeEffectText(k);
      row.innerHTML = `<div class="top">${SVG.tree[k] || ''}<b>${esc(br.name)}</b><span class="sub" style="color:#6B5A48">${lv}/${br.costs.length}</span><span class="eff">${eff ? `${esc(br.unit)} ${eff}` : `칸마다 ${esc(br.unit)} ${this.perStepText(br.perStep)}`}</span></div><div class="steps">${steps}</div>`;
      host.appendChild(row);
    }
    host.querySelectorAll('.step.can').forEach((b) => b.addEventListener('click', () => {
      if (m.buy(b.dataset.k)) { this.toast(`${T[b.dataset.k].name} 강화! ${T[b.dataset.k].unit} ${m.treeEffectText(b.dataset.k)}`); this.renderTree(); }
    }));
    $('treeReset').disabled = !m.treeSpent();
  }
  perStepText(ps) { return Object.keys(ps).map((k) => (k === 'allDmg' || k === 'rangeMul') ? `+${Math.round(ps[k] * 100)}%` : k === 'baseTier' ? '한 단 위에서 시작' : `+${ps[k]}`).join(' '); }

  // ---------- 무한 모드 지도 선택 ----------
  showMapScreen() { this.hideAll(); $('mapScreen').hidden = false; this.buildMapGrid(); this.cb.onMenu(true); }
  mapList() { const list = [...this.data.maps.list]; for (let s = 1; s <= this.genCount; s++) list.push(this.cb.genMap(s)); return list; }
  buildMapGrid() {
    const grid = $('mapGrid'); grid.innerHTML = '';
    for (const m of this.mapList()) {
      const b = document.createElement('button'); b.className = 'mapCard' + (m.id === this.mapId ? ' sel' : ''); b.dataset.id = m.id;
      const best = this.meta.bestFor(m.id);
      b.innerHTML = `<canvas width="150" height="108"></canvas><div class="nm">${esc(m.name)}</div><div class="rec">${best ? `${SVG.trophy} 웨이브 ${best.wave}` : '기록 없음'} · 굽이 ${m.turns} · 자리 ${m.SLOTS.length}</div>`;
      this.drawMini(b.querySelector('canvas'), m);
      b.addEventListener('click', () => { this.mapId = m.id; this.cb.onPreviewMap(m); grid.querySelectorAll('.mapCard').forEach((c) => c.classList.toggle('sel', c.dataset.id === m.id)); $('mapStart').disabled = false; });
      grid.appendChild(b);
    }
    $('mapStart').disabled = !this.mapId;
  }
  drawMini(cv, m) {
    const ctx = cv.getContext('2d'); const W = cv.width, H = cv.height;
    const T = { grass: ['#9CCB6E', '#B98A55'], snow: ['#E6EEF3', '#B0BEC8'], desert: ['#E3C88C', '#B87A4A'], lava: ['#5A4048', '#E0602A'] }[m.theme] || ['#9CCB6E', '#B98A55'];
    ctx.fillStyle = T[0]; ctx.fillRect(0, 0, W, H);
    const B = m.BOUNDS; const s = Math.min((W - 12) / (B.maxX - B.minX), (H - 12) / (B.maxY - B.minY));
    const ox = (W - (B.maxX - B.minX) * s) / 2, oy = (H - (B.maxY - B.minY) * s) / 2;
    const P = (x, y) => [ox + (x - B.minX) * s, oy + (y - B.minY) * s];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = T[1]; ctx.lineWidth = Math.max(4, 220 * s); ctx.beginPath(); m.GROUND_PATH.forEach(([x, y], i) => { const [a, b] = P(x, y); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke();
    ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); m.AIR_PATH.forEach(([x, y], i) => { const [a, b] = P(x, y); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke(); ctx.setLineDash([]);
    for (const sl of m.SLOTS) { const [a, b] = P(sl.x, sl.y); ctx.fillStyle = '#F3EFE4'; ctx.strokeStyle = '#6B4A2B'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(a, b, Math.max(2.5, 150 * s), 0, 7); ctx.fill(); ctx.stroke(); }
    const [ex, ey] = P(m.GROUND_PATH[0][0], m.GROUND_PATH[0][1]); ctx.fillStyle = '#4FA36B'; ctx.beginPath(); ctx.arc(ex, ey, 4, 0, 7); ctx.fill();
    const last = m.GROUND_PATH[m.GROUND_PATH.length - 1]; const [fx, fy] = P(last[0], last[1]); ctx.fillStyle = '#C94B3D'; ctx.beginPath(); ctx.arc(fx, fy, 4, 0, 7); ctx.fill();
  }
  // ---------- 순위표(records.js) / 설정 ----------
  showRecords(tab) { if (!this.records) this.records = new NGN.RecordsUI(this.meta, this.data, this); this.records.show(tab); this.cb.onMenu(true); }
  showSettings() {
    this.hideAll(); $('settingScreen').hidden = false;
    const s = this.meta.state.settings || {}; const m = this.meta;
    $('settingList').innerHTML = `
      <div class="row"><span class="grow">이름 <span class="sub" style="color:#6B5A48">${m.hasName() ? esc(m.state.name) : '아직 없음'}</span></span><button class="btn blue" data-k="name">바꾸기</button></div>
      <div class="row"><span class="grow">그림자</span><button class="btn ${s.shadows === false ? 'gray' : 'green'}" data-k="shadows">${s.shadows === false ? '꺼짐' : '켜짐'}</button></div>
      <div class="row"><span class="grow">소리</span><button class="btn ${s.sound === false ? 'gray' : 'green'}" data-k="sound">${s.sound === false ? '꺼짐' : '켜짐'}</button></div>
      <div class="row"><span class="grow">진동(뽑기)</span><button class="btn ${s.vibrate === false ? 'gray' : 'green'}" data-k="vibrate">${s.vibrate === false ? '꺼짐' : '켜짐'}</button></div>
      <div class="row"><span class="grow"><b>저장 코드</b><br><span class="sub" style="color:#6B5A48">별·기록·티켓·뽑은 것 전부를 긴 글자 하나로. 폰이 바뀌거나 저장이 지워져도 이걸로 살아나요.</span></span></div>
      <div class="row"><button class="btn green" data-k="export" style="flex:1">내보내기</button><button class="btn blue" data-k="import" style="flex:1">가져오기</button></div>
      <div class="row"><span class="grow">홈 화면에 추가 <span class="sub" style="color:#6B5A48">아이폰은 7일 안 들어오면 저장이 지워져요 — 홈 화면 앱은 안 지워져요</span></span><button class="btn gray" data-k="a2hs">방법</button></div>
      <div class="row"><span class="grow">기록 지우기</span><button class="btn red" data-k="reset">지우기</button></div>
      <div class="row"><span class="grow sub" style="color:#6B5A48">P의 디펜스 · 밸런스는 YouTD 2(MIT), 그래픽은 Kenney(CC0), 압축은 lz-string(MIT)</span></div>`;
    $('settingList').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.onSettingLocal(b.dataset.k)));
  }
  async onSettingLocal(k) {
    const m = this.meta;
    if (k === 'name') { await NGN.askName(m, '순위표와 기록 코드에 실리는 이름이에요. 8자까지.'); this.showSettings(); return; }
    if (k === 'a2hs') { this.a2hsHelp(); return; }
    if (k === 'export') { NGN.showCode('저장 코드', m.exportSave(), '메모장이나 나에게 보내는 톡에 붙여 두세요. 새 폰에서 [가져오기]에 넣으면 그대로 살아나요.', (t) => this.toast(t)); return; }
    if (k === 'import') {
      NGN.askCode('저장 코드 가져오기', '<b>지금 저장을 덮어씁니다.</b> TDSAVE- 로 시작하는 코드를 붙여 넣으세요.', (code) => {
        const r = NGN.Codes.decode('TDSAVE-', code); if (!r.ok) return r;
        if (!confirm('지금 기록을 이 코드의 기록으로 덮어쓸까요?')) return { ok: false, why: '취소했어요' };
        const res = m.importSave(code); if (!res.ok) return res;
        setTimeout(() => location.reload(), 600);
        return { ok: true, msg: `가져왔어요 — 별 ${res.stars} · 판 수 ${res.games}. 다시 불러옵니다…` };
      });
      return;
    }
    this.cb.onSetting(k);
  }

  // ---------- 전투 화면 ----------
  onGameStart(game, mode) {
    this.game = game; this.mode = mode || 'stage'; this.pickFam = null; this.selectedSlot = null; this.previewSlot = null; this.lastGold = null;
    this.hideAll(); $('game').hidden = false; $('nextDetail').hidden = true; $('pop').hidden = true;
    this.setCountdown(null); this.bossBar(null); this.setDanger(false); this.showPause(false); // 지난 판의 잔상(카운트다운·보스 막대·경고·일시정지)을 지운다
    this.cb.onMenu(false);
    this.buildTowerBar(); this.refreshHud(); this.setPreview();
  }
  refreshHud() {
    const g = this.game; if (!g) return;
    $('lives').textContent = Math.max(0, g.lives);
    const gold = Math.floor(g.gold);
    if (this.lastGold !== null && gold > this.lastGold) { const el = $('goldPill'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    this.lastGold = gold;
    $('gold').textContent = fmt(gold);
    // 웨이브 진행 막대(참고: 레이드 러시): 끝낸 웨이브만큼 차고, 진행 중인 웨이브는 잡은 적 비율만큼 조금 더 찬다. 눈금 = 웨이브 하나
    const total = g.waves.length, w = g.wave ? g.wave.def.wave : (g.stats.reachedWave + 1);
    const done = g.stats.reachedWave - (g.wave ? 1 : 0);
    let part = 0;
    if (g.wave) { const left = g.wave.queue.length - g.wave.qi + g.wave.enemies.length; part = g.wave.queue.length ? 1 - left / g.wave.queue.length : 0; }
    $('waveNo').textContent = w <= total ? `${w}/${total}` : `${w}`;
    const bar = $('waveBar');
    bar.querySelector('.fill').style.width = (Math.min(1, (done + part) / total) * 100) + '%';
    bar.querySelector('.ticks').style.setProperty('--seg', (100 / Math.min(total, 30)) + '%');
    $('waveBtn').classList.toggle('running', !!g.wave);
    this.renderWaveBtn();
    // 가방(떨어졌지만 아직 안 끼운 아이템). 끼우는 건 타워 팝업에서
    const bag = $('bagPill'); const n = g.inventory.length;
    bag.hidden = n === 0 && !g.towersBuilt.some((t) => t.items.length);
    bag.innerHTML = `${SVG.bag}<span class="num">${n}</span>`; bag.classList.toggle('has', n > 0);
    this.refreshTowerBar();
    if (this.popInst) this.renderPop();
  }
  // ▶ 버튼: 쉬는 중엔 재생 표시(+ 카운트다운 중이면 「미리 부르기」 보너스 칩 "+N"), 웨이브 중엔 빨리감기 표시 + 배속 칩(1× 는 안 보인다)
  renderWaveBtn() {
    const running = !!(this.game && this.game.wave), n = this.speed || 1;
    const bonus = !running && this.cdSec !== null && this.cdBonus > 0 ? `<span class="bonus">${SVG.coin}+${this.cdBonus}</span>` : '';
    $('waveBtn').innerHTML = (running ? '<svg viewBox="0 0 24 24"><path fill="#fff" d="M4 5v14l8-7zM13 5v14l8-7z"/></svg>' : '<svg viewBox="0 0 24 24"><path fill="#fff" d="M8 5v14l11-7z"/></svg>') + (n > 1 || running ? `<span class="spd">${n}×</span>` : '') + bonus;
    $('waveBtn').title = running ? '배속' : this.cdSec !== null ? '미리 부르기 — 빨리 부를수록 골드 보너스' : '웨이브 시작';
  }
  setSpeedLabel(n) { this.speed = n; this.renderWaveBtn(); }
  // 카운트다운 줄(①·⑥): sec = 남은 초(null 이면 숨김), wv = 다음 웨이브(적 아이콘·보스 칩·성질 칩), bonus = 지금 미리 부르면 받을 골드.
  // 매 프레임 불리니 DOM 은 값이 바뀔 때만 만진다(폰 성능): 웨이브가 바뀌면 아이콘을 다시 그리고, 초·보너스는 숫자만
  setCountdown(sec, wv = null, bonus = 0) {
    const box = $('countdown');
    if (sec === null) { if (this.cdSec !== null) { this.cdSec = null; this.cdWave = null; this.cdBonus = 0; box.hidden = true; this.renderWaveBtn(); } return; }
    const s = Math.max(0, Math.ceil(sec)), first = this.cdSec === null;
    if (first) box.hidden = false;
    if (wv && this.cdWave !== wv) {
      this.cdWave = wv;
      $('cdFoes').innerHTML = this.foeIcons(Object.assign({}, wv, { special: null })) + (wv.kind === 'boss' ? '<span class="spc boss">보스</span>' : '') + (wv.special ? `<span class="spc" style="background:${esc(wv.special.color || '#888')}">${esc(wv.special.이름)}</span>` : '');
    }
    if (s !== this.cdSec) { this.cdSec = s; const el = $('cdSec'); el.textContent = `다음 ${s}초`; el.classList.toggle('soon', s <= 3); }
    if (bonus !== this.cdBonus || first) {
      this.cdBonus = bonus;
      const chip = $('waveBtn').querySelector('.bonus');
      if (chip && bonus > 0) chip.innerHTML = `${SVG.coin}+${bonus}`; else this.renderWaveBtn();
    }
  }
  // 보스 체력 막대(③): boss = 엔진의 적(e.hp·e.maxHp), null 이면 숨김. 폭·% 는 바뀔 때만 갱신, 깎이면 흰 번쩍
  bossBar(boss) {
    const bar = $('bossBar');
    if (!boss) { if (this.bossPct !== null) { this.bossPct = null; bar.hidden = true; } return; }
    const pct = Math.max(0, Math.min(100, Math.ceil(boss.hp / (boss.maxHp || boss.hp || 1) * 100)));
    if (this.bossPct === null) bar.hidden = false;
    else if (pct === this.bossPct) return;
    else if (pct < this.bossPct) { bar.classList.remove('flash'); void bar.offsetWidth; bar.classList.add('flash'); }
    this.bossPct = pct;
    bar.querySelector('.fill').style.width = pct + '%';
    $('bossPct').textContent = pct + '%';
  }
  // 성이 맞았을 때(④): 생명 알약이 크게 튀며 붉게 + "−N" 플로터, 화면 가장자리 붉은 번쩍
  livesHit(n = 1) { if (navigator.vibrate && this.meta && this.meta.state.settings.vibrate !== false) { try { navigator.vibrate(70); } catch (e) {} } // 성이 맞으면 폰이 살짝 떤다(설정의 진동을 따른다)
    const p = $('lifePill'); p.classList.remove('hit'); void p.offsetWidth; p.classList.add('hit');
    const f = document.createElement('span'); f.className = 'lf'; f.textContent = `−${n}`; p.appendChild(f); setTimeout(() => f.remove(), 900);
    const d = $('dmgFlash'); d.classList.remove('on'); void d.offsetWidth; d.classList.add('on');
  }
  // 경고 비네트(④): 적이 출구 가까이 오면 렌더러가 켠다(renderer.onDanger)
  setDanger(on) { $('danger').hidden = !on; }
  // 일시정지 오버레이(②)
  showPause(on) { $('pauseOverlay').hidden = !on; }
  // 다음 웨이브: 상시 예고 줄은 없다(화면을 가려서 뺌). 막대를 누르면 펼쳐지는 자세히(nextDetail)와 카드의 상성 표시만 갱신한다
  setPreview() {
    const g = this.game; const wv = g.waveAt(g.stats.reachedWave + 1);
    const d = $('nextDetail');
    if (!wv) { d.hidden = true; return; }
    if (!d.hidden) {
      const rows = g.deck.map((f) => { const t = g.byFamily[f][0]; const m = this.mul(t.attackType, wv.defense); if (m === null || m === 1) return ''; return `<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${this.elColor(t.element)}"></span> ${esc(t.familyName)} <b style="color:${m > 1 ? '#2E7D32' : '#9E2B22'}">×${m}</b></span>`; }).filter(Boolean);
      const spMul = wv.special ? wv.special.hpMul : 1;
      d.innerHTML = `<span><b>${wv.wave > g.waves.length ? '∞ ' : ''}다음 웨이브 ${wv.wave}</b> · ${this.foeIcons(wv)}</span>`
        + `<span>${esc(wv.kindKo)} ×${wv.enemies.reduce((a, e) => a + e.count, 0)} · 체력 ${wv.enemies.map((e) => fmt(Math.round(e.hp * g.hpMul * spMul))).join('/')} · ${SVG.shield(hex(NGN.DEFENSE_COLOR[wv.defense]))} ${NGN.DEFENSE_KO[wv.defense]} 방어</span>`
        + (wv.special ? `<span><b style="color:${esc(wv.special.color || '#888')}">${esc(wv.special.이름)}</b> — ${esc(wv.special._설명 || '')}</span>` : '')
        + (rows.length ? rows.join('') : '<span style="color:#6B5A48">상성 없음 — 전부 ×1</span>');
    }
    this.refreshTowerBar();
  }
  foeIcons(wv) {
    const icons = wv.enemies.map((e) => { const n = Math.min(e.count, 6); return SVG.foe[e.kind].repeat(n) + (e.count > n ? `<span class="more">+${e.count - n}</span>` : ''); }).join('');
    return `<span class="foes">${icons}${SVG.shield(hex(NGN.DEFENSE_COLOR[wv.defense]))}${wv.special ? `<span class="spc" style="background:${esc(wv.special.color || '#888')}">${esc(wv.special.이름)}</span>` : ''}</span>`;
  }
  // 카드 바: 연 계열 전부(1단 카드만 — 승급은 지어진 타워를 눌러서). 카드 = 타워 3D 그림(한 번 찍어 둔 것) + 값. 이름은 고른 카드 위에 뜬다.
  // 길게 누르거나(0.45초) 위로 밀면 상세가 열린다(사장님: "타워 모델링 및 설명이 있고 선택해야")
  buildTowerBar() {
    const bar = $('towerBar'); bar.innerHTML = '';
    for (const f of this.game.deck) {
      const t = this.game.byFamily[f][0];
      const b = document.createElement('button'); b.className = 'tcard'; b.dataset.fam = f; b.style.background = this.elColor(t.element);
      // 값은 늘 1단 값(costToBuild). 기본기가 있으면 실제로는 더 높은 단이 지어진다 — 카드에 "2단" 표시, 그림도 그 단으로
      const bd = this.game.buildDef(f);
      const img = this.cb.towerImage ? this.cb.towerImage(bd) : null;
      b.innerHTML = `<span class="art">${img ? `<img src="${img}" alt="">` : SVG.role[t.role]}</span><span class="nm">${esc(t.familyName)}</span><span class="pr">${SVG.coin}${this.game.costToBuild(f)}</span>${bd.tier > 1 ? `<span class="bt">${bd.tier}단</span>` : ''}<span class="affslot"></span>`;
      this.bindCard(b, f);
      bar.appendChild(b);
    }
    bar.scrollLeft = 0;
    this.refreshTowerBar();
  }
  bindCard(b, fam) {
    let down = null, timer = null, opened = false;
    const open = () => { opened = true; clearTimeout(timer); this.showTowerDetail(fam); };
    b.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; opened = false; clearTimeout(timer); timer = setTimeout(open, 450); });
    b.addEventListener('pointermove', (e) => { if (!down || opened) return; const dx = e.clientX - down.x, dy = e.clientY - down.y; if (dy < -28 && Math.abs(dx) < 40) open(); else if (Math.abs(dx) > 14) { clearTimeout(timer); down = null; } });
    const end = () => { clearTimeout(timer); down = null; };
    b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end); b.addEventListener('pointerleave', end);
    b.addEventListener('click', () => { if (opened) { opened = false; return; } this.pickTower(fam); });
  }
  refreshTowerBar() {
    const g = this.game; const wv = g.wave ? g.wave.def : g.waveAt(g.stats.reachedWave + 1); const def = wv ? wv.defense : 'ZOD';
    for (const b of $('towerBar').children) {
      const t = g.byFamily[b.dataset.fam][0];
      b.classList.toggle('poor', g.gold < g.costToBuild(b.dataset.fam)); b.classList.toggle('sel', this.pickFam === b.dataset.fam);
      b.querySelector('.affslot').innerHTML = this.affBadge(t.attackType, def);
    }
  }
  pickTower(fam) {
    const g = this.game;
    if (this.pickFam === fam) { this.pickFam = null; this.refreshTowerBar(); this.clearPreview(); this.cb.onPick(null); return; }
    this.pickFam = fam; this.refreshTowerBar();
    const t = g.buildDef(fam), cost = g.costToBuild(fam);
    if (this.selectedSlot !== null && !g.slots[this.selectedSlot]) { this.showBuildPreview(this.selectedSlot); return; }
    this.cb.onPick(fam);
    this.toast(g.gold >= cost ? `${t.name} — 자리를 누르면 미리 보인다` : `${t.name} — ${cost}골드 필요`);
  }
  selectSlot(slotId) {
    const g = this.game; const inst = g.slots[slotId];
    if (inst) { this.previewSlot = null; this.selectedSlot = slotId; this.pickFam = null; this.refreshTowerBar(); this.showPop(inst); this.cb.onSelect(slotId, inst, g.effectiveStats(inst).range); return; }
    this.hidePop();
    if (this.pickFam) {
      if (this.previewSlot === slotId) { this.cb.onBuild(slotId, this.pickFam); return; } // 같은 자리를 한 번 더 누르면 짓는다
      this.selectedSlot = slotId; this.showBuildPreview(slotId); return;
    }
    this.previewSlot = null; this.selectedSlot = slotId; this.cb.onSelect(slotId, null, 0); this.toast('아래에서 타워를 고르세요');
  }
  // 자리 미리보기: 그 자리에 지었을 때의 사거리 원판 + 반투명 모형 + [짓기]. 한 번 더 누르거나 [짓기]를 누르면 짓는다
  showBuildPreview(slotId) {
    const g = this.game, fam = this.pickFam; if (!fam) return;
    const t = g.buildDef(fam), cost = g.costToBuild(fam);
    this.previewSlot = slotId; this.popInst = null;
    this.cb.onPreview(slotId, t);
    const pop = $('pop'); pop.hidden = false;
    pop.innerHTML = `<div class="panel title"><b>${esc(t.name)}</b> <span style="color:#6B5A48">사거리 ${Math.round(t.range)}</span></div>
      <div class="row"><button class="btn green build" id="buildBtn" ${g.gold >= cost ? '' : 'disabled'}>짓기<small>${SVG.coin} ${cost}</small></button><button class="btn gray" id="buildCancel">취소</button></div>`;
    $('buildBtn').addEventListener('click', () => this.cb.onBuild(slotId, fam));
    $('buildCancel').addEventListener('click', () => { this.clearPreview(); this.pickFam = null; this.refreshTowerBar(); this.cb.onPick(null); });
  }
  clearPreview() { if (this.previewSlot === null) return; this.previewSlot = null; this.selectedSlot = null; $('pop').hidden = true; this.cb.onSelect(null, null, 0); }
  popSlot() { if (this.popInst) return this.popInst.slot; if (this.previewSlot !== null) return NGN.map.SLOTS[this.previewSlot]; return null; }
  clearSelection() { this.selectedSlot = null; this.previewSlot = null; this.hidePop(); this.cb.onSelect(null, null, 0); }
  afterBuild() { this.selectedSlot = null; this.previewSlot = null; $('pop').hidden = true; this.refreshHud(); this.cb.onSelect(null, null, 0); if (this.pickFam && this.game.gold < this.game.costToBuild(this.pickFam)) { this.pickFam = null; this.refreshTowerBar(); this.cb.onPick(null); } }
  // 카드 상세: 돌아가는 3D 모형 + 속성·역할 + 한 줄 설명 + 3단 카드(그림·피해·사거리·주기·값) + 승급하면 어떻게 되는지 + 3단 갈래
  showTowerDetail(fam) {
    const g = this.game, tiers = g.byFamily[fam], t1 = tiers[0], bd = g.buildDef(fam);
    const m = $('codeModal'); m.hidden = false;
    const statLine = (t) => t.attackType ? `${Math.round(t.dmgMin)}~${Math.round(t.dmgMax)} 피해<span class="st">${t.attackCd}초마다 · 사거리 ${t.range}</span>` : `주변 타워 +${Math.round(t.aura.damageBonus * 100)}%<span class="st">범위 ${t.aura.range}</span>`;
    const roleTxt = `${this.data.roleKo[t1.role] || t1.role}${t1.attackType ? ' · ' + NGN.ATTACK_KO[t1.attackType] : ''}`;
    const B = g.branchKeys().map((k) => g.branchDef(k));
    m.innerHTML = `<div class="panel modal tdetail">
      <div class="head"><b>${esc(t1.familyName)}</b><div class="tags"><span class="spc" style="background:${this.elColor(t1.element)}">${esc(t1.elementKo)}</span><span class="spc" style="background:#5C666D">${esc(roleTxt)}</span></div></div>
      <div class="view" id="tdView"></div>
      <p class="desc">${esc(t1.desc || '')}</p>
      <div class="tiers">${tiers.map((t) => { const img = this.cb.towerImage ? this.cb.towerImage(t) : null; return `<div class="tier" style="background:${this.elColor(t.element)}"><span class="lv">${t.tier}단</span>${img ? `<img src="${img}" alt="">` : ''}<b>${esc(t.name)}</b><br>${statLine(t)}<span class="st">${SVG.coin} ${t.tier === 1 ? g.costToBuild(fam) : t.cost}</span></div>`; }).join('')}</div>
      <p class="up">${esc(t1.upgradeDesc || '')}${bd.tier > 1 ? ` <b>기본기로 ${bd.tier}단부터 지어진다.</b>` : ''}</p>
      ${t1.aura || !B.length ? '' : `<div class="branches">${B.map((b) => `<span style="background:${esc(b.color)}"><b>3단 ${esc(b.name)}</b><br>${esc(b.설명)}</span>`).join('')}</div>`}
      <div class="row"><button class="btn green" id="tdPick">이 타워 고르기</button><button class="btn gray" id="codeClose">닫기</button></div></div>`;
    if (this.cb.onDetailOpen) this.cb.onDetailOpen($('tdView'), bd);
    const close = () => { m.hidden = true; if (this.cb.onDetailClose) this.cb.onDetailClose(); };
    $('codeClose').addEventListener('click', close);
    $('tdPick').addEventListener('click', () => { close(); if (this.pickFam !== fam) this.pickTower(fam); });
  }
  showPop(inst) { this.popInst = inst; this.popDetail = false; this.popBag = false; $('pop').hidden = false; this.renderPop(); }
  hidePop() { this.popInst = null; this.popBag = false; $('pop').hidden = true; }
  gradeClass(item) { return 'g-' + (item.등급 || 'common'); }
  // 아이템 칸(타워당 3칸): 찬 칸은 이름(누르면 뺀다), 빈 칸은 + (누르면 가방이 열린다). 오라 타워는 칸이 없다
  itemSlotsHtml(inst) {
    const g = this.game, n = g.itemSlots(); if (!n || inst.def.aura) return '';
    if (!g.inventory.length && !inst.items.length) return ''; // 아이템이 하나도 없으면 빈 칸을 안 보여준다(팝업이 타워를 가린다)
    const cells = [];
    for (let i = 0; i < n; i++) {
      const it = inst.items[i];
      cells.push(it ? `<button class="islot on ${this.gradeClass(it)}" data-uid="${it.uid}" title="${esc(it.설명)}">${esc(it.이름)}<small>${esc(it.설명)}</small></button>`
        : `<button class="islot empty" data-i="${i}">+${g.inventory.length && i === inst.items.length ? `<small>가방 ${g.inventory.length}</small>` : ''}</button>`);
    }
    return `<div class="panel islots">${cells.join('')}</div>`;
  }
  bagHtml() {
    const g = this.game;
    if (!g.inventory.length) return '<div class="panel bag"><span style="color:#6B5A48">가방이 비었다 — 적을 잡으면 떨어진다</span></div>';
    return `<div class="panel bag"><b style="font-size:12px;width:100%">끼울 아이템을 고르세요</b>${g.inventory.map((it) => `<button class="islot on ${this.gradeClass(it)}" data-bag="${it.uid}">${esc(it.이름)}<small>${esc(it.설명)}</small></button>`).join('')}<button class="islot" data-bagclose="1">닫기</button></div>`;
  }
  renderPop() {
    const g = this.game, inst = this.popInst; if (!inst || g.slots[inst.slotId] !== inst) { this.hidePop(); return; }
    const s = g.effectiveStats(inst), d = inst.def;
    const next = g.byFamily[d.family][d.tier], upCost = g.costToUpgrade(inst), refund = g.refundFor(inst);
    const wv = g.wave ? g.wave.def : g.waveAt(g.stats.reachedWave + 1); const m = wv && s.attackType ? this.mul(s.attackType, wv.defense) : null;
    const affTxt = m === null || m === 1 ? '' : ` · 다음 웨이브 <b style="color:${m > 1 ? '#2E7D32' : '#9E2B22'}">×${m}</b>`;
    const lvl = d.aura || (s.expToNext === null && s.expForThis === 0) ? '' : (() => { const max = s.expToNext === null; const pct = max ? 100 : Math.round((s.exp - s.expForThis) / (s.expToNext - s.expForThis) * 100); return `<div class="lvl"><b>Lv.${s.level}</b><span class="xp"><span style="width:${pct}%"></span></span><span>${max ? '최고' : `${Math.floor(s.exp)}/${s.expToNext}`}</span></div>`; })();
    const B = g.branchDef(inst.branch);
    const branchChip = B ? ` <span class="spc" style="background:${esc(B.color)}">${esc(B.name)}</span>` : '';
    // 승급 버튼: 3단으로 올릴 때(오라 제외)는 갈래 둘을 보여준다(checklist I-7). 3단부터 지어진 타워는 무료로 갈래를 고른다
    const branches = g.branchKeys();
    let actions;
    if (inst.branchPending) actions = branches.map((k) => { const b = g.branchDef(k); return `<button class="btn brn" data-branch="${k}" style="background:${esc(b.color)};border-color:rgba(0,0,0,.35);--sh:rgba(0,0,0,.35)">${esc(b.name)} 고르기<small>${esc(b.설명)}</small></button>`; }).join('');
    else if (next && next.tier >= 3 && !next.aura && branches.length) actions = branches.map((k) => { const b = g.branchDef(k); return `<button class="btn brn up" data-branch="${k}" ${g.gold >= upCost ? '' : 'disabled'} style="background:${esc(b.color)};border-color:rgba(0,0,0,.35);--sh:rgba(0,0,0,.35)">${SVG.up} ${esc(b.name)}<small>${esc(b.설명)}</small><small>${upCost}골드</small></button>`; }).join('');
    else if (next) actions = `<button class="btn green up" ${g.gold >= upCost ? '' : 'disabled'}>${SVG.up} 승급<small>${upCost}</small></button>`;
    else actions = '<button class="btn gray" disabled>최고 단계</button>';
    $('pop').innerHTML = `
      <div class="panel title"><b>${esc(d.name)}</b> <span style="color:#6B5A48">${d.tier}단</span>${branchChip}${s.attackType ? ` · 초당 <b>${Math.round(s.dps)}</b>` : ''}${affTxt}${lvl}</div>
      ${this.popDetail ? `<div class="panel detail">${this.detailText(inst, s)}</div>` : ''}
      ${this.popBag ? this.bagHtml() : this.itemSlotsHtml(inst)}
      <div class="row">
        ${actions}
        <button class="btn red sell">${SVG.sell} 팔기<small>+${refund}</small></button>
        <button class="btn gray more">${SVG.info}</button>
      </div>`;
    const pop = $('pop');
    pop.querySelectorAll('.up').forEach((b) => b.addEventListener('click', () => this.cb.onUpgrade(inst, b.dataset.branch || null)));
    if (inst.branchPending) pop.querySelectorAll('.brn').forEach((b) => b.addEventListener('click', () => this.cb.onChooseBranch(inst, b.dataset.branch)));
    pop.querySelector('.sell').addEventListener('click', () => this.cb.onSell(inst));
    pop.querySelector('.more').addEventListener('click', () => { this.popDetail = !this.popDetail; this.renderPop(); });
    pop.querySelectorAll('.islot.empty').forEach((b) => b.addEventListener('click', () => { if (!g.inventory.length) { this.toast('가방이 비었다 — 적을 잡으면 떨어진다'); return; } this.popBag = true; this.renderPop(); }));
    pop.querySelectorAll('.islot[data-uid]').forEach((b) => b.addEventListener('click', () => this.cb.onUnequip(inst, Number(b.dataset.uid))));
    pop.querySelectorAll('.islot[data-bag]').forEach((b) => b.addEventListener('click', () => { this.popBag = false; this.cb.onEquip(inst, Number(b.dataset.bag)); }));
    pop.querySelectorAll('.islot[data-bagclose]').forEach((b) => b.addEventListener('click', () => { this.popBag = false; this.renderPop(); }));
  }
  // 팝은 타워 아래쪽에(위에 띄우면 타워와 사거리 원판을 가린다). 화면 아래 40% 에 있는 타워는 카드 줄과 겹치니 위에 띄운다
  placePop(x, y, yBase) {
    const p = $('pop'); if (p.hidden) return;
    const below = (yBase === undefined ? y : yBase) < innerHeight * 0.6;
    p.classList.toggle('below', below);
    p.style.left = Math.max(150, Math.min(innerWidth - 150, x)) + 'px';
    p.style.top = (below ? (yBase === undefined ? y : yBase) + 14 : Math.max(70, y)) + 'px';
  }
  detailText(inst, s) {
    const d = inst.def;
    return [
      s.attackType ? `${NGN.ATTACK_KO[s.attackType]} 공격 · 피해 ${Math.round(s.dmgMin)}~${Math.round(s.dmgMax)} · ${s.attackCd.toFixed(2)}초마다 · 사거리 ${Math.round(s.range)}` : `사거리 ${Math.round(s.range)}`,
      s.splash ? `광역 ${s.splash.radius} (${Math.round(s.splash.ratio * 100)}%)` : '', s.bounce ? `튕김 ${s.bounce.count}회` : '', s.multishot > 1 ? `연사 ${s.multishot}발` : '',
      s.slow ? `감속 ${Math.round(s.slow.ratio * 100)}%` : '', s.aura ? `주변 타워 공격력 +${Math.round(s.aura.damageBonus * 100)}%` : '',
      inst.auraBonus ? `오라 받음 +${Math.round(inst.auraBonus * 100)}%` : '', s.levelMul > 1 ? `레벨 피해 ×${s.levelMul.toFixed(2)}` : '', s.aspdMul > 1 ? `공격속도 ×${s.aspdMul.toFixed(2)}` : '', s.perkMul > 1 ? `강화·뽑기 ×${s.perkMul.toFixed(2)}` : '',
      s.itemMul > 1 ? `아이템 피해 ×${s.itemMul.toFixed(2)}` : '', s.dmgToBoss ? `보스 +${Math.round(s.dmgToBoss * 100)}%` : '', s.dmgToAir ? `공중 +${Math.round(s.dmgToAir * 100)}%` : '', s.expMul ? `경험치 +${Math.round(s.expMul * 100)}%` : '', s.goldMul ? `골드 +${Math.round(s.goldMul * 100)}%` : '',
      s.branch ? `${this.game.branchDef(s.branch).name} 갈래 — ${this.game.branchDef(s.branch).설명}` : '',
      `낸 피해 ${fmt(inst.dmgDone)}`, `${NGN.ELEMENT_KO[d.element]} 속성`,
    ].filter(Boolean).join(' · ');
  }
  // 안내 화살표. 글이 비면 화살표만(카드·▶ 위에서는 말풍선이 아래쪽 UI 를 한 줄 더 먹어서 글은 토스트로 준다)
  hint(x, y, text) { const h = $('hint'); if (x === null) { h.hidden = true; return; } h.hidden = false; h.style.left = x + 'px'; h.style.top = y + 'px'; const t = h.querySelector('.txt'); t.textContent = text; t.hidden = !text; }
  // 웨이브 시작 배너. 상시 예고 줄을 뺀 대신 여기에 적 아이콘·방어 방패를 함께 보여준다. 적 성질이 붙은 웨이브면 그 이름을 색 칩으로(checklist I-8)
  // cls: 'boss'(보스 등장 — 더 크고 붉은, 2초) · 'gold'(보스 처치 — 금색) · 'small'(웨이브 클리어 — 28px). sub = 둘째 줄(클리어 보너스 골드 등), subCls = 'leak' 면 붉게
  banner(text, special = null, wv = null, cls = '', sub = '', subCls = '') {
    const old = document.getElementById('banner'); if (old) old.remove(); // 겹치면(클리어 직후 보스 등장 등) 앞 것을 치운다
    const b = document.createElement('div'); b.id = 'banner'; if (cls) b.className = cls;
    b.innerHTML = esc(text) + (sub ? `<div class="sub ${subCls}">${sub}</div>` : '') + (wv ? `<div>${this.foeIcons(Object.assign({}, wv, { special: null }))}</div>` : '') + (special ? `<div class="spcline"><span class="spc big" style="background:${esc(special.color || '#888')}">${esc(special.이름)}</span></div>` : '');
    document.body.appendChild(b); setTimeout(() => b.remove(), cls === 'boss' ? 2100 : 1700);
  }
  toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(this._tt); this._tt = setTimeout(() => { t.hidden = true; }, 1500); }

  // ---------- 결과 화면 ----------
  ticketHtml(tickets) {
    return tickets && tickets.lines.length
      ? `<br><b style="color:#B8860B">${SVG.ticket} 뽑기 티켓 +${tickets.lines.reduce((a, l) => a + l.n, 0)}장</b><br>` + tickets.lines.map((l) => `· ${esc(l.why)} +${l.n}`).join('<br>') + `<br><span style="color:#6B5A48">가진 티켓 ${tickets.total}장</span>`
      : '';
  }
  showBtns(ids) { for (const b of $('endBtns').children) b.hidden = !ids.includes(b.id); }
  // 결과 화면의 [기록 코드] — 이 판의 기록(종목 최고가 아니면 최고 기록)을 코드로. 이름이 없으면 먼저 묻는다(I-10 ②)
  setEndCode(rec) { this.endRec = rec ? (rec.notBest ? rec.best : rec) : null; $('endCode').hidden = !this.endRec; }
  async showEndCode() {
    if (!this.endRec) return;
    if (!this.meta.hasName()) { const n = await NGN.askName(this.meta, '기록 코드에 실릴 이름이에요. 8자까지. 설정에서 바꿀 수 있어요.'); if (!n) return; }
    NGN.showCode('내 기록 코드', this.meta.recordCode(this.endRec), '길게 눌러 복사해 단톡방에 올리세요. 친구가 [순위표 → 친구 코드 넣기]에 붙이면 그 친구 순위표에 내가 나란히 떠요.', (t) => this.toast(t));
  }
  // 스테이지 결과: 별이 하나씩 튀어나온다(난이도 색). 신기록·티켓·해금. [다음 스테이지 ▶] / [다시] / [월드맵]
  showStageEnd(stage, diff, result, settle, isLast) {
    this.hideAll(); $('endScreen').hidden = false; $('pop').hidden = true; $('hint').hidden = true;
    const D = this.meta.diff(diff);
    const st = $('endStars'); st.hidden = false;
    st.innerHTML = [1, 2, 3].map((k) => NGN.starOf(diff, true).replace('class="i "', `class="${k <= settle.stars ? 'on' : ''}" style="animation-delay:${0.25 + k * 0.35}s"`)).join('');
    const nextTier = result.cleared ? this.meta.starTiers(stage, result.startLives).find((t) => t.star === settle.stars + 1) : null;
    $('endTitle').textContent = result.cleared ? (isLast ? '모든 스테이지 클리어!' : `스테이지 ${stage.id} 클리어!`) : `스테이지 ${stage.id} — 웨이브 ${result.fellAt}에서 무너졌다`;
    $('endBody').innerHTML = `<b>${esc(stage.name)}</b> · <span class="spc" style="background:${NGN.DIFF_COLOR[diff]};color:#fff;text-shadow:none">${esc(D.name)}</span><br>`
      + (result.cleared ? `남은 생명 ${result.lives}/${result.startLives} · 쓴 골드 ${Math.round(result.spent).toLocaleString()}${settle.stars < 3 && nextTier ? ` <span style="color:#6B5A48">(${nextTier.lives} 이상 남기면 ★${nextTier.star})</span>` : ''}<br>` : `남은 생명 0 · 별 없음<br>`)
      + (settle.gained > 0 ? `<span class="newBest">${settle.newRecord ? '신기록! ' : ''}${NGN.starOf(diff)} +${settle.gained} ${esc(D.star)}</span><br>` : (result.cleared && settle.prevStars >= settle.stars && settle.prevStars > 0 ? `<span style="color:#6B5A48">이미 ${esc(D.star)} ${settle.prevStars}개 — 더 잘 깨면 차액을 받는다</span><br>` : ''))
      + (settle.unlocked ? `<b style="color:#2E7D32">새 타워 계열 해금: ${esc(NGN.FAMILY_NAMES[settle.unlocked])}</b><br>` : '')
      + (result.cleared && diff === 'normal' && settle.prevStars === 0 ? `<b style="color:#9E2B22">이 스테이지의 어려움(붉은별)이 열렸다!</b><br>` : '')
      + (isLast && result.cleared ? `<b style="color:#B8860B">축하합니다! 20개 스테이지를 모두 깼다.</b><br>다른 난이도의 별과 무한 모드가 남아 있어요.<br>` : '')
      + (result.cleared && stage.id === this.data.stages.infiniteUnlockStage && settle.firstClear ? `<b style="color:#1D5FA0">무한 모드가 열렸다!</b><br>` : '');
    $('ticketLines').innerHTML = this.ticketHtml(settle.tickets);
    const hasNext = result.cleared && !isLast;
    this.showBtns([hasNext ? 'endNext' : '', 'endRetry', 'endWorld', (isLast && result.cleared) ? 'endMenu' : ''].filter(Boolean));
    $('endMenu').textContent = '메뉴';
    this.setEndCode(settle.rec);
  }
  // 무한 모드 결과: 웨이브 N, 지도 기록. [뽑기] / [다시] / [메뉴]
  showInfiniteEnd(result, best, tickets, mapName, rec) {
    this.hideAll(); $('endScreen').hidden = false; $('pop').hidden = true; $('hint').hidden = true;
    $('endStars').hidden = true;
    $('ticketLines').innerHTML = this.ticketHtml(tickets);
    $('endTitle').textContent = result.stopped ? `웨이브 ${result.wave}까지 막았다` : `웨이브 ${result.wave}까지 막고, ${result.fellAt}에서 무너졌다`;
    const at30 = result.livesAt30 !== null && result.livesAt30 !== undefined ? `<br>30웨이브 때 — 남은 생명 ${result.livesAt30} · 쓴 골드 ${Math.round(result.spentAt30).toLocaleString()} <span style="color:#6B5A48">(순위표 철벽·알뜰 부문)</span>` : '';
    $('endBody').innerHTML = `<b>${esc(mapName)}</b> · 무한 모드<br>${result.wave > this.game.waves.length ? '30웨이브를 넘어 무한 구간까지 갔다!<br>' : ''}남은 생명 ${result.lives} · 남은 골드 ${Math.floor(result.gold)} · 쓴 골드 ${Math.round(result.spent).toLocaleString()}${at30}<br>${result.newBest ? '<b style="color:#B8860B">새 기록!</b> ' : ''}이 지도 최고: 웨이브 ${best.wave}`;
    this.showBtns([tickets && tickets.total > 0 ? 'endGacha' : '', 'endRetry', 'endMenu'].filter(Boolean));
    this.setEndCode(rec);
  }
  // 오늘의 판 결과(I-9): 하루 한 번이라 [다시] 없음. [순위표] / [메뉴]
  showDailyEnd(dk, result, settle) {
    this.hideAll(); $('endScreen').hidden = false; $('pop').hidden = true; $('hint').hidden = true;
    $('endStars').hidden = true;
    $('ticketLines').innerHTML = this.ticketHtml(settle);
    $('endTitle').textContent = result.cleared ? `오늘의 판 클리어!` : `오늘의 판 — 웨이브 ${result.wave}까지 막았다`;
    $('endBody').innerHTML = `<b>${esc(dk.label)}</b> · 강화 없이 같은 조건<br>${result.cleared ? `남은 생명 ${result.lives} · 쓴 골드 ${Math.round(result.spent).toLocaleString()}` : `웨이브 ${result.fellAt}에서 무너졌다`}<br><span style="color:#6B5A48">내일 새 판이 열려요. 기록 코드를 단톡방에 올려 겨루세요.</span>`;
    this.showBtns(['endRecords', 'endMenu']);
    this.setEndCode(settle.rec);
  }
};
