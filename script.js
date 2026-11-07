const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const base = () => $('#apiBase').value.replace(/\/$/, '');

async function api(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
  const res = await fetch(base() + path + (qs ? '?' + qs : ''));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
  return data;
}

const scoreCls = n => Number(n) >= 50 ? 'good' : 'poor';
function table(cols, rows, rowAttr) {
  if (!rows.length) return '<div class="msg">No data found.</div>';
  const head = cols.map(c => `<th>${esc(c.label)}</th>`).join('');
  const body = rows.map(r => `<tr ${rowAttr ? rowAttr(r) : ''}>` + cols.map(c => `<td>${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('') + '</tr>').join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
const pager = d => `<div class="pager"><span>${d.total} records · page ${d.page}/${d.total_pages || 1}</span>
  <button class="btn" id="prev" ${d.page <= 1 ? 'disabled' : ''}>← Prev</button>
  <button class="btn" id="next" ${d.page >= d.total_pages ? 'disabled' : ''}>Next →</button></div>`;
const loading = el => el.innerHTML = '<div class="msg">Loading…</div>';
const showErr = (el, e) => el.innerHTML = `<div class="msg err">⚠ ${esc(e.message)}<br><small>Check that the API is running at ${esc(base())}</small></div>`;

/* ---------- Modal ---------- */
function openModal(html) { $('#modalBox').innerHTML = `<button class="btn close" onclick="closeModal()">✕</button>` + html; $('#modal').classList.add('show'); }
function closeModal() { $('#modal').classList.remove('show'); }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => e.key === 'Escape' && closeModal());

const scoreCols = [
  { label: 'Subject', key: 'subject' }, { label: 'Trainer', key: 'trainer' },
  { label: 'Homework', key: 'homework' }, { label: 'Midterm', key: 'minterm' },
  { label: 'Assignment', key: 'assignment' },
  { label: 'Final', render: r => `<b class="${scoreCls(r.final_score)}">${esc(r.final_score)}</b>` }
];

async function showStudent(id) {
  openModal('<div class="msg">Loading…</div>');
  try {
    const [s, sc] = await Promise.all([api('/api/students/' + id), api(`/api/students/${id}/scores`)]);
    $('#modalBox').innerHTML = `<button class="btn close" onclick="closeModal()">✕</button>
      <h2>${esc(s.name)}</h2>
      <div class="profile"><span>ID: ${s.id}</span><span>Class: ${esc(s.class_name)}</span><span>Gender: ${esc(s.gender)}</span>
      <span>DOB: ${esc(s.dob)}</span><span>Born: ${esc(s.pob)}</span><span>Lives: ${esc(s.pol)}</span></div>
      <p><b>Average final score: ${esc(sc.average_final_score)}</b></p>` + table(scoreCols, sc.data);
  } catch (e) { showErr($('#modalBox'), e); }
}

async function showClass(id) {
  openModal('<div class="msg">Loading…</div>');
  try {
    const [c, r] = await Promise.all([api('/api/classes/' + id), api(`/api/classes/${id}/ranking`)]);
    $('#modalBox').innerHTML = `<button class="btn close" onclick="closeModal()">✕</button>
      <h2>${esc(c.class_name)} — Ranking</h2>
      <div class="profile"><span>${esc(c.start_date)} → ${esc(c.end_date)}</span><span>${c.total_students} students</span></div>` +
      table([{ label: '#', key: 'rank' }, { label: 'Student', key: 'name' }, { label: 'Avg final', key: 'avg_final_score' }], r.data,
        x => `class="click" onclick="showStudent(${x.student_id})"`);
  } catch (e) { showErr($('#modalBox'), e); }
}

/* ---------- Pages ---------- */
const pages = {
  async dashboard(el) {
    loading(el);
    const [cl, su, tr, st, rep] = await Promise.all([api('/api/classes'), api('/api/subjects'), api('/api/trainers'),
      api('/api/students', { limit: 1 }), api('/api/reports/subject-average')]);
    el.innerHTML = `<div class="stats">
      <div class="stat"><b>${st.total}</b><span>Students</span></div>
      <div class="stat"><b>${cl.count}</b><span>Classes</span></div>
      <div class="stat"><b>${su.count}</b><span>Subjects</span></div>
      <div class="stat"><b>${tr.count}</b><span>Trainers</span></div></div>
      <div class="card"><h3 style="margin-top:0">Average score per subject</h3>` +
      table([{ label: 'Subject', key: 'subject' }, { label: 'Homework', key: 'avg_homework' }, { label: 'Midterm', key: 'avg_minterm' },
        { label: 'Assignment', key: 'avg_assignment' }, { label: 'Final', key: 'avg_final_score' },
        { label: '', render: r => `<div class="bar"><i style="width:${Math.min(r.avg_final_score, 100)}%"></i></div>` }], rep.data) + '</div>';
  },

  async students(el) {
    const classes = (await api('/api/classes')).data;
    el.innerHTML = `<div class="card"><div class="toolbar">
      <input id="f-search" placeholder="Search name…">
      <select id="f-class"><option value="">All classes</option>${classes.map(c => `<option value="${c.class_id}">${esc(c.class_name)}</option>`).join('')}</select>
      <select id="f-gender"><option value="">All genders</option><option value="M">Male</option><option value="F">Female</option></select>
      <select id="f-limit"><option>10</option><option selected>20</option><option>50</option></select>
      <button class="btn primary" id="f-go">Search</button></div><div id="list"></div></div>`;
    let page = 1;
    const load = async () => {
      const box = $('#list'); loading(box);
      try {
        const d = await api('/api/students', { page, limit: $('#f-limit').value, search: $('#f-search').value.trim(), class_id: $('#f-class').value, gender: $('#f-gender').value });
        box.innerHTML = table([{ label: 'ID', key: 'id' }, { label: 'Name', key: 'name' }, { label: 'Gender', key: 'gender' }, { label: 'Class', key: 'class_name' },
          { label: 'DOB', key: 'dob' }, { label: 'Born', key: 'pob' }, { label: 'Lives', key: 'pol' }], d.data, r => `class="click" onclick="showStudent(${r.id})"`) + pager(d);
        $('#prev')?.addEventListener('click', () => { page--; load(); });
        $('#next')?.addEventListener('click', () => { page++; load(); });
      } catch (e) { showErr(box, e); }
    };
    $('#f-go').onclick = () => { page = 1; load(); };
    $('#f-search').onkeydown = e => e.key === 'Enter' && $('#f-go').click();
    ['f-class', 'f-gender', 'f-limit'].forEach(i => $('#' + i).onchange = () => { page = 1; load(); });
    load();
  },

  async classes(el) {
    loading(el);
    const d = await api('/api/classes');
    el.innerHTML = '<div class="card">' + table([{ label: 'ID', key: 'class_id' }, { label: 'Class', key: 'class_name' }, { label: 'Start', key: 'start_date' },
      { label: 'End', key: 'end_date' }, { label: 'Students', key: 'total_students' }], d.data, r => `class="click" onclick="showClass(${r.class_id})"`) +
      '<div class="msg">Click a class to see its ranking.</div></div>';
  },

  async subjects(el) {
    loading(el);
    const d = await api('/api/subjects');
    el.innerHTML = '<div class="card">' + table([{ label: 'ID', key: 'sub_id' }, { label: 'Subject', key: 'name' }, { label: 'Hours', key: 'hours' }], d.data) + '</div>';
  },

  async trainers(el) {
    loading(el);
    const d = await api('/api/trainers');
    el.innerHTML = '<div class="card">' + table([{ label: 'ID', key: 't_id' }, { label: 'Trainer', key: 'name' }], d.data) + '</div>';
  },

  async scores(el) {
    const [cl, su, tr] = await Promise.all([api('/api/classes'), api('/api/subjects'), api('/api/trainers')]);
    const opts = (arr, v, l, all) => `<option value="">${all}</option>` + arr.map(x => `<option value="${x[v]}">${esc(x[l])}</option>`).join('');
    el.innerHTML = `<div class="card"><div class="toolbar">
      <select id="s-class">${opts(cl.data, 'class_id', 'class_name', 'All classes')}</select>
      <select id="s-sub">${opts(su.data, 'sub_id', 'name', 'All subjects')}</select>
      <select id="s-tr">${opts(tr.data, 't_id', 'name', 'All trainers')}</select>
      <input id="s-stu" type="number" min="1" placeholder="Student ID" style="width:120px">
      <button class="btn primary" id="s-go">Filter</button></div><div id="list"></div></div>`;
    let page = 1;
    const load = async () => {
      const box = $('#list'); loading(box);
      try {
        const d = await api('/api/scores', { page, limit: 20, class_id: $('#s-class').value, sub_id: $('#s-sub').value, t_id: $('#s-tr').value, student_id: $('#s-stu').value });
        box.innerHTML = table([{ label: 'ID', key: 'id' }, { label: 'Student', key: 'student' }, { label: 'Class', key: 'class_name' }].concat(scoreCols), d.data,
          r => `class="click" onclick="showStudent(${r.student_id})"`) + pager(d);
        $('#prev')?.addEventListener('click', () => { page--; load(); });
        $('#next')?.addEventListener('click', () => { page++; load(); });
      } catch (e) { showErr(box, e); }
    };
    $('#s-go').onclick = () => { page = 1; load(); };
    ['s-class', 's-sub', 's-tr'].forEach(i => $('#' + i).onchange = () => { page = 1; load(); });
    load();
  }
};

/* ---------- Router ---------- */
const labels = { dashboard: 'Dashboard', students: 'Students', classes: 'Classes', subjects: 'Subjects', trainers: 'Trainers', scores: 'Scores' };
$('#nav').innerHTML = Object.entries(labels).map(([k, v]) => `<button data-p="${k}">${v}</button>`).join('');

async function go(name) {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.p === name));
  const el = $('#app'); loading(el);
  try { await pages[name](el); } catch (e) { showErr(el, e); }
}
$('#nav').addEventListener('click', e => e.target.dataset.p && go(e.target.dataset.p));
$('#apiBase').addEventListener('change', () => go(document.querySelector('#nav .active').dataset.p));
go('dashboard');
