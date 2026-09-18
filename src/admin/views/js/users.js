let uCurPage = 1;
let uDebounce = null;
let editingId = null;
let uploadAbort = null;

function populateYears() {
  const sel = document.getElementById('uYearFilter');
  const cur = new Date().getFullYear();
  for (let y = cur; y >= cur - 5; y--) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    sel.appendChild(o);
  }
}

function onUserFilterChange() {
  clearTimeout(uDebounce);
  uDebounce = setTimeout(() => { loadUserStats(); loadUsers(1); }, 350);
}

function showUploadModal() {
  document.getElementById('uploadModalOverlay').classList.add('open');
  setText('uploadModalTitle', 'Uploading Users');
  setText('upTotal', '0');
  setText('upProcessed', '0');
  setText('upAdded', '0');
  setText('upSkipped', '0');
  setText('upProgressPct', '0%');
  document.getElementById('upProgressFill').style.width = '0%';
  setText('uploadStatus', 'Starting...');
}

function closeUploadModal() {
  document.getElementById('uploadModalOverlay').classList.remove('open');
  if (uploadAbort) { uploadAbort.abort(); uploadAbort = null; }
}

async function handleUserUpload(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';

  showUploadModal();
  uploadAbort = new AbortController();

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`${BASE}/doctors/upload-stream`, {
      method: 'POST',
      headers: { 'x-admin-token': getToken() },
      body: formData,
      signal: uploadAbort.signal,
    });

    if (response.status === 401) { doLogout(); return; }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') continue;

        try {
          const data = JSON.parse(payload);
          if (data.error) {
            setText('uploadStatus', 'Error: ' + data.error);
            return;
          }
          setText('upTotal', data.total);
          setText('upProcessed', data.processed);
          setText('upAdded', data.added);
          setText('upSkipped', data.skipped);
          setText('upProgressPct', data.progress + '%');
          document.getElementById('upProgressFill').style.width = data.progress + '%';
          if (data.done) {
            setText('uploadStatus', 'Completed');
            setTimeout(() => {
              closeUploadModal();
              loadUserStats();
              loadUsers(uCurPage);
            }, 1200);
          } else {
            setText('uploadStatus', 'Processing...');
          }
        } catch (e) { console.error(e); }
      }
    }
  } catch (e) {
    setText('uploadStatus', 'Upload failed');
    console.error(e);
  }
}

async function loadUserStats() {
  try {
    const year = document.getElementById('uYearFilter').value;
    const qs = year ? `?year=${year}` : '';
    const r = await fetch(`${BASE}/doctors/stats${qs}`, { headers: { 'x-admin-token': getToken() } });
    if (r.status === 401) { doLogout(); return; }
    const d = await r.json();
    const pct = (n, t) => t > 0 ? ((n / t) * 100).toFixed(1) + '%' : '0%';
    setText('ukTotal', d.totalDoctors);
    setText('ukActive', d.activeDoctors);
    setText('ukInactive', d.inactiveDoctors);
    setText('ukMsgs', d.totalMessages);
    setText('ukActivePct', pct(d.activeDoctors, d.totalDoctors));
    setText('ukInactivePct', pct(d.inactiveDoctors, d.totalDoctors));
    setText('ukYear', year || 'All');
  } catch (e) { console.error(e); }
}

async function loadUsers(page) {
  uCurPage = page;
  const tbody = document.getElementById('uBody');
  tbody.innerHTML = '<tr class="loading-row"><td colspan="10"><div class="spin"></div></td></tr>';
  try {
    const year = document.getElementById('uYearFilter').value;
    const status = document.getElementById('uStatusFilter').value;
    const search = document.getElementById('uSearch').value.trim();
    const params = { page, limit: 20 };
    if (year) params.year = year;
    if (status) params.status = status;
    if (search) params.search = search;
    const qs = new URLSearchParams(params).toString();
    const r = await fetch(`${BASE}/doctors?${qs}`, { headers: { 'x-admin-token': getToken() } });
    if (r.status === 401) { doLogout(); return; }
    const d = await r.json();
    setText('uTblMeta', d.total.toLocaleString() + ' doctors');
    setText('uPgInfo', `Page ${d.page} of ${d.pages} · ${d.total.toLocaleString()} total`);
    renderUserRows(d.data);
    renderPager(d.page, d.pages, 'uPgBtns', loadUsers);
  } catch (e) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="10">Failed to load data</td></tr>';
  }
}

function renderUserRows(rows) {
  const tbody = document.getElementById('uBody');
  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="10">No doctors found</td></tr>';
    return;
  }
  const canModify = isSuperAdmin();
  const userDivision = getSessionInfo().division;
  const checkSvg = `<polyline points="20 6 9 17 4 12"/>`;
  const crossSvg = `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`;
  tbody.innerHTML = rows.map(r => {
    const canToggle = canModify || (userDivision && r.division === userDivision);

    const statusCell = canToggle
      ? `<button class="toggle-btn ${r.is_active ? 'on' : 'off'}" onclick="toggleActive(${r.id}, this)">
          <svg viewBox="0 0 24 24">${r.is_active ? checkSvg : crossSvg}</svg>
          ${r.is_active ? 'Active' : 'Inactive'}
        </button>`
      : `<span class="toggle-btn ${r.is_active ? 'on' : 'off'}">
          <svg viewBox="0 0 24 24">${r.is_active ? checkSvg : crossSvg}</svg>
          ${r.is_active ? 'Active' : 'Inactive'}
        </span>`;

    const adminBtn = canModify
      ? `<button class="btn btn-sm ${r.is_admin ? 'btn-primary' : ''}" onclick="toggleAdmin(${r.id}, this)" style="min-width:70px" title="${r.is_admin ? 'Remove admin' : 'Make admin'}">
          ${r.is_admin ? 'Admin' : 'Set Admin'}
        </button>`
      : `<span class="admin-badge ${r.is_admin ? 'on' : 'off'}">
          ${r.is_admin ? 'Admin' : '—'}
        </span>`;

    const editDeleteBtn = canModify ? `
      <button class="btn btn-sm btn-xls" onclick='openModal(${JSON.stringify(r)})'>
        <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Edit
      </button>
      <button class="btn btn-sm btn-danger" onclick="deleteDoctor(${r.id})">
        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        Delete
      </button>` : '';

    return `
    <tr>
      <td class="dim">${r.id}</td>
      <td><div style="font-weight:600">${r.name}</div></td>
      <td class="dim">${r.phone}</td>
      <td class="dim">${r.clinic_name || '—'}</td>
      <td class="dim" style="font-size:12px">${r.birthday || '—'}</td>
      <td class="dim" style="font-size:12px">${r.anniversary || '—'}</td>
      <td class="dim" style="font-size:12px">${r.clinic_anniversary || '—'}</td>
      <td><span class="msg-count-badge">${r.msgCount || 0}</span></td>
      <td>${statusCell}</td>
      <td>
        <div style="display:flex;gap:6px">${adminBtn}${editDeleteBtn}</div>
      </td>
    </tr>`;
  }).join('');
}

async function toggleActive(id, btn) {
  try {
    const r = await fetch(`${BASE}/doctors/${id}/toggle`, {
      method: 'PATCH',
      headers: { 'x-admin-token': getToken() },
    });
    if (r.status === 401) { doLogout(); return; }
    const d = await r.json();
    if (r.ok) {
      const checkSvg = `<polyline points="20 6 9 17 4 12"/>`;
      const crossSvg = `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`;
      btn.className = `toggle-btn ${d.is_active ? 'on' : 'off'}`;
      btn.innerHTML = `<svg viewBox="0 0 24 24">${d.is_active ? checkSvg : crossSvg}</svg>${d.is_active ? 'Active' : 'Inactive'}`;
      loadUserStats();
    }
  } catch (e) { console.error(e); }
}

async function toggleAdmin(id, btn) {
  const prevText = btn.textContent;
  btn.disabled = true;
  try {
    const isAdmin = btn.textContent.trim() === 'Admin';
    const r = await fetch(`${BASE}/doctors/${id}/admin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': getToken() },
      body: JSON.stringify({ is_admin: !isAdmin }),
    });
    if (r.status === 401) { doLogout(); return; }
    const d = await r.json();
    if (!r.ok) {
      console.error(d.error || 'Toggle failed');
      btn.textContent = prevText;
      btn.disabled = false;
      return;
    }
    btn.classList.toggle('btn-primary', d.is_admin);
    btn.textContent = d.is_admin ? 'Admin' : 'Set Admin';
    btn.title = d.is_admin ? 'Remove admin' : 'Make admin';
    loadUserStats();
    btn.disabled = false;
  } catch (e) {
    console.error(e);
    btn.textContent = prevText;
    btn.disabled = false;
  }
}

async function applyBulkAction() {
  const action = document.getElementById('uBulkAction').value;
  if (!action) return;
  if (!confirm(`Apply "${action.replace(/_/g, ' ')}" to all matching doctors?`)) return;

  const div = document.getElementById('uDivisionFilter').value;
  const qs = div ? `?division=${encodeURIComponent(div)}` : '';

  try {
    const r = await fetch(`${BASE}/doctors/bulk-action${qs}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': getToken() },
      body: JSON.stringify({ action }),
    });
    if (r.status === 401) { doLogout(); return; }
    const d = await r.json();
    if (r.ok) {
      alert(`${d.updated} doctors updated`);
      document.getElementById('uBulkAction').value = '';
      loadUserStats();
      loadUsers(uCurPage);
    } else {
      alert('Error: ' + (d.error || 'bulk action failed'));
    }
  } catch (e) {
    console.error(e);
    alert('Bulk action failed');
  }
}

async function loadDivisions() {
  try {
    const r = await fetch(`${BASE}/doctors/divisions`, { headers: { 'x-admin-token': getToken() } });
    if (r.status === 401) { doLogout(); return; }
    const divs = await r.json();
    const sel = document.getElementById('uDivisionFilter');
    sel.innerHTML = '<option value="">All Divisions</option>';
    divs.forEach(d => {
      const o = document.createElement('option');
      o.value = d; o.textContent = d;
      sel.appendChild(o);
    });
    const info = getSessionInfo();
    if (info.type === 'doctor' && info.division) {
      sel.value = info.division;
    }
  } catch (e) { console.error(e); }
}

async function deleteDoctor(id) {
  if (!confirm('Delete this doctor? This cannot be undone.')) return;
  try {
    await fetch(`${BASE}/doctors/${id}`, { method: 'DELETE', headers: { 'x-admin-token': getToken() } });
    loadUserStats();
    loadUsers(uCurPage);
  } catch (e) { console.error(e); }
}

function openModal(doc) {
  editingId = doc ? doc.id : null;
  setText('modalTitle', doc ? 'Edit Doctor' : 'Add Doctor');
  document.getElementById('mName').value = doc ? doc.name : '';
  document.getElementById('mPhone').value = doc ? doc.phone : '';
  document.getElementById('mClinic').value = doc ? (doc.clinic_name || '') : '';
  document.getElementById('mBirthday').value = doc ? (doc.birthday || '') : '';
  document.getElementById('mAnniversary').value = doc ? (doc.anniversary || '') : '';
  document.getElementById('mClinicAnniv').value = doc ? (doc.clinic_anniversary || '') : '';
  document.getElementById('mDivision').value = doc ? (doc.division || '') : '';
  document.getElementById('mIsDoctor').checked = doc ? (doc.is_doctor !== 0 && doc.is_doctor !== false) : true;
  document.getElementById('mPassword').value = doc ? (doc.password || '') : '';
  document.getElementById('mIsAdmin').checked = doc ? (doc.is_admin !== 0 && doc.is_admin !== false) : false;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  editingId = null;
}

async function saveDoctor() {
  const body = {
    name: document.getElementById('mName').value.trim(),
    phone: document.getElementById('mPhone').value.trim(),
    clinic_name: document.getElementById('mClinic').value.trim(),
    birthday: document.getElementById('mBirthday').value || null,
    anniversary: document.getElementById('mAnniversary').value || null,
    clinic_anniversary: document.getElementById('mClinicAnniv').value || null,
    division: document.getElementById('mDivision').value.trim() || null,
    is_doctor: document.getElementById('mIsDoctor').checked ? 1 : 0,
    is_admin: document.getElementById('mIsAdmin').checked ? 1 : 0,
    password: document.getElementById('mPassword').value.trim() || null,
  };
  if (!body.name || !body.phone) { alert('Name and phone are required'); return; }
  try {
    const url = editingId ? `${BASE}/doctors/${editingId}` : `${BASE}/doctors`;
    const method = editingId ? 'PUT' : 'POST';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'x-admin-token': getToken() }, body: JSON.stringify(body) });
    closeModal();
    loadUserStats();
    loadUsers(uCurPage);
  } catch (e) { console.error(e); }
}

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('modalOverlay');
  if (overlay) overlay.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
});
