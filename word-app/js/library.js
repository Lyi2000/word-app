'use strict';

/* ================= 词库页（树结构 + 释义显隐 + 随机背） ================= */

let showAllMeaning = false;        // 全局显隐
const revealedSet = new Set();     // 单词级手动显示的释义
const selectedDirsLib = new Set(); // 勾选的目录
const collapsedSet = new Set();    // 折叠的目录

function initLibrary() {
  document.getElementById('toggleAllBtn').addEventListener('click', () => {
    showAllMeaning = !showAllMeaning;
    updateMeaningVisibility();
    updateToggleButtons();
  });

  document.getElementById('toggleSelBtn').addEventListener('click', () => {
    if (!selectedDirsLib.size) return alert('请先勾选要操作的目录');
    const ids = new Set();
    selectedDirsLib.forEach(d => wordsUnderDir(d, true).forEach(w => ids.add(w.id)));
    if (!ids.size) return alert('所选目录下没有单词');
    const arr = [...ids];
    const anyHidden = arr.some(id => !isMeaningVisible(getWord(id)));
    if (anyHidden) {
      arr.forEach(id => revealedSet.add(id));
    } else {
      arr.forEach(id => revealedSet.delete(id));
      showAllMeaning = false;
    }
    updateMeaningVisibility();
    updateToggleButtons();
  });

  document.getElementById('dirTreeLib').addEventListener('click', onLibClick);
  document.getElementById('dirTreeLib').addEventListener('change', onLibChange);
}

function isMeaningVisible(w) {
  return showAllMeaning || revealedSet.has(w.id);
}

function onLibChange(e) {
  const cb = e.target.closest('input[data-dir]');
  if (!cb) return;
  if (cb.checked) selectedDirsLib.add(cb.dataset.dir);
  else selectedDirsLib.delete(cb.dataset.dir);
}

function onLibClick(e) {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const node = btn.closest('[data-id]');
  const act = btn.dataset.act;

  if (act === 'toggle') {
    const id = node.dataset.id;
    if (collapsedSet.has(id)) collapsedSet.delete(id); else collapsedSet.add(id);
    renderLibrary();
  } else if (act === 'random') {
    startStudy('random', { dirId: node.dataset.id, includeDerived: true });
  } else if (act === 'eye') {
    const wid = btn.dataset.wid;
    if (revealedSet.has(wid)) revealedSet.delete(wid); else revealedSet.add(wid);
    updateMeaningVisibility();
  } else if (act === 'speak') {
    const w = getWord(btn.dataset.wid);
    if (w) speak(w.text);
  }
}

function renderLibrary() {
  const box = document.getElementById('dirTreeLib');
  box.innerHTML = '';
  renderLibDirs(state.dirs, 0, box);
  document.getElementById('libEmpty').hidden = state.dirs.length > 0;
  updateToggleButtons();
  updateMeaningVisibility();
}

function renderLibDirs(nodes, depth, parent) {
  nodes.forEach(n => {
    const wrap = document.createElement('div');
    wrap.className = 'tree-node';
    wrap.dataset.id = n.id;
    const row = document.createElement('div');
    row.className = 'dir-row';
    row.style.setProperty('--depth', depth);
    row.innerHTML = `
      <button class="arrow" data-act="toggle">${collapsedSet.has(n.id) ? '▸' : '▾'}</button>
      <label class="dir-checkbox"><input type="checkbox" data-dir="${n.id}" ${selectedDirsLib.has(n.id) ? 'checked' : ''}></label>
      <span class="dir-name">${esc(n.name)}</span>
      <span class="dir-count">${wordsUnderDir(n.id, true).length}</span>
      <button class="mini" data-act="random">随机背</button>`;
    wrap.appendChild(row);

    const children = document.createElement('div');
    children.className = 'node-children';
    if (!collapsedSet.has(n.id)) {
      renderLibDirs(n.children, depth + 1, children);
      rootWordsUnderDir(n.id).forEach(w => children.appendChild(buildWordRow(w, depth + 1)));
    }
    wrap.appendChild(children);
    parent.appendChild(wrap);
  });
}

function rootWordsUnderDir(dirId) {
  const ids = new Set(collectDirIds(dirId));
  return wordList()
    .filter(w => !w.isDerived && (w.dirIds || []).some(d => ids.has(d)))
    .sort((a, b) => a.text.localeCompare(b.text));
}

function buildWordRow(w, depth) {
  const wrap = document.createElement('div');
  wrap.className = 'word-row';
  wrap.dataset.wid = w.id;
  wrap.style.setProperty('--depth', depth);
  wrap.innerHTML = `
    <span class="w-text">${esc(w.text)}</span>
    <button class="mini icon" data-act="speak" data-wid="${w.id}">
      <svg viewBox="0 0 24 24" width="14" height="14"><path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor"/><path d="M16 8.5c1.6 1.4 1.6 5.6 0 7" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"/></svg>
    </button>
    <button class="mini" data-act="eye" data-wid="${w.id}">释义</button>
    <div class="word-meaning">${sensesHTML(w)}</div>`;
  const kids = childWords(w.id);
  if (kids.length) {
    const box = document.createElement('div');
    box.className = 'derived-box';
    kids.sort((a, b) => a.text.localeCompare(b.text))
        .forEach(c => box.appendChild(buildWordRow(c, depth + 1)));
    wrap.appendChild(box);
  }
  return wrap;
}

function updateMeaningVisibility() {
  document.querySelectorAll('.word-row').forEach(row => {
    const w = getWord(row.dataset.wid);
    if (!w) return;
    const visible = isMeaningVisible(w);
    row.querySelector('.word-meaning').classList.toggle('open', visible);
    const eye = row.querySelector('[data-act="eye"]');
    if (eye) eye.textContent = visible ? '隐藏' : '释义';
  });
}

function updateToggleButtons() {
  document.getElementById('toggleAllBtn').textContent =
    showAllMeaning ? '隐藏全部释义' : '显示全部释义';
}
