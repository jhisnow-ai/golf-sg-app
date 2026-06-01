// app.js — screen navigation, course loading, scorecard, course editor

// ── State ──────────────────────────────────────────────────────────────────
let allCourses    = [];   // merged from courses.json + IndexedDB
let activeRound   = null; // round being played/viewed
let selectedCourse = null; // chosen course, awaiting tee selection
let editingCourse  = null; // deep copy being edited in course editor
let editingTeeIdx  = null; // tee index open in tee-edit modal (null = new)
let editingHoleIdx = null; // hole index (0-17) open in hole-editor modal

// ── Utilities ──────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso) {
  return new Date(iso + 'T00:00:00')
    .toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

function totalScore(round) {
  return round.holes.reduce((s, h) => s + (h.score ?? 0), 0);
}

function totalPar(round) {
  return round.holes.reduce((s, h) => s + (h.score != null ? h.par : 0), 0);
}

function relScore(score, par) {
  if (!score || !par) return '—';
  const d = score - par;
  return d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`;
}

function scoreClass(score, par) {
  if (score == null) return '';
  const d = score - par;
  if (d <= -2) return 'score-eagle';
  if (d === -1) return 'score-birdie';
  if (d === 0)  return 'score-par';
  if (d === 1)  return 'score-bogey';
  if (d === 2)  return 'score-double';
  return 'score-worse';
}

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function generateId(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (slug || 'course') + '-' + Date.now().toString(36);
}

function teeTotalMetres(tee) {
  return tee.distances.reduce((s, d) => s + (d || 0), 0);
}

// Map common tee names to display colours
function teeColour(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('blue'))   return '#2563eb';
  if (n.includes('white'))  return '#9ca3af';
  if (n.includes('yellow')) return '#ca8a04';
  if (n.includes('red'))    return '#dc2626';
  if (n.includes('black'))  return '#374151';
  if (n.includes('gold'))   return '#b45309';
  if (n.includes('green'))  return '#15803d';
  return '#52b788';
}

// ── Data ───────────────────────────────────────────────────────────────────
async function loadAllCourses() {
  const res = await fetch('/golf-sg-app/data/courses.json');
  const builtIn = await res.json();
  const custom  = await db.courses.toArray();
  // Custom entries with matching id override the built-in JSON defaults.
  const map = new Map();
  builtIn.forEach(c => map.set(c.id, c));
  custom.forEach(c  => map.set(c.id, c));
  return Array.from(map.values());
}

async function persistCourse(course) {
  if (!course.id) course.id = generateId(course.name || 'course');
  await db.courses.put(course);
  allCourses = await loadAllCourses();
}

// ── Boot ───────────────────────────────────────────────────────────────────
async function init() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/golf-sg-app/sw.js');
    } catch (e) {
      console.warn('SW registration failed:', e);
    }
  }

  allCourses = await loadAllCourses();

  document.getElementById('new-round-btn').addEventListener('click', () => {
    renderCourseSelect();
    showScreen('course-screen');
  });
  document.getElementById('manage-courses-btn').addEventListener('click', () => {
    renderEditorList();
    showScreen('editor-list-screen');
  });
  document.getElementById('back-to-home-from-course').addEventListener('click', () => showScreen('home-screen'));
  document.getElementById('back-from-tee').addEventListener('click', () => {
    selectedCourse = null;
    showScreen('course-screen');
  });
  document.getElementById('back-to-home-from-card').addEventListener('click', confirmLeaveRound);
  document.getElementById('back-from-editor-list').addEventListener('click', async () => {
    await renderHome();
    showScreen('home-screen');
  });
  document.getElementById('back-from-editor').addEventListener('click', () => {
    editingCourse = null;
    renderEditorList();
    showScreen('editor-list-screen');
  });

  await renderHome();
  showScreen('home-screen');
}

// ── Home ───────────────────────────────────────────────────────────────────
async function renderHome() {
  const list   = document.getElementById('rounds-list');
  const rounds = await db.rounds.orderBy('id').reverse().limit(20).toArray();

  if (rounds.length === 0) {
    list.innerHTML = '<p class="empty-state">No rounds yet — tap New Round to start.</p>';
    return;
  }

  list.innerHTML = rounds.map(r => {
    const sc  = totalScore(r);
    const par = totalPar(r);
    const teeChip = r.teeName
      ? `<span class="tee-chip" style="background:${teeColour(r.teeName)}">${r.teeName}</span>`
      : '';
    return `
      <div class="round-card" data-id="${r.id}">
        <div class="rc-info">
          <div class="rc-course">${r.courseName} ${teeChip}</div>
          <div class="rc-date">${formatDate(r.date)}</div>
        </div>
        <div>
          <div class="rc-score">${sc || '—'}</div>
          <div class="rc-rel">${relScore(sc, par)}</div>
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

// ── Course Select ──────────────────────────────────────────────────────────
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
      selectedCourse = course;
      renderTeeSelect(course);
      showScreen('tee-screen');
    });
  });
}

// ── Tee Select ─────────────────────────────────────────────────────────────
function renderTeeSelect(course) {
  document.getElementById('tee-course-name').textContent = course.name;
  const list = document.getElementById('tee-list');

  if (!course.tees || course.tees.length === 0) {
    list.innerHTML = '<p class="empty-state">No tees defined — edit this course first.</p>';
    return;
  }

  list.innerHTML = course.tees.map((tee, idx) => `
    <div class="tee-card" data-tee="${idx}">
      <div class="tc-swatch" style="background:${teeColour(tee.name)}"></div>
      <div class="tc-info">
        <div class="tc-name">${tee.name}</div>
        <div class="tc-meta">${teeTotalMetres(tee).toLocaleString()}m · Rating ${tee.rating ?? '—'} · Slope ${tee.slope ?? '—'}</div>
      </div>
      <div class="tc-arrow">›</div>
    </div>`).join('');

  list.querySelectorAll('.tee-card').forEach(card => {
    card.addEventListener('click', () => startNewRound(selectedCourse, parseInt(card.dataset.tee)));
  });
}

// ── Round Management ───────────────────────────────────────────────────────
async function startNewRound(course, teeIndex) {
  const tee = course.tees[teeIndex];

  const holes = course.holes.map((h, i) => ({
    no:     h.no,
    par:    h.par,
    si:     h.si,
    metres: tee.distances[i] ?? 0,
    score:  null,
    putts:  null,
    firHit: null,
    gir:    null,
  }));

  const round = {
    courseId:   String(course.id),
    courseName: course.name,
    teeName:    tee.name,
    teeRating:  tee.rating,
    teeSlope:   tee.slope,
    date:       today(),
    holes,
  };

  round.id = await db.rounds.add(round);
  selectedCourse = null;
  openRound(round);
}

function openRound(round) {
  activeRound = round;
  renderScorecard();
  showScreen('scorecard-screen');
}

async function confirmLeaveRound() {
  activeRound = null;
  await renderHome();
  showScreen('home-screen');
}

// ── Scorecard ──────────────────────────────────────────────────────────────
function renderScorecard() {
  if (!activeRound) return;

  const teeLabel = activeRound.teeName ? ` (${activeRound.teeName})` : '';
  document.getElementById('card-course-name').textContent = activeRound.courseName + teeLabel;
  document.getElementById('card-date').textContent = formatDate(activeRound.date);

  const sc  = totalScore(activeRound);
  const par = totalPar(activeRound);
  document.getElementById('card-total-score').textContent = sc || '—';
  document.getElementById('card-rel-score').textContent   = relScore(sc, par);
  document.getElementById('card-holes-played').textContent =
    `${activeRound.holes.filter(h => h.score != null).length}/18`;

  const list = document.getElementById('holes-list');
  list.innerHTML = activeRound.holes.map(h => {
    const played   = h.score != null;
    const firLabel = h.par === 3 ? '' : (h.firHit === true ? ' · FIR' : h.firHit === false ? ' · Miss' : '');
    const girLabel = h.gir  === true ? ' · GIR' : h.gir  === false ? ' · No GIR' : '';
    const detail   = `Par ${h.par} · ${h.metres}m · SI ${h.si}${firLabel}${girLabel}`;
    return `
      <div class="hole-row ${played ? 'completed' : ''}" data-hole="${h.no}">
        <div class="hr-no">${h.no}</div>
        <div class="hr-info"><strong>${played ? `Score: ${h.score}` : 'Tap to enter'}</strong><br>${detail}</div>
        <div class="hr-score ${scoreClass(h.score, h.par)}">${h.score ?? ''}</div>
      </div>`;
  }).join('');

  list.querySelectorAll('.hole-row').forEach(row => {
    row.addEventListener('click', () => {
      openHoleModal(activeRound.holes.find(h => h.no === parseInt(row.dataset.hole)));
    });
  });
}

// ── Scoring Modal ──────────────────────────────────────────────────────────
let modalHole = null;

function openHoleModal(hole) {
  modalHole = hole;
  document.getElementById('modal-title').innerHTML =
    `Hole ${hole.no} <span>Par ${hole.par} · ${hole.metres}m</span>`;
  setStepVal('score', hole.score ?? hole.par);
  setStepVal('putts', hole.putts ?? 2);
  document.getElementById('fir-row').style.display = hole.par === 3 ? 'none' : 'flex';
  setToggle('fir', hole.firHit);
  setToggle('gir', hole.gir);
  document.getElementById('hole-modal').classList.add('open');
}

function closeHoleModal() {
  document.getElementById('hole-modal').classList.remove('open');
  modalHole = null;
}

function setStepVal(name, val) {
  document.getElementById(`${name}-val`).textContent = val;
}

function getStepVal(name) {
  return parseInt(document.getElementById(`${name}-val`).textContent);
}

function setToggle(name, value) {
  document.getElementById(`${name}-yes`).classList.toggle('active-yes', value === true);
  document.getElementById(`${name}-no`).classList.toggle('active-no',  value === false);
}

function getToggle(name) {
  if (document.getElementById(`${name}-yes`).classList.contains('active-yes')) return true;
  if (document.getElementById(`${name}-no`).classList.contains('active-no'))   return false;
  return null;
}

async function saveHoleEntry() {
  if (!modalHole || !activeRound) return;
  const hole  = activeRound.holes.find(h => h.no === modalHole.no);
  hole.score  = getStepVal('score');
  hole.putts  = getStepVal('putts');
  hole.firHit = hole.par === 3 ? null : getToggle('fir');
  hole.gir    = getToggle('gir');
  await db.rounds.put(activeRound);
  closeHoleModal();
  renderScorecard();
}

// ── Course Editor List ─────────────────────────────────────────────────────
function renderEditorList() {
  const list = document.getElementById('editor-course-list');
  list.innerHTML = allCourses.map(c => `
    <div class="course-card" data-id="${c.id}">
      <div class="cc-icon">⛳</div>
      <div style="flex:1">
        <div class="cc-name">${c.name}</div>
        <div class="cc-loc">${c.location ?? ''} · ${c.tees.length} tee${c.tees.length !== 1 ? 's' : ''}</div>
      </div>
      <div style="color:var(--text-muted);font-size:1.3rem;padding-right:4px">›</div>
    </div>`).join('');

  list.querySelectorAll('.course-card').forEach(card => {
    card.addEventListener('click', () => {
      const course = allCourses.find(c => String(c.id) === card.dataset.id);
      openCourseEditor(deepCopy(course));
    });
  });
}

// ── Course Editor ──────────────────────────────────────────────────────────
function openCourseEditor(course) {
  if (!course) {
    // Blank template for a new course
    course = {
      id:       null,
      name:     '',
      location: '',
      tees:     [],
      holes:    Array.from({ length: 18 }, (_, i) => ({ no: i + 1, par: 4, si: i + 1 })),
    };
  }
  editingCourse = course;
  renderCourseEditor();
  showScreen('course-editor-screen');
}

function renderCourseEditor() {
  document.getElementById('editor-title').textContent =
    editingCourse.id ? 'Edit Course' : 'New Course';
  document.getElementById('editor-name-input').value     = editingCourse.name;
  document.getElementById('editor-loc-input').value      = editingCourse.location ?? '';

  // Tees
  const teesList = document.getElementById('editor-tees-list');
  if (editingCourse.tees.length === 0) {
    teesList.innerHTML = '<p class="empty-state" style="padding:8px 0">No tees yet — add one below.</p>';
  } else {
    teesList.innerHTML = editingCourse.tees.map((tee, idx) => `
      <div class="tee-row">
        <div class="tee-row-swatch" style="background:${teeColour(tee.name)}"></div>
        <div class="tee-row-info">
          <strong>${tee.name}</strong>
          <span>Rating ${tee.rating ?? '—'} · Slope ${tee.slope ?? '—'}</span>
        </div>
        <button class="btn btn-outline btn-sm tee-edit-btn" data-tee="${idx}">Edit</button>
        <button class="btn btn-danger  btn-sm tee-del-btn"  data-tee="${idx}">×</button>
      </div>`).join('');
    teesList.querySelectorAll('.tee-edit-btn').forEach(b =>
      b.addEventListener('click', () => openTeeModal(parseInt(b.dataset.tee))));
    teesList.querySelectorAll('.tee-del-btn').forEach(b =>
      b.addEventListener('click', () => deleteTee(parseInt(b.dataset.tee))));
  }

  // Holes
  const holesList = document.getElementById('editor-holes-list');
  holesList.innerHTML = editingCourse.holes.map((h, idx) => {
    const chips = editingCourse.tees.map(tee =>
      `<span class="dist-chip" style="border-color:${teeColour(tee.name)};color:${teeColour(tee.name)}">${tee.name[0]}:${tee.distances[idx] ?? 0}</span>`
    ).join('');
    return `
      <div class="hole-editor-row" data-idx="${idx}">
        <div class="her-no">${h.no}</div>
        <div class="her-par-si">P${h.par} · SI${h.si}</div>
        <div class="her-dists">${chips || '<span style="color:var(--text-muted);font-size:0.75rem">no tees</span>'}</div>
        <div class="her-chevron">›</div>
      </div>`;
  }).join('');

  holesList.querySelectorAll('.hole-editor-row').forEach(row =>
    row.addEventListener('click', () => openHoleEditorModal(parseInt(row.dataset.idx))));
}

async function saveCourseEdits() {
  const name = document.getElementById('editor-name-input').value.trim();
  if (!name) { alert('Course name is required.'); return; }
  editingCourse.name     = name;
  editingCourse.location = document.getElementById('editor-loc-input').value.trim();
  await persistCourse(editingCourse);
  editingCourse = null;
  renderEditorList();
  showScreen('editor-list-screen');
}

// ── Tee Modal (add / edit) ─────────────────────────────────────────────────
function openTeeModal(teeIdx) {
  editingTeeIdx = teeIdx; // null = new
  const isNew = teeIdx == null;
  const tee   = isNew ? { name: '', rating: '', slope: '' } : editingCourse.tees[teeIdx];
  document.getElementById('tee-modal-title').textContent   = isNew ? 'Add Tee' : 'Edit Tee';
  document.getElementById('tee-name-input').value          = tee.name;
  document.getElementById('tee-rating-input').value        = tee.rating ?? '';
  document.getElementById('tee-slope-input').value         = tee.slope  ?? '';
  document.getElementById('tee-edit-modal').classList.add('open');
  document.getElementById('tee-name-input').focus();
}

function closeTeeModal() {
  document.getElementById('tee-edit-modal').classList.remove('open');
  editingTeeIdx = null;
}

function saveTeeModal() {
  const name   = document.getElementById('tee-name-input').value.trim();
  if (!name) { alert('Tee name is required.'); return; }
  const rating = parseFloat(document.getElementById('tee-rating-input').value) || null;
  const slope  = parseInt(document.getElementById('tee-slope-input').value)    || null;

  if (editingTeeIdx == null) {
    // New tee: initialise distances to 0 for all 18 holes
    editingCourse.tees.push({ name, rating, slope, distances: new Array(18).fill(0) });
  } else {
    Object.assign(editingCourse.tees[editingTeeIdx], { name, rating, slope });
  }
  closeTeeModal();
  renderCourseEditor();
}

function deleteTee(teeIdx) {
  if (!confirm(`Delete tee "${editingCourse.tees[teeIdx].name}"?`)) return;
  editingCourse.tees.splice(teeIdx, 1);
  renderCourseEditor();
}

// ── Hole Editor Modal (within course editor) ───────────────────────────────
function openHoleEditorModal(holeIdx) {
  editingHoleIdx = holeIdx;
  const h = editingCourse.holes[holeIdx];
  document.getElementById('he-title').textContent = `Hole ${h.no}`;
  setHEStep('par', h.par);
  setHEStep('si',  h.si);

  const distDiv = document.getElementById('he-tee-distances');
  if (editingCourse.tees.length === 0) {
    distDiv.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;margin-top:4px">Add tees first to enter distances.</p>';
  } else {
    distDiv.innerHTML = editingCourse.tees.map((tee, tIdx) => `
      <div class="field-row" style="margin-top:12px">
        <label style="display:flex;align-items:center;gap:6px">
          <span class="he-tee-dot" style="background:${teeColour(tee.name)}"></span>${tee.name} (m)
        </label>
        <input type="number" class="he-dist-input dist-input" data-tee="${tIdx}"
               value="${tee.distances[holeIdx] ?? 0}" min="0" max="700" inputmode="numeric">
      </div>`).join('');
  }

  document.getElementById('hole-editor-modal').classList.add('open');
}

function closeHoleEditorModal() {
  document.getElementById('hole-editor-modal').classList.remove('open');
  editingHoleIdx = null;
}

function setHEStep(name, val) {
  document.getElementById(`he-${name}-val`).textContent = val;
}

function getHEStep(name) {
  return parseInt(document.getElementById(`he-${name}-val`).textContent);
}

function saveHoleEditor() {
  const h = editingCourse.holes[editingHoleIdx];
  h.par = getHEStep('par');
  h.si  = getHEStep('si');
  document.querySelectorAll('.he-dist-input').forEach(input => {
    editingCourse.tees[parseInt(input.dataset.tee)].distances[editingHoleIdx] =
      parseInt(input.value) || 0;
  });
  closeHoleEditorModal();
  renderCourseEditor();
}

// ── DOM Wiring (runs once on page load) ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // ── Scoring modal steppers
  ['score', 'putts'].forEach(name => {
    document.getElementById(`${name}-dec`).addEventListener('click', () => {
      const min = name === 'score' ? 1 : 0;
      const cur = getStepVal(name);
      if (cur > min) setStepVal(name, cur - 1);
    });
    document.getElementById(`${name}-inc`).addEventListener('click', () => {
      const max = name === 'score' ? 15 : 10;
      const cur = getStepVal(name);
      if (cur < max) setStepVal(name, cur + 1);
    });
  });

  // ── Scoring modal toggles
  ['fir', 'gir'].forEach(name => {
    document.getElementById(`${name}-yes`).addEventListener('click', () =>
      setToggle(name, getToggle(name) === true ? null : true));
    document.getElementById(`${name}-no`).addEventListener('click', () =>
      setToggle(name, getToggle(name) === false ? null : false));
  });

  document.getElementById('modal-save').addEventListener('click', saveHoleEntry);
  document.getElementById('modal-cancel').addEventListener('click', closeHoleModal);
  document.getElementById('hole-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeHoleModal();
  });

  // ── Course editor
  document.getElementById('add-course-btn').addEventListener('click', () => openCourseEditor(null));
  document.getElementById('save-course-btn').addEventListener('click', saveCourseEdits);
  document.getElementById('add-tee-btn').addEventListener('click', () => openTeeModal(null));

  // ── Tee modal
  document.getElementById('tee-modal-save').addEventListener('click', saveTeeModal);
  document.getElementById('tee-modal-cancel').addEventListener('click', closeTeeModal);
  document.getElementById('tee-edit-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeTeeModal();
  });

  // ── Hole editor modal — par/SI steppers (par 3–5, SI 1–18)
  [['par', 3, 5], ['si', 1, 18]].forEach(([name, min, max]) => {
    document.getElementById(`he-${name}-dec`).addEventListener('click', () => {
      const cur = getHEStep(name);
      if (cur > min) setHEStep(name, cur - 1);
    });
    document.getElementById(`he-${name}-inc`).addEventListener('click', () => {
      const cur = getHEStep(name);
      if (cur < max) setHEStep(name, cur + 1);
    });
  });

  document.getElementById('he-save').addEventListener('click', saveHoleEditor);
  document.getElementById('he-cancel').addEventListener('click', closeHoleEditorModal);
  document.getElementById('hole-editor-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeHoleEditorModal();
  });

  init().catch(console.error);
});
