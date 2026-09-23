let curPage = 1;
let curFilters = {};
let debounceTimer = null;
let filterOpen = false;

function toggleFilter() {
  filterOpen = !filterOpen;
  document.getElementById('filterDrawer').classList.toggle('open', filterOpen);
  document.getElementById('btnFilter').classList.toggle('active', filterOpen);
}

function onFilterChange() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    buildFilters();
    loadStats();
    loadMessages(1);
    loadCharts();
    renderActiveTags();
  }, 400);
}

function buildFilters() {
  const v = id => document.getElementById(id).value.trim();
  const f = {};
  if (v('fFrom')) f.date_from = v('fFrom');
  if (v('fTo')) f.date_to = v('fTo');
  if (v('fName')) f.doctor_name = v('fName');
  if (v('fPhone')) f.recipient_id = v('fPhone');
  if (v('fType')) f.message_type = v('fType');
  if (v('fStatus')) f.status = v('fStatus');
  if (v('fTemplate')) f.template_name = v('fTemplate');
  curFilters = f;
  document.getElementById('filterDot').classList.toggle('show', Object.keys(f).length > 0);
}

const TAG_LABELS = {
  date_from: 'From', date_to: 'To', doctor_name: 'Doctor',
  recipient_id: 'Phone', message_type: 'Type', status: 'Status', template_name: 'Template',
};

function renderActiveTags() {
  const c = document.getElementById('activeTags');
  c.innerHTML = Object.entries(curFilters).map(([k, v]) =>
    `<span class="filter-tag">${TAG_LABELS[k] || k}: ${v} <button onclick="removeFilter('${k}')">×</button></span>`
  ).join('');
}

function removeFilter(key) {
  const map = { date_from: 'fFrom', date_to: 'fTo', doctor_name: 'fName', recipient_id: 'fPhone', message_type: 'fType', status: 'fStatus', template_name: 'fTemplate' };
  const el = document.getElementById(map[key]);
  if (el) el.value = '';
  delete curFilters[key];
  buildFilters();
  renderActiveTags();
  loadStats();
  loadMessages(1);
  loadCharts();
}

function resetFilters() {
  ['fFrom', 'fTo', 'fName', 'fPhone', 'fTemplate'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fType').value = '';
  document.getElementById('fStatus').value = '';
  curFilters = {};
  document.getElementById('filterDot').classList.remove('show');
  renderActiveTags();
  loadStats();
  loadMessages(1);
  loadCharts();
}

async function loadMessages(page) {
  curPage = page;
  const tbody = document.getElementById('tBody');
  tbody.innerHTML = '<tr class="loading-row"><td colspan="9"><div class="spin"></div></td></tr>';
  try {
    const qs = new URLSearchParams({ ...curFilters, page, limit: 20 }).toString();
    const r = await fetch(`${BASE}/messages?${qs}`, { headers: { 'x-admin-token': getToken() } });
    if (r.status === 401) { doLogout(); return; }
    const d = await r.json();
    setText('tblMeta', d.total.toLocaleString() + ' records');
    setText('pgInfo', `Page ${d.page} of ${d.pages} · ${d.total.toLocaleString()} total`);
    renderRows(d.data);
    renderPager(d.page, d.pages, 'pgBtns', loadMessages);
  } catch (e) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">Failed to load data</td></tr>';
  }
}

function renderRows(rows) {
  const tbody = document.getElementById('tBody');
  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">No records found</td></tr>';
    return;
  }
  const tl = { birthday: 'Birthday', anniversary: 'Anniversary', clinic_anniversary: 'Clinic Anniv.' };
  tbody.innerHTML = rows.map(r => {
    const status = r.sent_at ? 'sent' : (r.failed_at ? 'failed' : '—');
    return `
    <tr>
      <td class="dim">${r.id}</td>
      <td><div style="font-weight:600">${r.doctor_name || '—'}</div></td>
      <td class="dim">${r.doctor_phone || '—'}</td>
      <td><span class="badge ${r.message_type || ''}">${tl[r.message_type] || r.message_type || '—'}</span></td>
      <td class="dim" style="font-size:12px">${r.template_name || '—'}</td>
      <td><span class="badge ${status}">${status}</span></td>
      <td class="dim" style="font-size:12px">${fmtDate(r.createdAt)}</td>
      <td class="dim" style="font-size:12px">${r.error_code || '—'}</td>
      <td style="font-size:11px;color:#DC2626">${r.error_title
        ? `<span title="${r.error_message || ''}">${r.error_title}</span>`
        : '<span style="color:#94A3B8">—</span>'}</td>
    </tr>`;
  }).join('');
}

function exportData(fmt) {
  const qs = new URLSearchParams({ ...curFilters, format: fmt, token: getToken() }).toString();
  window.open(`${BASE}/export?${qs}`, '_blank');
}
