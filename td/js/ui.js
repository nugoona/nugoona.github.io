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
// 로비(checklist J-11 ②, 2026-09-06 사장님 "인게임 들어가기 전에 로비 같은 게 있어야"): 옛 메뉴가 로비. 하단 탭 넷 [전투][타워][강화][순위] — 전투 = 이 화면(월드맵·무한·오늘의 판) + 출석·오늘의 미션,
//   타워 = 도감(codex.js), 강화 = 강화 나무 + 뽑기, 순위 = 시즌 + 순위표(records.js). 새 알림은 탭에 빨간 점(refreshDots). 전투·결과·뽑기 화면에선 탭을 숨긴다(hideTabs).
//   전투 화면의 학습 요소(설명 문장·상성 목록·성질 설명)는 도감으로 옮겼다 — 전투엔 숫자·칩만. 결과 화면 버튼은 최대 3개.
window.NGN = window.NGN || {};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 10000 ? Math.round(n / 1000) + 'K' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(Math.floor(n)));

const SVG = {
  coin: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#F5B301"/><circle cx="12" cy="12" r="7" fill="#FFD84D"/></svg>',
  ticket: '<svg class="i" viewBox="0 0 24 24"><path fill="#B15BE8" d="M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V7z"/><path d="M9 7v12" stroke="#fff" stroke-width="1.5" stroke-dasharray="2 2"/></svg>',
  shield: (c) => `<svg class="i" viewBox="0 0 24 24"><path fill="${c}" stroke="#222" stroke-width="1.5" d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3z"/></svg>`,
  up: '<svg class="i" viewBox="0 0 24 24"><path fill="currentColor" d="M12 4 4 12h5v8h6v-8h5z"/></svg>',
  sell: '<svg class="i" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3 8 7h8l-4-4zM6 9h12l1 12H5L6 9z"/><path d="M12 12v6M10 14h3a1 1 0 0 1 0 2h-2" stroke="#B8860B" stroke-width="1.6" fill="none"/></svg>',
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
    range: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#146587" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="#1C9FD7"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="#146587" stroke-width="2"/></svg>',
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
    single: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="currentColor" stroke-width="2"/></svg>',
    splash: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="m12 2 2.5 5.5L20 6l-3 5 5 2-5.5 2.5L18 21l-5-3-1 5-2.5-5.5L4 20l3-5-5-2 5.5-2.5L6 4l5 3z"/></svg>',
    bounce: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>',
    multishot: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 6l7 6-7 6zM10 6l7 6-7 6zM16 6l6 6-6 6z"/></svg>',
    aura: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
  },
  // ---------- 글자 대신 그림 (checklist K-2-5) ----------
  // 재화·보상·미션·등급을 한글 이름이나 ✓ 글자 대신 그림으로. 창고(assets/kenney-lib-index.json) 49팩은 전부 3D 라 2D 아이콘이 한 장도 없어
  // 이미 쓰던 인라인 SVG 방식을 넓혔다(밖에서 받은 그림 0장 = 라이선스 표기 의무 0). 색은 부르는 쪽이 넘긴다.
  heart: '<svg class="i" viewBox="0 0 24 24"><path fill="#E8443A" stroke="#7A1020" stroke-width="1.6" d="M12 21S3 15.4 3 9.8C3 6.6 5.4 4.5 8 4.5c1.8 0 3.2 1 4 2.3.8-1.3 2.2-2.3 4-2.3 2.6 0 5 2.1 5 5.3C21 15.4 12 21 12 21z"/></svg>',
  gift: '<svg class="i" viewBox="0 0 24 24"><path fill="#C0392B" d="M4 12h16v9H4z"/><path fill="#EE2747" d="M3 7.5h18V12H3z"/><path fill="#FFC93C" d="M10.3 7.5h3.4V21h-3.4z"/><path fill="#FFC93C" stroke="#B8860B" stroke-width="1.1" d="M12 7.5C9.6 7.5 7.5 6.7 7.5 5.2S9 2.6 12 6c3-3.4 4.5-2.3 4.5-.8S14.4 7.5 12 7.5z"/></svg>',
  scroll: '<svg class="i" viewBox="0 0 24 24"><path fill="#F3E7CC" stroke="#8E6B3A" stroke-width="1.6" d="M6 3h11v16a2 2 0 0 0 2 2H8a2 2 0 0 1-2-2V3z"/><path stroke="#8E6B3A" stroke-width="1.6" stroke-linecap="round" d="M9 7.5h5M9 11h5M9 14.5h3"/></svg>',
  check: '<svg class="i" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" d="M4 13l5.5 5.5L20 5.5"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 4l8 13H4z"/></svg>',
  arrowDown: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 20L4 7h16z"/></svg>',
  // 도는 화살표 — 「약점 바퀴」 한가운데
  turn: '<svg class="turn" viewBox="0 0 48 48"><circle cx="24" cy="24" r="15" fill="none" stroke="#8E6B3A" stroke-width="3.4" stroke-dasharray="15 9" stroke-linecap="round"/><path fill="#8E6B3A" d="M20 4l8 5-8 5z"/><path fill="#8E6B3A" d="M28 34l-8 5 8 5z"/></svg>',
  // 등급 배지: 색만 달랐던 글자 칩을 모양까지 다르게 — 돌 → 육각 → 보석 → 수정 → 왕관
  grade: {
    basic: (c) => `<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5" fill="${c}" stroke="#222" stroke-width="1.6"/></svg>`,
    common: (c) => `<svg class="i" viewBox="0 0 24 24"><path fill="${c}" stroke="#222" stroke-width="1.6" d="M12 3.5l7.4 4.3v8.4L12 20.5l-7.4-4.3V7.8z"/></svg>`,
    uncommon: (c) => `<svg class="i" viewBox="0 0 24 24"><path fill="${c}" stroke="#222" stroke-width="1.6" d="M7 4h10l4 5.5L12 21 3 9.5z"/></svg>`,
    rare: (c) => `<svg class="i" viewBox="0 0 24 24"><path fill="${c}" stroke="#222" stroke-width="1.6" d="M12 2.5l6 9.5-6 9.5-6-9.5z"/></svg>`,
    legendary: (c) => `<svg class="i" viewBox="0 0 24 24"><path fill="${c}" stroke="#222" stroke-width="1.6" d="M3 8.5l4.5 4L12 4l4.5 8.5 4.5-4L19 20H5z"/></svg>`,
  },
};
NGN.SVG = SVG;

// ---------- [?] 도움말 (checklist K-2-15) ----------
// 사장님: "텍스트 꾸역꾸역에 엉망진창 쓰레기 같은데 이걸 통과시켰다고?"
// 화면에 늘 떠 있던 긴 설명을 전부 여기로 옮겼다. 게임 화면은 설명서가 아니다 — 궁금할 때만 누른다.
// 판단 기준은 하나: 「이 문장이 없으면 조카가 못 하나?」 못 하면 화면에, 아니면 여기에.
const HELP = {
  save: ['저장 코드', ['별·기록·티켓·뽑은 것을 긴 글자 하나로 만들어요.', '폰이 바뀌거나 저장이 지워져도 그 글자만 있으면 그대로 살아나요.', '[내보내기] 로 만들어서 나에게 보내는 톡에 붙여 두세요.']],
  a2hs: ['홈 화면에 추가', ['아이폰은 웹을 7일 안 열면 저장을 스스로 지워요.', '홈 화면에 추가해서 앱처럼 열면 안 지워집니다.', '[방법] 을 누르면 하는 법이 나와요.']],
  affinity: ['상성이 뭔가요', ['타워마다 잘 드는 상대가 따로 있어요.', '적은 웨이브마다 방패 색이 바뀌는데, 그 방패에 센 타워를 세우면 같은 타워로 두세 배를 냅니다.', '위 바퀴에서 방패마다 ▲ 잘 드는 공격과 ▼ 안 통하는 공격을 보세요.']],
  tree: ['강화가 뭔가요', ['스테이지를 깨면 별을 받아요. 그 별로 칸을 하나씩 찍습니다.', '앞 칸부터 순서대로 찍을 수 있고, 잘못 찍었으면 [전부 되돌리기] 로 별을 다 돌려받아요.', '강화는 모든 판에 늘 적용됩니다.']],
  season: ['시즌이 뭔가요', ['매달 1일에 점수만 0 이 되고 별·타워·강화는 그대로 남아요.', '점수는 이번 달에 새로 딴 별·오늘의 판 성적·무한 기록 갱신·일일 미션으로 쌓입니다.', '친구 코드를 주고받으면 순위표에 나란히 서요.']],
  daily: ['일일이 뭔가요', ['미션은 하루 세 개, 한국 시간 자정에 새로 나와요. 안 쌓이고, 못 해도 벌칙이 없어요.', '셋 다 하면 보너스 티켓을 더 받습니다.', '출석은 로비에 들어오면 저절로 찍혀요. 이레를 돌면 다시 1일째부터.']],
  enemies: ['적 읽는 법', ['체력·속도·보상은 「보통 적의 몇 배인가」 예요. ×2 면 두 배라는 뜻이에요.', '「새면 생명 −N」 은 그 적이 성에 닿았을 때 잃는 생명이에요.', '발밑 색 고리는 그 웨이브에 붙은 성질이고, 방패 색은 방어 타입이에요.']],
  credit: ['만든 것들', ['P의 디펜스', '밸런스 표는 YouTD 2 (MIT)', '그림·모델은 Kenney (CC0)', '저장 압축은 lz-string (MIT)', '글꼴은 검은고딕·Jua (SIL OFL 1.1)']],
};
NGN.HELP = HELP;

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
    // 로비 좌우 아이콘 열(checklist K-2-9) — 출석·미션은 전용 페이지로, 나머지 넷은 이미 있는 흐름으로 보내는 지름길이다(중복 구현 금지)
    $('gateMission').addEventListener('click', () => this.showMissions());   // 「일일」 = 출석 + 오늘의 미션 한 페이지
    $('gateDaily').addEventListener('click', () => cb.onStartDaily());
    $('gateInfinite').addEventListener('click', () => { if (this.meta.infiniteUnlocked()) this.showMapScreen(); else this.toast(`스테이지 ${this.data.stages.infiniteUnlockStage}을 깨면 열립니다`); });
    $('gateGacha').addEventListener('click', () => this.showUpgrade());   // 뽑기는 강화 탭 안에 이미 있다
    $('gateSeason').addEventListener('click', () => this.showRecords());
    $('missionClose').addEventListener('click', () => this.showMenu());
    this.bindHelp();   // [?] 도움말 — 문서 하나에 위임(K-2-15)
    $('menuSettings').addEventListener('click', () => this.showSettings());
    // 로비 탭 바(J-11 ②)
    $('lobbyTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const t = b.dataset.tab; if (t === 'battle') this.showMenu(); else if (t === 'tower') cb.onCodex(); else if (t === 'grow') this.showUpgrade(); else if (t === 'rank') this.showRecords(); });
    $('growGacha').addEventListener('click', (e) => { if (e.target.closest('button')) cb.onGacha(); });
    $('missionBody').addEventListener('click', (e) => {
      const g = e.target.closest('[data-go]');                    // 「이동」(checklist K-2-9): 그 미션을 올릴 수 있는 화면으로 데려간다
      if (g) { this.missionGo(g.dataset.go); return; }
      const b = e.target.closest('[data-claim]'); if (!b) return;
      const got = this.meta.missionClaim(Number(b.dataset.claim));
      if (got) { this.toast(`뽑기 티켓 +${got}장`); NGN.sound && NGN.sound.play('gold'); this.renderMissions(); this.refreshDots(); }
    });
    $('a2hsClose').addEventListener('click', () => { this.meta.state.settings.a2hsDismissed = true; this.meta.save(); $('a2hs').hidden = true; });
    $('a2hsMore').addEventListener('click', () => this.a2hsHelp());
    // 난이도 고르기(월드맵 점을 누르면)
    $('diffClose').addEventListener('click', () => { $('diffModal').hidden = true; });
    // 월드맵 · 강화
    $('worldBack').addEventListener('click', () => this.showMenu());
    $('worldUpgrade').addEventListener('click', () => this.showUpgrade());
    $('treeReset').addEventListener('click', () => { if (!this.meta.treeSpent()) return this.toast('찍은 것이 없습니다'); this.meta.resetTree(); this.toast('별을 전부 되돌렸습니다'); this.renderTree(); });
    // 무한 모드 지도 선택
    $('mapBack').addEventListener('click', () => this.showMenu());
    $('mapMore').addEventListener('click', () => { this.genCount += 12; this.buildMapGrid(); });
    $('mapStart').addEventListener('click', () => { if (this.mapId) cb.onStartInfinite(this.mapId); });
    $('settingBack').addEventListener('click', () => this.showMenu());
    $('endCode').addEventListener('click', () => this.showEndCode());
    // 전투: ▶ 는 「미리 부르기」(카운트다운 중 누르면 바로 시작 + 보너스 골드 — main.js callWave), 웨이브 중에는 배속(1→2→3×)
    $('waveBtn').addEventListener('click', () => { if (this.game && this.game.wave) cb.onSpeed(); else cb.onWaveStart(); });
    $('speedBtn') && $('speedBtn').addEventListener('click', () => cb.onSpeed());   // 배속은 위 정보줄에서(K: 타워 카드를 가리지 않게)
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
    $('endMenu').addEventListener('click', () => { cb.onLeave(); this.showMenu(); });
    $('endRecords').addEventListener('click', () => { cb.onLeave(); this.showRecords('daily'); });
  }
  hideAll() { for (const id of ['menu', 'worldScreen', 'upgradeScreen', 'mapScreen', 'recordScreen', 'settingScreen', 'codexScreen', 'missionScreen', 'helpModal', 'endScreen', 'game', 'diffModal', 'codeModal']) $(id).hidden = true; }
  // ---------- 로비 탭 바(J-11 ②) ----------
  showTabs(active) {
    document.body.classList.add('has-tabs'); $('lobbyTabs').hidden = false;
    for (const b of $('lobbyTabs').children) b.classList.toggle('on', b.dataset.tab === active);
    this.refreshDots();
  }
  hideTabs() { document.body.classList.remove('has-tabs'); $('lobbyTabs').hidden = true; }
  // 빨간 점: 전투 = 받을 미션 보상 · 타워 = 새로 열린 계열 · 강화 = 티켓·프리미엄 팩·찍을 별 · 순위 = 아직 안 본 지난 시즌 결과
  refreshDots() {
    const m = this.meta; if (!m) return;
    const on = { battle: m.missionUnclaimed() > 0, tower: m.codexNew().length > 0, grow: m.state.tickets > 0 || (m.state.premiumPulls || 0) > 0 || m.treeKeys().some((k) => m.canBuy(k)), rank: !!m.seasonUnseen() };
    for (const b of $('lobbyTabs').children) { const d = b.querySelector('.dot'); if (d) d.hidden = !on[b.dataset.tab]; }
  }

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
    // 로비는 「입구」다(checklist K-2-9) — 곁다리(출석·미션·오늘의 판·무한·뽑기·시즌)는 좌우 아이콘 열로 빼고
    // 가운데는 「다음에 갈 스테이지」가 주인공, 아래는 큰 [전투] 하나.
    const dk = this.cb.dailyClock ? this.cb.dailyClock() : null;
    this.a2hsBanner();
    this.lobbyDay(dk);            // 날짜 정리가 먼저 — 출석 도장·미션이 여기서 갱신된다
    this.renderLobbyCenter();
    this.renderGates(dk);
    this.showTabs('battle');
    this.cb.onMenu(true);
  }
  // 로비에 들어올 때 날짜 정리(J-11 ④·⑤): 출석 도장·미션 갱신·늦게 준 보상·시즌 정산. 알릴 것이 여럿이면 시즌 > 늦은 보상 > 출석 순으로 하나만 토스트(나머지는 시트에 보인다)
  lobbyDay(dk) {
    const r = this.meta.lobbyDay(dk);
    if (r.seasonRolled) { const h = r.seasonRolled; this.toast(h.prize ? `지난달 시즌 ${h.rank}등 — 프리미엄 팩 ${h.prize}회!` : h.people > 1 ? `지난달 시즌 ${h.people}명 중 ${h.rank}등 — 새 달이 시작됐어요` : '새 달 — 시즌 점수가 0에서 다시 시작해요(별·타워는 그대로)'); }
    else if (r.paidLate) this.toast(`어제 미션 보상 ${r.paidLate}장을 받았어요`);
    else if (r.attended) { this.toast(`출석 ${r.attended.streak}일째 — 뽑기 티켓 +${r.attended.reward}장`); NGN.sound && NGN.sound.play('gold'); }
    if (r.attended || r.paidLate || r.seasonRolled) $('menuTickets').innerHTML = `${SVG.ticket}<span class="num">${this.meta.state.tickets}</span>`;
  }
  // ---------- 로비 가운데: 다음에 갈 스테이지가 주인공 (checklist K-2-9) ----------
  renderLobbyCenter() {
    const m = this.meta, next = m.nextStage();
    if (!next) {                                   // 20개를 다 깼으면 월드맵으로 보낸다
      $('lobbyStageNo').textContent = '모두 깼어요';
      $('lobbyStageName').textContent = '월드맵';
      $('lobbyStageStars').innerHTML = '';
      $('menuPlay').innerHTML = `<span>${SVG.play} 월드맵</span>`;
      return;
    }
    $('lobbyStageNo').textContent = `스테이지 ${next.id}`;
    $('lobbyStageName').textContent = next.name;
    // 별은 난이도별로 따로(보통=금 · 어려움=붉은) — 이 스테이지에서 딴 것만 보여준다
    $('lobbyStageStars').innerHTML = m.diffList().map((d) => `<span class="srow">${NGN.starsRow(d, m.starsFor(next.id, d))}</span>`).join('');
    $('menuPlay').innerHTML = `<span>${SVG.play} 전투</span>`;
  }
  // ---------- 로비 좌우 아이콘 열 (checklist K-2-9) ----------
  // 빨간 점 = 지금 받을 게 있다 · 배지 = 상태 한 조각(연속 일수·오늘 진행·최고 기록). 잠긴 것은 회색.
  renderGates(dk) {
    const m = this.meta;
    const put = (id, icon, name, o = {}) => {
      const el = $(id); if (!el) return;
      el.classList.toggle('locked', !!o.locked);
      el.innerHTML = `${icon}<span class="gnm">${esc(name)}</span>`
        + (o.dot ? '<span class="dot"></span>' : '')
        + (o.badge ? `<span class="badge">${esc(o.badge)}</span>` : '');
    };
    // 「일일」 하나에 출석과 미션이 함께 들어간다 — 둘 다 매일 받는 것이라 한 페이지가 이치에 맞고, 아이콘도 하나로 줄었다
    const M = m.missions();
    const doneN = M ? M.list.filter((x) => x.done).length : 0;
    put('gateMission', SVG.scroll, '일일', { dot: m.missionUnclaimed() > 0, badge: M ? `미션 ${doneN}/${M.list.length}` : null });
    const played = dk && m.dailyPlayed(dk.date);
    put('gateDaily', SVG.calendar, '오늘의 판', { locked: !dk, badge: dk ? (played ? '오늘 완료' : dk.label) : '준비 중' });
    const inf = m.infiniteUnlocked(), b = m.state.best;
    put('gateInfinite', inf ? SVG.infinity : SVG.lock, '무한', { locked: !inf, badge: inf ? (b ? `최고 ${b.wave}` : '기록 없음') : `${this.data.stages.infiniteUnlockStage} 깨면` });
    const tk = m.state.tickets, pp = m.state.premiumPulls || 0;
    put('gateGacha', SVG.ticket, '뽑기', { dot: tk > 0 || pp > 0, badge: tk ? `${tk}장` : null });
    put('gateSeason', SVG.trophy, '시즌', { dot: !!m.seasonUnseen() });
  }

  // ---------- 출석 칸 (전용 페이지 「일일」의 아래 절반) ----------
  // 로비에 끼워 넣던 36px 짜리 작은 칸 일곱을 78px 카드로 키웠다(K-2-9 다섯째).
  // 처음엔 출석만 따로 페이지를 뒀는데, 미션이 하루 3개뿐이라 미션 쪽 화면 아래 60%가 비었다 →
  // 둘 다 「매일 받는 것」이라 한 페이지에 합쳤다(2026-09-07).
  attendHtml() {
    const A = this.meta.attendInfo();
    const cells = A.cycle.map((rw, i) => {
      const d = i + 1, done = A.day >= d, today = A.day === d;
      return `<div class="astamp ${done ? 'done' : ''} ${today ? 'today' : ''}"><b>${d}일째</b><span class="tk">${SVG.ticket}${rw}장</span>${done ? `<span class="chk">${SVG.check}</span>` : ''}</div>`;
    }).join('');
    return `<div class="sec-head">${SVG.check} 출석 <small>${A.streak}일째</small></div>
      <div class="panel cx-wheel"><div class="astamps">${cells}</div></div>`;
  }

  // ---------- 전용 페이지 「일일」 = 오늘의 미션 + 출석 (checklist K-2-9·11) ----------
  // 참고 그림의 「구조」만 배웠다(그림·색·글꼴은 우리 것): 위에 누적 진행바, 각 줄은
  // [보상 배지] [제목 + 채워지는 막대] [받기(초록) / 이동(금색)]. 전에는 높이 30px 짜리 글자 줄이었다.
  showMissions() { this.hideAll(); $('missionScreen').hidden = false; this.renderMissions(); this.showTabs('battle'); this.cb.onMenu(true); }
  // 「이동」이 데려갈 곳: 뽑기·무한만 따로고 나머지는 전부 판을 해야 오르는 미션이라 로비로 보낸다
  missionGo(type) {
    if (type === 'pull') { this.showUpgrade(); const b = document.querySelector('#upgradeScreen .grow-gacha .btn'); if (b && !b.disabled) b.click(); return; }
    if (type === 'infinite' && this.meta.infiniteUnlocked()) { this.showMapScreen(); return; }
    this.showMenu();
  }
  renderMissions() {
    const m = this.meta, M = m.missions(), R = m.missionRules();
    const dk = this.cb.dailyClock ? this.cb.dailyClock() : null;
    $('missionSub').textContent = dk ? dk.label : '…';
    if (!M) { $('missionBody').innerHTML = `<div class="panel cx-note">오늘 날짜를 정하는 중이에요.</div>${this.attendHtml()}`; return; }
    const list = M.list, n = list.length;
    const doneN = list.filter((x) => x.done).length;
    const allDone = n > 0 && doneN === n;
    const allClaimed = n > 0 && list.every((x) => x.claimed);
    // 누적 진행바: 미션을 깰 때마다 한 칸 차오르고, 마지막 칸에서 보너스 상자가 열린다
    const stops = list.map((x) => `<span class="stop ${x.done ? 'on' : ''}"><span class="box">${SVG.ticket}</span>${x.reward}장</span>`).join('')
      + (R.allClearBonus ? `<span class="stop ${allDone ? 'on' : ''}"><span class="box">${SVG.gift}</span>${R.allClearBonus}장</span>` : '');
    const nStop = n + (R.allClearBonus ? 1 : 0);
    const pctAll = nStop > 1 ? Math.round(doneN / (nStop - 1) * 100) : 0;
    const rows = list.map((x, i) => {
      const got = Math.min(x.n || 0, x.goal);
      const pct = Math.min(100, Math.round(got / x.goal * 100));
      const right = x.claimed ? `<span class="mbtn ok">${SVG.check} 받음</span>`
        : x.done ? `<button class="btn green mbtn" data-claim="${i}">받기</button>`
                 : `<button class="btn gold mbtn" data-go="${esc(x.type || '')}">이동</button>`;
      return `<div class="mission ${x.done ? 'done' : ''} ${x.claimed ? 'claimed' : ''}">
        <span class="mrw">${SVG.ticket}<b>${x.reward}</b></span>
        <span class="mbody"><b class="nm">${esc(x.name)}</b><span class="bar"><span class="fill" style="width:${pct}%"></span><span class="pct">${got}/${x.goal}</span></span></span>
        ${right}</div>`;
    }).join('');
    const bonusPct = n ? Math.round(doneN / n * 100) : 0;
    const bonus = R.allClearBonus ? `<div class="mission bonus ${allDone ? 'done' : ''}">
        <span class="mrw">${SVG.gift}<b>${R.allClearBonus}</b></span>
        <span class="mbody"><b class="nm">셋 다 하면 보너스</b><span class="bar"><span class="fill" style="width:${bonusPct}%"></span><span class="pct">${doneN}/${n}</span></span></span>
        <span class="mbtn ok">${M.bonusClaimed || allClaimed ? `${SVG.check} 받음` : '자동'}</span></div>` : '';
    $('missionBody').innerHTML = `<div class="sec-head">${SVG.scroll} 오늘의 미션 <button class="hlp light" data-help="daily">?</button></div>
      <div class="panel mprog"><span class="track"><span class="fill" style="width:${pctAll}%"></span></span><span class="stops">${stops}</span></div>${rows}${bonus}
      ${this.attendHtml()}`;
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
    this.showTabs('battle');
    this.cb.onMenu(true);
  }
  // 점 i(0부터)의 위치. 세로로 내려가며 좌우로 굽이친다.
  // 🛑 간격(STEP)은 반드시 노드 한 칸의 실제 높이(동그라미 58 + 별 3줄 36 + 이름 19 ≈ 109px)보다 커야 한다.
  //    예전엔 지도 높이를 화면 폭에 비례시켜(aspect-ratio 360/1900) 360px 폰에서 간격이 92px 로 쪼그라들었고,
  //    그 결과 20판 전부에서 이름표가 다음 동그라미 밑에 17px 씩 깔렸다(2026-09-08 수정).
  static get STEP() { return 126; }
  worldHeight(n) { return 60 + n * UI.STEP; }
  nodePos(i) { return { x: 180 + Math.sin(i * 1.05) * 105, y: 60 + i * UI.STEP }; }
  buildWorld() {
    const host = $('world'); host.innerHTML = '';
    const stages = this.meta.stageList(); const next = this.meta.nextStage();
    const H = this.worldHeight(stages.length); host.style.height = H + 'px';
    const pts = stages.map((_, i) => this.nodePos(i));
    // 길: 점들을 잇는 부드러운 곡선(위 → 아래). 밑에 넓은 흙길, 위에 점선
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; const my = (a.y + b.y) / 2; d += ` C${a.x},${my} ${b.x},${my} ${b.x},${b.y}`; }
    // 배경 색 띠 = 숲→눈→사막→불. 🛑 두 번째 값은 「비율」이 아니라 「몇 번째 판 자리」다.
    //    예전엔 비율(0.24 …)로 박아 뒀는데 그 값들은 옛 간격 92px 에 손으로 맞춘 것이라,
    //    간격을 126px 로 넓히자 눈밭 색이 「5. 눈 골짜기」에서 밀려났다(2026-09-08). 이제 판 자리를 따라간다.
    const bands = [['#5E9E42', 0], ['#8FBF6A', 2.7], ['#E9F1F6', 4], ['#E0C287', 5.2], ['#5E9E42', 6.5], ['#3B5E3A', 8.9], ['#2F3A48', 11.8], ['#4A3038', 15.5], ['#8A2E10', 19.7]];
    const bandOff = (i) => Math.max(0, Math.min(1, this.nodePos(i).y / H));
    host.innerHTML = `<svg class="road" viewBox="0 0 360 ${H}" preserveAspectRatio="none">
      <defs><linearGradient id="worldBg" x1="0" y1="0" x2="0" y2="1">${bands.map(([c, i]) => `<stop offset="${bandOff(i).toFixed(4)}" stop-color="${c}"/>`).join('')}</linearGradient></defs>
      <rect x="0" y="0" width="360" height="${H}" fill="url(#worldBg)" opacity=".55"/>
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
      b.style.left = (p.x / 360 * 100) + '%'; b.style.top = (p.y / H * 100) + '%';
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
  // 화면에서만 짧게 (checklist K-2-15) — 「모든 타워」는 강화의 전제라 칸마다 되풀이할 말이 아니다
  shortUnit(u) { return String(u).replace(/모든 타워 /g, '').replace(/타워 시작 단계/g, '시작 단계').trim(); }
  showUpgrade() { this.hideAll(); $('upgradeScreen').hidden = false; this.renderGrowGacha(); this.renderTree(); this.showTabs('grow'); this.cb.onMenu(true); }
  // 강화 탭 위의 뽑기 카드(J-11 ②): 티켓 수 · 천장까지 · 프리미엄 팩
  renderGrowGacha() {
    const m = this.meta, G = this.data.gacha, s = m.state;
    const toLeg = G.pity.pityLegendary - s.sinceLegendary;
    const owned = m.unlockedFamilies().length, all = this.data.families.length;
    $('growGacha').innerHTML = `<span class="grow"><b>뽑기</b><small>타워 ${owned}/${all}${s.premiumPulls ? ` · 프리미엄 ${s.premiumPulls}` : ''}</small></span><button class="btn gold">${SVG.ticket} ${s.tickets}장 뽑기</button>`;
  }
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
      row.innerHTML = `<div class="top">${SVG.tree[k] || ''}<b>${esc(br.name)}</b><span class="sub" style="color:#6B5A48">${lv}/${br.costs.length}</span><span class="eff">${eff ? `${esc(this.shortUnit(br.unit))} ${eff}` : `${esc(this.shortUnit(br.unit))} ${this.perStepText(br.perStep)}`}</span></div><div class="steps">${steps}</div>`;
      host.appendChild(row);
    }
    host.querySelectorAll('.step.can').forEach((b) => b.addEventListener('click', () => {
      if (m.buy(b.dataset.k)) { this.toast(`${T[b.dataset.k].name} 강화! ${T[b.dataset.k].unit} ${m.treeEffectText(b.dataset.k)}`); this.renderTree(); }
    }));
    $('treeReset').disabled = !m.treeSpent();
  }
  perStepText(ps) { return Object.keys(ps).map((k) => (k === 'allDmg' || k === 'rangeMul') ? `+${Math.round(ps[k] * 100)}%` : k === 'baseTier' ? '+1단' : `+${ps[k]}`).join(' '); }

  // ---------- 무한 모드 지도 선택 ----------
  showMapScreen() { this.hideAll(); $('mapScreen').hidden = false; this.buildMapGrid(); this.showTabs('battle'); this.cb.onMenu(true); }
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
  // ---------- 도움말 창 (checklist K-2-15) ----------
  showHelp(key) {
    const h = HELP[key]; if (!h) return;
    const m = $('helpModal'); m.hidden = false;
    const isCredit = key === 'credit';
    m.innerHTML = `<div class="panel modal"><h3>${esc(h[0])}</h3>
      ${h[1].map((p) => `<p class="${isCredit ? 'credit' : ''}">${esc(p)}</p>`).join('')}
      <div class="row"><button class="btn gray" id="helpClose">닫기</button></div></div>`;
    const close = () => { m.hidden = true; };
    $('helpClose').addEventListener('click', close);
    m.addEventListener('click', (e) => { if (e.target === m) close(); }, { once: true });
  }
  // 화면 어디서나 [?] 를 누르면 열린다. 화면을 다시 그릴 때마다 다시 걸 필요가 없게 문서 하나에 위임한다
  bindHelp() {
    if (this._helpBound) return; this._helpBound = 1;
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-help]');
      if (b) { e.stopPropagation(); this.showHelp(b.dataset.help); }
    }, true);
  }

  // ---------- 설정 (checklist K-2-15) ----------
  // 🔴 전에는 라벨 옆에 설명이 세 줄로 흘러 [방법] 버튼과 엉키고 줄 높이가 제각각이었다(사장님 실기기 캡처).
  //    켜짐/켜짐/켜짐 글자 버튼이 세로로 서 있었고, 조카가 볼 이유가 없는 저작권 두 줄이 첫 화면에 있었다.
  //    → 라벨은 한 줄 고정 · 켜고 끄기는 스위치 · 긴 설명과 저작권은 [?] 뒤로.
  showSettings() {
    this.hideAll(); $('settingScreen').hidden = false; this.hideTabs();
    const s = this.meta.state.settings || {}; const m = this.meta;
    const sw = (k, on) => `<button class="sw ${on ? 'on' : ''}" data-k="${k}" role="switch" aria-checked="${on}" aria-label="${k}"><span class="knob"></span></button>`;
    // 3칸 선택: 켜고 끄기가 아니라 셋 중 하나를 고르는 것(화면 흔들림 = 끄기/절반/기본)
    const seg = (k, cur, opts) => `<span class="seg" role="radiogroup">${opts.map(([v, label]) =>
      `<button class="${cur === v ? 'on' : ''}" data-k="${k}:${v}" role="radio" aria-checked="${cur === v}">${esc(label)}</button>`).join('')}</span>`;
    $('settingList').innerHTML = `
      <div class="row"><span class="grow">이름 <span class="sub" style="color:#6B5A48">${m.hasName() ? esc(m.state.name) : '아직 없음'}</span></span><button class="btn blue" data-k="name">바꾸기</button></div>
      <div class="row"><span class="grow">그림자</span>${sw('shadows', s.shadows !== false)}</div>
      <div class="row"><span class="grow">소리</span>${sw('sound', s.sound !== false)}</div>
      <div class="row"><span class="grow">진동</span>${sw('vibrate', s.vibrate !== false)}</div>
      <div class="row"><span class="grow">화면 흔들림</span>${seg('shake', s.shake === 'off' ? 'off' : s.shake === 'half' ? 'half' : 'full', [['off', '끄기'], ['half', '절반'], ['full', '기본']])}</div>
      <!-- 🛑 한 줄에 라벨 + [?] + 버튼 둘을 우겨넣었더니 라벨이 「저장 ...」으로 잘렸다(2026-09-07 실기기 확인).
           라벨은 제 줄에, 버튼은 아랫줄에 — 라벨이 온전히 보이는 것이 먼저다 -->
      <div class="row"><span class="grow">저장 코드</span><button class="hlp" data-help="save">?</button></div>
      <div class="row"><button class="btn green" data-k="export" style="flex:1">내보내기</button><button class="btn blue" data-k="import" style="flex:1">가져오기</button></div>
      <div class="row"><span class="grow">홈 화면에 추가</span><button class="hlp" data-help="a2hs">?</button><button class="btn gray" data-k="a2hs">방법</button></div>
      <div class="row"><span class="grow">기록 지우기</span><button class="btn red" data-k="reset">지우기</button></div>
      <div class="row"><span class="grow">만든 것들</span><button class="hlp" data-help="credit">?</button></div>`;
    $('settingList').querySelectorAll('button[data-k]').forEach((b) => b.addEventListener('click', () => this.onSettingLocal(b.dataset.k)));

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
    this.hideAll(); this.hideTabs(); $('game').hidden = false; $('nextDetail').hidden = true; $('pop').hidden = true;
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
  // ▶ 버튼(아래 오른쪽) = 「웨이브 시작 · 미리 부르기」 전용. 배속은 위 정보줄로 옮겼다.
  // 🔴 전에는 웨이브가 시작되면 이 버튼이 배속으로 바뀌었는데, 자리가 세 번째 타워 카드 바로 옆이라
  //    카드를 고르려던 손가락이 배속을 눌렀다(사장님 지적 2026-09-07). 이제 웨이브 중엔 이 버튼을 숨긴다 —
  //    숨기면 카드 줄이 그만큼 넓어져 고르기도 쉬워진다.
  renderWaveBtn() {
    const running = !!(this.game && this.game.wave), n = this.speed || 1;
    const bonus = !running && this.cdSec !== null && this.cdBonus > 0 ? `<span class="bonus">${SVG.coin}+${this.cdBonus}</span>` : '';
    $('waveBtn').hidden = running;
    $('waveBtn').innerHTML = '<svg viewBox="0 0 24 24"><path fill="#fff" d="M8 5v14l11-7z"/></svg>' + bonus;
    $('waveBtn').title = this.cdSec !== null ? '미리 부르기 — 빨리 부를수록 골드 보너스' : '웨이브 시작';
    // 배속은 웨이브 중에만 위 정보줄에 나온다(쉬는 중엔 배속이 의미가 없다)
    const sp = $('speedBtn');
    if (sp) { sp.hidden = !running; sp.textContent = n + '×'; sp.classList.toggle('fast', n > 1); }
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
    // 3초 전부터는 색만이 아니라 "!" 표시와 커지는 펄스로(색만으로 정보를 주지 않는다 — 글자 규칙 3)
    if (s !== this.cdSec) { this.cdSec = s; const el = $('cdSec'); el.textContent = s <= 3 ? `! ${s}초` : `다음 ${s}초`; el.classList.toggle('soon', s <= 3); }
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
    if (!d.hidden) { // 글자 규칙 4(설명은 도감으로): 상성 목록·성질 설명 문장은 뺐다 — 카드의 화살표 배지가 상성을, 도감이 뜻을 알려 준다
      const spMul = wv.special ? wv.special.hpMul : 1;
      d.innerHTML = `<span><b>${wv.wave > g.waves.length ? '∞ ' : ''}다음 웨이브 ${wv.wave}</b> · ${this.foeIcons(wv)}</span>`
        + `<span>${esc(wv.kindKo)} ×${wv.enemies.reduce((a, e) => a + e.count, 0)} · 체력 ${wv.enemies.map((e) => fmt(Math.round(e.hp * g.hpMul * spMul))).join('/')} · ${SVG.shield(hex(NGN.DEFENSE_COLOR[wv.defense]))} ${NGN.DEFENSE_KO[wv.defense]} 방어</span>`;
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
      const poor = g.gold < g.costToBuild(b.dataset.fam);
      b.classList.toggle('poor', poor); b.classList.toggle('sel', this.pickFam === b.dataset.fam);
      // 골드가 모자라면 회색만이 아니라 자물쇠도(색만으로 정보를 주지 않는다 — 글자 규칙 3)
      const pr = b.querySelector('.pr'); if (pr && pr.dataset.poor !== String(poor)) { pr.dataset.poor = String(poor); pr.innerHTML = (poor ? SVG.lock : SVG.coin) + g.costToBuild(b.dataset.fam); }
      b.querySelector('.affslot').innerHTML = this.affBadge(t.attackType, def);
    }
    // 자리(3D)에 카드 상태를 알린다: 골랐고 돈이 되면 빈 자리가 떠오르며 빛나고, 돈이 모자라면 회색으로 가라앉는다(2026-09-06)
    if (this.cb.onPickState) this.cb.onPickState(this.pickFam ? (g.gold >= g.costToBuild(this.pickFam) ? 1 : 2) : 0);
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
      <div class="tiers">${tiers.map((t) => { const img = this.cb.towerImage ? this.cb.towerImage(t) : null; return `<div class="tier" style="background:${this.elColor(t.element)}"><span class="lv">${t.tier}단</span>${img ? `<img src="${img}" alt="">` : ''}<b>${esc(t.name)}</b><br>${statLine(t)}<span class="st">${SVG.coin} ${t.tier === 1 ? g.costToBuild(fam) : t.cost}</span></div>`; }).join('')}</div>
      <p class="up">${bd.tier > 1 ? `<b>기본기로 ${bd.tier}단부터 지어진다.</b> ` : ''}${t1.aura || !B.length ? '' : `3단 갈래 ${B.map((b) => `<span class="spc" style="background:${esc(b.color)}">${esc(b.name)}</span>`).join(' ')} · `}<span style="color:#6B5A48">설명은 로비 [타워] 도감에</span></p>
      <div class="row"><button class="btn green" id="tdPick">이 타워 고르기</button><button class="btn gray" id="codeClose">닫기</button></div></div>`;
    if (this.cb.onDetailOpen) this.cb.onDetailOpen($('tdView'), bd);
    const close = () => { m.hidden = true; if (this.cb.onDetailClose) this.cb.onDetailClose(); };
    $('codeClose').addEventListener('click', close);
    $('tdPick').addEventListener('click', () => { close(); if (this.pickFam !== fam) this.pickTower(fam); });
  }
  showPop(inst) { this.popInst = inst; this.popDetail = false; this.popBag = false; this.popSell = false; $('pop').hidden = false; this.renderPop(); }
  hidePop() { this.popInst = null; this.popBag = false; this.popSell = false; $('pop').hidden = true; }
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
    const affTxt = m === null || m === 1 ? '' : ` · 다음 웨이브 <b style="color:${m > 1 ? '#046D41' : '#871023'}">×${m}</b>`;
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
    // 팔기(2026-09-06 화면 설계 2판 — 사장님 "타워를 실수로 지우는 경우가 되게 많아"): 세 겹으로 막는다.
    //   ⑴ 팝업은 화면 아래 고정(CSS #pop) — 타워 위에 안 겹친다 ⑵ [팔기]는 작고 회색으로 왼쪽 구석, 승급은 크게 가운데 ⑶ 누르면 한 번 더 묻는다("이 타워를 파시겠어요? +N골드" [팔기][취소])
    const sellRow = this.popSell
      ? `<div class="row confirm"><span class="q">이 타워를 파시겠어요? <b>${SVG.coin} +${refund}</b></span><button class="btn red sellYes">${SVG.sell} 팔기</button><button class="btn gray sellNo">취소</button></div>`
      : `<div class="row">${actions}</div><div class="row side"><button class="btn gray tiny sell" title="팔기">${SVG.sell} 팔기 +${refund}</button><span class="grow"></span><button class="btn gray tiny more">${SVG.info} ${this.popDetail ? '숫자 닫기' : '숫자'}</button><button class="btn gray tiny close">✕</button></div>`;
    $('pop').innerHTML = `
      <div class="panel title"><b>${esc(d.name)}</b> <span style="color:#6B5A48">${d.tier}단</span>${branchChip}${s.attackType ? ` · 초당 <b>${Math.round(s.dps)}</b>` : ''}${affTxt}${lvl}</div>
      ${this.popDetail ? `<div class="panel detail">${this.detailText(inst, s)}</div>` : ''}
      ${this.popBag ? this.bagHtml() : this.itemSlotsHtml(inst)}
      ${sellRow}`;
    const pop = $('pop');
    pop.querySelectorAll('.up').forEach((b) => b.addEventListener('click', () => this.cb.onUpgrade(inst, b.dataset.branch || null)));
    if (inst.branchPending) pop.querySelectorAll('.brn').forEach((b) => b.addEventListener('click', () => this.cb.onChooseBranch(inst, b.dataset.branch)));
    const on = (sel, fn) => { const el = pop.querySelector(sel); if (el) el.addEventListener('click', fn); };
    on('.sell', () => { this.popSell = true; this.renderPop(); });
    on('.sellYes', () => { this.popSell = false; this.cb.onSell(inst); });
    on('.sellNo', () => { this.popSell = false; this.renderPop(); });
    on('.more', () => { this.popDetail = !this.popDetail; this.renderPop(); });
    on('.close', () => this.clearSelection());
    pop.querySelectorAll('.islot.empty').forEach((b) => b.addEventListener('click', () => { if (!g.inventory.length) { this.toast('가방이 비었어요 — 적을 잡으면 떨어져요'); return; } this.popBag = true; this.renderPop(); }));
    pop.querySelectorAll('.islot[data-uid]').forEach((b) => b.addEventListener('click', () => this.cb.onUnequip(inst, Number(b.dataset.uid))));
    pop.querySelectorAll('.islot[data-bag]').forEach((b) => b.addEventListener('click', () => { this.popBag = false; this.cb.onEquip(inst, Number(b.dataset.bag)); }));
    pop.querySelectorAll('.islot[data-bagclose]').forEach((b) => b.addEventListener('click', () => { this.popBag = false; this.renderPop(); }));
  }
  // 팝은 화면 아래 고정(CSS #pop) — 타워 위에 띄우면 타워를 다시 누르려다 [팔기]를 눌렀다(2026-09-06). 자리 계산이 없다
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
    b.innerHTML = `<span class="bt">${esc(text)}</span>` + (sub ? `<div class="sub ${subCls}">${sub}</div>` : '') + (wv ? `<div>${this.foeIcons(Object.assign({}, wv, { special: null }))}</div>` : '') + (special ? `<div class="spcline"><span class="spc big" style="background:${esc(special.color || '#888')}">${esc(special.이름)}</span></div>` : '');
    document.body.appendChild(b); setTimeout(() => b.remove(), cls === 'boss' ? 2100 : 1700);
  }
  toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(this._tt); this._tt = setTimeout(() => { t.hidden = true; }, 1500); }

  // ---------- 결과 화면 ----------
  ticketHtml(tickets) {
    return tickets && tickets.lines.length
      ? `<br><b style="color:#B8860B">${SVG.ticket} 뽑기 티켓 +${tickets.lines.reduce((a, l) => a + l.n, 0)}장</b><br>` + tickets.lines.map((l) => `· ${esc(l.why)} +${l.n}`).join('<br>') + `<br><span style="color:#6B5A48">가진 티켓 ${tickets.total}장</span>`
      : '';
  }
  showBtns(ids) { for (const b of $('endBtns').children) if (b.id !== 'endCode') b.hidden = !ids.includes(b.id); }
  // 결과 화면의 [기록 코드] — 이 판의 기록(종목 최고가 아니면 최고 기록)을 코드로. 이름이 없으면 먼저 묻는다(I-10 ②)
  // show = false 면 코드 버튼을 숨긴다(버튼 3개 규칙 — 클리어 화면은 [다음][다시][로비]. 코드는 로비 [순위] 탭의 [내 코드]로도 만든다)
  setEndCode(rec, show = true) { this.endRec = rec ? (rec.notBest ? rec.best : rec) : null; $('endCode').hidden = !(this.endRec && show); }
  async showEndCode() {
    if (!this.endRec) return;
    if (!this.meta.hasName()) { const n = await NGN.askName(this.meta, '기록 코드에 실릴 이름이에요. 8자까지. 설정에서 바꿀 수 있어요.'); if (!n) return; }
    NGN.showCode('내 기록 코드', this.meta.recordCode(this.endRec), '길게 눌러 복사해 단톡방에 올리세요. 친구가 [순위표 → 친구 코드 넣기]에 붙이면 그 친구 순위표에 내가 나란히 떠요.', (t) => this.toast(t));
  }
  // ---------- 결과 화면 (checklist K-2-16) ----------
  // 🔴 사장님: "이 버튼 혹은 텍스트 박스 디자인 너무 구리고, 내용도 이상해. 별 없음? 수식은 왜 나와.
  //    이게 대체 무슨 말이야. 정리도 안 되고."
  //    전에는 판 이름·난이도·성적·보상·누적이 문장으로 한 덩어리에 쏟아졌고, 티켓 사유에 계산식(웨이브÷3+1)까지 나왔다.
  // 이제 위계를 셋으로 세운다: ⑴얼마나 갔나(칩) → ⑵무엇을 받았나(칩) → ⑶다음에 뭘 할까(버튼).
  //    진 화면은 「실패 통보」가 아니라 「다음엔 어떻게」를 보여 준다 — 다음 별을 어떻게 받는지 한 줄.
  rchip(text, cls = '') { return `<span class="rchip ${cls}">${text}</span>`; }
  rrow(chips) { const c = chips.filter(Boolean); return c.length ? `<div class="rrow">${c.join('')}</div>` : ''; }
  // 받은 것 줄: 별과 티켓을 아이콘 + 숫자로. 사유 목록은 없앴다(거기에 계산식이 있었다)
  rewardRow(gained, starIcon, tickets, extra) {
    const t = tickets && tickets.lines && tickets.lines.length ? tickets.lines.reduce((a, l) => a + l.n, 0) : 0;
    return this.rrow([
      gained > 0 ? this.rchip(`${starIcon} +${gained}`, 'gold') : '',
      t > 0 ? this.rchip(`${SVG.ticket} +${t}`, 'gold') : '',
      extra || '',
    ]);
  }

  // 스테이지 결과: 별이 하나씩 튀어나온다(난이도 색). 신기록·티켓·해금. [다음 스테이지 ▶] / [다시] / [월드맵]
  showStageEnd(stage, diff, result, settle, isLast) {
    this.hideAll(); $('endScreen').hidden = false; $('pop').hidden = true; $('hint').hidden = true;
    const D = this.meta.diff(diff);
    const st = $('endStars'); st.hidden = false;
    st.innerHTML = [1, 2, 3].map((k) => NGN.starOf(diff, true).replace('class="i "', `class="${k <= settle.stars ? 'on' : ''}" style="animation-delay:${0.25 + k * 0.35}s"`)).join('');
    $('endTitle').textContent = result.cleared ? (isLast ? '모두 클리어!' : `스테이지 ${stage.id} 클리어!`) : `웨이브 ${result.fellAt}에서 무너졌다`;
    const P = settle.progress;
    // ⑴ 얼마나 갔나
    const grade = this.rrow([
      this.rchip(esc(stage.name)),
      this.rchip(esc(D.name), 'diff'),
      result.cleared ? this.rchip(`${SVG.heart} ${result.lives}/${result.startLives}`)
                     : this.rchip(`웨이브 ${P ? P.wave : result.wave}/${stage.waves}`),
      result.cleared ? this.rchip(`${SVG.coin} ${Math.round(result.spent).toLocaleString()}`) : '',
      P && !P.firstTry && P.best && !result.cleared ? this.rchip('최고 기록', 'best') : '',
      P && !P.firstTry && result.cleared && !P.prevCleared ? this.rchip('첫 클리어', 'best') : '',
    ]);
    // ⑵ 다음엔 어떻게 — 진 화면에도 「다음 목표」가 있어야 한다(「별 없음」이라고 통보하지 않는다)
    const nextTier = result.cleared ? this.meta.starTiers(stage, result.startLives).find((t) => t.star === settle.stars + 1) : null;
    const goal = !result.cleared ? `<div class="rgoal">${NGN.starOf(diff, false)} 끝까지 막으면 ${esc(D.star)}</div>`
      : nextTier ? `<div class="rgoal">${NGN.starOf(diff, false)} ${SVG.heart} ${nextTier.lives} 이상 남기면 ★${nextTier.star}</div>` : '';
    // ⑶ 받은 것 + 새로 열린 것
    const opened = [
      settle.unlocked ? this.rchip(`새 타워 ${esc(NGN.FAMILY_NAMES[settle.unlocked])}`, 'open') : '',
      result.cleared && diff === 'normal' && settle.prevStars === 0 ? this.rchip('어려움 열림', 'open') : '',
      result.cleared && stage.id === this.data.stages.infiniteUnlockStage && settle.firstClear ? this.rchip('무한 모드 열림', 'open') : '',
    ].filter(Boolean).join('');
    $('endBody').innerHTML = grade + goal;
    $('ticketLines').innerHTML = this.rewardRow(settle.gained, NGN.starOf(diff), settle.tickets, opened);
    const hasNext = result.cleared && !isLast;
    this.showBtns([hasNext ? 'endNext' : '', 'endRetry', 'endMenu'].filter(Boolean)); // 최대 3개
    this.setEndCode(settle.rec, !hasNext);
  }
  // 무한 모드 결과: 웨이브 N, 지도 기록. [뽑기] / [다시] / [메뉴]
  showInfiniteEnd(result, best, tickets, mapName, rec) {
    this.hideAll(); $('endScreen').hidden = false; $('pop').hidden = true; $('hint').hidden = true;
    $('endStars').hidden = true;
    $('endTitle').textContent = `웨이브 ${result.wave}까지`;
    $('endBody').innerHTML = this.rrow([
      this.rchip(esc(mapName)),
      this.rchip('무한'),
      this.rchip(`${SVG.heart} ${result.lives}`),
      this.rchip(`${SVG.coin} ${Math.round(result.spent).toLocaleString()}`),
      result.newBest ? this.rchip('새 기록', 'best') : '',
    ]) + `<div class="rgoal">${NGN.SVG.trophy} 이 지도 최고 ${best.wave}</div>`;
    $('ticketLines').innerHTML = this.rewardRow(0, '', tickets, '');
    this.showBtns(['endRetry', 'endMenu']); // [다시][로비][기록 코드]
    this.setEndCode(rec);
  }
  // 오늘의 판 결과(I-9): 하루 한 번이라 [다시] 없음. [순위표] / [메뉴]
  showDailyEnd(dk, result, settle) {
    this.hideAll(); $('endScreen').hidden = false; $('pop').hidden = true; $('hint').hidden = true;
    $('endStars').hidden = true;
    $('endTitle').textContent = result.cleared ? '오늘의 판 클리어!' : `웨이브 ${result.fellAt}에서 무너졌다`;
    $('endBody').innerHTML = this.rrow([
      this.rchip(esc(dk.label)),
      this.rchip('오늘의 판'),
      result.cleared ? this.rchip(`${SVG.heart} ${result.lives}`) : this.rchip(`웨이브 ${result.wave}`),
      result.cleared ? this.rchip(`${SVG.coin} ${Math.round(result.spent).toLocaleString()}`) : '',
    ]) + '<div class="rgoal">하루 한 번 · 내일 새 판</div>';
    $('ticketLines').innerHTML = this.rewardRow(0, '', settle, '');
    this.showBtns(['endRecords', 'endMenu']); // [순위][로비][기록 코드]
    this.setEndCode(settle.rec);
  }
};
