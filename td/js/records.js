'use strict';
// 순위표 화면 (checklist I-10). 바깥 서비스 없이 게임 안에서 끝난다 — 친구 기록은 코드(TD-…)로 주고받는다.
// 탭 셋: 캠페인(별 총합 · 금/붉은별 · 스테이지별 등급) · 무한(지도별 최고 웨이브) · 도전(오늘의 판).
// 부문 넷: 최고 웨이브 · 철벽(남은 생명) · 알뜰(쓴 골드, 클리어한 판만) · 별 총합 — 부문마다 1등에 왕관. 꼴찌도 부문 하나는 1등이 되게.
// 순위 진입에 조건이 없다: 캠페인 별 총합만으로도 이름이 오른다(무한 모드를 못 열었어도).
// 규칙·저장은 meta.js(ranking·starRanking·importFriend·recordCode), 여기는 보여주고 누르는 것만.
window.NGN = window.NGN || {};

const $r = (id) => document.getElementById(id);
const escR = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

NGN.CROWN = '<svg class="i crown" viewBox="0 0 24 24"><path fill="#FFC93C" stroke="#7A4E00" stroke-width="1.4" d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>';
NGN.DIFF_COLOR = { normal: '#FFC93C', hard: '#E85A4F' }; // 쉬움(은별 #C9D1D9)은 2026-09-06 폐지
NGN.DIFF_EDGE = { normal: '#7A4E00', hard: '#7A1E14' };
// 별 아이콘: 난이도 색(은·금·붉은). 안 딴 것은 회색
NGN.starOf = (diff, on = true, size = '') => `<svg class="i ${size}" viewBox="0 0 24 24"><path d="M12 2l3 6.6 7 .8-5.2 4.8 1.5 7L12 17.7 5.7 21.2l1.5-7L2 9.4l7-.8z" fill="${on ? NGN.DIFF_COLOR[diff] : '#4A4F55'}" stroke="${on ? NGN.DIFF_EDGE[diff] : '#2E3237'}" stroke-width="1.5"/></svg>`;
NGN.starsRow = (diff, n, size = '') => [1, 2, 3].map((k) => NGN.starOf(diff, k <= n, size)).join('');

// ---------- 코드·이름 모달(공용) ----------
// 코드 보여주기: 길게 눌러 복사할 수 있는 글상자 + [복사] 버튼(클립보드가 막힌 브라우저면 안내)
NGN.showCode = function showCode(title, code, note, toast) {
  const m = $r('codeModal'); m.hidden = false;
  m.innerHTML = `<div class="panel modal"><h3>${escR(title)}</h3>${note ? `<p class="note">${note}</p>` : ''}<textarea id="codeBox" readonly rows="4">${escR(code)}</textarea><div class="row"><button class="btn green" id="codeCopy">복사</button><button class="btn gray" id="codeClose">닫기</button></div><div class="msg" id="codeMsg"></div></div>`;
  const box = $r('codeBox'); box.addEventListener('click', () => { box.focus(); box.select(); });
  $r('codeCopy').addEventListener('click', async () => {
    box.focus(); box.select();
    try { await navigator.clipboard.writeText(code); $r('codeMsg').textContent = '복사했어요 — 단톡방에 붙여 넣으세요'; if (toast) toast('복사했어요'); }
    catch (e) { try { document.execCommand('copy'); $r('codeMsg').textContent = '복사했어요'; } catch (e2) { $r('codeMsg').textContent = '글상자를 길게 눌러 복사하세요'; } }
  });
  $r('codeClose').addEventListener('click', () => { m.hidden = true; });
};
// 코드 넣기: 붙여넣는 글상자 + [넣기]. onSubmit(code) 가 { ok, why } 를 돌려준다
NGN.askCode = function askCode(title, note, onSubmit) {
  const m = $r('codeModal'); m.hidden = false;
  m.innerHTML = `<div class="panel modal"><h3>${escR(title)}</h3>${note ? `<p class="note">${note}</p>` : ''}<textarea id="codeBox" rows="4" placeholder="여기에 붙여 넣으세요"></textarea><div class="row"><button class="btn blue" id="codeOk">넣기</button><button class="btn gray" id="codeClose">닫기</button></div><div class="msg" id="codeMsg"></div></div>`;
  $r('codeBox').focus();
  $r('codeOk').addEventListener('click', () => { const r = onSubmit($r('codeBox').value); $r('codeMsg').textContent = r.ok ? (r.msg || '넣었어요') : r.why; $r('codeMsg').className = 'msg ' + (r.ok ? 'ok' : 'bad'); if (r.ok && r.close) m.hidden = true; });
  $r('codeClose').addEventListener('click', () => { m.hidden = true; });
};
// 이름 묻기(처음 한 번, 설정에서 바꿀 수 있다). resolve(이름 | null)
NGN.askName = function askName(meta, note) {
  return new Promise((resolve) => {
    const m = $r('codeModal'); m.hidden = false;
    m.innerHTML = `<div class="panel modal"><h3>이름을 정하세요</h3><p class="note">${note || '순위표와 기록 코드에 이 이름이 실려요. 8자까지. 설정에서 바꿀 수 있어요.'}</p><input id="nameBox" maxlength="8" placeholder="예: 민준" value="${escR(meta.state.name || '')}"><div class="row"><button class="btn green" id="nameOk">저장</button><button class="btn gray" id="codeClose">닫기</button></div><div class="msg" id="codeMsg"></div></div>`;
    const box = $r('nameBox'); box.focus();
    const ok = () => { if (meta.setName(box.value)) { m.hidden = true; resolve(meta.state.name); } else $r('codeMsg').textContent = '이름을 적어 주세요'; };
    $r('nameOk').addEventListener('click', ok);
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    $r('codeClose').addEventListener('click', () => { m.hidden = true; resolve(null); });
  });
};

NGN.RecordsUI = class RecordsUI {
  constructor(meta, data, ui) {
    this.meta = meta; this.data = data; this.ui = ui; this.tab = 'campaign'; this.open = new Set();
    $r('recordTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { this.tab = b.dataset.tab; this.render(); } });
    $r('recordPaste').addEventListener('click', () => this.pasteFriend());
    $r('recordFriends').addEventListener('click', () => this.friends());
    $r('recordName').addEventListener('click', async () => { await NGN.askName(this.meta); this.render(); });
  }
  show(tab) { if (tab) this.tab = tab; this.ui.hideAll(); $r('recordScreen').hidden = false; this.render(); }
  render() {
    const m = this.meta;
    $r('recordName').innerHTML = m.hasName() ? escR(m.state.name) : '이름 정하기';
    for (const b of $r('recordTabs').children) b.classList.toggle('on', b.dataset.tab === this.tab);
    const body = $r('recordBody');
    body.innerHTML = this.tab === 'campaign' ? this.campaign() : this.tab === 'infinite' ? this.infinite() : this.daily();
    body.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => { const k = el.dataset.open; if (this.open.has(k)) this.open.delete(k); else this.open.add(k); this.render(); }));
    body.querySelectorAll('[data-code]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); this.showMyCode(JSON.parse(el.dataset.code)); }));
    const d = body.querySelector('#dailyGo'); if (d) d.addEventListener('click', () => this.ui.cb.onStartDaily());
  }
  crownOf(crowns, name) { const has = (k) => (Array.isArray(crowns[k]) ? crowns[k].includes(name) : crowns[k] === name); const parts = []; if (has('wave')) parts.push(crowns.waveLabel || '웨이브'); if (has('lives')) parts.push('철벽'); if (has('gold')) parts.push('알뜰'); return parts; }
  // 순위 줄 하나: 이름 · 부문 값 · 왕관
  rowHtml(r, crowns, cols) {
    const crown = this.crownOf(crowns, r.n);
    const cells = cols.map((c) => c(r)).filter(Boolean).join('');
    const clock = r.m === 'd' && r.cs === 'p' ? ' <small class="clock" title="서버 시각이 아니라 폰 날짜로 판정된 기록">폰시계</small>' : '';
    return `<div class="rk ${r.me ? 'me' : ''}"><span class="nm">${r.me ? '나' : escR(r.n)}${r.me && this.meta.hasName() ? ` <small>${escR(this.meta.state.name)}</small>` : ''}${clock}</span>${cells}<span class="cr">${crown.map((c) => `<span class="ctag">${NGN.CROWN}${c}</span>`).join('')}</span></div>`;
  }
  rankingHtml(m, k, d, cols, emptyText) {
    const { rows, crowns, waveLabel } = this.meta.ranking(m, k, d);
    if (!rows.length) return `<div class="rk dim">${emptyText || '아직 기록이 없어요'}</div>`;
    crowns.waveLabel = waveLabel;
    return rows.map((r) => this.rowHtml(r, crowns, cols)).join('');
  }
  colLives(r) { return r.c ? `<span class="v"><b>${r.l}</b> 생명</span>` : '<span class="v dim">못 깸</span>'; }
  colGold(r) { return r.c && r.g !== null ? `<span class="v"><b>${r.g.toLocaleString()}</b> 골드</span>` : ''; }
  colWave(r) { return `<span class="v">웨이브 <b>${r.w}</b></span>`; }
  colStars(r) { return r.s ? `<span class="v">${NGN.starsRow(NGN.DIFF_FROM_SHORT[r.d] || 'normal', r.s, 'sm')}</span>` : ''; }
  codeBtn(rec) { return rec ? `<button class="btn gold tiny" data-code='${escR(JSON.stringify({ m: rec.m, k: rec.k, d: rec.d }))}'>내 코드</button>` : ''; }
  showMyCode(key) {
    const rec = this.meta.myRecord(key.m, key.k, key.d);
    if (!rec) return;
    this.withName(() => NGN.showCode('내 기록 코드', this.meta.recordCode(rec), '단톡방에 올리면 친구가 [친구 코드 넣기]로 받아 순위표에 나란히 떠요.', (t) => this.ui.toast(t)));
  }
  async withName(fn) { if (!this.meta.hasName()) { const n = await NGN.askName(this.meta); if (!n) return; this.render(); } fn(); }
  pasteFriend() {
    this.withName(() => NGN.askCode('친구 코드 넣기', '친구가 단톡방에 올린 TD- 코드를 붙여 넣으세요. 손으로 고친 코드는 걸려요.', (code) => {
      const r = this.meta.importFriend(code);
      if (!r.ok) return r;
      this.render();
      const what = r.rec.m === 's' ? `스테이지 ${r.rec.k} ${this.meta.diff(NGN.DIFF_FROM_SHORT[r.rec.d] || 'normal').name}` : r.rec.m === 'i' ? `무한 ${this.mapName(r.rec.k)}` : `오늘의 판 ${r.rec.k}`;
      return { ok: true, msg: `${r.rec.n} — ${what} 기록을 ${r.replaced ? '갱신' : '추가'}했어요`, close: false };
    }));
  }
  friends() {
    const names = this.meta.friendNames();
    const m = $r('codeModal'); m.hidden = false;
    m.innerHTML = `<div class="panel modal"><h3>친구 ${names.length}명</h3>${names.length ? names.map((n) => `<div class="frow"><span class="grow">${escR(n)} <small>기록 ${this.meta.state.friends.filter((f) => f.n === n).length}개 · 별 ${Math.max(0, ...this.meta.state.friends.filter((f) => f.n === n).map((f) => f.t || 0))}</small></span><button class="btn red tiny" data-rm="${escR(n)}">지우기</button></div>`).join('') : '<p class="note">아직 친구 코드를 넣지 않았어요.</p>'}<div class="row"><button class="btn gray" id="codeClose">닫기</button></div></div>`;
    m.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { if (confirm(`${b.dataset.rm} 기록을 전부 지울까요?`)) { this.meta.removeFriend(b.dataset.rm); this.friends(); this.render(); } }));
    $r('codeClose').addEventListener('click', () => { m.hidden = true; });
  }
  mapName(id) { const mp = this.data.maps.byId[id]; if (mp) return mp.name; const s = /^gen(\d+)$/.exec(id); return s ? this.ui.cb.genMap(Number(s[1])).name : id; }

  // ---------- 캠페인 탭 ----------
  campaign() {
    const m = this.meta, diffs = m.diffList();
    const sum = `<div class="panel sumbox">${diffs.map((d) => `<span class="sumcell">${NGN.starOf(d)}<b>${m.totalStars(d)}</b><small>/${m.maxStars(d)} ${escR(m.diff(d).star)}</small></span>`).join('')}<span class="sumcell tot"><b>${m.totalStars()}</b><small>/${m.maxStars()}</small></span></div>`;
    const rk = m.starRanking();
    const starRank = `<div class="panel list rankbox"><div class="rhead">별 총합 순위 <small>캠페인 기록만으로도 여기 올라요</small></div>${rk.map((r, i) => `<div class="rk ${r.me ? 'me' : ''}"><span class="pos">${i + 1}</span><span class="nm">${r.me ? '나' : escR(r.n)}</span><span class="v">${NGN.starOf('normal')}<b>${r.t}</b></span><span class="cr">${i === 0 && rk.length > 1 ? `<span class="ctag">${NGN.CROWN}별</span>` : ''}</span></div>`).join('')}${rk.length === 1 ? '<div class="rk dim">친구 코드를 넣으면 나란히 서요</div>' : ''}</div>`;
    const stages = m.stageList().map((s) => {
      const key = 's' + s.id; const isOpen = this.open.has(key);
      const friendN = new Set(m.state.friends.filter((f) => f.m === 's' && f.k === s.id).map((f) => f.n)).size;
      const stars = diffs.map((d) => `<span class="st">${NGN.starsRow(d, m.starsFor(s.id, d), 'sm')}</span>`).join('');
      let detail = '';
      if (isOpen) detail = diffs.map((d) => `<div class="dsec"><div class="dhead">${NGN.starOf(d)} ${escR(m.diff(d).name)} <small>×${m.diff(d).hpMul}</small>${this.codeBtn(m.myRecord('s', s.id, NGN.DIFF_SHORT[d]))}</div>${this.rankingHtml('s', s.id, NGN.DIFF_SHORT[d], [this.colStars.bind(this), this.colLives.bind(this), this.colGold.bind(this)], m.isDiffOpen(s.id, d) ? '아직 기록이 없어요' : '보통으로 깨면 열려요')}</div>`).join('');
      return `<div class="srow ${isOpen ? 'open' : ''} ${m.clearedAny(s.id) ? '' : 'locked'}"><div class="shead" data-open="${key}"><span class="no">${s.id}</span><span class="nm">${escR(s.name)}</span>${stars}${friendN ? `<span class="fb">친구 ${friendN}</span>` : ''}</div>${detail}</div>`;
    }).join('');
    return sum + starRank + `<div class="panel list stlist"><div class="rhead">스테이지별 <small>누르면 난이도별 순위가 펼쳐져요</small></div>${stages}</div>`;
  }

  // ---------- 무한 탭 ----------
  infinite() {
    const m = this.meta;
    const mine = m.myRecords('i'); const friends = m.state.friends.filter((f) => f.m === 'i');
    // 종합: 사람마다 최고 웨이브 하나(지도 무관). 철벽·알뜰은 30웨이브를 넘긴 판 중 최고
    const people = new Map();
    const put = (r, me) => { const p = people.get(r.n) || { n: r.n, me, w: 0, l: null, g: null }; p.w = Math.max(p.w, r.w || 0); if (r.c && r.l !== null && (p.l === null || r.l > p.l)) p.l = r.l; if (r.c && r.g !== null && (p.g === null || r.g < p.g)) p.g = r.g; people.set(r.n, p); };
    for (const r of mine) put(Object.assign({}, r, { n: m.state.name || '나' }), true);
    for (const r of friends) put(r, false);
    const rows = [...people.values()].sort((a, b) => b.w - a.w);
    const topBy = (pick, cmp) => { let best = null; for (const r of rows) { const v = pick(r); if (v === null) continue; if (best === null || cmp(v, best) > 0) best = v; } return best === null ? [] : rows.filter((r) => pick(r) === best).map((r) => r.n); };
    const crowns = { wave: topBy((r) => (r.w > 0 ? r.w : null), (a, b) => a - b), lives: topBy((r) => r.l, (a, b) => a - b), gold: topBy((r) => r.g, (a, b) => b - a), waveLabel: '웨이브' };
    const overall = `<div class="panel list rankbox"><div class="rhead">무한 모드 종합 <small>웨이브 · 철벽(30웨이브 때 남은 생명) · 알뜰(30웨이브까지 쓴 골드)</small></div>${rows.length ? rows.map((r) => this.rowHtml(r, crowns, [(x) => `<span class="v">웨이브 <b>${x.w}</b></span>`, (x) => (x.l !== null ? `<span class="v"><b>${x.l}</b> 생명</span>` : ''), (x) => (x.g !== null ? `<span class="v"><b>${x.g.toLocaleString()}</b> 골드</span>` : '')])).join('') : `<div class="rk dim">${m.infiniteUnlocked() ? '아직 무한 모드 기록이 없어요' : `무한 모드는 스테이지 ${this.data.stages.infiniteUnlockStage}을 깨면 열려요 — 그 전에도 캠페인 탭의 별 총합으로 순위에 올라요`}</div>`}</div>`;
    const mapIds = [...new Set([...mine.map((r) => r.k), ...friends.map((r) => r.k)])];
    const maps = mapIds.map((id) => {
      const key = 'i' + id; const isOpen = this.open.has(key); const my = m.myRecord('i', id);
      return `<div class="srow ${isOpen ? 'open' : ''}"><div class="shead" data-open="${key}"><span class="nm">${escR(this.mapName(id))}</span><span class="v">${my ? `내 최고 웨이브 <b>${my.w}</b>` : '<span class="dim">내 기록 없음</span>'}</span></div>${isOpen ? `<div class="dsec"><div class="dhead">이 지도 순위${this.codeBtn(my)}</div>${this.rankingHtml('i', id, null, [this.colWave.bind(this), (r) => (r.c && r.l !== null ? `<span class="v"><b>${r.l}</b> 생명</span>` : ''), this.colGold.bind(this)])}</div>` : ''}</div>`;
    }).join('');
    return overall + `<div class="panel list stlist"><div class="rhead">지도별 <small>누르면 그 지도 순위가 펼쳐져요</small></div>${maps || '<div class="rk dim">지도 기록이 없어요</div>'}</div>`;
  }

  // ---------- 도전 탭(오늘의 판) ----------
  daily() {
    const m = this.meta, D = this.data.stages.daily;
    const dk = this.ui.cb.dailyClock ? this.ui.cb.dailyClock() : null;
    let today;
    if (!dk) today = `<div class="panel list rankbox"><div class="rhead">오늘의 판</div><div class="rk dim">오늘 날짜를 아직 못 정했어요.</div></div>`;
    else {
      const done = m.dailyPlayed(dk.date);
      today = `<div class="panel list rankbox"><div class="rhead">오늘의 판 · ${escR(dk.label)} <small>${D.waves}웨이브 · 강화 없이 · 하루 한 번${dk.src === 'p' ? ' · <span class="clock">폰 날짜로 판단하는 중</span>' : ''}</small></div>${done ? `<div class="dhead">오늘 순위${this.codeBtn(m.myRecord('d', dk.date))}</div>` + this.rankingHtml('d', dk.date, null, [this.colWave.bind(this), this.colLives.bind(this), this.colGold.bind(this)]) : `<div class="rk"><span class="grow">아직 안 했어요</span><button class="btn green tiny" id="dailyGo">오늘의 판 하기</button></div>` + this.rankingHtml('d', dk.date, null, [this.colWave.bind(this), this.colLives.bind(this), this.colGold.bind(this)], '')}</div>`;
    }
    const dates = [...new Set([...m.myRecords('d').map((r) => r.k), ...m.state.friends.filter((f) => f.m === 'd').map((f) => f.k)])].filter((d) => !dk || d !== dk.date).sort().reverse().slice(0, 30);
    const past = dates.map((d) => { const key = 'd' + d; const isOpen = this.open.has(key); const my = m.myRecord('d', d); return `<div class="srow ${isOpen ? 'open' : ''}"><div class="shead" data-open="${key}"><span class="nm">${escR(d)}</span><span class="v">${my ? `웨이브 <b>${my.w}</b>${my.c ? ` · ${my.l} 생명` : ''}` : '<span class="dim">내 기록 없음</span>'}</span></div>${isOpen ? `<div class="dsec"><div class="dhead">그날 순위${this.codeBtn(my)}</div>${this.rankingHtml('d', d, null, [this.colWave.bind(this), this.colLives.bind(this), this.colGold.bind(this)])}</div>` : ''}</div>`; }).join('');
    return today + `<div class="panel list stlist"><div class="rhead">지난 판</div>${past || '<div class="rk dim">지난 기록이 없어요</div>'}</div>`;
  }
};
