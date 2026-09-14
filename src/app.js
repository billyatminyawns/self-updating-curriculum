/* Drift Inbox — product-style stage demo (WellSaid × Continuity Intelligence), TechLearn 2026 */
(() => {
'use strict';
const C = JSON.parse(document.getElementById('content-data').textContent);
const AUDIO = JSON.parse(document.getElementById('audio-data').textContent || '{}');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = ms => new Promise(r => setTimeout(r, reduced ? 0 : ms));
const nf = new Intl.NumberFormat('en-US');
const fdate = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

/* ── indexes ─────────────────────────────────────────────────────────────── */
const courseById = Object.fromEntries(C.courses.map(c => [c.id, c]));
const segById = {}; C.courses.forEach(c => c.segments.forEach(s => { segById[s.id] = Object.assign({ course: c.id }, s); }));
const findingById = Object.fromEntries(C.findings.map(f => [f.id, f]));
const sourceById = Object.fromEntries(C.sources.map(s => [s.id, s]));
const narration = f => !!f.fixed;
const findingsBySeg = {}; C.findings.filter(narration).forEach(f => { (findingsBySeg[f.segment] ||= []).push(f); });
const byCourse = {}; C.findings.forEach(f => { (byCourse[f.course] ||= []).push(f); });
const SEV = { critical: 'Critical', serious: 'Serious', warning: 'Warning' }, SEV_ORDER = { critical: 0, serious: 1, warning: 2 };
const OWNER = { ci: 'Continuity Intelligence', ws: 'WellSaid', flow: 'Workflow' };
const P = C.slack.people, ME = C.company.persona;

/* ── state ───────────────────────────────────────────────────────────────── */
const S = { view: 'inbox', filter: 'all', selected: 'F11', status: {}, take: {}, notify: {}, versions: {}, today: [], batch: false, editing: null, libSel: 'A' };
C.findings.forEach(f => { S.status[f.id] = f.status === 'auto' ? 'open' : f.status; S.take[f.id] = 'fix'; S.notify[f.id] = f.material ? 'notify' : 'quiet'; });
const RESOLVED = new Set(['published', 'dismissed', 'task_created']);
const NEEDS_ME = new Set(['open', 'review', 'task', 'snoozed']);
const STATUS = { open: 'New take ready', review: 'Needs your judgment', task: 'Task for a person', publishing: 'Publishing…', handoff: 'Sent to Priya N.', published: 'Published', task_created: 'Task created', dismissed: 'Marked accurate', snoozed: 'Snoozed · Oct 1' };
const PILL = { open: 'good', review: 'review', task: 'task', publishing: 'ci busy', handoff: 'task busy', published: 'good', task_created: 'task', dismissed: 'muted', snoozed: 'muted' };

/* demo clock */
let minutes = 7 * 60 + 42;
const clockStr = () => { const h = Math.floor(minutes / 60), m = minutes % 60; return `${(h % 12) || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const drawClock = () => { $('#clock').textContent = `${C.meta.weekday}, ${fdate(C.meta.date)} · ${clockStr()}`; };
const tick = (n = 1) => { minutes += n; drawClock(); };
drawClock();

/* ── text diff ───────────────────────────────────────────────────────────── */
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
function diffNode(o, f) { const n = el('p', { class: 'diff' }); diffWords(o, f).forEach((op, i) => { const t = op.words.join(' '); if (op.type === 'eq') n.append((i ? ' ' : '') + t); else { if (i) n.append(' '); n.append(el(op.type === 'del' ? 'del' : 'ins', {}, t)); } }); return n; }
function changeSummary(o, f) { const ops = diffWords(o, f); const changed = ops.filter(op => op.type !== 'eq').reduce((a, op) => a + op.words.length, 0), total = toks(o).length; const n = el('span', { class: 'change' }); if (changed / total > 0.45) { n.append(el('span', { style: 'color:var(--ink-3);font-family:var(--font-mono);font-size:12px' }, 'rewritten · '), el('ins', {}, f)); return n; } let first = true; ops.forEach(op => { if (op.type === 'eq') return; if (!first) n.append(' '); first = false; n.append(el(op.type === 'del' ? 'del' : 'ins', {}, op.words.join(' '))); }); return n; }

/* ── audio ───────────────────────────────────────────────────────────────── */
const players = {}; const clipFor = k => AUDIO[k] || null;
function audioEl(k) { const a = clipFor(k); if (!a) return null; if (!players[k]) { const e = new Audio(a.src); e.preload = 'auto'; players[k] = e; } return players[k]; }
let current = null;
function stopAll() { if (!current) return; const c = current; current = null; c.el.pause(); c.el.currentTime = 0; c.cleanup && c.cleanup(); }
function playClip(key, hooks = {}) {
  return new Promise(resolve => {
    stopAll(); const e = audioEl(key); if (!e) { toast('That clip is not in the offline demo.'); resolve(false); return; }
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
function player({ key, text, mask, kind, label, course, tone, tag }) {
  const clip = clipFor(key), c = courseById[course];
  const box = el('div', { class: 'player ' + (tone || '') + (clip ? '' : ' pending') });
  const btn = el('button', { class: 'pbtn ' + (tone === 'fresh' ? 'mint' : tone === 'stale' ? 'amber' : ''), 'aria-label': 'Play ' + label, disabled: !clip }, el('span', { class: 'ic' }));
  const bar = el('div', { class: 'bar' }, el('i')), time = el('span', { class: 'time num' }, clip ? fmtTime(clip.duration) : '–:––');
  const sc = scriptNode(text, mask, kind);
  box.append(el('div', { class: 'ph' }, el('div', { class: 'who' }, el('b', {}, label), el('span', {}, `${c.voice.name} · ${c.voice.style}`)), tag || null), el('div', { class: 'pc' }, btn, bar, time), sc);
  let playing = false; const setPlaying = v => { playing = v; btn.classList.toggle('playing', v); };
  btn.addEventListener('click', () => { if (playing) { stopAll(); return; } playClip(key, { onStart: () => setPlaying(true), onWord: i => highlightWord(sc, i), onTime: (t, d) => { bar.firstChild.style.width = (d ? t / d * 100 : 0) + '%'; time.textContent = fmtTime(t); }, onEnd: () => { setPlaying(false); highlightWord(sc, -1); bar.firstChild.style.width = '0%'; time.textContent = fmtTime(clip.duration); } }); });
  box.play = () => { if (!playing) btn.click(); }; return box;
}
const takeKey = f => f.segment + '_' + (S.take[f.id] === 'alt' ? 'alt' : 'fix');
const takeText = f => S.take[f.id] === 'alt' && f.alt ? f.alt.text : f.fixed;

/* ── derived ─────────────────────────────────────────────────────────────── */
function segState(s) {
  const fs = findingsBySeg[s.id] || []; if (!fs.length) return 'verified';
  if (fs.some(f => S.status[f.id] === 'published')) return 'fixed';
  if (fs.some(f => S.status[f.id] === 'handoff' || S.status[f.id] === 'publishing')) return 'pending';
  if (fs.every(f => S.status[f.id] === 'dismissed')) return 'verified';
  return fs.some(f => f.severity === 'critical') ? 'critical' : 'drift';
}
function courseScore(c) { const fs = (byCourse[c.id] || []).filter(narration); if (!fs.length) return c.score; const done = fs.filter(f => ['published', 'dismissed'].includes(S.status[f.id])).length; return Math.round(c.score + (100 - c.score) * done / fs.length); }
const myHealth = () => Math.round(C.courses.reduce((a, c) => a + courseScore(c), 0) / C.courses.length);
function strip(course) { const n = el('div', { class: 'strip', role: 'img', 'aria-label': `${course.title}: ${course.segments.length} narration segments`, 'data-course': course.id }); course.segments.forEach(s => n.append(el('div', { class: 'seg ' + segState(s), title: `${s.id} · ${s.title}`, 'data-seg': s.id, style: `--w:${toks(s.script).length}` }, el('span', { class: 'seg-label' }, s.id)))); return n; }
function refreshStrips() { $$('.strip .seg').forEach(seg => { const s = segById[seg.dataset.seg]; if (!s) return; seg.className = 'seg ' + segState(s) + (seg.classList.contains('playing') ? ' playing' : ''); }); }
const statusPill = id => el('span', { class: 'pill ' + (PILL[S.status[id]] || '') }, el('i', { class: 'dot' }), S.status[id] === 'published' && S.versions[findingById[id].course] ? `Published ${S.versions[findingById[id].course]}` : STATUS[S.status[id]]);
const sevPill = f => el('span', { class: 'pill ' + f.severity }, SEV[f.severity]);
const sourcesOf = f => f.sources.map(id => sourceById[id]);

/* ── toast / modal / theme ───────────────────────────────────────────────── */
let toastT = 0; function toast(msg, ms = 3200) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms); }
function applyTheme(t) { if (t === 'light') document.documentElement.setAttribute('data-theme', 'light'); else document.documentElement.removeAttribute('data-theme'); }
function toggleTheme() { const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'; applyTheme(next); try { localStorage.setItem('suc-theme', next); } catch (_) {} }
try { const t = localStorage.getItem('suc-theme'); if (t) applyTheme(t); } catch (_) {}
$('#theme').addEventListener('click', toggleTheme);
$('#reset').addEventListener('click', () => { stopAll(); location.reload(); });
$('#slack-toggle').addEventListener('click', () => { $('#app').classList.toggle('slack-collapsed'); $('#slack-toggle').classList.toggle('on', !$('#app').classList.contains('slack-collapsed')); });
$('#slack-toggle').classList.add('on');
const help = $('#help-modal'); $('#help').addEventListener('click', () => { help.hidden = false; }); $('#help-close').addEventListener('click', () => { help.hidden = true; }); help.addEventListener('click', e => { if (e.target === help) help.hidden = true; });
document.addEventListener('keydown', e => {
  if (e.target.matches('input,textarea,select')) return;
  if (e.key === 'Escape') { help.hidden = true; return; }
  if (e.key === '?') { help.hidden = !help.hidden; return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 't') toggleTheme(); else if (k === 's') $('#slack-toggle').click();
  else if (['1', '2', '3', '4'].includes(k)) showView(['inbox', 'library', 'sources', 'activity'][+k - 1]);
});

/* ── views ───────────────────────────────────────────────────────────────── */
function showView(v) { S.view = v; $$('.view').forEach(x => { x.hidden = x.id !== 'view-' + v; }); $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v)); if (v === 'library') renderLibrary(); if (v === 'activity') renderActivity(); if (v === 'sources') renderSources(); }
$$('.nav-btn').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));

/* sidebar */
(() => {
  C.company.integrations.forEach(i => $('#integrations').append(el('li', {}, i)));
  C.agents.forEach(a => $('#agents-mini').append(el('li', {}, el('span', { class: 'own ' + a.owner }, a.owner === 'ci' ? 'CI' : a.owner === 'ws' ? 'WS' : 'FLOW'), el('span', {}, el('b', {}, a.name), ' · ', a.role.split('.')[0].replace(/^Follows/, 'follows').replace(/^Pulls/, 'pulls').replace(/^Proposes/, 'proposes').replace(/^Re-renders/, 're-renders').replace(/^Listens/, 'listens').replace(/^Splices/, 'splices')))));
  $('#src-count').textContent = C.sources.length + C.unchanged_sources.length;
  $('#sl-members').textContent = `${C.slack.members} members`;
})();
function refreshSidebar() {
  const h = myHealth(); $('#my-health').textContent = h; const bar = $('#my-health-bar'); bar.style.width = h + '%'; bar.classList.toggle('good', h >= 90);
  const open = C.findings.filter(f => NEEDS_ME.has(S.status[f.id])).length; const b = $('#inbox-badge'); b.textContent = open; b.classList.toggle('zero', open === 0);
  $('#my-health-note').textContent = open ? `${open} item${open === 1 ? '' : 's'} waiting on you across ${C.courses.length} courses` : 'Everything you own is current.';
  const lib = $('#library-sub'); if (lib) lib.innerHTML = `${C.library.courses} courses · ${nf.format(C.library.segments)} narration segments · library health <b>${C.library.health_before}</b> before tonight's approvals.`;
}

/* ── inbox ───────────────────────────────────────────────────────────────── */
const FILTERS = [['all', 'All', () => true], ['ready', 'Ready', f => S.status[f.id] === 'open'], ['review', 'Needs judgment', f => S.status[f.id] === 'review'], ['tasks', 'Tasks', f => ['task', 'task_created'].includes(S.status[f.id])], ['done', 'Done', f => ['published', 'dismissed', 'handoff', 'publishing', 'snoozed'].includes(S.status[f.id])]];
function renderFilters() { const h = $('#filters'); h.innerHTML = ''; FILTERS.forEach(([id, label, fn]) => h.append(el('button', { class: 'filter' + (S.filter === id ? ' on' : ''), role: 'tab', 'aria-selected': S.filter === id, onclick: () => { S.filter = id; renderInbox(); } }, label, el('span', { class: 'c' }, C.findings.filter(fn).length)))); }
function renderInboxHead() {
  const ready = C.findings.filter(f => S.status[f.id] === 'open').length, rev = C.findings.filter(f => S.status[f.id] === 'review').length, tasks = C.findings.filter(f => S.status[f.id] === 'task').length, done = C.findings.filter(f => RESOLVED.has(S.status[f.id])).length;
  $('#inbox-sub').innerHTML = `Overnight scan finished <b>${C.scan.finished}</b> · ${C.scan.findings} findings library-wide · in your ${C.courses.length} courses: <b>${ready} new take${ready === 1 ? '' : 's'} ready</b> · ${rev} need${rev === 1 ? 's' : ''} your judgment · ${tasks} task${tasks === 1 ? '' : 's'}${done ? ` · <b>${done} done</b>` : ''}`;
  const b = $('#approve-all'); b.disabled = ready === 0 || S.batch; b.textContent = S.batch ? 'Publishing…' : ready ? `Approve all ready (${ready})` : 'All ready takes approved';
}
function renderInbox() {
  renderFilters(); renderInboxHead(); refreshSidebar();
  const fn = FILTERS.find(x => x[0] === S.filter)[2]; const list = $('#ilist'); list.innerHTML = '';
  C.courses.forEach(c => {
    const fs = (byCourse[c.id] || []).filter(fn).sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.id.localeCompare(b.id, undefined, { numeric: true }));
    if (!fs.length) return;
    const g = el('div', { class: 'cgroup' });
    const sc = courseScore(c);
    g.append(el('div', { class: 'cg-head' }, el('div', { class: 't' }, el('b', {}, c.title), el('span', {}, `${c.format} · ${c.voice.name} · ${c.learners}`)), el('div', { class: 'sc' }, 'health ', el('b', {}, sc), S.versions[c.id] ? el('span', { class: 'pill good' }, S.versions[c.id]) : null), strip(c)));
    fs.forEach(f => {
      const seg = segById[f.segment], st = S.status[f.id], done = RESOLVED.has(st);
      const row = el('button', { class: `irow ${f.severity}${done ? ' done' : ''}${S.selected === f.id ? ' active' : ''}`, 'data-id': f.id, onclick: () => selectFinding(f.id) },
        el('span', { class: 'stripe' }),
        el('span', { class: 'ir-main' }, el('b', {}, f.claim), el('span', { class: 'sub' }, el('span', { class: 'fid' }, f.id), el('span', {}, `${seg.id} · ${seg.title}`), el('span', {}, f.category), el('span', {}, sourcesOf(f)[0].name)), narration(f) ? changeSummary(seg.script, takeText(f)) : el('span', { class: 'change' }, f.category === 'Media' ? 'replace media · ' + f.course_says : 'screen capture · ' + seg.at)),
        el('span', { class: 'ir-side' }, statusPill(f.id), narration(f) && clipFor(takeKey(f)) ? el('button', { class: 'btn small', onclick: e => { e.stopPropagation(); selectFinding(f.id); const pl = $('#idetail .player.fresh'); pl && pl.play(); } }, el('span', { class: 'play-ic' }), 'New take') : null));
      g.append(row);
    });
    list.append(g);
  });
  if (!list.children.length) list.append(el('div', { class: 'empty-detail' }, 'Nothing here.'));
  renderDetail();
}
function selectFinding(id) { S.selected = id; S.editing = null; if (S.view !== 'inbox') showView('inbox'); $$('#ilist .irow').forEach(r => r.classList.toggle('active', r.dataset.id === id)); renderDetail(); const r = $(`#ilist .irow[data-id="${id}"]`); r && r.scrollIntoView({ block: 'nearest' }); }

function mockScreen(f, after) {
  const orders = f.id !== 'F6';
  const side = el('div', { class: 'side' }, el('div', { class: 'brandm' }, 'ClaimsCore · ' + (after ? '26.3' : '26.2')), el('div', { class: 'item' }, 'Claim'));
  if (!after) side.append(el('div', { class: 'item' + (orders ? ' hi' : '') }, 'Payments'), el('div', { class: 'item' }, 'Documents'), el('div', { class: 'item' }, 'Notes'), el('div', { class: 'item' }, 'Tasks'));
  else side.append(el('div', { class: 'item' + (orders ? ' hi good' : '') }, 'Settlement ▾'), el('div', { class: 'item sub' + (orders ? ' hi good' : '') }, 'Total Loss'), el('div', { class: 'item sub' }, 'Partial'), el('div', { class: 'item' }, 'Documents'), el('div', { class: 'item' }, 'Notes'));
  const main = el('div', { class: 'mainp' }, el('div', { class: 'ttl' }, 'Settlement worksheet · Total loss'), el('div', { class: 'row', style: '--w:70%' }), el('div', { class: 'row', style: '--w:45%' }), el('div', { class: 'row', style: '--w:60%' }), el('div', { class: 'btns' }, el('span', { class: 'b pri' }, 'Issue payment'), el('span', { class: 'b' + (!orders ? (after ? ' hi good' : ' hi') : '') }, after ? 'Pend' : 'Hold for Review'), el('span', { class: 'b' }, 'Cancel')));
  return el('div', { class: 'mock', role: 'img', 'aria-label': after ? 'ClaimsCore 26.3 screen' : 'ClaimsCore 26.2 screen as captured in the video' }, side, main);
}
function mockCompare(f) {
  const wrap = el('div', { class: 'mock-wrap' }); let after = false; const mock = el('div');
  const b1 = el('button', { class: 'btn small', onclick: () => { after = false; draw(); } }, 'As captured in the video'), b2 = el('button', { class: 'btn small', onclick: () => { after = true; draw(); } }, 'Current release 26.3');
  const draw = () => { mock.innerHTML = ''; mock.append(mockScreen(f, after)); b1.classList.toggle('on', !after); b2.classList.toggle('on', after); };
  wrap.append(el('div', { class: 'mock-toggle' }, b1, b2), mock, el('div', { class: 'mock-cap' }, el('span', {}, `frame at ${segById[f.segment].at} · ${courseById[f.course].title}`), el('span', {}, narration(f) ? 'narration: re-voiced' : 'screen capture: needs new footage')));
  draw(); return wrap;
}
function pubInfo(c) { const p = c.publish; return el('dl', { class: 'pubinfo' }, el('dt', {}, 'Goes back to'), el('dd', {}, el('b', {}, p.target), ` · ${p.package} · ${S.versions[c.id] ? S.versions[c.id].replace('→', '→') : p.version}`), el('dt', {}, 'How'), el('dd', {}, p.how), p.handoff ? el('dt', {}, 'Hand-off') : null, p.handoff ? el('dd', {}, el('b', {}, p.handoff), ' · course owner in Storyline · the new takes, the diff and a change list land in her queue') : null); }
function versionNote(c) {
  const fs = (byCourse[c.id] || []).filter(f => narration(f) && S.status[f.id] === 'published');
  const srcs = [...new Set(fs.flatMap(f => f.sources))].map(id => `${sourceById[id].name} (${fshort(sourceById[id].date)})`);
  const material = fs.some(f => f.material);
  return `${S.versions[c.id] || c.publish.version.split('→')[1].trim()} · ${c.title}\nPublished ${fdate(C.meta.date)} ${clockStr()} by ${ME.name} · ${fs.length} segment${fs.length === 1 ? '' : 's'} re-voiced (${c.voice.name}) · captions and transcript regenerated\n` + fs.map(f => `• ${f.segment} ${segById[f.segment].title}: ${f.claim}`).join('\n') + `\nSources: ${srcs.join('; ')}\nLearners: ${material ? (S.notify[fs.find(f => f.material).id] === 'reassign' ? 're-assigned for re-completion' : S.notify[fs.find(f => f.material).id] === 'notify' ? 'notified of a material change' : 'updated in place') : 'updated in place, completions preserved'}`;
}
function renderDetail() {
  const d = $('#idetail'); d.innerHTML = ''; const f = findingById[S.selected]; if (!f) { d.append(el('div', { class: 'empty-detail' }, 'Select a finding.')); return; }
  const seg = segById[f.segment], c = courseById[f.course], srcs = sourcesOf(f), st = S.status[f.id];
  d.append(el('div', { class: 'dt-head' }, el('div', { class: 'row' }, sevPill(f), el('span', { class: 'pill' }, f.category), el('span', { class: 'pill' }, `${Math.round(f.confidence * 100)}% confidence`), statusPill(f.id)), el('h2', { class: 'dt-title' }, f.claim),
    el('p', { class: 'dt-meta' }, el('b', {}, c.title), ` · ${seg.id} “${seg.title}” · ${c.format} · narrated by ${c.voice.name} · last published ${fdate(c.updated)} · ${c.learners}`)));
  const truth = el('div', { class: 'box truth' }, el('span', { class: 'k' }, 'Source says now'), el('p', {}, f.source_says), el('span', { class: 'src' }, srcs.map(s => `${s.name} · ${s.system} · ${fdate(s.date)}`).join(' — ')));
  d.append(el('div', { class: 'compare' }, el('div', { class: 'box says' }, el('span', { class: 'k' }, 'Course says'), el('p', {}, f.course_says), el('span', { class: 'src' }, `published ${fdate(c.updated)}`)), truth));
  if (c.kind === 'video' && (f.id === 'F5' || f.id === 'F6' || f.id === 'V1')) d.append(mockCompare(f));
  if (st === 'review' && srcs[0].conflict) {
    const s = srcs[0];
    d.append(el('div', { class: 'card review' }, el('h4', {}, 'Two sources disagree. Which one is authoritative?'), el('p', {}, f.note),
      el('div', { class: 'srcpair' }, el('div', { class: 'box truth' }, el('span', { class: 'k' }, s.name), el('p', {}, s.change), el('span', { class: 'src' }, `${s.system} · ${fdate(s.date)}`)), el('div', { class: 'box says' }, el('span', { class: 'k' }, s.conflict.name), el('p', {}, s.conflict.says), el('span', { class: 'src' }, s.conflict.system))),
      el('div', { class: 'row' }, el('button', { class: 'btn primary', onclick: () => resolveReview(f.id, 'guide') }, `${s.name} is authoritative · approve`), el('button', { class: 'btn', onclick: () => resolveReview(f.id, 'faq') }, `${s.conflict.name} is right · dismiss and flag the guide`))));
  }
  if (narration(f)) {
    d.append(el('div', { class: 'dt-section' }, el('span', { class: 'dt-label' }, 'Published narration'), player({ key: seg.id + '_orig', text: seg.script, mask: staleMask(seg.script, takeText(f)), kind: 'stale', label: `${seg.id} as published`, course: c.id, tone: 'stale', tag: el('span', { class: 'pill muted' }, fdate(c.updated)) })));
    const takeSec = el('div', { class: 'dt-section' }, el('span', { class: 'dt-label' }, S.take[f.id] === 'alt' ? 'Your edited take · re-voiced by WellSaid' : 'Proposed take · rewritten by Continuity, voiced by WellSaid'), diffNode(seg.script, takeText(f)),
      player({ key: takeKey(f), text: takeText(f), mask: freshMask(seg.script, takeText(f)), kind: 'fresh', label: S.take[f.id] === 'alt' ? 'Edited take' : 'New take', course: c.id, tone: 'fresh', tag: el('span', { class: 'pill good' }, 'same narrator · ' + (clipFor(takeKey(f)) ? clipFor(takeKey(f)).duration.toFixed(1) + ' s' : 'pending')) }),
      el('div', { class: 'qa' }, el('span', { class: 'chk' }, '✓'), el('span', {}, `Listen QA: prosody natural · loudness matched to ${neighbors(seg)} · 0 pronunciation flags · length ${lenDelta(seg, f)}`)));
    d.append(takeSec);
    if (S.editing === f.id) d.append(editor(f));
  }
  if (!narration(f)) {
    d.append(el('div', { class: 'card task' }, el('h4', {}, st === 'task_created' ? 'Task created' : 'This needs a person'), el('p', {}, f.note), el('p', {}, el('b', {}, 'Task: '), f.task),
      st === 'task_created' ? el('p', {}, el('b', {}, `Assigned to ${ME.name} · due Fri, Sep 18`), ` · ${f.id === 'V1' ? 'the re-voiced narration for F5 and F6 is held in the Kaltura draft until the footage lands' : 'request sent to the CEO\'s office; the narration fix (F8) publishes independently'}`) : null));
  }
  d.append(el('div', { class: 'dt-section' }, el('span', { class: 'dt-label' }, 'Where it goes back'), pubInfo(c)));
  if (st === 'publishing') d.append(el('div', { class: 'card' }, el('h4', {}, 'Publishing'), el('div', { class: 'progress' }, el('i', { id: 'pub-progress' })), el('p', { id: 'pub-step' }, 'Splicing the new take…')));
  if (st === 'published') d.append(el('div', { class: 'card ok' }, el('h4', {}, `Published ${S.versions[c.id]} → ${c.publish.target}`), el('pre', { class: 'vnote' }, versionNote(c))));
  if (st === 'handoff') d.append(el('div', { class: 'card task' }, el('h4', {}, 'Sent to Priya N. (course owner, Storyline)'), el('p', {}, 'The new take, the word diff and a change list are in her queue. Storyline keeps audio inside the project file, so the swap is hers: about two minutes, no re-record. You\'ll see the republish confirmation in Slack.')));
  if (st === 'dismissed') d.append(el('div', { class: 'card' }, el('h4', {}, 'Marked accurate'), el('p', {}, 'Continuity will treat this wording as correct until the source changes again, and it will not re-flag it tomorrow.')));
  if (st === 'snoozed') d.append(el('div', { class: 'card' }, el('h4', {}, 'Snoozed until Oct 1'), el('p', {}, 'Nothing is published. The new take stays rendered and ready.')));
  // decisions
  const dec = el('div', { class: 'decision' });
  if (st === 'open') {
    dec.append(el('button', { class: 'btn primary', onclick: () => approve(f.id) }, 'Approve & publish'), el('button', { class: 'btn', onclick: () => { S.editing = S.editing === f.id ? null : f.id; renderDetail(); } }, S.editing === f.id ? 'Close editor' : 'Edit script'), el('button', { class: 'btn ghost', onclick: () => dismiss(f.id) }, 'Dismiss · still accurate'), el('button', { class: 'btn ghost', onclick: () => snooze(f.id) }, 'Snooze'));
    if (f.material) { const sel = el('select', { onchange: e => { S.notify[f.id] = e.target.value; } }, el('option', { value: 'notify' }, 'Notify assigned learners'), el('option', { value: 'quiet' }, 'Update quietly'), el('option', { value: 'reassign' }, 'Re-assign for re-completion')); sel.value = S.notify[f.id]; dec.append(el('span', { class: 'spacer' }), el('label', { class: 'notify' }, 'Material change · ', sel)); }
  } else if (st === 'review') {
    dec.append(el('button', { class: 'btn', onclick: () => { S.editing = S.editing === f.id ? null : f.id; renderDetail(); } }, S.editing === f.id ? 'Close editor' : 'Edit script'), el('button', { class: 'btn ghost', onclick: () => snooze(f.id) }, 'Snooze'));
  } else if (st === 'task') {
    dec.append(el('button', { class: 'btn primary', onclick: () => createTask(f.id) }, 'Create task · assign to me'), el('button', { class: 'btn ghost', onclick: () => snooze(f.id) }, 'Snooze'));
  } else if (st === 'dismissed' || st === 'snoozed') {
    dec.append(el('button', { class: 'btn', onclick: () => reopen(f.id) }, 'Reopen'));
  } else if (st === 'published') {
    dec.append(el('span', { class: 'qa' }, el('span', { class: 'chk' }, '✓'), `Completions preserved · ${S.notify[f.id] === 'reassign' ? 'learners re-assigned' : S.notify[f.id] === 'notify' && f.material ? 'assigned learners notified' : 'no learner action needed'}`));
  }
  if (dec.children.length) d.append(dec);
}
const neighbors = seg => { const c = courseById[seg.course]; const i = c.segments.findIndex(s => s.id === seg.id); return [c.segments[i - 1], c.segments[i + 1]].filter(Boolean).map(s => s.id).join(' and '); };
const lenDelta = (seg, f) => { const a = clipFor(seg.id + '_orig'), b = clipFor(takeKey(f)); if (!a || !b) return 'preserved'; const d = b.duration - a.duration; return `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} s`; };
function editor(f) {
  const seg = segById[f.segment];
  const ta = el('textarea', { 'aria-label': 'Edit the proposed script' }); ta.value = takeText(f);
  const chips = el('div', { class: 'chips' }, el('button', { class: 'chip', onclick: () => { ta.value = f.fixed; } }, 'Suggested take'), f.alt ? el('button', { class: 'chip', onclick: () => { ta.value = f.alt.text; } }, f.alt.label) : null, el('button', { class: 'chip', onclick: () => { ta.value = seg.script; } }, 'Published wording'));
  const revoice = el('button', { class: 'btn primary', onclick: () => {
    const v = ta.value.trim(); const same = (a, b) => toks(a).map(norm).join(' ') === toks(b).map(norm).join(' ');
    if (same(v, f.fixed)) { S.take[f.id] = 'fix'; S.editing = null; toast(`Re-voiced in ${courseById[f.course].voice.name}'s voice · 1.8 s`); renderInbox(); }
    else if (f.alt && same(v, f.alt.text)) { S.take[f.id] = 'alt'; S.editing = null; toast(`Re-voiced in ${courseById[f.course].voice.name}'s voice · 1.9 s · Legal's wording`); renderInbox(); }
    else toast('Live re-voice needs the WellSaid connection, and this demo runs offline. Try one of the suggested wordings.', 4200);
  } }, 'Re-voice');
  return el('div', { class: 'card' }, el('h4', {}, 'Edit the script, then re-voice'), el('div', { class: 'editor' }, ta, chips, el('div', { class: 'row' }, revoice, el('span', { class: 'dt-meta' }, `Renders in ${courseById[f.course].voice.name}'s voice with the course pronunciation library. About two seconds.`))));
}

/* ── actions ─────────────────────────────────────────────────────────────── */
function logToday(who, msg, cls = '') { S.today.push({ t: clockStr(), who, msg, cls }); if (S.view === 'activity') renderToday(); }
function bumpVersion(c) { if (!S.versions[c.id]) S.versions[c.id] = c.publish.version.split('→')[1].trim(); return S.versions[c.id]; }
async function approve(id, opts = {}) {
  const f = findingById[id], c = courseById[f.course]; if (!['open', 'review'].includes(S.status[id])) return;
  S.status[id] = 'publishing'; S.editing = null; renderInbox();
  const steps = ['Splicing the new take…', 'Regenerating captions and transcript…', c.publish.handoff ? 'Packaging takes and change list for the course owner…' : `Building ${c.publish.package} · new version of the same course…`, c.publish.handoff ? 'Sending to Priya N.…' : `Pushing to ${c.publish.target}…`];
  for (let i = 0; i < steps.length; i++) { const p = $('#pub-progress'), s = $('#pub-step'); if (p) p.style.width = ((i + 1) / steps.length * 100) + '%'; if (s) s.textContent = steps[i]; await wait(opts.fast ? 180 : 420); }
  tick(1);
  if (c.publish.handoff) { S.status[id] = 'handoff'; logToday('you', `Approved ${id} (${c.title}) → sent to Priya N. for the Storyline swap`); if (!opts.silent) { slackPost('continuity', `📦 <b>${ME.name}</b> approved <b>${id}</b> in <i>${c.title}</i>. New take + change list sent to <b>Priya N.</b> (Storyline owner).`); schedulePriya(); } }
  else { const v = bumpVersion(c); S.status[id] = 'published'; logToday('you', `Approved ${id} (${c.title}) → ${c.publish.target} ${v}`); if (!opts.silent) slackPost('continuity', `✅ <b>${ME.name}</b> approved <b>${id}</b> · <i>${c.title}</i> republished to <b>${c.publish.target}</b> as ${v} (${c.publish.package}${c.kind === 'video' ? ', same media ID' : ', completions preserved'})${f.material ? S.notify[id] === 'reassign' ? ' · learners re-assigned' : S.notify[id] === 'notify' ? ` · ${c.learners.split(' ·')[0]} learners notified` : '' : ''}.`); }
  renderInbox(); if (S.view === 'library') renderLibrary();
}
let priyaTimer = 0;
function schedulePriya() {
  clearTimeout(priyaTimer);
  priyaTimer = setTimeout(async () => {
    slackPost('priya', 'Got them. Swapping the audio in the Storyline project now, four minutes tops.');
    await wait(reduced ? 0 : 4200);
    const c = courseById.C; const v = bumpVersion(c); let n = 0;
    C.findings.filter(f => f.course === 'C' && S.status[f.id] === 'handoff').forEach(f => { S.status[f.id] = 'published'; n++; });
    tick(4);
    slackPost('priya', `Swapped ${n} take${n === 1 ? '' : 's'} and republished <i>${c.title}</i> as <b>${v}</b> in Alder Learn (SCORM 2004, same course ID, completions preserved). No re-record, no timeline edits. ✅`, { react: '🙌 3' });
    logToday('priya', `Republished ${c.title} ${v} after swapping ${n} take${n === 1 ? '' : 's'}`);
    renderInbox(); if (S.view === 'library') renderLibrary();
  }, reduced ? 0 : 3600);
}
async function approveAll() {
  if (S.batch) return; const ids = C.findings.filter(f => S.status[f.id] === 'open').map(f => f.id); if (!ids.length) return;
  S.batch = true; renderInboxHead(); $('#approve-all').disabled = true;
  const touched = {};
  for (const id of ids) { S.selected = id; await approve(id, { silent: true, fast: true }); touched[findingById[id].course] = (touched[findingById[id].course] || 0) + 1; await wait(120); }
  S.batch = false; tick(1);
  const lines = Object.entries(touched).map(([cid, n]) => { const c = courseById[cid]; return c.publish.handoff ? `<i>${c.title}</i> → ${n} take${n === 1 ? '' : 's'} sent to Priya N. (Storyline)` : `<i>${c.title}</i> → ${c.publish.target} ${S.versions[cid]} (${n} take${n === 1 ? '' : 's'})`; });
  slackPost('continuity', `✅ <b>${ME.name}</b> approved <b>${ids.length} new takes</b>. Republished:`, { list: lines.map(l => ({ sev: 'done', html: l })) });
  if (touched.C) schedulePriya();
  const rev = C.findings.filter(f => S.status[f.id] === 'review'); if (rev.length) { S.selected = rev[0].id; slackPost('continuity', `Still waiting on you: <b>${rev.length}</b> item${rev.length === 1 ? '' : 's'} that need${rev.length === 1 ? 's' : ''} a judgment call, and ${C.findings.filter(f => S.status[f.id] === 'task').length} task${C.findings.filter(f => S.status[f.id] === 'task').length === 1 ? '' : 's'}.`, { buttons: [{ label: 'Open', onclick: () => selectFinding(rev[0].id) }] }); }
  renderInbox();
}
$('#approve-all').addEventListener('click', approveAll);
function dismiss(id, why) { const f = findingById[id]; S.status[id] = 'dismissed'; tick(1); logToday('you', `Marked ${id} accurate${why ? ' · ' + why : ''}`); slackPost('continuity', `🟢 <b>${ME.name}</b> marked <b>${id}</b> as still accurate${why ? ` (${why})` : ''}. I'll accept this wording until the source changes again.`); renderInbox(); }
function snooze(id) { S.status[id] = 'snoozed'; tick(1); logToday('you', `Snoozed ${id} until Oct 1`); renderInbox(); }
function reopen(id) { const f = findingById[id]; S.status[id] = f.status === 'auto' ? 'open' : f.status; renderInbox(); }
function createTask(id) { const f = findingById[id]; S.status[id] = 'task_created'; tick(1); logToday('you', `Created task for ${id}: ${f.task.split('.')[0]}`); slackPost('continuity', `📋 Task created for <b>${ME.name}</b> · due Fri Sep 18 · <i>${courseById[f.course].title}</i>: ${f.task.split('.')[0]}.`); renderInbox(); }
async function resolveReview(id, choice) {
  const f = findingById[id], s = sourcesOf(f)[0];
  if (choice === 'guide') {
    S.status[id] = 'open'; await approve(id, { silent: true }); tick(0);
    slackPost('continuity', `✅ <b>${ME.name}</b> resolved the conflict on <b>${id}</b>: <b>${s.name}</b> outranks <b>${s.conflict.name}</b> for leave policy. New take sent to Priya N. I've flagged the FAQ to the People team.`);
    logToday('you', `Resolved ${id}: ${s.name} authoritative over ${s.conflict.name}`);
    setTimeout(() => slackPost('sam', 'Good catch. The FAQ page is mine, fixing it this morning.', { react: '👍 2' }), reduced ? 0 : 5200);
  } else { dismiss(id, `${s.conflict.name} kept; ${s.name} flagged for correction`); }
  renderInbox();
}

/* ── Slack ───────────────────────────────────────────────────────────────── */
const msgs = $('#sl-msgs');
function slackPost(who, html, opts = {}) {
  const p = P[who] || P.continuity;
  const body = el('div', { class: 'sl-body' }, el('div', { class: 'sl-name' }, el('b', {}, p.name), p.app ? el('span', { class: 'app-tag' }, 'APP') : null, el('span', { class: 'sl-time' }, opts.time || clockStr())), el('div', { class: 'sl-text', html }));
  if (opts.list) { const ul = el('ul', { class: 'sl-list' }); opts.list.forEach(it => ul.append(el('li', {}, el('span', { class: 'sev ' + it.sev }), el('span', { html: it.html })))); body.append(ul); }
  if (opts.buttons) { const a = el('div', { class: 'sl-actions' }); opts.buttons.forEach(b => a.append(el('button', { class: 'sl-btn' + (b.primary ? ' primary' : ''), onclick: e => { b.onclick(e.currentTarget); } }, b.label))); body.append(a); }
  if (opts.react) body.append(el('span', { class: 'sl-react' }, opts.react));
  const m = el('div', { class: 'sl-msg' + (opts.dim ? ' dim' : '') }, el('span', { class: 'avatar ' + p.color }, p.initials), body);
  msgs.append(m); msgs.scrollTop = msgs.scrollHeight; return m;
}
function seedSlack() {
  msgs.innerHTML = ''; msgs.append(el('div', { class: 'sl-day' }, 'Today'));
  const sc = C.scan;
  slackPost('continuity', `Nightly scan started · ${C.library.courses} courses · ${sc.sources} sources of truth. First full scan since the library was connected yesterday.`, { time: sc.started });
  const mine = C.findings.length, ready = C.findings.filter(f => f.status === 'auto').length, rev = C.findings.filter(f => f.status === 'review').length, tasks = C.findings.filter(f => f.status === 'task').length;
  slackPost('continuity', `Scan complete at ${sc.finished}. <b>${nf.format(sc.claims)} claims</b> checked against ${sc.sources} sources · <b>${sc.findings} findings in ${sc.courses_affected} courses</b> library-wide (${sc.critical} critical).<br>In your ${C.courses.length} courses, <b>${ME.name.split(' ')[0]}</b>: <b>${mine} findings</b> · ${ready} new takes ready to approve · ${rev} needs your judgment · ${tasks} tasks a voice can't fix.`, { time: sc.finished,
    list: C.courses.map(c => ({ sev: (byCourse[c.id] || []).some(f => f.severity === 'critical') ? 'critical' : 'serious', html: `<i>${c.title}</i> · ${(byCourse[c.id] || []).length} finding${(byCourse[c.id] || []).length === 1 ? '' : 's'} · ${c.voice.name}` })),
    buttons: [{ label: 'Open inbox', primary: true, onclick: () => { showView('inbox'); S.filter = 'all'; renderInbox(); } }, { label: 'Approve all ready', onclick: () => { showView('inbox'); approveAll(); } }] });
  slackPost('wellsaid', `Rendered <b>${ready} new takes</b> in the original narrators' voices: ${[...new Set(C.courses.map(c => c.voice.name))].join(', ')}. Listen-back QA: ${ready} passed, 0 flagged. Only the changed segments were re-rendered.`, { time: '2:07 AM' });
  const crit = C.findings.find(f => f.severity === 'critical');
  slackPost('continuity', `🔴 <b>Critical</b> · <i>${courseById[crit.course].title}</i> → ${crit.source_says.split('.')[0]}. The course still gives the old number to ${courseById[crit.course].learners.split(' ·')[0]} people. New take is ready.`, { time: '2:07 AM', buttons: [{ label: '▶ Listen', onclick: () => { selectFinding(crit.id); const pl = $('#idetail .player.fresh'); pl && pl.play(); } }, { label: 'Approve & publish', primary: true, onclick: btn => { if (S.status[crit.id] === 'open') { selectFinding(crit.id); approve(crit.id); } else toast('Already handled.'); } }, { label: 'Open', onclick: () => selectFinding(crit.id) }] });
  const rv = C.findings.find(f => f.status === 'review'); const rs = sourceById[rv.sources[0]];
  slackPost('continuity', `🟡 <b>Needs your judgment</b> · <i>${courseById[rv.course].title}</i>, ${rv.segment} → <b>${rs.name}</b> says 16 weeks of parental leave; <b>${rs.conflict.name}</b> still says 12. Which source is authoritative?`, { time: '2:08 AM', buttons: [{ label: 'Open', onclick: () => selectFinding(rv.id) }] });
  const ts = C.findings.filter(f => f.status === 'task');
  slackPost('continuity', `📋 <b>${ts.length} tasks</b> a voice can't fix:`, { time: '2:08 AM', list: ts.map(t => ({ sev: 'serious', html: `<i>${courseById[t.course].title}</i> · ${t.claim}` })), buttons: [{ label: 'Open tasks', onclick: () => { showView('inbox'); S.filter = 'tasks'; S.selected = ts[0].id; renderInbox(); } }] });
}
seedSlack();

/* ── library ─────────────────────────────────────────────────────────────── */
function renderLibrary() {
  const t = $('#ltable'); t.innerHTML = '';
  t.append(el('div', { class: 'lhead' }, el('span', {}, 'Course'), el('span', {}, 'Format'), el('span', { class: 'c-owner' }, 'Owner'), el('span', {}, 'Learners'), el('span', {}, 'Findings'), el('span', { style: 'text-align:right' }, 'Health')));
  t.append(el('div', { class: 'lsep' }, `Your courses (${C.courses.length})`));
  C.courses.forEach(c => {
    const fs = byCourse[c.id] || [], done = fs.filter(f => RESOLVED.has(S.status[f.id])).length, sc = courseScore(c);
    t.append(el('button', { class: 'lrow' + (S.libSel === c.id ? ' active' : ''), onclick: () => { S.libSel = c.id; renderLibrary(); } },
      el('span', { class: 't' }, el('b', {}, c.title), el('span', {}, `${c.voice.name} · updated ${fdate(c.updated)}${S.versions[c.id] ? ' · republished ' + S.versions[c.id] + ' today' : ''}`)), el('span', { class: 'c' }, c.format.split(' ·')[0]), el('span', { class: 'c c-owner' }, c.owner.split(' ')[0]), el('span', { class: 'c' }, c.learners.split(' ·')[0]),
      el('span', { class: 'findings' }, fs.length - done ? el('span', { class: 'pill ' + (fs.some(f => f.severity === 'critical' && !RESOLVED.has(S.status[f.id])) ? 'critical' : 'serious') }, `${fs.length - done} open`) : null, done ? el('span', { class: 'pill good' }, `${done} done`) : null),
      el('span', { class: 'hs' }, el('b', { class: 'num' }, sc), el('span', { class: 'hbar' }, el('i', { class: sc >= 90 ? 'good' : '', style: `width:${sc}%` })))));
  });
  t.append(el('div', { class: 'lsep' }, `Other owners · with findings (${C.library.others.length})`));
  C.library.others.forEach(o => t.append(el('button', { class: 'lrow other', onclick: () => toast(`${o.title} belongs to ${o.owner}. Their findings are in their inbox; the offline demo carries audio only for your five courses.`, 4200) },
    el('span', { class: 't' }, el('b', {}, o.title), el('span', {}, o.note)), el('span', { class: 'c' }, o.format), el('span', { class: 'c c-owner' }, o.owner.split(' ')[0]), el('span', { class: 'c' }, o.learners), el('span', { class: 'findings' }, el('span', { class: 'pill ' + (o.critical ? 'critical' : 'serious') }, `${o.findings} open`)), el('span', { class: 'hs' }, el('b', { class: 'num' }, 60 + (o.findings * 3) % 20), el('span', { class: 'hbar' }, el('i', { style: `width:${60 + (o.findings * 3) % 20}%` }))))));
  t.append(el('div', { class: 'lsep' }, `${C.library.courses - C.courses.length - C.library.others.length} more courses · verified overnight, nothing to do`));
  $('#lib-legend').innerHTML = ''; ['verified', 'drift', 'critical', 'fixed'].forEach(k => $('#lib-legend').append(el('span', {}, el('i', { class: k }), { verified: 'Verified', drift: 'Drift', critical: 'Critical', fixed: 'New take live' }[k])));
  renderCourse(courseById[S.libSel]);
}
function renderCourse(c) {
  const d = $('#ldetail'); d.innerHTML = ''; if (!c) return;
  const sc = courseScore(c), R = 40, circ = 2 * Math.PI * R;
  d.append(el('div', { class: 'dt-head' }, el('div', { class: 'row' }, el('span', { class: 'pill' }, c.format), el('span', { class: 'pill' }, c.voice.name + ' · ' + c.voice.style), S.versions[c.id] ? el('span', { class: 'pill good' }, 'republished ' + S.versions[c.id]) : null), el('h2', { class: 'dt-title' }, c.title), el('p', { class: 'dt-meta' }, `${c.learners} · ${c.duration} · owner ${c.owner} · last published ${fdate(c.updated)}`)));
  d.append(el('div', { class: 'score' }, el('div', { class: 'ring' + (sc >= 90 ? ' good' : '') }, el('div', { html: `<svg viewBox="0 0 96 96" aria-hidden="true"><circle class="track" cx="48" cy="48" r="${R}"/><circle class="val" cx="48" cy="48" r="${R}" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${(circ * (1 - sc / 100)).toFixed(1)}"/></svg>` }), el('span', { class: 'n num' }, sc)), el('div', {}, el('span', { class: 'dt-label' }, 'Continuity score'), el('p', { style: 'margin-top:6px;font-size:14px;color:var(--ink-2)' }, `${sc} of 100. Every checkable claim in this course, verified against a current source. ${(byCourse[c.id] || []).filter(f => !RESOLVED.has(S.status[f.id])).length || 'No'} open finding${(byCourse[c.id] || []).filter(f => !RESOLVED.has(S.status[f.id])).length === 1 ? '' : 's'}.`))));
  d.append(el('div', { class: 'dt-section' }, el('span', { class: 'dt-label' }, 'Narration track'), strip(c), el('div', { class: 'legend' }, ...['verified', 'drift', 'critical', 'fixed'].map(k => el('span', {}, el('i', { class: k }), { verified: 'Verified', drift: 'Drift', critical: 'Critical', fixed: 'New take live' }[k])))));
  const list = el('div', { class: 'seglist' }), np = el('div', { class: 'nowplaying', hidden: true }); const rows = {};
  c.segments.forEach(s => {
    const fs = findingsBySeg[s.id] || []; const pub = fs.find(f => S.status[f.id] === 'published'); const key = pub ? takeKey(pub) : s.id + '_orig'; const text = pub ? takeText(pub) : s.script;
    const open = fs.filter(f => !['published', 'dismissed'].includes(S.status[f.id]));
    const tag = pub ? el('span', { class: 'pill good' }, 'new take') : open.length ? el('span', { class: 'pill ' + (open.some(f => f.severity === 'critical') ? 'critical' : 'serious') }, S.status[open[0].id] === 'handoff' ? 'with Priya N.' : 'drift · in your inbox') : s.verified ? el('span', { class: 'pill muted', title: s.verified }, 'checked · still true') : el('span', { class: 'pill muted' }, 'unchanged');
    const b = el('button', { class: 'pbtn sm' + (pub ? ' mint' : ''), 'aria-label': 'Play ' + s.id, disabled: !clipFor(key), onclick: () => playRow(s.id) }, el('span', { class: 'ic' }));
    const row = el('div', { class: 'segrow', 'data-seg': s.id }, el('span', { class: 'fid' }, s.id), b, el('span', { class: 't' }, s.title), tag);
    rows[s.id] = { row, key, text, mask: pub ? freshMask(s.script, takeText(pub)) : (fs[0] ? staleMask(s.script, fs[0].fixed) : []), kind: pub ? 'fresh' : 'stale' }; list.append(row);
  });
  function playRow(id) { const r = rows[id]; $$('.segrow', list).forEach(x => x.classList.toggle('active', x.dataset.seg === id)); np.hidden = false; np.innerHTML = ''; const sc2 = scriptNode(r.text, r.mask, r.kind); np.append(el('div', { class: 'np-head' }, el('span', {}, el('b', {}, `${id} · ${segById[id].title}`)), el('span', {}, `${c.voice.name} · ${r.kind === 'fresh' ? 'new take' : 'as published'}`)), sc2); const segEl = $(`#ldetail .seg[data-seg="${id}"]`); segEl && segEl.classList.add('playing'); return playClip(r.key, { onWord: i => highlightWord(sc2, i), onEnd: () => { segEl && segEl.classList.remove('playing'); highlightWord(sc2, -1); } }); }
  let all = false; const allVoiced = c.segments.every(s => clipFor(rows[s.id].key));
  const allBtn = el('button', { class: 'btn primary', disabled: !allVoiced, title: allVoiced ? '' : 'Only the flagged segments of this course carry audio in the offline demo', onclick: async () => { if (all) { all = false; stopAll(); allBtn.textContent = 'Play the whole module'; return; } all = true; allBtn.textContent = 'Stop'; for (const s of c.segments) { if (!all) break; const ok = await playRow(s.id); if (!ok) break; await wait(300); } all = false; allBtn.textContent = 'Play the whole module'; $$('.segrow', list).forEach(x => x.classList.remove('active')); } }, 'Play the whole module');
  d.append(el('div', { class: 'dt-section' }, el('div', { class: 'row', style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, allBtn, el('span', { class: 'dt-meta' }, `${c.segments.filter(s => (findingsBySeg[s.id] || []).some(f => S.status[f.id] === 'published')).length} of ${c.segments.length} segments are new takes; the rest are untouched`)), list, np));
  d.append(el('div', { class: 'dt-section' }, el('span', { class: 'dt-label' }, 'Where it goes back'), pubInfo(c)));
  if (S.versions[c.id]) d.append(el('div', { class: 'card ok' }, el('h4', {}, `Version note · ${S.versions[c.id]}`), el('pre', { class: 'vnote' }, versionNote(c))));
}

/* ── sources ─────────────────────────────────────────────────────────────── */
function renderSources() {
  const t = $('#stable'); t.innerHTML = '';
  t.append(el('div', { class: 'shead' }, el('span', {}, 'Source'), el('span', {}, 'What changed'), el('span', {}, 'Changed'), el('span', {}, 'Depends'), el('span', {}, 'Findings')));
  [...C.sources].sort((a, b) => b.date.localeCompare(a.date)).forEach(s => t.append(el('div', { class: 'srow' + (s.conflict ? ' conflict' : '') },
    el('span', { class: 't' }, el('b', {}, s.name), el('span', {}, s.system)), el('span', { class: 'ch' }, s.change, s.was ? el('span', { class: 'was' }, 'was: ' + s.was) : null, s.conflict ? el('span', { class: 'was' }, `conflicts with ${s.conflict.name}: “${s.conflict.says}”`) : null),
    el('span', { class: 'st moved' }, fshort(s.date)), el('span', { class: 'dep num' }, `${s.dependents} seg.`), el('span', { class: 'fl' }, ...s.findings.map(id => el('button', { onclick: () => selectFinding(id), title: findingById[id].claim }, id))))));
  C.unchanged_sources.forEach(s => t.append(el('div', { class: 'srow' }, el('span', { class: 't' }, el('b', {}, s.name), el('span', {}, s.system)), el('span', { class: 'ch' }, 'No change since the courses that cite it were published.'), el('span', { class: 'st ok' }, 'unchanged'), el('span', { class: 'dep num' }, `${s.dependents} seg.`), el('span', { class: 'fl' }))));
}
$('#add-source').addEventListener('click', () => toast('Connect a SharePoint library, a release-notes feed, a Workday report, a web page or a PDF. Continuity watches it from the next scan.', 4500));

/* ── activity ────────────────────────────────────────────────────────────── */
const tiles = []; let activityBuilt = false;
const mulberry = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function buildActivity() {
  if (activityBuilt) return; activityBuilt = true;
  const n = C.library.courses, rnd = mulberry(20260915), drift = new Set(), crit = new Set();
  while (drift.size < C.scan.courses_affected) drift.add(Math.floor(rnd() * n)); const d = [...drift]; while (crit.size < C.scan.critical) crit.add(d[Math.floor(rnd() * d.length)]);
  const host = $('#tiles'); for (let i = 0; i < n; i++) { const t = el('div', { class: 'tile' }); t.dataset.fate = crit.has(i) ? 'critical' : drift.has(i) ? 'drift' : 'on'; tiles.push(t); host.append(t); }
  const cs = $('#counters'); [['claims', 'claims checked', ''], ['segments', 'segments read', ''], ['findings', 'findings', 'alert'], ['courses_affected', 'courses affected', 'crit']].forEach(([k, label, cls]) => cs.append(el('div', { class: 'counter ' + cls, 'data-k': k }, el('span', { class: 'v num' }, nf.format(C.scan[k])), el('span', { class: 'k' }, label))));
  tiles.forEach(t => t.classList.add(t.dataset.fate));
  renderScanLog(false);
}
function logLine(list, t, who, msg, cls = '') { const li = el('li', {}, el('span', { class: 't num' }, t), el('span', { class: 'who ' + who }, who), el('span', { class: 'msg ' + cls }, msg)); list.append(li); return li; }
function renderScanLog(animated) { const l = $('#scan-log'); l.innerHTML = ''; C.scan.log.forEach(([t, who, msg, cls], i) => { if (animated) setTimeout(() => { logLine(l, t, who, msg, cls); l.lastChild.scrollIntoView({ block: 'nearest' }); }, reduced ? 0 : 350 + i * 520); else logLine(l, t, who, msg, cls); }); }
function renderToday() { const l = $('#today-log'); l.innerHTML = ''; if (!S.today.length) { l.append(el('li', { class: 'empty' }, 'Nothing yet. Decisions you make in the inbox show up here.')); return; } S.today.forEach(e => logLine(l, e.t, e.who, e.msg, e.cls)); }
function animateCount(node, to, ms) { const start = performance.now(); const iv = setInterval(() => { const p = reduced ? 1 : Math.min(1, (performance.now() - start) / ms); node.textContent = nf.format(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p >= 1) clearInterval(iv); }, 32); }
function renderActivity() { buildActivity(); renderToday(); }
$('#replay-scan').addEventListener('click', () => {
  buildActivity(); const T = 7200; tiles.forEach(t => { t.className = 'tile'; }); $$('#counters .counter').forEach(c => animateCount($('.v', c), C.scan[c.dataset.k], T));
  const order = tiles.map((_, i) => i); const rnd = mulberry(7); order.sort(() => rnd() - 0.5); order.forEach((i, k) => setTimeout(() => tiles[i].classList.add(tiles[i].dataset.fate), reduced ? 0 : 400 + (k / order.length) * (T - 900)));
  renderScanLog(true);
});

/* ── help ────────────────────────────────────────────────────────────────── */
$('#help-body').append(
  el('p', {}, 'You are ', el('b', {}, `${ME.name}, ${ME.role} at ${C.company.name}`), ' (fictional). It is ', el('b', {}, `${C.meta.weekday} ${fdate(C.meta.date)}, ${C.meta.time}`), '. The agents ran the first full scan of the library overnight and posted to Slack.'),
  el('ol', {}, el('li', {}, el('b', {}, 'Slack digest.'), ' Read the 2:06 AM message. Point out: findings are grouped by course, the critical one is called out, tasks a voice can\'t fix are separate.'), el('li', {}, el('b', {}, 'Critical first.'), ' Click Open on the 🔴 message. Play the published narration (old number highlighted), then the new take (same narrator, new number). Approve & publish. Watch Slack confirm the republish.'), el('li', {}, el('b', {}, 'The rest in one click.'), ' Approve all ready. Rows publish; Slack summarizes per course; Priya N. swaps the Storyline takes and republishes a few seconds later.'), el('li', {}, el('b', {}, 'Judgment stays human.'), ' Open the 🟡 item: two sources disagree on parental leave. Pick the authoritative one. Sam from People replies.'), el('li', {}, el('b', {}, 'Tasks.'), ' Filter Tasks: the ClaimsCore screen capture and the CEO welcome video. Create the task.'), el('li', {}, el('b', {}, 'Edit script.'), ' On F3 (customer communications), open Edit script → “Use Legal\'s wording” → Re-voice. The edited take is real audio.'), el('li', {}, el('b', {}, 'Library.'), ' Working with AI at Alder: play the whole module with the four new takes spliced in. Health 44 → 100. Version note at the bottom.'), el('li', {}, el('b', {}, 'Sources and Activity.'), ' The watch list, and the audit trail of the 2:00 AM run (Replay animates it).')),
  el('div', { class: 'keys' }, el('kbd', {}, '1 – 4'), el('span', {}, 'Inbox · Library · Sources · Activity'), el('kbd', {}, 'S'), el('span', {}, 'show / hide Slack'), el('kbd', {}, 'T'), el('span', {}, 'light / dark'), el('kbd', {}, '?'), el('span', {}, 'these notes'), el('kbd', {}, 'Reset demo'), el('span', {}, 'back to 7:42 AM')),
  el('p', { class: 'fine' }, `All narration is real WellSaid audio (preview model) rendered ahead of time so the demo runs offline: ${Object.keys(AUDIO).length} clips. In production the re-voice step renders live in about two seconds. Library-wide counts are illustrative for this sample library. Alder Mutual, its people and policies are fictional; the drift categories are the real ones Continuity Intelligence reports.`));

/* ── boot ────────────────────────────────────────────────────────────────── */
renderInbox(); refreshSidebar();
})();
