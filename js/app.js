// app.js — screen navigation, course loading, scorecard logic
//
// Navigation model: each screen is a <div class="screen">.
// showScreen(id) hides all, shows the target. No URL routing needed for a
// single-user offline app.

// ── State ──────────────────────────────────────────────────────────────────
let allCourses = [];   // loaded from courses.json + IndexedDB custom courses
let activeRound = null; // the round currently being played/viewed

// ── Utility ────────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function today() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Total score for a round (sum of entered scores, skipping unplayed holes)
function totalScore(round) {
  return round.holes.reduce((sum, h) => sum + (h.score ?? 0), 0);
}

// Total par for holes where a score has been entered
function totalPar(round) {
  return round.holes.reduce((sum, h) => sum + (h.score != null ? h.par : 0), 0);
}

function relScore(score, par) {
  if (!score || !par) return '—';
  const d = score - par;
  if (d === 0) return 'E';
  return d > 0 ? `+${d}` : `${d}`;
}

function scoreClass(score, par) {
  if (score == null || par == null) return '';
  const d = score - par;
  if (d <= -2) return 'score-eagle';
  if (d === -1) return 'score-birdie';
  if (d === 0)  return 'score-par';
  if (d === 1)  return 'score-bogey';
  if (d === 2)  return 'score-double';
  return 'score-worse';
}

// ── Boot ───────────────────────────────────────────────────────────────────
async function init() {
  // Register service worker for offline support.
  // We check for https: or localhost because SW requires a secure context.
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/golf-sg-app/sw.js');
    } catch (e) {
      console.warn('SW registration failed (expected on plain localhost file://):', e);
    }
  }

  // Load pre-built courses from the JSON file.
  const res = await fetch('/golf-sg-app/data/courses.json');
  allCourses = await res.json();

  // Merge in any user-added custom courses from IndexedDB.
  const custom = await db.customCourses.toArray();
  allCourses = [...allCourses, ...custom];

  // Wire up buttons that are always present.
  document.getElementById('new-round-btn').addEventListener('click', () => {
    renderCourseSelect();
    showScreen('course-screen');
  });
  document.getElementById('back-to-home-from-course').addEventListener('click', () => showScreen('home-screen'));
  document.getElementById('back-to-home-from-card').addEventListener('click', confirmLeaveRound);

  renderHome();
  showScreen('home-screen');
}

// ── Home screen ────────────────────────────────────────────────────────────
async function renderHome() {
  const list = document.getElementById('rounds-list');
  // Fetch rounds sorted newest-first (by id descending, since id is auto-increment).
  const rounds = await db.rounds.orderBy('id').reverse().limit(20).toArray();

  if (rounds.length === 0) {
    list.innerHTML = '<p class="empty-state">No rounds yet — tap New Round to start.</p>';
    return;
  }

  list.innerHTML = rounds.map(r => {
    const sc = totalScore(r);
    const par = totalPar(r);
    const rel = relScore(sc, par);
    return `
      <div class="round-card" data-id="${r.id}">
        <div class="rc-info">
          <div class="rc-course">${r.courseName}</div>
          <div class="rc-date">${formatDate(r.date)}</div>
        </div>
        <div>
          <div class="rc-score">${sc || '—'}</div>
          <div class="rc-rel">${rel}</div>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.round-card').forEach(card => {
    card.addEventListener('click', async () => {
      const round = await db.rounds.get(parseInt(card.dataset.id));
      openRound(round);
    });
  });
}

// ── Course select screen ───────────────────────────────────────────────────
function renderCourseSelect() {
  const list = document.getElementById('course-list');
  list.innerHTML = allCourses.map(c => `
    <div class="course-card" data-id="${c.id}">
      <div class="cc-icon">⛳</div>
      <div>
        <div class="cc-name">${c.name}</div>
        <div class="cc-loc">${c.location ?? ''}</div>
      </div>
    </div>`).join('');

  list.querySelectorAll('.course-card').forEach(card => {
    card.addEventListener('click', () => {
      const course = allCourses.find(c => String(c.id) === card.dataset.id);
      startNewRound(course);
    });
  });
}

// ── Round management ───────────────────────────────────────────────────────
async function startNewRound(course) {
  // Build the holes array with nulls for un-entered fields.
  const holes = course.holes.map(h => ({
    no:     h.no,
    par:    h.par,
    si:     h.si,
    metres: h.metres,
    score:  null,
    putts:  null,
    firHit: null, // null = not applicable (par 3) or not yet entered
    gir:    null,
  }));

  const round = {
    courseId:   String(course.id),
    courseName: course.name,
    date:       today(),
    holes,
  };

  // Save immediately so we have an id and it survives a browser crash.
  round.id = await db.rounds.add(round);
  openRound(round);
}

function openRound(round) {
  activeRound = round;
  renderScorecard();
  showScreen('scorecard-screen');
}

async function confirmLeaveRound() {
  // In Phase 1 we just go home; the round is already persisted.
  activeRound = null;
  await renderHome();
  showScreen('home-screen');
}

// ── Scorecard screen ───────────────────────────────────────────────────────
function renderScorecard() {
  if (!activeRound) return;

  // Update header
  document.getElementById('card-course-name').textContent = activeRound.courseName;
  document.getElementById('card-date').textContent = formatDate(activeRound.date);

  // Summary totals
  const sc  = totalScore(activeRound);
  const par = totalPar(activeRound);
  document.getElementById('card-total-score').textContent = sc || '—';
  document.getElementById('card-rel-score').textContent   = relScore(sc, par);

  const holesPlayed = activeRound.holes.filter(h => h.score != null).length;
  document.getElementById('card-holes-played').textContent = `${holesPlayed}/18`;

  // Render hole rows
  const list = document.getElementById('holes-list');
  list.innerHTML = activeRound.holes.map(h => {
    const played = h.score != null;
    const firLabel = h.par === 3 ? '' : (h.firHit === true ? ' · FIR' : h.firHit === false ? ' · Miss' : '');
    const girLabel = h.gir === true ? ' · GIR' : h.gir === false ? ' · No GIR' : '';
    const detail = `Par ${h.par} · ${h.metres}m · SI ${h.si}${firLabel}${girLabel}`;

    return `
      <div class="hole-row ${played ? 'completed' : ''}" data-hole="${h.no}">
        <div class="hr-no">${h.no}</div>
        <div class="hr-info"><strong>${played ? `Score: ${h.score}` : 'Tap to enter'}</strong><br>${detail}</div>
        <div class="hr-score ${scoreClass(h.score, h.par)}">${h.score ?? ''}</div>
      </div>`;
  }).join('');

  list.querySelectorAll('.hole-row').forEach(row => {
    row.addEventListener('click', () => {
      const holeNo = parseInt(row.dataset.hole);
      const hole = activeRound.holes.find(h => h.no === holeNo);
      openHoleModal(hole);
    });
  });
}

// ── Hole entry modal ───────────────────────────────────────────────────────
let modalHole = null; // the hole object currently being edited

function openHoleModal(hole) {
  modalHole = hole;
  const modal = document.getElementById('hole-modal');

  document.getElementById('modal-title').innerHTML =
    `Hole ${hole.no} <span>Par ${hole.par} · ${hole.metres}m</span>`;

  // Score stepper: default to par if not yet entered
  setStepperValue('score', hole.score ?? hole.par);

  // Putts stepper: default to 2
  setStepperValue('putts', hole.putts ?? 2);

  // FIR toggle — hide entirely for par 3s
  const firRow = document.getElementById('fir-row');
  firRow.style.display = hole.par === 3 ? 'none' : 'flex';
  setToggle('fir', hole.firHit);

  // GIR toggle
  setToggle('gir', hole.gir);

  modal.classList.add('open');
}

function closeHoleModal() {
  document.getElementById('hole-modal').classList.remove('open');
  modalHole = null;
}

function setStepperValue(name, val) {
  document.getElementById(`${name}-val`).textContent = val;
}

function getStepperValue(name) {
  return parseInt(document.getElementById(`${name}-val`).textContent);
}

function setToggle(name, value) {
  const yes = document.getElementById(`${name}-yes`);
  const no  = document.getElementById(`${name}-no`);
  yes.classList.remove('active-yes');
  no.classList.remove('active-no');
  if (value === true)  yes.classList.add('active-yes');
  if (value === false) no.classList.add('active-no');
}

function getToggle(name) {
  const yes = document.getElementById(`${name}-yes`);
  const no  = document.getElementById(`${name}-no`);
  if (yes.classList.contains('active-yes')) return true;
  if (no.classList.contains('active-no'))  return false;
  return null;
}

async function saveHoleEntry() {
  if (!modalHole || !activeRound) return;

  const hole = activeRound.holes.find(h => h.no === modalHole.no);
  hole.score  = getStepperValue('score');
  hole.putts  = getStepperValue('putts');
  hole.firHit = hole.par === 3 ? null : getToggle('fir');
  hole.gir    = getToggle('gir');

  // Persist the whole round (Dexie put replaces the record by primary key).
  await db.rounds.put(activeRound);

  closeHoleModal();
  renderScorecard();
}

// ── Wire up modal controls ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Stepper buttons
  ['score', 'putts'].forEach(name => {
    document.getElementById(`${name}-dec`).addEventListener('click', () => {
      const min = name === 'score' ? 1 : 0;
      const cur = getStepperValue(name);
      if (cur > min) setStepperValue(name, cur - 1);
    });
    document.getElementById(`${name}-inc`).addEventListener('click', () => {
      const max = name === 'score' ? 15 : 10;
      const cur = getStepperValue(name);
      if (cur < max) setStepperValue(name, cur + 1);
    });
  });

  // Toggle buttons
  ['fir', 'gir'].forEach(name => {
    document.getElementById(`${name}-yes`).addEventListener('click', () => {
      const wasYes = document.getElementById(`${name}-yes`).classList.contains('active-yes');
      setToggle(name, wasYes ? null : true); // tap again to deselect
    });
    document.getElementById(`${name}-no`).addEventListener('click', () => {
      const wasNo = document.getElementById(`${name}-no`).classList.contains('active-no');
      setToggle(name, wasNo ? null : false);
    });
  });

  document.getElementById('modal-save').addEventListener('click', saveHoleEntry);
  document.getElementById('modal-cancel').addEventListener('click', closeHoleModal);

  // Tap the backdrop to dismiss
  document.getElementById('hole-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeHoleModal();
  });

  // Kick off the app
  init().catch(console.error);
});
