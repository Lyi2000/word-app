'use strict';

/* ================= 背单词页 ================= */

let session = null; // { mode, ids, idx, counts:[不认识,模糊,认识] }

function initStudy() {
  document.getElementById('includeDerivedChk').checked = !!state.settings.includeDerived;
  document.getElementById('includeDerivedChk').addEventListener('change', e => {
    state.settings.includeDerived = e.target.checked;
    saveState();
    updateStudyCounts();
  });

  document.querySelectorAll('.mode-btn').forEach(btn =>
    btn.addEventListener('click', () => startStudy(btn.dataset.mode)));

  document.getElementById('gradeRow').addEventListener('click', e => {
    const btn = e.target.closest('button[data-r]');
    if (!btn || !session) return;
    gradeCurrent(Number(btn.dataset.r));
  });

  document.getElementById('speakBtn').addEventListener('click', () => {
    const w = currentWord();
    if (w) speak(w.text);
  });

  document.getElementById('tipBtn').addEventListener('click', () => {
    const w = currentWord();
    if (!w) return;
    const box = document.getElementById('tipBox');
    const btn = document.getElementById('tipBtn');
    if (box.hidden) {
      box.textContent = w.tip || '（该单词没有提示）';
      box.hidden = false;
      btn.textContent = '收起提示';
    } else {
      box.hidden = true;
      btn.textContent = '提示';
    }
  });

  document.getElementById('nextBtn').addEventListener('click', nextWord);
  document.getElementById('quitBtn').addEventListener('click', endStudy);
  document.getElementById('backHomeBtn').addEventListener('click', endStudy);
}

function currentWord() {
  return session ? getWord(session.ids[session.idx]) : null;
}

function updateStudyCounts() {
  const inc = !!state.settings.includeDerived;
  const all = wordList().filter(w => inc || !w.isDerived);
  const t = todayStr();
  document.getElementById('learnCount').textContent =
    all.filter(w => !w.stats).length + ' 个新词';
  document.getElementById('reviewCount').textContent =
    all.filter(w => w.stats && w.stats.due <= t).length + ' 个待复习';
  document.getElementById('randomCount').textContent =
    all.length + ' 个单词';
}

function startStudy(mode, opts) {
  opts = opts || {};
  const inc = opts.includeDerived !== undefined ? opts.includeDerived : !!state.settings.includeDerived;
  let list;
  if (opts.dirId) {
    list = wordsUnderDir(opts.dirId, inc);
  } else {
    list = wordList().filter(w => inc || !w.isDerived);
  }

  const t = todayStr();
  if (mode === 'learn') list = list.filter(w => !w.stats);
  else if (mode === 'review') list = list.filter(w => w.stats && w.stats.due <= t);

  if (!list.length) {
    alert(mode === 'learn' ? '没有未背过的新单词'
      : mode === 'review' ? '今天没有需要复习的单词'
      : '没有可选的单词');
    return;
  }

  if (mode === 'random') {
    list = shuffle(list.slice());
  } else if (mode === 'review') {
    list.sort((a, b) => (a.stats.due < b.stats.due ? -1 : 1)); // 最久到期的先复习
  } else {
    list.sort((a, b) => (a.id < b.id ? -1 : 1)); // 按录入顺序
  }

  session = { mode: mode, ids: list.map(w => w.id), idx: 0, counts: [0, 0, 0] };
  switchTabTo('page-study');
  showStudyView('card');
  renderCard();
}

function renderCard() {
  const w = currentWord();
  document.getElementById('studyProgress').textContent =
    `${session.idx + 1} / ${session.ids.length}`;

  const tag = document.getElementById('cardTag');
  if (w.isDerived) {
    const p = getWord(w.parentWordId);
    tag.hidden = false;
    tag.textContent = p ? `派生词 · 来自 ${p.text}` : '派生词';
  } else {
    tag.hidden = true;
  }

  document.getElementById('cardWord').textContent = w.text;

  const tipBox = document.getElementById('tipBox');
  tipBox.hidden = true;
  const tipBtn = document.getElementById('tipBtn');
  tipBtn.textContent = '提示';
  tipBtn.disabled = !w.tip;

  const ans = document.getElementById('answerBox');
  ans.hidden = true;
  ans.innerHTML = sensesHTML(w);

  document.getElementById('nextBtn').hidden = true;
  document.getElementById('gradeRow').hidden = false;
}

function gradeCurrent(r) {
  const w = currentWord();
  reviewWord(w, r); // 记录熟练度并按艾宾浩斯更新复习计划
  session.counts[r]++;
  document.getElementById('gradeRow').hidden = true;
  document.getElementById('answerBox').hidden = false;
  document.getElementById('nextBtn').hidden = false;
}

function nextWord() {
  session.idx++;
  if (session.idx >= session.ids.length) { showDone(); return; }
  renderCard();
}

function showDone() {
  showStudyView('done');
  const b = session.counts[0], m = session.counts[1], g = session.counts[2];
  document.getElementById('doneStats').innerHTML =
    `<p class="done-line"><span class="good-t">认识 ${g}</span><span class="mid-t">模糊 ${m}</span><span class="bad-t">不认识 ${b}</span></p>
     <p class="hint">共 ${session.ids.length} 个单词，复习计划已按艾宾浩斯曲线更新。</p>`;
  session = null;
}

function endStudy() {
  session = null;
  showStudyView('home');
  updateStudyCounts();
  renderLibrary(); // 刷新词库（复习状态变化）
}

function showStudyView(v) {
  document.getElementById('studyHome').hidden = v !== 'home';
  document.getElementById('studyCard').hidden = v !== 'card';
  document.getElementById('studyDone').hidden = v !== 'done';
}
