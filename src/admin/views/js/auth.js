async function doLogin() {
  const u = document.getElementById('lu').value.trim();
  const p = document.getElementById('lp').value.trim();
  const err = document.getElementById('lerr');
  err.style.display = 'none';
  try {
    const r = await fetch(`${BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p }),
    });
    const d = await r.json();
    if (!r.ok) { err.style.display = 'block'; return; }
    setToken(d.token);
    setSessionInfo(d.type, d.division, d.name);
    boot();
  } catch {
    err.style.display = 'block';
  }
}

async function doLogout() {
  await fetch(`${BASE}/logout`, { method: 'POST', headers: { 'x-admin-token': getToken() } }).catch(() => {});
  clearToken();
  clearSessionInfo();
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
}

function togglePassword() {
  const input = document.getElementById('lp');
  const icon = document.getElementById('eyeIcon');
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  icon.innerHTML = isHidden
    ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
       <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
       <line x1="1" y1="1" x2="23" y2="23"/>`
    : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
       <circle cx="12" cy="12" r="3"/>`;
}

function updateUserInfo() {
  const info = getSessionInfo();
  const nameEl = document.querySelector('.user-name');
  const roleEl = document.querySelector('.user-role');
  const avEl = document.querySelector('.user-av');
  const brandEl = document.querySelector('.b-name');
  const brandSubEl = document.querySelector('.b-sub');
  if (nameEl) nameEl.textContent = info.name || 'Admin';
  if (roleEl) roleEl.textContent = info.type === 'doctor' ? 'Division Admin' : 'Admin';
  if (avEl) avEl.textContent = (info.name || 'Admin').charAt(0).toUpperCase();
  if (brandEl) {
    if (info.type === 'doctor' && info.division) {
      brandEl.textContent = info.division.charAt(0).toUpperCase() + info.division.slice(1);
    } else {
      brandEl.textContent = 'Automation Dashboard';
    }
  }
  if (brandSubEl) brandSubEl.textContent = 'Admin';
  const adminOnly = document.querySelectorAll('.admin-only');
  adminOnly.forEach(el => { el.style.display = info.type === 'doctor' ? 'none' : ''; });
}

function boot() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  updateUserInfo();
  populateYears();
  loadStats();
  loadCharts();
  loadMessages(1);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('loginPage').style.display !== 'none') doLogin();
});

window.onload = () => {
  if (getToken()) {
    fetch(`${BASE}/stats`, { headers: { 'x-admin-token': getToken() } })
      .then(r => { if (r.ok) boot(); })
      .catch(() => {});
  }
};
