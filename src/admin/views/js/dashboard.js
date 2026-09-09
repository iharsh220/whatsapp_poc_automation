function showPage(p) {
  ['dashboard', 'messages', 'users'].forEach(n => {
    const pg = document.getElementById('page' + n.charAt(0).toUpperCase() + n.slice(1));
    if (pg) pg.style.display = p === n ? 'block' : 'none';
    const nav = document.getElementById('nav-' + n);
    if (nav) nav.classList.toggle('active', p === n);
  });
  if (p === 'users') { loadUserStats(); loadUsers(1); }
}

async function loadStats() {
  try {
    const qs = new URLSearchParams(curFilters).toString();
    const r = await fetch(`${BASE}/stats${qs ? '?' + qs : ''}`, { headers: { 'x-admin-token': getToken() } });
    if (r.status === 401) { doLogout(); return; }
    const d = await r.json();
    const pct = n => d.total > 0 ? ((n / d.total) * 100).toFixed(1) + '%' : '0%';

    ['Total', 'Sent', 'Delivered', 'Read', 'Failed'].forEach((id, i) => {
      const val = [d.total, d.sent, d.delivered, d.read, d.failed][i];
      setText('k' + id, val);
      setText('mk' + id, val);
    });
    ['Sent', 'Delivered', 'Read', 'Failed'].forEach((id, i) => {
      const val = pct([d.sent, d.delivered, d.read, d.failed][i]);
      setText('p' + id, val);
      setText('mp' + id, val);
    });

    const set = (pre, obj) => {
      setText(pre + 'Tot', (obj.total || 0) + ' total');
      setText(pre + 'S', obj.sent || 0);
      setText(pre + 'D', obj.delivered || 0);
      setText(pre + 'R', obj.read || 0);
      setText(pre + 'F', obj.failed || 0);
    };
    set('bt', d.byType.birthday || {});
    set('an', d.byType.anniversary || {});
    set('ca', d.byType.clinic_anniversary || {});
  } catch (e) { console.error(e); }
}
