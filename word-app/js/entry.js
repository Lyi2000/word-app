'use strict';

/* ================= 录入页 ================= */

let editingWordId = null;

function initEntry() {
  document.getElementById('addRootDirBtn').addEventListener('click', () => {
    const input = document.getElementById('newRootDirName');
    const name = input.value.trim();
    if (!name) return alert('请输入目录名称');
    createDir(name, null);
    input.value = '';
    refreshAll();
  });

  document.getElementById('dirTreeEntry').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('[data-id]').dataset.id;
    const act = btn.dataset.act;
    if (act === 'add') {
      const name = prompt('子目录名称：');
      if (name && name.trim()) { createDir(name.trim(), id); refreshAll(); }
    } else if (act === 'rename') {
      const d = findDir(id);
      const name = prompt('新名称：', d.name);
      if (name && name.trim()) { renameDir(id, name.trim()); refreshAll(); }
    } else if (act === 'del') {
      const d = findDir(id);
      if (!d) return;
      const n = wordsUnderDir(id, true).length;
      if (confirm(`删除目录「${d.name}」？该目录下有 ${n} 个单词，删除后这些单词只是不再属于此目录（不会删除）。`)) {
        deleteDir(id);
        selectedDirsLib.delete(id);
        refreshAll();
      }
    }
  });

  document.getElementById('wIsDerived').addEventListener('change', () => {
    const on = document.getElementById('wIsDerived').checked;
    document.getElementById('wParent').hidden = !on;
    syncDirsWithParent();
  });
  document.getElementById('wParent').addEventListener('change', syncDirsWithParent);

  document.getElementById('addSenseBtn').addEventListener('click', () => addSenseRow('n.', ''));
  document.getElementById('senseRows').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act="rm"]');
    if (btn) {
      if (document.querySelectorAll('.sense-row').length > 1) btn.closest('.sense-row').remove();
    }
  });

  document.getElementById('wordForm').addEventListener('submit', onWordSubmit);
  document.getElementById('cancelEditBtn').addEventListener('click', resetWordForm);
  document.getElementById('wordSearch').addEventListener('input', renderWordList);

  document.getElementById('wordList').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('[data-id]').dataset.id;
    const act = btn.dataset.act;
    if (act === 'speak') speak(getWord(id).text);
    else if (act === 'edit') editWord(id);
    else if (act === 'del') {
      const w = getWord(id);
      const kids = childWords(id).length;
      if (confirm(`删除单词「${w.text}」？${kids ? `其下 ${kids} 个派生词也会一并删除。` : ''}`)) {
        deleteWord(id);
        if (editingWordId === id) resetWordForm();
        refreshAll();
      }
    }
  });

  addSenseRow('n.', '');
  renderEntryAll();
}

function renderEntryAll() {
  renderEntryDirTree();
  renderDirChecks();
  renderParentOptions();
  renderWordList();
}

/* ---------- 目录树（管理） ---------- */

function renderEntryDirTree() {
  const box = document.getElementById('dirTreeEntry');
  box.innerHTML = state.dirs.length ? '' : '<p class="hint">暂无目录，请在下方添加。</p>';
  (function render(nodes, depth, parent) {
    nodes.forEach(n => {
      const wrap = document.createElement('div');
      wrap.className = 'tree-node';
      wrap.dataset.id = n.id;
      const row = document.createElement('div');
      row.className = 'dir-row';
      row.style.setProperty('--depth', depth);
      row.innerHTML = `
        <span class="dir-name">${esc(n.name)}</span>
        <span class="dir-count">${wordsUnderDir(n.id, true).length}词</span>
        <span class="dir-btns">
          <button type="button" class="mini" data-act="add">+子目录</button>
          <button type="button" class="mini" data-act="rename">改名</button>
          <button type="button" class="mini danger" data-act="del">删除</button>
        </span>`;
      wrap.appendChild(row);
      const children = document.createElement('div');
      children.className = 'node-children';
      render(n.children, depth + 1, children);
      wrap.appendChild(children);
      parent.appendChild(wrap);
    });
  })(state.dirs, 0, box);
}

/* ---------- 表单：目录多选 ---------- */

function renderDirChecks() {
  const box = document.getElementById('wDirs');
  if (!state.dirs.length) { box.innerHTML = '<p class="hint">请先在上方添加目录</p>'; return; }
  box.innerHTML = '';
  (function render(nodes, depth) {
    nodes.forEach(n => {
      const label = document.createElement('label');
      label.className = 'dir-check-item';
      label.style.setProperty('--depth', depth);
      label.innerHTML = `<input type="checkbox" value="${n.id}"> ${esc(n.name)}`;
      box.appendChild(label);
      if (n.children.length) render(n.children, depth + 1);
    });
  })(state.dirs, 0);
}

/* ---------- 表单：派生词父单词下拉 ---------- */

function renderParentOptions() {
  const sel = document.getElementById('wParent');
  const cur = sel.value;
  sel.innerHTML = '<option value="">选择所属单词（派生词必选）</option>' +
    rootWords().sort((a, b) => a.text.localeCompare(b.text))
      .map(w => `<option value="${w.id}">${esc(w.text)}</option>`).join('');
  sel.value = cur;
}

function syncDirsWithParent() {
  if (!document.getElementById('wIsDerived').checked) return;
  const p = getWord(document.getElementById('wParent').value);
  if (!p) return;
  document.querySelectorAll('#wDirs input[type=checkbox]').forEach(cb => {
    cb.checked = (p.dirIds || []).includes(cb.value);
  });
}

/* ---------- 表单：词性 / 意思行 ---------- */

const POS_OPTIONS = ['n.', 'v.', 'vt.', 'vi.', 'adj.', 'adv.', 'prep.', 'pron.',
  'conj.', 'art.', 'num.', 'interj.', 'phr.', 'abbr.'];

function addSenseRow(pos, meaning) {
  const row = document.createElement('div');
  row.className = 'sense-row';
  row.innerHTML = `
    <select class="sense-pos">${POS_OPTIONS.map(p =>
      `<option value="${p}" ${p === pos ? 'selected' : ''}>${p}</option>`).join('')}</select>
    <input class="sense-meaning" type="text" placeholder="意思，如：放弃" value="${esc(meaning)}">
    <button type="button" class="mini danger" data-act="rm">删</button>`;
  document.getElementById('senseRows').appendChild(row);
}

/* ---------- 提交 / 编辑 / 重置 ---------- */

function onWordSubmit(e) {
  e.preventDefault();
  const text = document.getElementById('wText').value.trim();
  if (!text) return alert('请输入单词');
  const dirIds = [...document.querySelectorAll('#wDirs input:checked')].map(i => i.value);
  if (!dirIds.length) return alert('请至少选择一个目录');
  const senses = [...document.querySelectorAll('.sense-row')].map(r => ({
    pos: r.querySelector('.sense-pos').value,
    meaning: r.querySelector('.sense-meaning').value.trim()
  })).filter(s => s.meaning);
  if (!senses.length) return alert('请至少填写一条意思');
  const isDerived = document.getElementById('wIsDerived').checked;
  const parentWordId = document.getElementById('wParent').value;
  if (isDerived && !parentWordId) return alert('派生词必须选择所属单词');

  upsertWord({
    text, isDerived, parentWordId, dirIds, senses,
    tip: document.getElementById('wTip').value.trim()
  }, editingWordId);

  resetWordForm();
  refreshAll();
}

function editWord(id) {
  const w = getWord(id);
  if (!w) return;
  editingWordId = id;
  document.getElementById('wText').value = w.text;
  document.getElementById('wIsDerived').checked = w.isDerived;
  document.getElementById('wParent').hidden = !w.isDerived;
  renderParentOptions();
  document.getElementById('wParent').value = w.parentWordId || '';
  renderDirChecks();
  document.querySelectorAll('#wDirs input').forEach(cb => {
    cb.checked = (w.dirIds || []).includes(cb.value);
  });
  const rows = document.getElementById('senseRows');
  rows.innerHTML = '';
  (w.senses || []).forEach(s => addSenseRow(s.pos, s.meaning));
  if (!w.senses || !w.senses.length) addSenseRow('n.', '');
  document.getElementById('wTip').value = w.tip || '';
  document.getElementById('saveWordBtn').textContent = '保存修改';
  document.getElementById('cancelEditBtn').hidden = false;
  window.scrollTo(0, 0);
}

function resetWordForm() {
  editingWordId = null;
  document.getElementById('wordForm').reset();
  document.getElementById('wParent').hidden = true;
  document.getElementById('wParent').value = '';
  const rows = document.getElementById('senseRows');
  rows.innerHTML = '';
  addSenseRow('n.', '');
  document.getElementById('saveWordBtn').textContent = '保存';
  document.getElementById('cancelEditBtn').hidden = true;
}

/* ---------- 单词列表 ---------- */

function renderWordList() {
  const q = document.getElementById('wordSearch').value.trim().toLowerCase();
  const box = document.getElementById('wordList');
  let list = wordList().sort((a, b) => a.text.localeCompare(b.text));
  if (q) list = list.filter(w => w.text.toLowerCase().includes(q));
  box.innerHTML = list.length ? '' : '<p class="hint">暂无单词</p>';
  list.forEach(w => {
    const dirs = (w.dirIds || []).map(id => findDir(id)).filter(Boolean)
      .map(d => d.name).join('、');
    const pos = (w.senses || []).map(s => s.pos).join(' / ');
    const item = document.createElement('div');
    item.className = 'word-item';
    item.dataset.id = w.id;
    item.innerHTML = `
      <div class="word-item-main">
        <span class="w-text">${esc(w.text)}</span>
        ${w.isDerived ? '<span class="tag">派生</span>' : ''}
        <span class="w-sub">${esc(pos)} · ${esc(dirs || '未分类')}</span>
      </div>
      <div class="word-item-btns">
        <button class="mini" data-act="speak">读音</button>
        <button class="mini" data-act="edit">编辑</button>
        <button class="mini danger" data-act="del">删除</button>
      </div>`;
    box.appendChild(item);
  });
}
