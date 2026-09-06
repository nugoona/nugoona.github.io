'use strict';
// 조립과 게임 루프. 규칙은 전부 sim/engine.js(시뮬레이터와 같은 코드)가 굴리고, 여기는 시간을 흘리고 입력을 넘길 뿐이다.
// 흐름(design.md 12장): 메인 메뉴(3D 배경이 천천히 돈다) → 월드맵 → 난이도 고름(쉬움/보통/어려움) → 스테이지 전투(덱 편성 없음, 연 계열 전부) → 결과(별·티켓·기록 코드) → 월드맵
//                     무한 모드(스테이지 10 뒤): 지도 고름 → 30웨이브 + 무한 구간 → 기록
//                     오늘의 판(I-9): 날짜가 씨앗. 강화·뽑기 효과 없이 열 계열 전부, 하루 한 번. 날짜는 서버 시각(HTTP Date)으로
//   ?auto=dps        — AI 가 대신 플레이(시뮬레이터 대조용, 무한 모드 규칙). 전략: dps|affinity|cheap|balanced|adaptive
//   ?deck=a,b,c,d,e  — 대조용 덱 · ?map=serpent|gen7 — 지도 지정 · ?speed=20 — 배속 · ?stage=3&diff=hard — 그 스테이지로 바로(개발용)
//   ?hp=3            — 적 체력을 더 곱한다(개발용 — 성질 연출을 눈으로 볼 때 적이 너무 빨리 죽지 않게) · ?dailyseed=1005 — 오늘의 판을 그 씨앗으로(개발용)
window.NGN = window.NGN || {};

// 서버 시각: 자기 주소로 HEAD 요청을 보내 응답의 Date 헤더를 읽는다. 폰 시계를 돌려도 소용없다(checklist I-9).
// 파일(file://)로 열었거나 서버가 Date 를 안 주면 null — 오늘의 판이 잠긴다
NGN.serverNow = async function serverNow() {
  if (location.protocol === 'file:') return null;
  const tryFetch = async (method) => {
    const r = await fetch(location.href, { method, cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
    const d = r.headers.get('date');
    if (!d) return null;
    const t = new Date(d);
    return isNaN(t.getTime()) ? null : t;
  };
  try { return (await tryFetch('HEAD')) || (await tryFetch('GET')); } catch (e) { try { return await tryFetch('GET'); } catch (e2) { return null; } }
};

(async function boot() {
  const params = new URLSearchParams(location.search);
  const L = window.NGN_LOADING || { set() {}, done() {}, fail() {} }; // 로딩 화면(index.html): 30% 부터 이어 채운다
  const data = await NGN.loadData((n, total, k) => L.set(30 + 8 * n / total, `데이터 ${n}/${total}`));
  const genCache = new Map();
  const genMap = (seed) => { if (!genCache.has(seed)) genCache.set(seed, NGN.createMap(NGN.generateMap(seed))); return genCache.get(seed); };
  const mapById = (id) => (id && data.maps.byId[id]) || (/^gen\d+$/.test(id || '') ? genMap(Number(id.slice(3))) : null);
  // 스테이지의 지도: {preset} 이면 maps.json 의 그 지도, {seed} 면 생성기 씨앗. 같은 스테이지 = 언제나 같은 지도
  const stageMap = (stage) => {
    const m = stage.map || {};
    const found = m.preset ? data.maps.byId[m.preset] : (m.seed !== undefined ? genMap(m.seed) : null);
    if (!found) console.warn(`스테이지 ${stage.id} 지도를 못 찾음(${JSON.stringify(m)}) — 기본 지도로`);
    return found || data.maps.default;
  };
  NGN.map = mapById(params.get('map')) || data.maps.default;

  const world = new NGN.World(document.getElementById('stage'));
  const models = new NGN.Models(data.kenneyParts);
  await models.loadAll((n, total, label) => L.set(38 + 58 * n / total, `모델 ${n}/${total} · ${String(label).split('/').pop()}`));
  console.log(`Kenney 모델: ${models.ready ? '사용' : '못 읽어 코드 그림으로'} (${models.templates.size}개, ${models.loadMs}ms)`);
  // 타워 30종(10계열 × 3단)의 지오메트리를 로딩 화면에서 미리 만든다 — 전투 중 처음 지을 때 외곽선 계산(수만 삼각형)으로 한 프레임이 200~400ms 멈추던 것을 없앤다(폰 4배 감속 실측).
  // 로딩 시간은 늘지만 그건 사장님이 "당연한 것"이라 하셨고, 전투 중 끊김은 매 순간 조카가 겪는다(J-0)
  if (models.ready) {
    const jobs = []; for (const f of data.families) for (const t of [1, 2, 3]) jobs.push([f, t, data.byFamily[f][t - 1].element]);
    for (let i = 0; i < jobs.length; i++) { const [f, t, el] = jobs[i]; L.set(96 + 2 * i / jobs.length, `타워 준비 ${i + 1}/${jobs.length}`); models.buildTower(f, t, { element: el }); if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0)); }
    for (const k of Object.keys(data.kenneyParts.enemies)) models.buildEnemy(k); // 적 6종도 — 새 종류가 처음 나올 때 멈추지 않게
  }
  L.set(98, '세계를 만드는 중…');
  // 서비스워커(PWA): 나눔 빌드(__NGN_PATHS__ 가 있다)에서만. 개발 서버는 저장본이 헷갈리니 ?sw=1 로만
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && (window.__NGN_PATHS__ || params.get('sw'))) {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => { const w = reg.installing; if (!w) return; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) setTimeout(() => ui && ui.toast('새 버전을 받았어요 — 다음에 열면 적용됩니다'), 800); }); });
    }).catch((e) => console.warn('서비스워커 등록 실패', e.message));
  }
  const renderer = new NGN.Renderer(world, data, models);
  const preview = models.ready ? new NGN.TowerPreview(models) : null; // 카드 그림(한 번 찍어 캐시)·상세 화면의 돌아가는 모형
  const meta = new NGN.Meta(data.gacha, data.stages, data.families);
  if (meta.state.settings.shadows === false) { world.renderer.shadowMap.enabled = false; world.sun.castShadow = false; }

  let game = null, speed = Number(params.get('speed') || 1), acc = 0, last = performance.now(), ended = false, curMap = NGN.map, menuSpin = true;
  let mode = null, curStage = null, curDiff = 'normal', curDaily = null; // mode: 'stage' | 'infinite' | 'daily'
  const auto = params.get('auto');
  const devHp = Number(params.get('hp') || 1) || 1; // 개발용 체력 배율
  const SPEEDS = [1, 2, 3];
  let tutorialStep = 0;
  // 서버 시각은 게임을 열 때 미리 받아 둔다(오늘의 판 버튼이 바로 반응하게). 실패하면 버튼을 누를 때 한 번 더
  let serverTime = null, serverAt = 0;
  const refreshServerTime = async () => { const t = await NGN.serverNow(); if (t) { serverTime = t; serverAt = performance.now(); } return t; };
  const nowFromServer = () => (serverTime ? new Date(serverTime.getTime() + (performance.now() - serverAt)) : null);
  const devDailySeed = Number(params.get('dailyseed') || 0);

  const showMap = (m) => { if (NGN.map !== m) { curMap = m; world.setMap(m); renderer.reset(); } };

  const ui = new NGN.UI(data, {
    onStartStage(stage, diff) { if (meta.isStageOpen(stage.id) && meta.isDiffOpen(stage.id, diff)) startStage(stage, diff); else ui.toast(diff === 'hard' ? '보통으로 먼저 깨야 열립니다' : '앞 스테이지를 먼저 깨세요'); },
    onStartInfinite(mapId) { startInfinite(meta.unlockedFamilies(), mapById(mapId)); },
    // 오늘의 판: 서버 시각이 있으면 그것, 없으면(파일로 열었거나 아티팩트처럼 fetch 가 막힌 곳) 폰 시계로 — 되돌리기는 meta.dailyClock 이 막는다. 잠그지 않는다
    async onStartDaily() {
      const t = nowFromServer() || (await refreshServerTime());
      const dk = meta.dailyClock(t); if (!dk) return;
      if (devDailySeed) { dk.seed = devDailySeed; dk.date = 'dev-' + devDailySeed; dk.label = `개발 씨앗 ${devDailySeed}`; }
      if (dk.src === 'p') ui.toast(dk.rolledBack ? '폰 날짜가 마지막 판보다 과거예요 — 마지막 날짜로 판단합니다' : '서버 시각을 못 받아 폰 날짜로 판단합니다');
      if (meta.dailyPlayed(dk.date)) { ui.toast('오늘은 이미 했어요 — 내일 새 판이 열립니다'); return; }
      startDaily(dk);
    },
    onNextStage() { const n = curStage && meta.stageAfter(curStage.id); if (n && meta.isStageOpen(n.id) && meta.isDiffOpen(n.id, curDiff)) startStage(n, curDiff); else ui.showWorld(); },
    onRetry() { if (mode === 'stage' && curStage) startStage(curStage, curDiff); else if (mode === 'infinite') startInfinite(meta.unlockedFamilies(), curMap); else ui.showMenu(meta); },
    onLeave() { game = null; ended = false; renderer.reset(); },
    onWaveStart() { startWave(); },
    onSpeed() { speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] || 1; ui.setSpeedLabel(speed); },
    onRotate() { world.camAngle += Math.PI / 2; world.placeCamera(); },
    onQuit() {
      if (!game || ended) { ui.showMenu(meta); return; }
      if (mode === 'stage') { // 스테이지는 중간에 나가면 없던 판 — 별·티켓 없음
        if (!confirm('그만두면 이 판은 없던 것이 됩니다. 나갈까요?')) return;
        game = null; ended = false; renderer.reset(); ui.showWorld();
      } else if (mode === 'daily') { // 오늘의 판은 하루 한 번 — 나가면 여기까지가 오늘 기록
        if (!confirm('오늘의 판은 하루 한 번입니다. 나가면 여기까지가 오늘 기록이 됩니다. 나갈까요?')) return;
        endGame(true, true);
      } else endGame(true, true); // 무한은 여기까지 간 기록으로 정산
    },
    onGacha() { gachaUi.show(); },
    onMenu(on) {
      menuSpin = on;
      if (!on) { world.camAngle = world.baseAngle || 0; world.placeCamera(); }
      else if (!game && mode !== 'infinite') { const n = meta.nextStage(); showMap(n ? stageMap(n) : data.maps.default); } // 메뉴 배경 = 다음 스테이지 지도
    },
    onPreviewMap(m) { showMap(m); },
    // 사거리 원판: 지어진 타워를 눌렀을 때(속성색)
    onSelect(slotId, inst, range) {
      for (const s of NGN.map.SLOTS) world.setSlotHighlight(s.id, s.id === slotId);
      if (slotId === null) renderer.showRange(null); else renderer.showRange(NGN.map.SLOTS[slotId], range || 0, { color: inst ? NGN.ELEMENT_COLOR[inst.def.element] : 0xFFFFFF });
    },
    // 자리 미리보기: 카드를 고르고 빈 자리를 누르면 그 자리에 지을 타워의 사거리 원판 + 반투명 모형
    onPreview(slotId, def) {
      for (const s of NGN.map.SLOTS) world.setSlotHighlight(s.id, s.id === slotId);
      renderer.showRange(NGN.map.SLOTS[slotId], def.range, { color: NGN.ELEMENT_COLOR[def.element], ghost: def });
    },
    onPick(fam) { if (fam && tutorialStep === 1) tutorialStep = 2; },
    // 카드 그림: 계열·단마다 한 번만 그려 data URL 로 캐시. 못 그리면 null → 카드는 역할 아이콘으로
    towerImage(def) { try { return preview ? preview.snapshot(def.family, def.tier, def.element) : null; } catch (e) { return null; } },
    onDetailOpen(host, def) { if (preview) preview.attach(host, def.family, def.tier, def.element, Math.min(220, innerWidth - 80)); },
    onDetailClose() { if (preview) preview.detach(); },
    onBuild(slotId, fam) {
      if (game.build(slotId, fam)) { renderer.syncTowers(game); ui.afterBuild(slotId); ui.toast(`${game.slots[slotId].def.name} 지음`); if (tutorialStep === 2) tutorialStep = 3; }
      else ui.toast(`골드가 모자라요 (${game.byFamily[fam][0].cost} 필요)`);
    },
    // 승급. 3단으로 올릴 때는 갈래(화력/광역)를 함께 받는다 — 엔진이 갈래 없는 3단 승급을 거절한다(checklist I-7)
    onUpgrade(inst, branch) {
      if (game.upgrade(inst, branch || null)) { const B = game.branchDef(inst.branch); renderer.syncTowers(game); ui.refreshHud(); ui.toast(`${inst.def.name}${B && inst.def.tier >= 3 ? ' · ' + B.name : ''}(으)로 승급!`); ui.cb.onSelect(inst.slotId, inst, game.effectiveStats(inst).range); }
      else ui.toast('골드가 모자라요');
    },
    // 3단부터 지어진 타워(기본기 2칸)의 갈래 고르기 — 무료, 한 번
    onChooseBranch(inst, branch) { if (game.chooseBranch(inst, branch)) { renderer.syncTowers(game); ui.refreshHud(); ui.toast(`${game.branchDef(branch).name} 갈래를 골랐다`); ui.cb.onSelect(inst.slotId, inst, game.effectiveStats(inst).range); } },
    onSell(inst) { const r = game.sell(inst); renderer.syncTowers(game); ui.clearSelection(); ui.refreshHud(); ui.toast(`팔아서 +${r}골드`); },
    // 아이템 끼우기/빼기 (checklist I-11). 효과는 엔진 effectiveStats() 한 통로로 들어간다
    onEquip(inst, uid) { if (game.equip(inst, uid)) { ui.refreshHud(); ui.cb.onSelect(inst.slotId, inst, game.effectiveStats(inst).range); } else ui.toast('칸이 다 찼어요'); },
    onUnequip(inst, uid) { if (game.unequip(inst, uid)) { ui.refreshHud(); ui.cb.onSelect(inst.slotId, inst, game.effectiveStats(inst).range); } },
    onSetting(k) {
      const s = meta.state.settings;
      if (k === 'shadows') { s.shadows = s.shadows === false; world.renderer.shadowMap.enabled = s.shadows; world.sun.castShadow = s.shadows; world.root.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
      else if (k === 'vibrate') s.vibrate = s.vibrate === false;
      else if (k === 'reset') { if (confirm('별·기록·티켓·뽑은 것을 전부 지울까요?')) { localStorage.removeItem('ngn-td-meta'); localStorage.removeItem('ngn-td-best'); location.reload(); return; } }
      meta.save(); ui.showSettings();
    },
    genMap,
    serverDate: () => nowFromServer(),
    dailyClock: () => meta.dailyClock(nowFromServer()), // 화면(메뉴·순위표)이 "오늘"을 물을 때 — 서버 시각 우선, 없으면 폰 시계
  });
  ui.meta = meta;
  ui.setSpeedLabel(speed);
  // 서버 시각이 도착하면(비동기) 메뉴가 열려 있을 때 오늘의 판 버튼을 다시 그린다
  refreshServerTime().then(() => { if (!game && !document.getElementById('menu').hidden) ui.showMenu(meta); });
  renderer.onNotice = (msg) => ui.toast(msg); // 아이템 드롭 같은 엔진 사건을 글로도 알린다
  const gachaUi = new NGN.GachaUI(meta, data, () => { if (!game) ui.showMenu(meta); { const gd = document.getElementById('gachaDot'); if (gd) gd.hidden = meta.state.tickets < 1; } });

  // 공통: 엔진 한 판 만들기. 강화 나무·뽑기 보상은 meta.perks() 하나로 합쳐져 effectiveStats() 한 통로로 들어간다.
  // perks 를 직접 주면(오늘의 판 = 전부 0) 그것을 쓴다
  function newGame({ map, waves, balance, deck, hpMul, waveSource, ai, seed = 0, perks }) {
    showMap(map); renderer.reset();
    game = new NGN.Game({ towers: data.towers, waves, affinity: data.affinity, balance, deck, ai, waveSource, hpMul: hpMul * devHp, growth: data.growth, perks: perks !== undefined ? perks : (ai ? null : meta.perks()), map, items: data.items, seed });
    ended = false;
    ui.onGameStart(game, mode);
    { const gd = document.getElementById('gachaDot'); if (gd) gd.hidden = meta.state.tickets < 1; }
    tutorialStep = meta.state.games === 0 && !ai ? 1 : 0;
    if (tutorialStep === 1) setTimeout(() => ui.toast('아래 카드에서 타워를 고르세요'), 600); // 말풍선 대신 토스트(화면을 안 가린다)
    world.warmup = 0;
    window.game = game;
  }
  // 스테이지: 웨이브 수·체력 배율·시작 골드·생명은 stages.json, 난이도 배율(쉬움 ×0.8 · 보통 ×1 · 어려움 ×2)은 difficulties. 카드 = 연 계열 전부. 끝이 있다(waveSource 없음)
  // 웨이브는 시뮬레이터와 같은 생성기(balanceForStage + waveFor)로 만든다 — 스테이지마다 적 순서가 다르고(I-2), 적 성질이 붙는다(I-8).
  function startStage(stage, diff = 'normal') {
    mode = 'stage'; curStage = stage; curDiff = diff; curDaily = null;
    const balance = NGN.balanceForStage(stage.id, stage.waves, { ...data.balance, startGold: stage.startGold, lives: stage.lives, _growth: data.growth, _specials: data.specials });
    const waves = [];
    for (let w = 1; w <= stage.waves; w++) waves.push(NGN.waveFor(w, balance, { enemies: data.enemies }));
    newGame({ map: stageMap(stage), waves, balance, deck: meta.unlockedFamilies(), hpMul: (stage.hpMul || 1) * (meta.diff(diff).hpMul || 1), waveSource: null, ai: null, seed: stage.id });
  }
  // 무한: 30웨이브 뒤에도 같은 생성기로 계속. 적 성질은 지도 씨앗 × 웨이브 번호(진행도 = 웨이브 번호, 원본 규칙 그대로)
  function startInfinite(deck, map) {
    mode = 'infinite'; curStage = null; curDaily = null;
    const ai = auto ? NGN.makeAi(auto) : null;
    map = map || data.maps.default;
    const balance = { ...data.balance, _growth: data.growth, _specials: data.specials, _infiniteSeed: NGN.seedOfMap(map) };
    const waves = [];
    for (let w = 1; w <= data.balance.waveCount; w++) waves.push(NGN.waveFor(w, balance, { enemies: data.enemies }));
    const waveSource = (n) => NGN.waveFor(n, balance, { enemies: data.enemies });
    newGame({ map, waves, balance, deck, hpMul: 1, waveSource, ai });
    if (auto) { speed = Number(params.get('speed') || 30); ui.setSpeedLabel(speed); startWave(); }
  }
  // 오늘의 판(I-9): 씨앗 = 날짜. 강화·뽑기 효과 0(perks 전부 0), 열 계열 전부, 규칙은 stages.json daily. 하루 한 번 — 시작하는 순간 표시한다
  function startDaily(dk) {
    const D = data.stages.daily;
    mode = 'daily'; curStage = null; curDaily = dk;
    meta.dailyStart(dk.date);
    const balance = { ...data.balance, startGold: D.startGold, lives: D.lives, _growth: data.growth, _specials: data.specials, _dailySeed: dk.seed, _dailyProgressPerWave: D.progressPerWave };
    const waves = [];
    for (let w = 1; w <= D.waves; w++) waves.push(NGN.waveFor(w, balance, { enemies: data.enemies }));
    newGame({ map: genMap(dk.seed), waves, balance, deck: data.families.slice(), hpMul: D.hpMul, waveSource: null, ai: null, seed: dk.seed, perks: NGN.defaultPerks() });
  }
  function startWave() {
    if (!game || game.wave || ended) return;
    const wv = game.waveAt(game.stats.reachedWave + 1);
    if (!wv) return;
    game.startWave(wv);
    if (game.ai) game.ai(game);
    tutorialStep = 0; ui.hint(null);
    ui.banner(mode !== 'infinite' && wv.wave === game.waves.length ? `마지막 웨이브 ${wv.wave}` : `웨이브 ${wv.wave}`, wv.special || null, wv);
    if (wv.special) ui.toast(`${wv.special.이름}: ${wv.special._설명}`);
    renderer.waveStart();
    ui.refreshHud();
    acc = 0;
  }
  function finishWave() {
    const leaks = game.endWave();
    renderer.consume(game);
    if (game.lives <= 0) return endGame(false);
    if (game.stats.reachedWave === game.waves.length) {
      if (mode !== 'infinite' || auto) return endGame(true); // 스테이지·오늘의 판은 마지막 웨이브를 막으면 클리어
      ui.banner('30웨이브 돌파! 무한 구간');
    } else ui.toast(leaks ? `${leaks}마리 샘` : '완벽 방어! 보너스 골드');
    ui.setPreview(); ui.refreshHud();
    if (auto) startWave();
  }
  function endGame(stopped, quit = false) {
    ended = true; game.stats.cleared = stopped; game.finish();
    const clearedWaves = stopped ? game.stats.reachedWave - (game.wave ? 1 : 0) : game.stats.reachedWave - 1;
    const result = { cleared: stopped, stopped, wave: Math.max(0, clearedWaves), fellAt: game.stats.reachedWave, lives: Math.max(0, game.lives), gold: game.gold, spent: game.spent };
    if (mode === 'stage') {
      result.startLives = game.balance.lives + game.perks.lives; // 별 비율의 분모 = 실제 시작 생명(스테이지 정가 + 강화)
      const settle = meta.settleStage(curStage, curDiff, stopped, result.lives, result.startLives, result.spent);
      const isLast = !meta.stageAfter(curStage.id);
      ui.showStageEnd(curStage, curDiff, result, settle, isLast);
      window.stageResult = { stage: curStage.id, diff: curDiff, cleared: stopped, lives: result.lives, stars: settle.stars, gained: settle.gained, unlocked: settle.unlocked, tickets: settle.tickets.lines };
      return;
    }
    if (mode === 'daily') {
      result.cleared = stopped && result.wave >= game.waves.length;
      const settle = meta.dailySettle(curDaily.date, result, curDaily.src || 's');
      ui.showDailyEnd(curDaily, result, settle);
      window.dailyResult = { date: curDaily.date, seed: curDaily.seed, src: curDaily.src, cleared: result.cleared, wave: result.wave, lives: result.lives, spent: result.spent };
      return;
    }
    const prev = meta.bestFor(curMap.id);
    const tickets = auto ? { lines: [], better: !prev || result.wave > prev.wave } : meta.settleGame(result.wave, result.lives, game.waves.length, curMap.id);
    const better = tickets.better;
    // 30웨이브 시점 생명·지출 = 순위표 철벽·알뜰 부문(무한은 결국 무너지니 끝 시점이 아니라 30웨이브 시점을 잰다)
    const W0 = game.waves.length;
    result.livesAt30 = (game.stats.livesByWave || []).length >= W0 ? game.stats.livesByWave[W0 - 1] : null;
    result.spentAt30 = game.stats.spentByWave.length >= W0 ? game.stats.spentByWave[W0 - 1] : null;
    const best = better ? { wave: result.wave, lives: result.lives, spent: Math.round(result.spent), date: new Date().toISOString().slice(0, 10) } : prev;
    if (better) meta.setBestFor(curMap.id, best);
    if (!meta.state.best || result.wave > meta.state.best.wave) meta.setBest({ ...best, map: curMap.id });
    result.newBest = better;
    const rec = auto ? null : meta.addInfiniteRecord(curMap.id, result);
    ui.showInfiniteEnd(result, best || { wave: result.wave }, { lines: tickets.lines, total: meta.state.tickets }, curMap.name, rec);
    window.autoResult = { cleared: stopped, wave: game.stats.reachedWave, lives: result.lives, gold: game.gold, spent: game.spent, strategy: auto, deck: game.deck, map: curMap.id, leaksByWave: game.stats.leaksByWave, finalTowers: game.stats.finalTowers };
    if (auto) console.log('자동 플레이 결과', JSON.stringify(window.autoResult));
    void quit;
  }

  const dom = world.renderer.domElement;
  const toScreen = (x, y, h) => { const v = world.toWorld(x, y, h).project(world.camera); return { x: (v.x + 1) / 2 * dom.clientWidth, y: (1 - v.y) / 2 * dom.clientHeight }; };
  let down = null;
  dom.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  dom.addEventListener('pointerup', (e) => {
    if (!down || !game || ended) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
    if (moved > 10) return;
    const slots = NGN.map.SLOTS.map((s) => ({ id: s.id, p: toScreen(s.x, s.y, 0.3) }));
    let best = null, bestD = Infinity;
    for (const s of slots) { const d = Math.hypot(s.p.x - e.clientX, s.p.y - e.clientY); if (d < bestD) { bestD = d; best = s; } }
    const gap = slots.length > 1 ? Math.hypot(slots[1].p.x - slots[0].p.x, slots[1].p.y - slots[0].p.y) : 60;
    if (best && bestD <= Math.max(30, gap * 0.45)) { ui.selectSlot(best.id); return; }
    ui.clearSelection();
  });

  const floaters = document.getElementById('floaters');
  function flushFloaters() {
    const q = renderer.floatQueue; if (!q.length) return;
    while (floaters.children.length > 40) floaters.firstChild.remove();
    for (const f of q) {
      const p = toScreen(f.x, f.y, f.h);
      if (p.x < 0 || p.x > innerWidth || p.y < 0 || p.y > innerHeight) continue;
      const el = document.createElement('div'); el.className = 'fl' + (f.kill ? ' kill' : f.item ? ' item' : f.big ? ' big' : '');
      el.textContent = f.text ? f.text : f.kill ? '처치!' : Math.round(f.dmg).toLocaleString();
      el.style.left = (p.x + (Math.random() - .5) * 24) + 'px'; el.style.top = p.y + 'px';
      floaters.appendChild(el); setTimeout(() => el.remove(), f.item ? 1600 : 850); // 부활!·분열!·아이템! 글자는 더 오래(조카가 읽어야 한다)
    }
    q.length = 0;
  }

  function frame(t) {
    requestAnimationFrame(frame);
    const dtMs = t - last;
    const dt = Math.min(dtMs / 1000, 0.1); last = t;
    if (game && game.wave) world.watchFrame(dtMs, t);
    if (menuSpin && !game) { world.camAngle += dt * 0.08; world.placeCamera(); } // 메뉴 배경: 지도가 천천히 돈다
    if (game && game.wave && !ended) {
      acc += dt * speed;
      let n = 0;
      while (acc >= NGN.DT && game.wave && n < 400) { game.step(); acc -= NGN.DT; n++; if (game.waveOver() || game.lives <= 0) break; }
      if (game.wave && (game.waveOver() || game.lives <= 0)) finishWave();
      else if (n) ui.refreshHud();
    }
    if (preview) preview.tick(dt, t); // 카드 상세가 열려 있을 때만 그린다
    if (game) {
      if (speed > 4) game.events.length = 0; else renderer.consume(game);
      // 다음 엔진 틱까지 얼마나 왔나 → 적 위치를 그 비율로 이어 그린다(A1). 웨이브 밖이면 1
      renderer.update(dt, game, game.wave ? acc / NGN.DT : 1);
      if (speed <= 4) flushFloaters();
      const ps = ui.popSlot(); if (ps) { const p = toScreen(ps.x, ps.y, 3.2), b = toScreen(ps.x, ps.y, 0); ui.placePop(p.x, p.y - 8, b.y); }
      if (tutorialStep === 1) { const b = document.querySelector('.tcard'); const r = b.getBoundingClientRect(); ui.hint(r.left + r.width / 2, r.top + 18, ''); } // 화살표 끝이 카드 그림에 걸치게(카드 위로 한 줄 더 안 먹게)
      else if (tutorialStep === 2 && ui.previewSlot !== null) { const r = document.getElementById('buildBtn').getBoundingClientRect(); ui.hint(r.left + r.width / 2, r.top - 6, '짓기를 누르세요'); }
      else if (tutorialStep === 2) { const s = NGN.map.SLOTS.reduce((a, c) => (NGN.map.coverageFor(c.id, 800, false) > NGN.map.coverageFor(a.id, 800, false) ? c : a), NGN.map.SLOTS[0]); const p = toScreen(s.x, s.y, 0.5); ui.hint(p.x, p.y - 10, '여기에 놓으세요'); }
      else if (tutorialStep === 3) { const r = document.getElementById('waveBtn').getBoundingClientRect(); ui.hint(r.left + r.width / 2, r.top + 18, ''); }
      else ui.hint(null);
    } else renderer.update(dt, { towersBuilt: [], enemies: [], events: [] }); // 메뉴에서도 파티클 등은 굴린다
    world.render();
  }

  const presetDeck = params.get('deck');
  const devStage = Number(params.get('stage'));
  if (auto) startInfinite(presetDeck ? presetDeck.split(',') : meta.unlockedFamilies(), NGN.map); // 시뮬 대조: 무한 모드 규칙(30웨이브)
  else if (devStage && meta.stage(devStage)) startStage(meta.stage(devStage), params.get('diff') || 'normal');
  else if (params.get('showcase')) showcase(Number(params.get('showcase')) || 3); // 개발용: 열 계열을 한 판에 전부 지어 놓고 본다(J-1 검증)
  else ui.showMenu(meta);
  L.done();
  requestAnimationFrame(frame);

  // 개발용 전시: 무한 모드 판에 열 계열을 자리 순서대로 tier 단까지 올려 짓는다(골드 무제한). ?showcase=3&map=serpent
  //   &only=fiery,frost — 그 계열만(판 가운데에 가까운 자리부터) · &zoom=2.5 — 카메라 당김 · &hp=50 — 적 체력(효과를 오래 보려고)
  function showcase(tier) {
    startInfinite(data.families.slice(), NGN.map);
    game.gold = 999999;
    const only = params.get('only') ? params.get('only').split(',') : null;
    const fams = only ? data.families.filter((f) => only.includes(f)) : data.families;
    const B = NGN.map.BOUNDS, mx = (B.minX + B.maxX) / 2, my = (B.minY + B.maxY) / 2;
    const slots = only ? NGN.map.SLOTS.slice().sort((a, b) => Math.hypot(a.x - mx, a.y - my) - Math.hypot(b.x - mx, b.y - my)) : NGN.map.SLOTS;
    if (params.get('zoom')) { world.zoom = Number(params.get('zoom')) || 1; world.placeCamera(); }
    fams.forEach((f, i) => {
      const slot = slots[i]; if (!slot) return;
      if (!game.build(slot.id, f)) return;
      const inst = game.slots[slot.id];
      while (inst.def.tier < tier) { if (!game.upgrade(inst, inst.def.tier === 2 ? (i % 2 ? 'power' : 'area') : null)) break; }
      if (inst.def.tier >= 3 && !inst.branch) game.chooseBranch(inst, i % 2 ? 'power' : 'area');
    });
    game.gold = 999999;
    renderer.syncTowers(game); ui.refreshHud();
  }

  async function measure() {
    const times = []; let l = performance.now();
    await new Promise((done) => { let n = 0; const f = (t) => { times.push(t - l); l = t; if (++n < 120) requestAnimationFrame(f); else done(); }; requestAnimationFrame(f); });
    times.sort((a, b) => a - b); const avg = times.reduce((a, b) => a + b, 0) / times.length;
    return { calls: world.renderer.info.render.calls, triangles: world.renderer.info.render.triangles, pixelRatio: world.renderer.getPixelRatio(), shadows: world.renderer.shadowMap.enabled, quality: world.quality, avgMs: +avg.toFixed(1), p95Ms: +times[Math.floor(times.length * 0.95)].toFixed(1), fps: +(1000 / avg).toFixed(0), objects: world.root.children.length };
  }
  // setSpeed 는 개발용(성질 연출을 느린 배속으로 눈으로 볼 때). 화면 버튼은 1·2·3배만 준다
  window.NGN.app = { preview, get game() { return game; }, get mode() { return mode; }, get stage() { return curStage; }, get diff() { return curDiff; }, get daily() { return curDaily; }, world, renderer, ui, startWave, startStage, startInfinite, startDaily, data, meta, gachaUi, models, genMap, measure, serverNow: () => nowFromServer(), refreshServerTime, setSpeed: (n) => { speed = n; ui.setSpeedLabel(n); } };
})().catch((e) => { if (window.NGN_LOADING) window.NGN_LOADING.fail(e.message); document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;padding:16px;position:relative;z-index:101">시작 실패: ${e.message}\n${e.stack}</pre>`); console.error(e); });
