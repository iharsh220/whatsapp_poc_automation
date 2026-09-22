let chartTimeline = null;
let chartTypeDist = null;
let chartDoctor = null;
let chartFilterDebounce = null;

function showPage(p) {
  ['dashboard', 'messages', 'users'].forEach(n => {
    const pg = document.getElementById('page' + n.charAt(0).toUpperCase() + n.slice(1));
    if (pg) pg.style.display = p === n ? 'block' : 'none';
    const nav = document.getElementById('nav-' + n);
    if (nav) nav.classList.toggle('active', p === n);
  });
  if (p === 'dashboard') {
    syncDashboardFilters();
    loadStats();
    loadCharts();
  }
  if (p === 'users') { loadUserStats(); loadUsers(1); loadDivisions(); }
}

function syncDashboardFilters() {
  const f = document.getElementById('chartFromDate');
  const t = document.getElementById('chartToDate');
  const d = document.getElementById('chartDoctor');
  const ty = document.getElementById('chartType');
  if (f) f.value = curFilters.date_from || '';
  if (t) t.value = curFilters.date_to || '';
  if (d) d.value = curFilters.doctor_name || '';
  if (ty) ty.value = curFilters.message_type || '';
}

function onChartFilterChange() {
  clearTimeout(chartFilterDebounce);
  chartFilterDebounce = setTimeout(() => {
    buildChartFilters();
    loadStats();
    loadMessages(1);
    loadCharts();
    if (typeof renderActiveTags === 'function') renderActiveTags();
  }, 400);
}

function buildChartFilters() {
  const from = document.getElementById('chartFromDate').value;
  const to = document.getElementById('chartToDate').value;
  const doctor = document.getElementById('chartDoctor').value.trim();
  const type = document.getElementById('chartType').value;
  const groupBy = document.getElementById('chartGroupBy').value;

  if (from) curFilters.date_from = from; else delete curFilters.date_from;
  if (to) curFilters.date_to = to; else delete curFilters.date_to;
  if (doctor) curFilters.doctor_name = doctor; else delete curFilters.doctor_name;
  if (type) curFilters.message_type = type; else delete curFilters.message_type;
  curFilters.group_by = groupBy;
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

async function loadCharts() {
  const canvas = document.getElementById('chartTimeline');
  if (!canvas) return;

  const qs = new URLSearchParams(curFilters).toString();
  try {
    const r = await fetch(`${BASE}/stats/chart?${qs}`, { headers: { 'x-admin-token': getToken() } });
    if (r.status === 401) { doLogout(); return; }
    const d = await r.json();
    renderTimelineChart(d.timeline);
    renderTypeChart(d.byType);
    renderDoctorChart(d.byDoctor);
  } catch (e) { console.error(e); }
}

function renderTimelineChart(data) {
  const ctx = document.getElementById('chartTimeline').getContext('2d');
  const labels = data.map(row => row.date);
  const datasets = [
    { label: 'Sent', data: data.map(r => r.sent || 0), backgroundColor: '#2563EB' },
    { label: 'Delivered', data: data.map(r => r.delivered || 0), backgroundColor: '#059669' },
    { label: 'Read', data: data.map(r => r.read || 0), backgroundColor: '#7C3AED' },
    { label: 'Failed', data: data.map(r => r.failed || 0), backgroundColor: '#DC2626' },
  ];

  if (chartTimeline) {
    chartTimeline.data.labels = labels;
    chartTimeline.data.datasets = datasets;
    chartTimeline.update();
  } else {
    chartTimeline = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
      },
    });
  }
}

function renderTypeChart(data) {
  const ctx = document.getElementById('chartTypeDist').getContext('2d');
  const typeLabels = { birthday: 'Birthday', anniversary: 'Anniversary', clinic_anniversary: 'Clinic Anniv.' };
  const labels = data.map(r => typeLabels[r.message_type] || r.message_type);
  const counts = data.map(r => r.count || 0);

  const colors = ['#DB2777', '#7C3AED', '#0891B2', '#2563EB', '#DC2626', '#059669'];

  if (chartTypeDist) {
    chartTypeDist.data.labels = labels;
    chartTypeDist.data.datasets[0].data = counts;
    chartTypeDist.update();
  } else {
    chartTypeDist = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: counts,
          backgroundColor: labels.map((_, i) => colors[i % colors.length]),
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right' } },
      },
    });
  }
}

function renderDoctorChart(data) {
  const ctx = document.getElementById('chartDoctor').getContext('2d');
  const labels = data.map(r => r.doctor_name || '—');
  const counts = data.map(r => r.count || 0);

  if (chartDoctor) {
    chartDoctor.data.labels = labels;
    chartDoctor.data.datasets[0].data = counts;
    chartDoctor.update();
  } else {
    chartDoctor = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Messages',
          data: counts,
          backgroundColor: '#4F46E5',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: { x: { beginAtZero: true } },
      },
    });
  }
}
