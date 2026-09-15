/* Drift Inbox — guided review flow for a stage demo (WellSaid × Continuity Intelligence), TechLearn 2026 */
(() => {
'use strict';
const C = JSON.parse(document.getElementById('content-data').textContent);
const AUDIO = JSON.parse(document.getElementById('audio-data').textContent || '{}');
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = ms => new Promise(r => setTimeout(r, reduced ? 0 : ms));
const nf = new Intl.NumberFormat('en-US');
const fdate = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const fshort = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v; else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
};

/* ── data ────────────────────────────────────────────────────────────────── */
const courseById = Object.fromEntries(C.courses.map(c => [c.id, c]));
const segById = {}; C.courses.forEach(c => c.segments.forEach(s => { segById[s.id] = Object.assign({ course: c.id }, s); }));
const findingById = Object.fromEntries(C.findings.map(f => [f.id, f]));
const sourceById = Object.fromEntries(C.sources.map(s => [s.id, s]));
const narration = f => !!f.fixed;
const findingsBySeg = {}; C.findings.filter(narration).forEach(f => { (findingsBySeg[f.segment] ||= []).push(f); });
const byCourse = {}; C.courses.forEach(c => { byCourse[c.id] = C.findings.filter(f => f.course === c.id); });
const SEV_ORDER = { critical: 0, serious: 1, warning: 2 };
const ORDER = C.courses.flatMap(c => byCourse[c.id].slice().sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.id.localeCompare(b.id, undefined, { numeric: true })).map(f => f.id));
const P = C.slack.people, ME = C.company.persona;
const RESOLVED = new Set(['published', 'dismissed', 'task_created']);
const NEEDS_ME = new Set(['open', 'review', 'task']);
const LABEL = { open: 'Fix ready', review: 'Needs your call', task: 'Needs a person', publishing: 'Publishing…', handoff: 'With Priya', published: 'Published', task_created: 'Task created', dismissed: 'Kept as is' };

const S = { view: 'morning', current: null, status: {}, take: {}, notify: {}, versions: {}, editing: null, batch: false, batchDone: false, course: 'A', todayLog: [] };
C.findings.forEach(f => { S.status[f.id] = f.status === 'auto' ? 'open' : f.status; S.take[f.id] = 'fix'; S.notify[f.id] = f.material ? 'notify' : 'quiet'; });

let minutes = 7 * 60 + 42;
const clockStr = () => { const h = Math.floor(minutes / 60), m = minutes % 60; return `${(h % 12) || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const drawClock = () => { $('#clock').textContent = `${C.meta.weekday}, ${fshort(C.meta.date)}, 2026 · ${clockStr()}`; };
const tick = (n = 1) => { minutes += n; drawClock(); };
drawClock();

/* ── word diff ───────────────────────────────────────────────────────────── */
const toks = s => s.split(/\s+/).filter(Boolean), norm = w => w.toLowerCase().replace(/[^a-z0-9]/g, '');
function diffWords(a, b) {
  const A = toks(a), B = toks(b), na = A.map(norm), nb = B.map(norm), m = A.length, n = B.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = na[i] === nb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = []; const push = (type, w) => { const l = ops[ops.length - 1]; if (l && l.type === type) l.words.push(w); else ops.push({ type, words: [w] }); };
  let i = 0, j = 0;
  while (i < m && j < n) { if (na[i] === nb[j]) { push('eq', A[i]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) push('del', A[i++]); else push('ins', B[j++]); }
  while (i < m) push('del', A[i++]); while (j < n) push('ins', B[j++]);
  return ops;
}
const staleMask = (o, f) => { const mk = []; diffWords(o, f).forEach(op => { if (op.type !== 'ins') op.words.forEach(() => mk.push(op.type === 'del')); }); return mk; };
const freshMask = (o, f) => { const mk = []; diffWords(o, f).forEach(op => { if (op.type !== 'del') op.words.forEach(() => mk.push(op.type === 'ins')); }); return mk; };

/* ── audio ───────────────────────────────────────────────────────────────── */
const players = {}; const clipFor = k => AUDIO[k] || null;
function audioEl(k) { const a = clipFor(k); if (!a) return null; if (!players[k]) { const e = new Audio(a.src); e.preload = 'auto'; players[k] = e; } return players[k]; }
let current = null;
function stopAll() { if (!current) return; const c = current; current = null; c.el.pause(); c.el.currentTime = 0; c.cleanup && c.cleanup(); }
function playClip(key, hooks = {}) {
  return new Promise(resolve => {
    stopAll(); const e = audioEl(key); if (!e) { toast('That line is not in the offline demo.'); resolve(false); return; }
    const words = clipFor(key).words || []; let raf = 0, last = -1;
    const tk = () => { const t = e.currentTime; let idx = -1; for (let i = 0; i < words.length; i++) { if (t >= words[i][0] - 0.02) idx = i; else break; } if (idx !== last) { last = idx; hooks.onWord && hooks.onWord(idx); } hooks.onTime && hooks.onTime(t, e.duration || clipFor(key).duration); cancelAnimationFrame(raf); raf = requestAnimationFrame(tk); };
    const done = ok => { cancelAnimationFrame(raf); e.onended = null; e.ontimeupdate = null; hooks.onEnd && hooks.onEnd(ok); resolve(ok); };
    current = { key, el: e, cleanup: () => done(false) };
    e.ontimeupdate = () => { if (current && current.key === key) tk(); };
    e.onended = () => { if (current && current.key === key) current = null; hooks.onWord && hooks.onWord(-1); done(true); };
    e.currentTime = 0; hooks.onStart && hooks.onStart();
    e.play().then(() => { raf = requestAnimationFrame(tk); }).catch(() => done(false));
  });
}
const fmtTime = s => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function scriptNode(text, mask = [], kind = '') { const p = el('p', { class: 'script' }); const T = toks(text); T.forEach((w, i) => { p.append(el('span', { class: 'w' + (mask[i] ? ' ' + kind : ''), 'data-i': i }, w)); if (i < T.length - 1) p.append(' '); }); return p; }
function highlightWord(sc, idx) { $$('.w.on', sc).forEach(w => w.classList.remove('on')); if (idx >= 0) { const w = sc.querySelector(`.w[data-i="${idx}"]`); w && w.classList.add('on'); } }
function player({ key, text, mask, kind, label, sub, course, tone, voiceName }) {
  const clip = clipFor(key), c = courseById[course];
  const box = el('div', { class: 'player ' + (tone || '') + (clip ? '' : ' pending') });
  const btn = el('button', { class: 'pbtn ' + (tone === 'fresh' ? 'mint' : 'amber'), 'aria-label': 'Play: ' + label, disabled: !clip }, el('span', { class: 'ic' }));
  const bar = el('div', { class: 'bar' }, el('i')), time = el('span', { class: 'time num' }, clip ? fmtTime(clip.duration) : '–:––');
  const sc = scriptNode(text, mask, kind);
  box.append(el('div', { class: 'ph' }, el('span', { class: 'lbl' }, el('b', {}, label), sub ? ' · ' + sub : ''), el('span', { class: 'nar' }, `${voiceName || c.voice.name} · WellSaid`)), el('div', { class: 'pc' }, btn, bar, time), sc);
  let playing = false; const setPlaying = v => { playing = v; btn.classList.toggle('playing', v); };
  btn.addEventListener('click', () => { if (playing) { stopAll(); return; } playClip(key, { onStart: () => setPlaying(true), onWord: i => highlightWord(sc, i), onTime: (t, d) => { bar.firstChild.style.width = (d ? t / d * 100 : 0) + '%'; time.textContent = fmtTime(t); }, onEnd: () => { setPlaying(false); highlightWord(sc, -1); bar.firstChild.style.width = '0%'; time.textContent = fmtTime(clip.duration); } }); });
  box.play = () => { if (!playing) btn.click(); }; return box;
}
const takeKey = f => f.segment + '_' + (S.take[f.id] === 'alt' ? 'alt' : 'fix');
const takeText = f => S.take[f.id] === 'alt' && f.alt ? f.alt.text : f.fixed;
const standardFor = c => C.voice_standards.find(s => s.id === c.standard) || null;
const voiceOk = c => { const s = standardFor(c); return !s || s.voice === c.voice.name; };
const takeVoice = f => f.voice_override || courseById[f.course].voice;
const voiceLine = (c, f) => { const s = standardFor(c); if (!s) return c.voice.name; if (f && f.voice_override) return `${c.voice.name} is a retired voice. ${s.content_type} uses ${s.voice}, so the fix is re-recorded in ${s.voice} instead`; return voiceOk(c) ? `${c.voice.name} · approved for ${s.content_type.toLowerCase()}` : `${c.voice.name} · not on the approved list; ${s.content_type.toLowerCase()} uses ${s.voice}`; };

/* ── derived ─────────────────────────────────────────────────────────────── */
function segState(s) {
  const fs = findingsBySeg[s.id] || []; if (!fs.length) return 'verified';
  if (fs.some(f => S.status[f.id] === 'published')) return 'fixed';
  if (fs.some(f => ['handoff', 'publishing'].includes(S.status[f.id]))) return 'pending';
  if (fs.every(f => S.status[f.id] === 'dismissed')) return 'verified';
  return fs.some(f => f.severity === 'critical') ? 'critical' : 'drift';
}
function courseScore(c) { const fs = byCourse[c.id].filter(narration); const done = fs.filter(f => ['published', 'dismissed'].includes(S.status[f.id])).length; return fs.length ? Math.round(c.score + (100 - c.score) * done / fs.length) : c.score; }
function strip(c) { const n = el('div', { class: 'strip', role: 'img', 'aria-label': `${c.title}: ${c.segments.length} narration lines`, 'data-course': c.id }); c.segments.forEach(s => n.append(el('div', { class: 'seg ' + segState(s), 'data-seg': s.id, title: s.where, style: `--w:${toks(s.script).length}` }))); return n; }
const openIds = () => ORDER.filter(id => NEEDS_ME.has(S.status[id]));
const readyIds = () => ORDER.filter(id => S.status[id] === 'open');

/* ── chrome: toast, theme, sheets, help ──────────────────────────────────── */
let toastT = 0; function toast(msg, ms = 3400) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms); }
function applyTheme(t) { if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark'); else document.documentElement.removeAttribute('data-theme'); }
function toggleTheme() { const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; applyTheme(next); try { localStorage.setItem('suc-theme', next); } catch (_) {} }
try { const t = localStorage.getItem('suc-theme'); if (t) applyTheme(t); } catch (_) {}
$('#theme').addEventListener('click', toggleTheme);
$('#reset').addEventListener('click', () => { stopAll(); location.reload(); });
const sheets = { slack: $('#slack'), how: $('#how') };
function openSheet(id) { Object.entries(sheets).forEach(([k, s]) => { s.hidden = k !== id; }); $('#slack-toggle').classList.toggle('on', id === 'slack'); $('#how-toggle').classList.toggle('on', id === 'how'); if (id === 'slack') { const m = $('#sl-msgs'); m.scrollTop = m.scrollHeight; } }
function closeSheets() { Object.values(sheets).forEach(s => { s.hidden = true; }); $('#slack-toggle').classList.remove('on'); $('#how-toggle').classList.remove('on'); }
function toggleSheet(id) { sheets[id].hidden ? openSheet(id) : closeSheets(); }
$('#slack-toggle').addEventListener('click', () => toggleSheet('slack'));
$('#how-toggle').addEventListener('click', () => toggleSheet('how'));
$$('[data-close]').forEach(b => b.addEventListener('click', closeSheets));
const help = $('#help-modal'); $('#help').addEventListener('click', () => { help.hidden = false; }); $('#help-close').addEventListener('click', () => { help.hidden = true; }); help.addEventListener('click', e => { if (e.target === help) help.hidden = true; });
document.addEventListener('keydown', e => {
  if (e.target.matches('input,textarea,select')) return;
  if (e.key === 'Escape') { help.hidden = true; closeSheets(); return; }
  if (e.key === '?') { help.hidden = !help.hidden; return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 't') toggleTheme(); else if (k === 's') toggleSheet('slack'); else if (k === 'h') toggleSheet('how');
  else if (k === '1') showView('inbox'); else if (k === '2') showView('courses');
  else if (e.key === 'ArrowRight' || k === 'n') { if (S.view === 'inbox') step(1); } else if (e.key === 'ArrowLeft' || k === 'p') { if (S.view === 'inbox') step(-1); }
});

/* ── views ───────────────────────────────────────────────────────────────── */
function showView(v) {
  S.view = v; $$('.view').forEach(x => { x.hidden = x.id !== 'view-' + v; });
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === (v === 'morning' ? 'inbox' : v)));
  if (v === 'inbox') { if (!S.current) S.current = openIds()[0] || ORDER[0]; renderQueue(); renderReview(); }
  if (v === 'courses') renderCourses();
}
$$('.tab').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));
function refreshBadge() { const n = openIds().length; const b = $('#badge'); b.textContent = n; b.classList.toggle('zero', n === 0); }
function select(id) { S.current = id; S.editing = null; if (S.view !== 'inbox') showView('inbox'); else { renderQueue(); renderReview(); } }
function step(dir) { const i = ORDER.indexOf(S.current); let j = i + dir; while (j >= 0 && j < ORDER.length && !NEEDS_ME.has(S.status[ORDER[j]]) && dir > 0) j++; if (j < 0 || j >= ORDER.length) { j = dir > 0 ? (openIds()[0] ? ORDER.indexOf(openIds()[0]) : ORDER.length - 1) : 0; } select(ORDER[j]); }
function nextOpen() { const i = ORDER.indexOf(S.current); const after = ORDER.slice(i + 1).find(id => NEEDS_ME.has(S.status[id])) || openIds()[0]; return after || null; }

/* ── morning ─────────────────────────────────────────────────────────────── */
function renderMorning() {
  const m = $('#morning-card'); m.innerHTML = '';
  const crit = C.findings.find(f => f.severity === 'critical');
  const list = el('ul', { class: 'courses' });
  C.courses.forEach(c => {
    const fs = byCourse[c.id]; const isCrit = fs.some(f => f.severity === 'critical');
    const shorts = fs.slice().sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]).map(f => f.short);
    list.append(el('li', { role: 'button', tabindex: 0, onclick: () => select(fs[0].id) }, el('span', { class: 'dot' + (isCrit ? ' critical' : '') }), el('span', {}, el('b', {}, c.title), el('span', { class: 'sub' }, shorts.join(' · '))), el('span', { class: 'n' }, `${fs.length} ${fs.length === 1 ? 'item' : 'items'}`)));
  });
  m.append(
    el('div', { class: 'stamp' }, el('span', {}, `# ld-content-ops`), el('span', {}, '·'), el('span', {}, `${C.meta.weekday}, ${fshort(C.meta.date)} · ${C.scan.finished}`)),
    el('div', { class: 'msg' }, el('span', { class: 'avatar sky' }, 'CI'), el('div', {},
      el('div', { class: 'who' }, el('b', {}, 'Continuity'), el('span', { class: 'app-tag' }, 'app'), el('span', { class: 'time' }, C.scan.finished)),
      el('div', { class: 'text' }, el('span', { class: 'lede' }, C.morning.greeting), el('b', {}, C.morning.summary)),
      list,
      el('div', { class: 'actions' }, el('button', { class: 'btn primary', onclick: () => select(crit.id) }, 'Start with the critical one'), el('button', { class: 'btn', onclick: () => { S.current = openIds()[0]; showView('inbox'); } }, 'See the whole queue')))),
    el('div', { class: 'msg sub' }, el('span', { class: 'avatar mint' }, 'W'), el('div', {}, el('div', { class: 'who' }, el('b', {}, 'WellSaid'), el('span', { class: 'app-tag' }, 'app'), el('span', { class: 'time' }, '2:07 AM')), el('div', { class: 'text' }, C.morning.wellsaid))),
    el('p', { class: 'morning-foot' }, `You are ${ME.name}, ${ME.role} at ${C.company.name} (fictional). Press ? for presenter notes.`));
}

/* ── queue ───────────────────────────────────────────────────────────────── */
function dotClass(f) { const st = S.status[f.id]; if (RESOLVED.has(st)) return st === 'dismissed' ? 'muted' : 'done'; if (st === 'publishing' || st === 'handoff') return 'busy'; if (st === 'review') return 'call'; if (st === 'task') return 'task'; return f.severity === 'critical' ? 'critical' : ''; }
function renderQueue() {
  refreshBadge(); const q = $('#queue'); q.innerHTML = '';
  const ready = readyIds().length;
  q.append(el('div', { class: 'q-head' }, el('div', { class: 't' }, el('h2', {}, 'Your queue'), el('span', { class: 'count num' }, `${openIds().length} of ${ORDER.length} left`)), el('button', { class: 'btn small primary', disabled: ready < 2 || S.batch, onclick: approveAll }, S.batch ? 'Working…' : ready >= 2 ? `Approve all ${ready} ready` : ready === 1 ? 'One left to approve' : 'All fixes approved')));
  C.courses.forEach(c => {
    const fs = ORDER.filter(id => findingById[id].course === c.id);
    q.append(el('div', { class: 'q-course' }, el('b', {}, c.title), el('span', {}, `${c.format} · ${c.voice.name}`)));
    fs.forEach(id => { const f = findingById[id], st = S.status[id]; q.append(el('button', { class: 'q-item' + (id === S.current ? ' active' : '') + (RESOLVED.has(st) ? ' done' : ''), onclick: () => select(id) }, el('span', { class: 'dot ' + dotClass(f) }), el('span', { class: 'l' }, el('b', {}, f.short), el('span', {}, st === 'published' && S.versions[c.id] ? `Published · ${S.versions[c.id]}` : LABEL[st])))); });
  });
}

/* ── review card ─────────────────────────────────────────────────────────── */
function mockScreen(f, after) {
  const orders = f.id !== 'F6';
  const side = el('div', { class: 'side' }, el('div', { class: 'brandm' }, 'ClaimsCore · ' + (after ? '26.3' : '26.2')), el('div', { class: 'item' }, 'Claim'));
  if (!after) side.append(el('div', { class: 'item' + (orders ? ' hi' : '') }, 'Payments'), el('div', { class: 'item' }, 'Documents'), el('div', { class: 'item' }, 'Notes'), el('div', { class: 'item' }, 'Tasks'));
  else side.append(el('div', { class: 'item' + (orders ? ' hi good' : '') }, 'Settlement ▾'), el('div', { class: 'item sub' + (orders ? ' hi good' : '') }, 'Total Loss'), el('div', { class: 'item sub' }, 'Partial'), el('div', { class: 'item' }, 'Documents'), el('div', { class: 'item' }, 'Notes'));
  const main = el('div', { class: 'mainp' }, el('div', { class: 'ttl' }, 'Settlement worksheet · Total loss'), el('div', { class: 'row', style: '--w:70%' }), el('div', { class: 'row', style: '--w:45%' }), el('div', { class: 'row', style: '--w:60%' }), el('div', { class: 'btns' }, el('span', { class: 'b pri' }, 'Issue payment'), el('span', { class: 'b' + (!orders ? (after ? ' hi good' : ' hi') : '') }, after ? 'Pend' : 'Hold for Review'), el('span', { class: 'b' }, 'Cancel')));
  return el('div', { class: 'mock', role: 'img', 'aria-label': after ? 'Current screen' : 'Screen as recorded' }, side, main);
}
function mockCompare(f) {
  const wrap = el('div', { class: 'mock-wrap' }); let after = false; const mock = el('div');
  const b1 = el('button', { class: 'btn small', onclick: () => { after = false; draw(); } }, 'In the video'), b2 = el('button', { class: 'btn small', onclick: () => { after = true; draw(); } }, 'Today');
  const draw = () => { mock.innerHTML = ''; mock.append(mockScreen(f, after)); b1.classList.toggle('on', !after); b2.classList.toggle('on', after); };
  wrap.append(el('div', { class: 'mock-toggle' }, b1, b2), mock, el('div', { class: 'mock-cap' }, el('span', {}, `frame at ${segById[f.segment].at}`), el('span', {}, narration(f) ? 'the narration can be re-voiced' : 'the recording needs a person')));
  draw(); return wrap;
}
function versionNote(c) {
  const fs = byCourse[c.id].filter(f => narration(f) && S.status[f.id] === 'published');
  const srcs = [...new Set(fs.flatMap(f => f.sources))].map(id => `${sourceById[id].name} (${fshort(sourceById[id].date)})`);
  const mat = fs.find(f => f.material);
  return `${S.versions[c.id]} · ${c.title}\nPublished ${fdate(C.meta.date)} ${clockStr()} by ${ME.name} · ${fs.length} line${fs.length === 1 ? '' : 's'} re-voiced (${c.voice.name}) · captions and transcript regenerated\n` + fs.map(f => `• ${segById[f.segment].where}: ${f.short}${f.voice_override ? ` (re-recorded in ${f.voice_override.name})` : ''}`).join('\n') + `\nSources: ${srcs.join('; ')}\nLearners: ${mat ? (S.notify[mat.id] === 'reassign' ? 're-assigned for re-completion' : S.notify[mat.id] === 'notify' ? 'notified of a material change' : 'updated in place') : 'updated in place, completions preserved'}`;
}
function renderReview() {
  const r = $('#review'); r.innerHTML = ''; const f = findingById[S.current]; if (!f) return;
  const seg = segById[f.segment], c = courseById[f.course], srcs = f.sources.map(id => sourceById[id]), st = S.status[f.id];
  const rv = el('div', { class: 'rv' });
  rv.append(el('div', { class: 'rv-top' }, el('p', { class: 'rv-where' }, el('a', { class: 'course-link', href: '#course-' + c.id, onclick: e => { e.preventDefault(); openCourse(c.id); } }, el('b', {}, c.title)), ` · ${seg.where} · narrated by ${c.voice.name}`), el('span', { class: 'chip ' + f.severity }, f.severity === 'critical' ? 'Critical' : f.severity === 'serious' ? 'Needs fixing' : 'Minor')));
  rv.append(el('h1', { class: 'rv-headline' }, f.headline));
  // what changed
  const s0 = srcs[0];
  rv.append(el('div', { class: 'box change' }, el('span', { class: 'k' }, 'What changed'), el('p', {}, srcs.map(s => s.change).join(' ')), el('div', { class: 'src' }, el('span', {}, srcs.map(s => `${s.name} · ${fdate(s.date)}`).join(' — ')), el('button', { class: 'lnk', onclick: () => openSheet('how') }, 'How did it know?'))));
  if (st === 'review' && s0.conflict) {
    rv.append(el('div', { class: 'box conflict' }, el('span', { class: 'k' }, 'Two sources disagree'), el('div', { class: 'srcpair' }, el('div', { class: 'one' }, el('span', { class: 'k' }, s0.name), el('p', {}, s0.change), el('span', { class: 'src' }, `${s0.system} · ${fdate(s0.date)}`)), el('div', { class: 'one' }, el('span', { class: 'k' }, s0.conflict.name), el('p', {}, s0.conflict.says), el('span', { class: 'src' }, s0.conflict.system))), el('p', { style: 'font-size:15px;color:var(--ink-2)' }, 'The agents don\'t guess. The proposed fix follows the policy-level document; you decide which source is right.')));
  }
  if (c.kind === 'video') rv.append(mockCompare(f));
  if (narration(f)) {
    rv.append(player({ key: seg.id + '_orig', text: seg.script, mask: staleMask(seg.script, takeText(f)), kind: 'stale', label: 'In the course today', sub: `published ${fdate(c.updated)}`, course: c.id, tone: 'stale' }));
    const tv = takeVoice(f), std = standardFor(c);
    rv.append(player({ key: takeKey(f), text: takeText(f), mask: freshMask(seg.script, takeText(f)), kind: 'fresh', label: S.take[f.id] === 'alt' ? 'Your edited line' : 'The fix', sub: f.voice_override ? `re-recorded in ${tv.name}, the approved voice for ${std.content_type.toLowerCase()}` : 'same narrator, only this line re-recorded', course: c.id, tone: 'fresh', voiceName: tv.name }));
    if (S.editing === f.id) rv.append(editor(f));
  } else {
    rv.append(el('div', { class: 'box task' }, el('span', { class: 'k' }, 'Needs a person'), el('p', {}, f.note), el('p', { style: 'font-size:16px;color:var(--ink-2)' }, el('b', {}, 'Task: '), f.task)));
  }
  // outcome / actions
  if (st === 'publishing') rv.append(el('div', { class: 'outcome plain' }, el('h3', {}, 'Publishing…'), el('div', { class: 'progress' }, el('i', { id: 'pub-progress' })), el('p', { id: 'pub-step' }, 'Splicing the new line into the course…')));
  else if (st === 'published') rv.append(outcome('ok', `Published.`, `${c.title} is now ${S.versions[c.id]} in ${c.publish.target}. Completions kept. ${f.material ? (S.notify[f.id] === 'reassign' ? 'Learners re-assigned.' : S.notify[f.id] === 'notify' ? 'Learners notified.' : '') : ''} Posted to #ld-content-ops.`, true, c.id, seg.id));
  else if (st === 'handoff') rv.append(outcome('sky', 'Sent to Priya.', 'Storyline keeps its audio inside the project file, so Priya swaps this line and republishes. About two minutes, no re-record. Slack will confirm.', true, c.id, seg.id));
  else if (st === 'dismissed') rv.append(el('div', { class: 'outcome plain' }, el('h3', {}, 'Kept as is.'), el('p', {}, 'Continuity won\'t flag this wording again unless the source changes.'), el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => { S.status[f.id] = f.status === 'auto' ? 'open' : f.status; select(f.id); } }, 'Undo'), nextBtn())));
  else if (st === 'task_created') rv.append(outcome('sky', 'Task created.', `Assigned to you, due Friday, September 18. ${f.id === 'V1' ? 'The re-voiced narration waits in the Kaltura draft until the new footage is in.' : 'The narration fix publishes on its own; the video is a request to the CEO\'s office.'}`, true));
  else {
    const act = el('div', { class: 'rv-actions' });
    if (st === 'open') act.append(el('button', { class: 'btn primary', onclick: () => approve(f.id) }, 'Approve & publish'), el('button', { class: 'btn', onclick: () => { S.editing = S.editing === f.id ? null : f.id; renderReview(); } }, S.editing === f.id ? 'Close editor' : 'Edit the wording'), el('button', { class: 'btn quiet', onclick: () => dismiss(f.id) }, 'Not a problem'));
    else if (st === 'review') act.append(el('button', { class: 'btn primary', onclick: () => resolveReview(f.id, 'guide') }, `Use the ${s0.name} · approve`), el('button', { class: 'btn', onclick: () => resolveReview(f.id, 'faq') }, `Keep the ${s0.conflict.name} · not a problem`), el('button', { class: 'btn quiet', onclick: () => { S.editing = S.editing === f.id ? null : f.id; renderReview(); } }, 'Edit the wording'));
    else if (st === 'task') act.append(el('button', { class: 'btn primary', onclick: () => createTask(f.id) }, 'Create a task for me'), el('button', { class: 'btn quiet', onclick: () => step(1) }, 'Skip for now'));
    rv.append(act);
  }
  // details
  const d = el('details', { class: 'more' }, el('summary', {}, 'Details: how it checked, where it goes back'));
  const kv = el('dl', { class: 'kv' });
  if (narration(f)) kv.append(el('dt', {}, 'Voice check'), el('dd', {}, `Prosody natural · loudness matched to the neighboring lines · 0 pronunciation flags · length ${lenDelta(seg, f)}`));
  kv.append(el('dt', {}, 'Voice'), el('dd', {}, voiceLine(c, f)));
  kv.append(el('dt', {}, 'Confidence'), el('dd', {}, `${Math.round(f.confidence * 100)}% that the course is out of date`), el('dt', {}, 'Goes back to'), el('dd', {}, el('b', {}, c.publish.target), ` · ${c.publish.package} · ${S.versions[c.id] || c.publish.version}`), el('dt', {}, 'How'), el('dd', {}, c.publish.how));
  if (f.material && narration(f) && st === 'open') { const sel = el('select', { onchange: e => { S.notify[f.id] = e.target.value; } }, el('option', { value: 'notify' }, 'Notify assigned learners'), el('option', { value: 'quiet' }, 'Update quietly'), el('option', { value: 'reassign' }, 'Re-assign for re-completion')); sel.value = S.notify[f.id]; kv.append(el('dt', {}, 'Learners'), el('dd', {}, 'Material change · ', sel)); }
  kv.append(el('dt', {}, 'In Notion'), el('dd', {}, el('a', { class: 'lnk', href: f.notion, target: '_blank', rel: 'noopener' }, 'This item'), ' · ', el('a', { class: 'lnk', href: C.links.notion_inventory, target: '_blank', rel: 'noopener' }, 'Curriculum inventory'), ' · ', el('a', { class: 'lnk', href: C.links.notion_hub, target: '_blank', rel: 'noopener' }, 'Content operations hub')));
  if (st === 'published') kv.append(el('dt', {}, 'Version note'), el('dd', {}, el('pre', { class: 'vnote' }, versionNote(c))));
  d.append(kv); rv.append(d);
  r.append(rv); r.scrollTop = 0;
}
function outcome(kind, head, body, withNext, courseId, segId) { return el('div', { class: 'outcome' + (kind === 'sky' ? ' sky' : '') }, el('h3', {}, el('span', { class: 'ok' }, kind === 'sky' ? '→ ' : '✓ '), head), el('p', {}, body), el('div', { class: 'row' }, withNext ? nextBtn() : null, courseId ? el('button', { class: 'btn small', onclick: () => openCourse(courseId, segId) }, kind === 'sky' ? 'Open the course' : 'Open the published course') : null, el('button', { class: 'btn quiet small', onclick: () => openSheet('slack') }, 'See it in Slack'))); }
function nextBtn() { const n = nextOpen(); return n ? el('button', { class: 'btn primary', onclick: () => select(n) }, `Next: ${findingById[n].short} →`) : el('button', { class: 'btn primary', onclick: () => showView('courses') }, 'Hear the updated courses →'); }
const lenDelta = (seg, f) => { const a = clipFor(seg.id + '_orig'), b = clipFor(takeKey(f)); if (!a || !b) return 'preserved'; const d = b.duration - a.duration; return `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} s`; };
function editor(f) {
  const seg = segById[f.segment], c = courseById[f.course];
  const ta = el('textarea', { 'aria-label': 'Edit the line' }); ta.value = takeText(f);
  const same = (a, b) => toks(a).map(norm).join(' ') === toks(b).map(norm).join(' ');
  const revoice = el('button', { class: 'btn primary', onclick: () => { const v = ta.value.trim(); if (same(v, f.fixed)) { S.take[f.id] = 'fix'; S.editing = null; toast(`Re-recorded in ${c.voice.name}'s voice · 1.8 s`); renderReview(); } else if (f.alt && same(v, f.alt.text)) { S.take[f.id] = 'alt'; S.editing = null; toast(`Re-recorded in ${c.voice.name}'s voice · 1.9 s`); renderReview(); } else toast('Live re-recording needs the WellSaid connection, and this demo runs offline. Try one of the suggested wordings.', 4500); } }, `Re-record in ${c.voice.name}'s voice`);
  return el('div', { class: 'box' }, el('span', { class: 'k' }, 'Edit the wording'), el('div', { class: 'editor' }, ta, el('div', { class: 'chips' }, el('button', { class: 'chipbtn', onclick: () => { ta.value = f.fixed; } }, 'Suggested wording'), f.alt ? el('button', { class: 'chipbtn', onclick: () => { ta.value = f.alt.text; } }, f.alt.label) : null, el('button', { class: 'chipbtn', onclick: () => { ta.value = seg.script; } }, 'Original wording')), el('div', { class: 'rv-actions', style: 'padding-top:0' }, revoice, el('span', { class: 'muted', style: 'font-size:14px' }, 'About two seconds, same pronunciation library.'))));
}

/* ── actions ─────────────────────────────────────────────────────────────── */
function bump(c) { if (!S.versions[c.id]) S.versions[c.id] = c.publish.version.split('→')[1].trim(); return S.versions[c.id]; }
function logToday(msg) { S.todayLog.push({ t: clockStr(), msg }); }
async function approve(id, opts = {}) {
  const f = findingById[id], c = courseById[f.course]; if (!['open', 'review'].includes(S.status[id])) return;
  S.status[id] = 'publishing'; S.editing = null; if (!opts.quietUI) { renderQueue(); if (S.current === id) renderReview(); }
  const steps = ['Splicing the new line into the course…', 'Regenerating captions and transcript…', c.publish.handoff ? 'Packaging the line and a change list for Priya…' : `Building a new version of the same course…`, c.publish.handoff ? 'Sending to Priya…' : `Pushing to ${c.publish.target}…`];
  for (let i = 0; i < steps.length; i++) { const p = $('#pub-progress'), s = $('#pub-step'); if (p) p.style.width = ((i + 1) / steps.length * 100) + '%'; if (s) s.textContent = steps[i]; await wait(opts.fast ? 160 : 450); }
  tick(1);
  if (c.publish.handoff) { S.status[id] = 'handoff'; logToday(`Approved ${f.short} → sent to Priya N.`); if (!opts.silent) { slackPost('continuity', `📦 <b>${ME.name}</b> approved a fix in <i>${c.title}</i> (${f.short}). New line + change list sent to <b>Priya N.</b>, who owns the Storyline file.`); schedulePriya(); } }
  else { const v = bump(c); S.status[id] = 'published'; logToday(`Approved ${f.short} → ${c.publish.target} ${v}`); if (!opts.silent) slackPost('continuity', `✅ <b>${ME.name}</b> approved a fix in <i>${c.title}</i> (${f.short}). Republished to <b>${c.publish.target}</b> as ${v}, completions kept${f.material && S.notify[id] !== 'quiet' ? `, ${c.learners.split(' ·')[0]} learners ${S.notify[id] === 'reassign' ? 're-assigned' : 'notified'}` : ''}.${f.voice_override ? ` Re-recorded in <b>${f.voice_override.name}</b>, the approved voice for ${standardFor(c).content_type.toLowerCase()}.` : ''}`); }
  if (!opts.quietUI) { renderQueue(); if (S.current === id) renderReview(); }
}
let priyaTimer = 0;
function schedulePriya() {
  clearTimeout(priyaTimer);
  priyaTimer = setTimeout(async () => {
    slackPost('priya', 'Got it. Swapping the audio in the Storyline project now.');
    await wait(reduced ? 0 : 4200);
    const c = courseById.C; const v = bump(c); let n = 0;
    C.findings.filter(f => f.course === 'C' && S.status[f.id] === 'handoff').forEach(f => { S.status[f.id] = 'published'; n++; });
    tick(4);
    slackPost('priya', `Swapped ${n} line${n === 1 ? '' : 's'} and republished <i>${c.title}</i> as <b>${v}</b>. Same course, completions kept. No re-record, no timeline surgery. ✅`, { react: '🙌 3' });
    logToday(`Priya republished ${c.title} ${v}`);
    renderQueue(); if (S.view === 'inbox') renderReview(); if (S.view === 'courses') renderCourses();
  }, reduced ? 0 : 3600);
}
async function approveAll() {
  if (S.batch) return; const ids = readyIds(); if (!ids.length) return;
  S.batch = true; renderQueue();
  const r = $('#review'); r.innerHTML = '';
  const list = el('ul', { class: 'worklist' }); const rows = {};
  ids.forEach(id => { const f = findingById[id], c = courseById[f.course]; const li = el('li', {}, el('span', { class: 'ck' }), el('span', {}, el('b', {}, f.short), ` · ${c.title}`), el('span', { class: 'st' }, 'queued')); rows[id] = li; list.append(li); });
  r.append(el('div', { class: 'rv summary' }, el('h1', { class: 'rv-headline' }, `Approving ${ids.length} fixes.`), el('p', { class: 'muted', style: 'font-size:16px' }, 'Each line is spliced in, captions regenerate, and the course goes back to where it lives as a new version.'), list));
  const touched = {};
  for (const id of ids) {
    const f = findingById[id], c = courseById[f.course]; rows[id].querySelector('.ck').classList.add('busy'); rows[id].querySelector('.st').textContent = 'publishing…';
    await approve(id, { silent: true, fast: true, quietUI: true });
    rows[id].querySelector('.ck').classList.remove('busy'); rows[id].querySelector('.ck').classList.add('ok'); rows[id].querySelector('.ck').textContent = '✓'; rows[id].querySelector('.st').textContent = c.publish.handoff ? 'with Priya' : `published ${S.versions[c.id]}`; rows[id].querySelector('.st').classList.add('ok');
    touched[c.id] = (touched[c.id] || 0) + 1; renderQueue(); await wait(120);
  }
  S.batch = false; S.batchDone = true; tick(1);
  const lines = Object.entries(touched).map(([cid, n]) => { const c = courseById[cid]; return c.publish.handoff ? `<i>${c.title}</i> → ${n} line${n === 1 ? '' : 's'} to Priya N. (Storyline)` : `<i>${c.title}</i> → ${c.publish.target} ${S.versions[cid]} (${n} line${n === 1 ? '' : 's'})`; });
  slackPost('continuity', `✅ <b>${ME.name}</b> approved <b>${ids.length} fixes</b>. Republished:`, { list: lines.map(l => ({ sev: 'done', html: l })) });
  if (touched.C) schedulePriya();
  renderQueue(); renderSummary(ids.length, Object.keys(touched).length);
}
function renderSummary(nFixes, nCourses) {
  const r = $('#review'); r.innerHTML = '';
  const left = openIds();
  const still = el('div', { class: 'still' });
  left.forEach(id => { const f = findingById[id]; still.append(el('div', { class: 'row' }, el('span', {}, el('b', {}, f.short), el('span', { style: 'margin-left:10px' }, S.status[id] === 'review' ? 'two sources disagree' : 'needs a person')), el('button', { class: 'btn small', onclick: () => select(id) }, 'Open'))); });
  const approvedTotal = C.findings.filter(f => narration(f) && ['published', 'handoff', 'publishing'].includes(S.status[f.id])).length;
  r.append(el('div', { class: 'rv summary' },
    el('h1', { class: 'rv-headline' }, `Done. ${approvedTotal} lines re-recorded this morning, ${nCourses} courses going back out.`),
    el('div', { class: 'stats' }, el('div', { class: 'stat good' }, el('span', { class: 'v num' }, approvedTotal), el('span', { class: 'k' }, 'fixes approved, same five narrators')), el('div', { class: 'stat good' }, el('span', { class: 'v num' }, nCourses), el('span', { class: 'k' }, 'courses republished as new versions, completions kept')), el('div', { class: 'stat' }, el('span', { class: 'v num' }, '0'), el('span', { class: 'k' }, 'studio sessions, re-records or timeline edits'))),
    left.length ? el('div', {}, el('p', { class: 'eyebrow', style: 'margin-bottom:10px' }, 'Still yours'), still) : null,
    el('div', { class: 'rv-actions' }, left.length ? el('button', { class: 'btn primary', onclick: () => select(left[0]) }, `Next: ${findingById[left[0]].short} →`) : null, el('button', { class: 'btn', onclick: () => showView('courses') }, 'Hear the updated courses'), el('button', { class: 'btn quiet', onclick: () => openSheet('slack') }, 'See it in Slack'))));
}
function dismiss(id, why) { const f = findingById[id]; S.status[id] = 'dismissed'; tick(1); logToday(`Kept ${f.short} as is${why ? ' · ' + why : ''}`); slackPost('continuity', `🟢 <b>${ME.name}</b> kept the current wording for <i>${courseById[f.course].title}</i> (${f.short})${why ? ` · ${why}` : ''}. I'll leave it alone until the source changes again.`); renderQueue(); renderReview(); }
function createTask(id) { const f = findingById[id]; S.status[id] = 'task_created'; tick(1); logToday(`Created task: ${f.task.split('.')[0]}`); slackPost('continuity', `📋 Task created for <b>${ME.name}</b>, due Fri Sep 18 · <i>${courseById[f.course].title}</i>: ${f.task.split('.')[0]}.`); renderQueue(); renderReview(); }
async function resolveReview(id, choice) {
  const f = findingById[id], s = sourceById[f.sources[0]];
  if (choice === 'guide') { S.status[id] = 'open'; await approve(id, { silent: true }); slackPost('continuity', `✅ <b>${ME.name}</b> settled the conflict on <i>${courseById[f.course].title}</i> (${f.short}): <b>${s.name}</b> outranks <b>${s.conflict.name}</b>. Fix sent to Priya N. I've flagged the FAQ to the People team.`); logToday(`Settled ${f.short}: ${s.name} is authoritative`); setTimeout(() => slackPost('sam', 'Good catch. The FAQ page is mine, fixing it this morning.', { react: '👍 2' }), reduced ? 0 : 5200); }
  else dismiss(id, `${s.conflict.name} kept, ${s.name} flagged for correction`);
  renderQueue(); renderReview();
}

/* ── Slack sheet ─────────────────────────────────────────────────────────── */
const msgs = $('#sl-msgs');
let webhook = ''; try { webhook = localStorage.getItem('suc-slack-webhook') || ''; } catch (_) {}
const mrkdwn = html => html.replace(/<br\s*\/?>/gi, '\n').replace(/<b>(.*?)<\/b>/gi, '*$1*').replace(/<i>(.*?)<\/i>/gi, '_$1_').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
function postReal(html, opts = {}) {
  if (!webhook) return;
  let text = mrkdwn(html); if (opts.list) text += '\n' + opts.list.map(it => '• ' + mrkdwn(it.html)).join('\n');
  try { fetch(webhook, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ text }) }).catch(() => {}); } catch (_) {}
}
function renderConnect() {
  const box = $('#sl-connect'); box.innerHTML = '';
  if (webhook) { box.append(el('div', { class: 'row' }, el('span', { class: 'live' }, '● Live'), el('span', {}, 'every post here also goes to your real Slack channel'), el('button', { class: 'sl-btn', onclick: () => { webhook = ''; try { localStorage.removeItem('suc-slack-webhook'); } catch (_) {} renderConnect(); } }, 'Disconnect'))); return; }
  const inp = el('input', { type: 'url', placeholder: 'Paste a Slack incoming-webhook URL to post for real', 'aria-label': 'Slack webhook URL' });
  box.append(el('div', { class: 'row' }, inp, el('button', { class: 'sl-btn primary', onclick: () => { const v = inp.value.trim(); if (!/^https:\/\/hooks\.slack\.com\//.test(v)) { toast('That does not look like a hooks.slack.com webhook URL.'); return; } webhook = v; try { localStorage.setItem('suc-slack-webhook', v); } catch (_) {} renderConnect(); postReal(`:wave: Drift Inbox connected. Approvals made in the demo will post here.`); toast('Connected. Approvals will post to your Slack channel.'); } }, 'Connect')), el('span', {}, 'Simulated channel below. Connect a webhook and the same messages post to a real channel during the demo.'));
}
renderConnect();
function slackPost(who, html, opts = {}) {
  const p = P[who] || P.continuity;
  const body = el('div', { class: 'sl-body' }, el('div', { class: 'sl-name' }, el('b', {}, p.name), p.app ? el('span', { class: 'app-tag' }, 'APP') : null, el('span', { class: 'sl-time' }, opts.time || clockStr())), el('div', { class: 'sl-text', html }));
  if (opts.list) { const ul = el('ul', { class: 'sl-list' }); opts.list.forEach(it => ul.append(el('li', {}, el('span', { class: 'sev ' + it.sev }), el('span', { html: it.html })))); body.append(ul); }
  if (opts.buttons) { const a = el('div', { class: 'sl-actions' }); opts.buttons.forEach(b => a.append(el('button', { class: 'sl-btn' + (b.primary ? ' primary' : ''), onclick: b.onclick }, b.label))); body.append(a); }
  if (opts.react) body.append(el('span', { class: 'sl-react' }, opts.react));
  const m = el('div', { class: 'sl-msg' }, el('span', { class: 'avatar ' + p.color }, p.initials), body);
  msgs.append(m); msgs.scrollTop = msgs.scrollHeight; if (!opts.time) { postReal(`*${p.name}:* ` + html, opts); if (sheets.slack.hidden) toast(webhook ? 'Posted to Slack' : 'Posted to #ld-content-ops', 1800); } return m;
}
function seedSlack() {
  msgs.innerHTML = ''; msgs.append(el('div', { class: 'sl-day' }, 'Today')); $('#sl-members').textContent = ` · ${C.slack.members} members`;
  const crit = C.findings.find(f => f.severity === 'critical');
  slackPost('continuity', `${C.morning.greeting}<br><b>${C.morning.summary}</b>`, { time: C.scan.finished, list: C.courses.map(c => ({ sev: byCourse[c.id].some(f => f.severity === 'critical') ? 'critical' : 'serious', html: `<i>${c.title}</i> · ${byCourse[c.id].length} item${byCourse[c.id].length === 1 ? '' : 's'}` })), buttons: [{ label: 'Open the inbox', primary: true, onclick: () => { closeSheets(); select(crit.id); } }] });
  slackPost('wellsaid', C.morning.wellsaid, { time: '2:07 AM' });
  slackPost('continuity', `🔴 <b>Critical</b> · <i>${courseById[crit.course].title}</i>: ${crit.headline} The fix is ready in Patrick K.'s voice.`, { time: '2:07 AM', buttons: [{ label: 'Review', primary: true, onclick: () => { closeSheets(); select(crit.id); } }] });
}
seedSlack();

/* ── How it works sheet ──────────────────────────────────────────────────── */
(() => {
  const h = $('#how-body');
  const OWN = { ci: 'Continuity Intelligence', ws: 'WellSaid', flow: 'Workflow' };
  h.append(el('div', {}, el('h3', {}, 'Every night, six agents. Every morning, one human.'), el('p', { style: 'margin-top:6px' }, 'Continuity Intelligence finds what drifted and drafts the fix. WellSaid re-records only that line in the original narrator\'s voice. Nothing publishes until a person approves.')));
  const steps = el('div', { class: 'steps' });
  C.agents.forEach((a, i) => steps.append(el('div', { class: 'step' }, el('span', { class: 'n ' + a.owner }, i + 1), el('div', {}, el('b', {}, `${a.name} · ${OWN[a.owner]}`), el('p', {}, a.role)))));
  steps.append(el('div', { class: 'step' }, el('span', { class: 'n you' }, '✓'), el('div', {}, el('b', {}, 'You decide'), el('p', {}, 'Approve, edit the wording, or keep it as is. Two sources disagree? It stops and asks. A screen recording or a video of a person? It opens a task instead.'))));
  h.append(steps);
  h.append(el('div', {}, el('h3', {}, 'Voice & style standards'), el('p', { style: 'margin-top:6px' }, 'The Voice agent reads these before it re-records a line: which narrator is approved for which kind of content, and how scripts are written. A course narrated by a retired voice is flagged like any other drift.'),
    el('ul', { class: 'srcs', style: 'margin-top:10px' }, ...C.voice_standards.map(s => el('li', {}, el('span', {}, el('b', {}, s.content_type), el('span', {}, s.status === 'Retired' ? s.notes : s.who)), el('span', { class: 'when' + (s.status === 'Retired' ? '' : ' ok') }, s.status === 'Retired' ? `${s.voice} · retired` : s.voice)))),
    el('ul', { class: 'rules' }, ...C.style_rules.map(r => el('li', {}, r))),
    el('p', { style: 'margin-top:10px' }, el('a', { class: 'lnk', href: C.links.notion_standards, target: '_blank', rel: 'noopener' }, 'Voice & style standards in Notion →'), ' · ', el('a', { class: 'lnk', href: C.links.notion_hub, target: '_blank', rel: 'noopener' }, 'Content operations hub →'))));
  h.append(el('div', {}, el('h3', {}, `Last night at ${C.company.name}`), el('ol', { class: 'log', style: 'margin-top:10px' }, ...C.scan.log.map(([t, who, msg, cls]) => el('li', {}, el('span', { class: 't' }, t), el('span', { class: cls || '' }, msg))))));
  h.append(el('div', {}, el('h3', {}, 'Sources being watched'), el('ul', { class: 'srcs', style: 'margin-top:10px' }, ...[...C.sources].sort((a, b) => b.date.localeCompare(a.date)).map(s => el('li', {}, el('span', {}, el('b', {}, s.name), el('span', {}, s.change)), el('span', { class: 'when' }, `moved ${fshort(s.date)}`))), ...C.unchanged_sources.map(s => el('li', {}, el('span', {}, el('b', {}, s.name), el('span', {}, s.system)), el('span', { class: 'when ok' }, 'unchanged'))))));
  h.append(el('div', {}, el('h3', {}, 'Where the fix goes back'), el('ul', { class: 'srcs', style: 'margin-top:10px' }, ...C.courses.map(c => el('li', {}, el('span', {}, el('b', {}, `${c.title} · ${c.format}`), el('span', {}, c.publish.how)), el('span', { class: 'when ok' }, c.publish.package))))));
  h.append(el('p', { class: 'muted', style: 'font-size:13px' }, 'SCORM is the container, not the fix: the fix goes into the source and the package is the new version the LMS receives.'));
})();

/* ── courses view ────────────────────────────────────────────────────────── */
function renderCourses() {
  const g = $('#courses-grid'); g.innerHTML = '';
  C.courses.forEach(c => {
    const sc = courseScore(c), fs = byCourse[c.id], done = fs.filter(f => RESOLVED.has(S.status[f.id])).length;
    const std = standardFor(c), revoiced = byCourse[c.id].some(f => f.voice_override && S.status[f.id] === 'published');
    g.append(el('button', { class: 'ccard' + (S.course === c.id ? ' active' : ''), onclick: () => { S.course = c.id; renderCourses(); } }, el('h3', {}, c.title), el('span', { class: 'm' }, `${c.format} · ${c.learners}`), el('span', { class: 'm ' + (voiceOk(c) || revoiced ? 'okv' : 'badv') }, revoiced ? `new lines in ${std.voice} · approved for ${std.content_type.toLowerCase()}` : voiceOk(c) ? `${c.voice.name} · approved for ${std.content_type.toLowerCase()}` : `${c.voice.name} · retired voice; ${std.content_type.toLowerCase()} uses ${std.voice}`), strip(c), el('div', { class: 'st' }, el('span', {}, done === fs.length ? `All ${fs.length} items handled${S.versions[c.id] ? ' · ' + S.versions[c.id] : ''}` : `${fs.length - done} of ${fs.length} items open`), el('span', { class: 'score num' + (sc >= 90 ? ' good' : '') }, sc))));
  });
  renderCourseDetail(courseById[S.course]);
}
function lessonIcon(kind) {
  const paths = {
    course: '<path d="M12 3l8 4v6c0 4.4-3.4 7.6-8 8-4.6-.4-8-3.6-8-8V7l8-4z"/><path d="M9 12l2 2 4-4"/>',
    ai: '<rect x="4" y="5" width="16" height="12" rx="3"/><circle cx="9" cy="11" r="1.4"/><circle cx="15" cy="11" r="1.4"/><path d="M12 2v3M8 21h8"/>',
    onboarding: '<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/>',
    path: '<path d="M4 19c4-1 5-6 9-7s4-5 7-6"/><circle cx="4" cy="19" r="1.6"/><circle cx="20" cy="6" r="1.6"/>',
    video: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind] || paths.course}</svg>`;
}
const courseArt = { A: 'ai', B: 'video', C: 'onboarding', D: 'course', E: 'path' };
S.player = { course: null, seg: null, mode: 'learner' };
let playingCourse = false;
function renderCourseDetail(c, segId) {
  const Pl = S.player; if (Pl.course !== c.id) { Pl.course = c.id; Pl.seg = segId || c.segments[0].id; Pl.mode = 'learner'; } else if (segId) Pl.seg = segId;
  const d = $('#course-detail'); d.innerHTML = '';
  const idx = c.segments.findIndex(s => s.id === Pl.seg), seg = c.segments[idx];
  const fs = findingsBySeg[seg.id] || []; const pub = fs.find(f => S.status[f.id] === 'published'); const open = fs.filter(f => !['published', 'dismissed'].includes(S.status[f.id]));
  const key = pub ? takeKey(pub) : seg.id + '_orig', text = pub ? takeText(pub) : seg.script, voice = pub ? takeVoice(pub).name : c.voice.name;
  const live = S.versions[c.id], author = Pl.mode === 'author';
  const changedLessons = c.segments.filter(s => (findingsBySeg[s.id] || []).some(f => S.status[f.id] === 'published'));
  // LMS chrome
  d.append(el('div', { class: 'lms-bar' }, el('span', { class: 'lms-name' }, c.publish.target), el('span', { class: 'lms-crumb' }, `› My learning › ${c.title}`), live ? el('span', { class: 'chip good' }, `Live · ${live} · updated today`) : el('span', { class: 'chip' }, `Live · ${c.publish.version.split('→')[0].trim()} · last published ${fdate(c.updated)}`), el('span', { class: 'lms-learner' }, 'Signed in as a learner · Alder Mutual SSO')));
  // player frame
  const side = el('aside', { class: 'pf-side' }, el('div', { class: 'pf-course' }, el('b', {}, c.title), el('span', {}, `${c.segments.length} lessons · ${c.duration}`)), el('div', { class: 'pf-progress' }, el('i', { style: `width:${Math.round((idx) / c.segments.length * 100)}%` })));
  const list = el('ol', { class: 'pf-lessons' });
  c.segments.forEach((s, i) => { const changed = (findingsBySeg[s.id] || []).some(f => S.status[f.id] === 'published'); list.append(el('li', {}, el('button', { class: 'pf-lesson' + (i === idx ? ' current' : i < idx ? ' done' : ''), onclick: () => { stopAll(); playingCourse = false; renderCourseDetail(c, s.id); } }, el('span', { class: 'pf-n' }, i < idx ? '✓' : i + 1), el('span', { class: 'pf-t' }, s.title), changed ? el('span', { class: 'chip good tiny' }, 'updated') : null))); });
  side.append(list);
  // slide
  const fig = c.kind === 'video' ? el('div', { class: 'slide-video' }, mockScreen(fs[0] || findingById.F5, false), el('div', { class: 'video-chrome' }, el('span', { class: 'vc-time' }, seg.at || '0:00'), el('div', { class: 'vc-bar' }, el('i', { style: `width:${Math.round((idx + 1) / c.segments.length * 100)}%` })), el('span', { class: 'vc-time' }, c.duration))) : el('div', { class: 'slide-fig art-' + courseArt[c.id], html: lessonIcon(courseArt[c.id]) });
  const sc = scriptNode(text, author && pub ? freshMask(seg.script, takeText(pub)) : [], 'fresh'); sc.classList.add('captions');
  const body = el('div', { class: 'slide-body' }, el('span', { class: 'slide-kicker' }, `Lesson ${idx + 1} of ${c.segments.length}`), el('h2', {}, seg.title), el('p', { class: 'slide-text' }, text));
  const slide = el('div', { class: 'slide' + (c.kind === 'video' ? ' is-video' : '') }, fig, body);
  // audio bar
  const clip = clipFor(key); const btn = el('button', { class: 'pbtn' + (pub ? ' mint' : ''), 'aria-label': 'Play narration', disabled: !clip }, el('span', { class: 'ic' }));
  const bar = el('div', { class: 'bar' }, el('i')), time = el('span', { class: 'time num' }, clip ? fmtTime(clip.duration) : '–:––');
  let playing = false; const setPlaying = v => { playing = v; btn.classList.toggle('playing', v); };
  function playLesson() { return playClip(key, { onStart: () => setPlaying(true), onWord: i => highlightWord(sc, i), onTime: (t, dd) => { bar.firstChild.style.width = (dd ? t / dd * 100 : 0) + '%'; time.textContent = fmtTime(t); }, onEnd: () => { setPlaying(false); highlightWord(sc, -1); bar.firstChild.style.width = '0%'; if (clip) time.textContent = fmtTime(clip.duration); } }); }
  btn.addEventListener('click', () => { if (playing) { stopAll(); playingCourse = false; return; } playLesson(); });
  const audio = el('div', { class: 'pf-audio' }, el('div', { class: 'pf-audio-row' }, btn, bar, time, el('span', { class: 'pf-nar' }, `Narration · ${voice}${pub ? ' · new take' : ''}`)), sc);
  // nav
  const prev = c.segments[idx - 1], next = c.segments[idx + 1];
  const nav = el('div', { class: 'pf-nav' }, el('button', { class: 'btn', disabled: !prev, onclick: () => { stopAll(); renderCourseDetail(c, prev.id); } }, '← Previous'),
    el('button', { class: 'btn primary', onclick: async () => { if (playingCourse) { playingCourse = false; stopAll(); return; } playingCourse = true; for (let i = idx; i < c.segments.length && playingCourse; i++) { renderCourseDetail(c, c.segments[i].id); const b = $('#course-detail .pf-audio .pbtn'); if (!b || b.disabled) { await wait(1200); continue; } await new Promise(res => { const k = (() => { const s2 = c.segments[i]; const f2 = (findingsBySeg[s2.id] || []).find(f => S.status[f.id] === 'published'); return f2 ? takeKey(f2) : s2.id + '_orig'; })(); const sc2 = $('#course-detail .captions'), bar2 = $('#course-detail .pf-audio .bar i'), t2 = $('#course-detail .pf-audio .time'), b2 = $('#course-detail .pf-audio .pbtn'); b2.classList.add('playing'); playClip(k, { onWord: w => highlightWord(sc2, w), onTime: (t, dd) => { bar2.style.width = (dd ? t / dd * 100 : 0) + '%'; t2.textContent = fmtTime(t); }, onEnd: () => { b2.classList.remove('playing'); res(); } }); }); await wait(350); } playingCourse = false; } }, playingCourse ? 'Stop' : 'Play course from here'),
    el('button', { class: 'btn', disabled: !next, onclick: () => { stopAll(); renderCourseDetail(c, next.id); } }, 'Next →'));
  // author panel
  let authorPanel = null;
  if (author) {
    const items = changedLessons.map(s => { const f = (findingsBySeg[s.id] || []).find(x => S.status[x.id] === 'published'); return el('li', {}, el('b', {}, `Lesson ${c.segments.indexOf(s) + 1} · ${s.title}`), ` — ${f.short}${f.voice_override ? ` · re-recorded in ${f.voice_override.name}` : ''}`); });
    const tasks = byCourse[c.id].filter(f => !narration(f) && ['task', 'task_created'].includes(S.status[f.id]));
    authorPanel = el('div', { class: 'author-panel' }, el('div', { class: 'ap-head' }, el('b', {}, live ? `What changed in ${live}` : 'Nothing published yet'), el('span', {}, live ? `Published today at ${clockStr()} by ${ME.name} · captions and transcript regenerated · completions kept` : `${byCourse[c.id].filter(f => !RESOLVED.has(S.status[f.id])).length} open items in the Drift Inbox`)),
      items.length ? el('ul', { class: 'ap-list' }, ...items) : null,
      tasks.length ? el('p', { class: 'ap-note' }, `${tasks.map(t => t.short).join(' · ')}: ${tasks[0].id === 'V1' ? 'the recording still shows the old screen until the re-capture task is done; the narration is already new.' : 'media replacement pending; the narration is already new.'}`) : null,
      pub ? el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => { const orig = seg.id + '_orig'; const sc3 = $('#course-detail .captions'); sc3.innerHTML = ''; scriptNode(seg.script, staleMask(seg.script, takeText(pub)), 'stale').childNodes.forEach(n => sc3.append(n)); playClip(orig, { onWord: i => highlightWord(sc3, i), onEnd: () => { renderCourseDetail(c, seg.id); } }); } }, el('span', { class: 'play-ic' }), 'Play the previous take of this lesson'), el('span', { class: 'muted', style: 'font-size:13px' }, 'Highlighted words are the ones that changed.')) : null,
      live ? el('details', { class: 'more', style: 'border-top:0;padding-top:4px' }, el('summary', {}, `Version note · ${live}`), el('pre', { class: 'vnote' }, versionNote(c))) : null);
  }
  const toggle = el('div', { class: 'seg-toggle' }, el('button', { class: 'btn small' + (!author ? ' on' : ''), onclick: () => { Pl.mode = 'learner'; renderCourseDetail(c, seg.id); } }, 'Learner view'), el('button', { class: 'btn small' + (author ? ' on' : ''), onclick: () => { Pl.mode = 'author'; renderCourseDetail(c, seg.id); } }, 'Author view'));
  const main = el('div', { class: 'pf-main' }, el('div', { class: 'pf-top' }, el('span', { class: 'pf-title' }, c.title), toggle), slide, audio, nav, authorPanel);
  d.append(el('div', { class: 'pf' }, side, main));
  d.append(el('p', { class: 'pf-foot muted' }, `${c.format} · ${c.publish.package} in ${c.publish.target} · narrated by ${c.voice.name}${changedLessons.length ? ` · ${changedLessons.length} lesson${changedLessons.length === 1 ? '' : 's'} updated in ${live}` : ''}`));
}
function openCourse(id, segId) { S.course = id; showView('courses'); renderCourseDetail(courseById[id], segId); const d = $('#course-detail'); d && d.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); }

/* ── help ────────────────────────────────────────────────────────────────── */
$('#help-body').append(
  el('p', {}, 'You are ', el('b', {}, `${ME.name}, ${ME.role} at ${C.company.name}`), ' (fictional). It is ', el('b', {}, `${C.meta.weekday} morning, ${C.meta.time}`), '. The agents checked the library overnight and posted to Slack.'),
  el('ol', {}, el('li', {}, el('b', {}, 'The morning message.'), ' Read it aloud: 14 things out of date, 11 fixes ready, 1 judgment call, 2 for a person. Click ', el('b', {}, 'Start with the critical one'), '.'), el('li', {}, el('b', {}, 'The hotline.'), ' Read the headline and What changed. Play ', el('b', {}, 'In the course today'), ' (old number highlighted), then ', el('b', {}, 'The fix'), ' (same narrator). Approve & publish. Read the green result.'), el('li', {}, el('b', {}, 'Next → the AI course.'), ' On “AI letters need a human review”, click Edit the wording → Use Legal\'s wording → Re-record. Real audio.'), el('li', {}, el('b', {}, 'Approve all.'), ' In the queue header. Watch the list publish, then the summary. Open Slack (S) to show Priya republishing the Storyline course.'), el('li', {}, el('b', {}, 'Judgment call.'), ' Parental leave: two sources disagree. Pick the Benefits Guide.'), el('li', {}, el('b', {}, 'Needs a person.'), ' The screen recording and the CEO video. Create a task.'), el('li', {}, el('b', {}, 'Courses.'), ' Working with AI at Alder → Play the whole course: four new lines, same voice. Score 44 → 100.'), el('li', {}, el('b', {}, 'If asked how it works:'), ' the How it works panel (H) has the agents, last night\'s log, the sources, and where fixes go back.')),
  el('div', { class: 'keys' }, el('kbd', {}, '→ / N'), el('span', {}, 'next item'), el('kbd', {}, '← / P'), el('span', {}, 'previous item'), el('kbd', {}, '1 / 2'), el('span', {}, 'Inbox / Courses'), el('kbd', {}, 'S'), el('span', {}, 'Slack panel'), el('kbd', {}, 'H'), el('span', {}, 'How it works'), el('kbd', {}, 'T'), el('span', {}, 'light / dark'), el('kbd', {}, 'Reset'), el('span', {}, 'back to 7:42 AM')),
  el('p', { class: 'fine' }, `All narration is real WellSaid audio (preview model), rendered ahead of time so the demo runs offline: ${Object.keys(AUDIO).length} clips. In production the re-record step renders live in about two seconds. Alder Mutual, its people and policies are fictional. Library-wide counts are illustrative.`));

/* ── boot ────────────────────────────────────────────────────────────────── */
renderMorning(); refreshBadge();
/* deep links for the presenter: #F11 opens that item, #courses opens the courses view, #inbox the queue */
(() => { const h = (location.hash || '').slice(1); if (h === 'courses') showView('courses'); else if (h.startsWith('course-') && courseById[h.slice(7)]) { S.course = h.slice(7); showView('courses'); } else if (h === 'inbox') { S.current = openIds()[0]; showView('inbox'); } else if (findingById[h]) select(h); else showView('morning'); })();
})();
