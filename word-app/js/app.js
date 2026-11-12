'use strict';

/* ================= 应用入口 / 页面切换 ================= */

function initApp() {
  loadState();
  initEntry();
  initLibrary();
  initStudy();

  document.getElementById('tabbar').addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    switchTabTo(btn.dataset.page);
  });

  switchTabTo('page-entry');

  // PWA Service Worker（https 或 localhost 下生效，实现离线可用）
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  preloadVoices();
}

function switchTabTo(pageId) {
  document.querySelectorAll('.page').forEach(p => { p.hidden = p.id !== pageId; });
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.page === pageId));
  const tab = document.querySelector(`.tab[data-page="${pageId}"]`);
  document.getElementById('pageTitle').textContent = tab ? tab.dataset.title : '';
  if (pageId === 'page-study') updateStudyCounts();
  if (pageId === 'page-library') renderLibrary();
}

function refreshAll() {
  renderEntryAll();
  renderLibrary();
  updateStudyCounts();
}

document.addEventListener('DOMContentLoaded', initApp);