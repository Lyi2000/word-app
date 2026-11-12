'use strict';

/* ================= 存储与数据模型 ================= */

const STORE_KEY = 'wordapp_v1';
let state = null;

function loadState() {
  try { state = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { state = null; }
  if (!state || typeof state !== 'object') state = {};
  if (!state.seq) state.seq = 1;
  if (!Array.isArray(state.dirs)) state.dirs = [];
  if (!state.words || typeof state.words !== 'object') state.words = {};
  if (!state.settings) state.settings = { includeDerived: false };
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function uid() { return 'w' + (state.seq++); }

/* ---------- 通用工具 ---------- */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ---------- 日期工具（本地时区，YYYY-MM-DD） ---------- */

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayStr() { return fmtDate(new Date()); }

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return fmtDate(dt);
}

/* ---------- 目录（无限层级树） ---------- */

function walkDirs(fn, nodes) {
  (nodes || state.dirs).forEach(n => {
    fn(n);
    if (n.children && n.children.length) walkDirs(fn, n.children);
  });
}

function findDir(id) {
  let r = null;
  walkDirs(d => { if (d.id === id) r = d; });
  return r;
}

function dirPath(id) {
  const parts = [];
  (function find(nodes, path) {
    for (const n of nodes) {
      const p = path.concat(n.name);
      if (n.id === id) { parts.push(...p); return true; }
      if (n.children && n.children.length && find(n.children, p)) return true;
    }
    return false;
  })(state.dirs, []);
  return parts.join(' / ');
}

function collectDirIds(id) {
  const ids = [];
  const d = findDir(id);
  if (d) walkDirs(n => ids.push(n.id), [d]);
  return ids;
}

function createDir(name, parentId) {
  const node = { id: uid(), name: name, children: [] };
  if (parentId) {
    const p = findDir(parentId);
    if (p) { p.children.push(node); return node; }
  }
  state.dirs.push(node);
  return node;
}

function renameDir(id, name) {
  const d = findDir(id);
  if (d) d.name = name;
}

function deleteDir(id) {
  (function rm(nodes) {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) { nodes.splice(i, 1); return true; }
      if (nodes[i].children && rm(nodes[i].children)) return true;
    }
    return false;
  })(state.dirs);
  Object.values(state.words).forEach(w => {
    w.dirIds = (w.dirIds || []).filter(x => x !== id);
  });
  saveState();
}

/* ---------- 单词 ---------- */

function wordList() { return Object.values(state.words); }
function getWord(id) { return state.words[id]; }
function childWords(pid) { return wordList().filter(w => w.parentWordId === pid); }
function rootWords() { return wordList().filter(w => !w.isDerived); }

/* 某目录（含子目录）下的单词；includeDerived 时把父单词在该范围内的派生词也算上 */
function wordsUnderDir(dirId, includeDerived) {
  const ids = new Set(collectDirIds(dirId));
  const base = wordList().filter(w => !w.isDerived && (w.dirIds || []).some(d => ids.has(d)));
  if (!includeDerived) return base;
  const set = new Set(base.map(w => w.id));
  wordList().forEach(w => {
    if (w.isDerived && w.parentWordId && set.has(w.parentWordId)) set.add(w.id);
  });
  return wordList().filter(w => set.has(w.id));
}

/* 新增 / 编辑单词 */
function upsertWord(data, editId) {
  let w;
  if (editId && state.words[editId]) {
    w = state.words[editId];
  } else {
    w = { id: uid(), stats: null };
    state.words[w.id] = w;
  }
  w.text = data.text;
  w.isDerived = !!data.isDerived;
  w.parentWordId = w.isDerived ? data.parentWordId : null;
  w.dirIds = data.dirIds || [];
  w.senses = data.senses || [];
  w.tip = data.tip || '';
  saveState();
  return w.id;
}

function deleteWord(id) {
  childWords(id).forEach(c => deleteWord(c.id)); // 派生词一并删除
  delete state.words[id];
  saveState();
}

function sensesHTML(w) {
  const lines = (w.senses || []).map(s =>
    `<div><b>${esc(s.pos)}</b> ${esc(s.meaning)}</div>`).join('');
  const tip = w.tip ? `<div class="w-tip-line">提示：${esc(w.tip)}</div>` : '';
  return lines + tip;
}

/* ---------- 艾宾浩斯复习计划 ---------- */
/* 熟练度 level 越高间隔越长；认识升级、模糊降一级、不认识清零 */
const INTERVALS = [1, 2, 4, 7, 15, 30, 60]; // 天

function reviewWord(w, result) { // result: 0 不认识 / 1 模糊 / 2 认识
  const t = todayStr();
  if (!w.stats) w.stats = { level: 0, count: 0, due: t, history: [] };
  const s = w.stats;
  s.count++;
  s.history.push({ d: t, r: result });
  if (s.history.length > 50) s.history = s.history.slice(-50);

  if (result === 2) {
    s.level = Math.min(s.level + 1, INTERVALS.length - 1);
  } else if (result === 1) {
    s.level = Math.max(s.level - 1, 0);
  } else {
    s.level = 0;
  }

  let days;
  if (result === 2) {
    // 第一次认识隔 1 天，之后 2/4/7/15/30/60
    days = s.level === 1 ? 1 : INTERVALS[s.level];
  } else {
    days = 1; // 模糊 / 不认识：明天再来（一直不认识就每天出现）
  }

  // 漏背顺延：认识的情况按原计划日期（若已过期则从今天）起算，保证节奏不乱
  const base = (result === 2 && s.due && s.due > t) ? s.due : t;
  s.due = addDays(base, days);
  s.last = t;
  saveState();
}

/* ---------- 语音朗读（系统人声 TTS，iOS Safari 支持） ---------- */

function preloadVoices() {
  if (!('speechSynthesis' in window)) return;
  const load = () => { speechSynthesis.getVoices(); };
  load();
  speechSynthesis.onvoiceschanged = load;
}

function speak(text) {
  if (!('speechSynthesis' in window)) { alert('当前浏览器不支持语音朗读'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.85;
  const voices = speechSynthesis.getVoices();
  const v = voices.find(v => /^en[-_]US/i.test(v.lang)) ||
            voices.find(v => /^en/i.test(v.lang));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
