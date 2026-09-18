const BASE = '/digilabs/automation/admin';
let TOKEN = localStorage.getItem('adm_tok') || '';

function setToken(t) {
  TOKEN = t;
  localStorage.setItem('adm_tok', t);
}
function clearToken() {
  TOKEN = '';
  localStorage.removeItem('adm_tok');
}
function getToken() { return TOKEN; }

function setSessionInfo(type, division, name) {
  localStorage.setItem('adm_session', JSON.stringify({ type, division, name }));
}
function getSessionInfo() {
  try { return JSON.parse(localStorage.getItem('adm_session') || '{}'); } catch { return {}; }
}
function clearSessionInfo() {
  localStorage.removeItem('adm_session');
}
function isSuperAdmin() {
  return getSessionInfo().type === 'superadmin';
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function renderPager(page, pages, containerId, loadFn) {
  const c = document.getElementById(containerId);
  if (pages <= 1) { c.innerHTML = ''; return; }
  let h = `<button class="pg-btn" onclick="${loadFn.name}(${page - 1})" ${page === 1 ? 'disabled' : ''}>‹</button>`;
  const s = Math.max(1, page - 2), e = Math.min(pages, page + 2);
  if (s > 1) h += `<button class="pg-btn" onclick="${loadFn.name}(1)">1</button>${s > 2 ? '<span style="padding:0 4px;color:#94A3B8">…</span>' : ''}`;
  for (let i = s; i <= e; i++) h += `<button class="pg-btn ${i === page ? 'active' : ''}" onclick="${loadFn.name}(${i})">${i}</button>`;
  if (e < pages) h += `${e < pages - 1 ? '<span style="padding:0 4px;color:#94A3B8">…</span>' : ''}<button class="pg-btn" onclick="${loadFn.name}(${pages})">${pages}</button>`;
  h += `<button class="pg-btn" onclick="${loadFn.name}(${page + 1})" ${page === pages ? 'disabled' : ''}>›</button>`;
  c.innerHTML = h;
}
