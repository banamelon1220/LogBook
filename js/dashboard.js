/* ========================================
   DASHBOARD - Charts & Stats
   ======================================== */
const Dashboard = {
  charts: {},

  init() {
    document.getElementById('dash-period').addEventListener('change', () => this.refresh());
  },

  async refresh() {
    const period = document.getElementById('dash-period').value;
    const allIncidents = await DB.getIncidents();
    const incidents = this.filterByPeriod(allIncidents, period);
    const zones = await DB.getZones();
    const mapBase64 = await DB.getFloorPlan();

    this.renderStats(incidents, allIncidents);
    this.renderMap(mapBase64, allIncidents, zones);
    this.renderEquipmentChart(incidents);
    this.renderSeverityChart(incidents);
    this.renderDayChart(incidents);
    this.renderTrendChart(incidents, period);
    this.renderRecentOpen(allIncidents);
  },

  renderMap(mapBase64, allIncidents, zones) {
    const container = document.getElementById('dash-map-container');
    const img = document.getElementById('dash-floorplan-img');
    const pins = document.getElementById('dash-pins-container');

    if (!mapBase64) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    img.src = mapBase64;
    pins.innerHTML = '';

    zones.forEach(z => {
      if (z.x != null && z.y != null) {
        // Find if this zone has open issues
        const openIssuesCount = allIncidents.filter(i => i.zone === z.name && i.status === 'Open').length;
        const isRect = z.w != null && z.h != null;

        const el = document.createElement('div');
        
        if (isRect) {
          el.className = `zone-rect ${openIssuesCount > 0 ? 'has-open' : ''}`;
          el.style.left = z.x + '%';
          el.style.top = z.y + '%';
          el.style.width = z.w + '%';
          el.style.height = z.h + '%';
          el.style.borderColor = z.color;
          el.style.background = z.color + '15'; // Very low opacity
          
          let hintText = openIssuesCount > 0 ? `${openIssuesCount} OPEN` : 'OK';
          el.innerHTML = `<span class="zone-rect-label">${this.escape(z.name)} - ${hintText}</span>`;
        } else {
          el.className = `map-pin ${openIssuesCount > 0 ? 'has-open' : 'is-ok'}`;
          el.style.left = z.x + '%';
          el.style.top = z.y + '%';
          el.style.backgroundColor = z.color;
          
          let hintText = openIssuesCount > 0 ? `${openIssuesCount} OPEN` : 'OK';
          el.innerHTML = `<span class="map-pin-label">${this.escape(z.name)} - ${hintText}</span>`;
        }

        el.addEventListener('click', async () => {
          if (openIssuesCount > 0) {
            // View open issues
            document.getElementById('filter-zone').value = z.name;
            document.getElementById('filter-status').value = 'Open';
            await App.navigate('table');
          } else {
            // Add new incident in this zone
            await Editor.openNew();
            const zoneSelect = document.getElementById('edit-zone');
            zoneSelect.value = z.name;
            // Also update the quick-zone buttons
            document.querySelectorAll('.zone-btn').forEach(btn => {
              btn.classList.toggle('active', btn.dataset.zone === z.name);
            });
          }
        });

        pins.appendChild(el);
      }
    });
  },

  filterByPeriod(incidents, period) {
    if (period === 'all') return incidents;
    const days = parseInt(period);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return incidents.filter(i => new Date(i.timestamp) >= cutoff);
  },

  renderStats(incidents, allIncidents) {
    const openCount = allIncidents.filter(i => i.status === 'Open').length;

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekCount = allIncidents.filter(i => new Date(i.timestamp) >= weekAgo).length;

    // Most frequent equipment
    const eqCount = {};
    incidents.forEach(i => {
      eqCount[i.equipmentType] = (eqCount[i.equipmentType] || 0) + 1;
    });
    const topEq = Object.entries(eqCount).sort((a, b) => b[1] - a[1])[0];

    document.getElementById('stat-total-val').textContent = incidents.length;
    document.getElementById('stat-open-val').textContent = openCount;
    document.getElementById('stat-week-val').textContent = weekCount;
    document.getElementById('stat-top-val').textContent = topEq ? `${topEq[0]} (${topEq[1]})` : '—';
  },

  renderEquipmentChart(incidents) {
    const types = ['Conveyor', 'Sensor', 'PLC', 'Freezer', 'Other'];
    const counts = types.map(t => incidents.filter(i => i.equipmentType === t).length);
    const colors = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#06b6d4', '#64748b'];

    if (this.charts.equipment) this.charts.equipment.destroy();

    const ctx = document.getElementById('chart-equipment').getContext('2d');
    this.charts.equipment = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: types,
        datasets: [{
          data: counts,
          backgroundColor: colors.map(c => c + '33'),
          borderColor: colors,
          borderWidth: 1.5,
          borderRadius: 6,
          barThickness: 36,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#64748b', font: { family: 'Inter' } }
          },
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              color: '#64748b',
              font: { family: 'Inter' }
            },
            grid: { color: 'rgba(255,255,255,0.04)' }
          }
        }
      }
    });
  },

  renderSeverityChart(incidents) {
    const levels = ['Low', 'Medium', 'High', 'Critical'];
    const counts = levels.map(l => incidents.filter(i => i.severity === l).length);
    const colors = ['#10b981', '#f59e0b', '#f97316', '#ef4444'];

    if (this.charts.severity) this.charts.severity.destroy();

    const ctx = document.getElementById('chart-severity').getContext('2d');
    this.charts.severity = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: levels,
        datasets: [{
          data: counts,
          backgroundColor: colors.map(c => c + '99'),
          borderColor: colors,
          borderWidth: 2,
          hoverOffset: 8,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#94a3b8',
              padding: 16,
              usePointStyle: true,
              font: { family: 'Inter', size: 12 }
            }
          }
        }
      }
    });
  },

  renderDayChart(incidents) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = [0, 0, 0, 0, 0, 0, 0];

    incidents.forEach(inc => {
      if (inc.timestamp) {
        const d = new Date(inc.timestamp);
        counts[d.getDay()]++;
      }
    });

    if (this.charts.day) this.charts.day.destroy();

    const ctx = document.getElementById('chart-day').getContext('2d');
    const colors = ['#f43f5e', '#0ea5e9', '#0ea5e9', '#0ea5e9', '#0ea5e9', '#0ea5e9', '#f43f5e'];

    this.charts.day = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dayNames,
        datasets: [{
          data: counts,
          backgroundColor: colors.map(c => c + '33'),
          borderColor: colors,
          borderWidth: 1.5,
          borderRadius: 4,
          barThickness: 30,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#64748b', font: { family: 'Inter' } }
          },
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              color: '#64748b',
              font: { family: 'Inter' }
            },
            grid: { color: 'rgba(255,255,255,0.04)' }
          }
        }
      }
    });
  },

  renderTrendChart(incidents, period) {
    const days = period === 'all' ? 90 : parseInt(period);
    const labels = [];
    const data = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      labels.push(d.toLocaleDateString('en', { month: 'short', day: 'numeric' }));
      data.push(incidents.filter(inc => inc.timestamp?.startsWith(dateStr)).length);
    }

    const showEvery = Math.max(1, Math.floor(days / 10));

    if (this.charts.trend) this.charts.trend.destroy();

    const ctx = document.getElementById('chart-trend').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(14, 165, 233, 0.2)');
    gradient.addColorStop(1, 'rgba(14, 165, 233, 0)');

    this.charts.trend = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor: '#0ea5e9',
          backgroundColor: gradient,
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHitRadius: 10,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#0ea5e9',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: '#64748b',
              font: { family: 'Inter', size: 11 },
              maxRotation: 0,
              callback: function(val, index) {
                return index % showEvery === 0 ? this.getLabelForValue(val) : '';
              }
            }
          },
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1, color: '#64748b', font: { family: 'Inter' } },
            grid: { color: 'rgba(255,255,255,0.04)' }
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      }
    });
  },

  renderRecentOpen(allIncidents) {
    const container = document.getElementById('recent-list');
    const incidents = allIncidents
      .filter(i => i.status === 'Open')
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 8);

    if (incidents.length === 0) {
      container.innerHTML = `<p class="text-muted" style="text-align:center;padding:24px">${I18n.t('dashboard.noData')}</p>`;
      return;
    }

    const severityColors = {
      Low: 'var(--severity-low)',
      Medium: 'var(--severity-medium)',
      High: 'var(--severity-high)',
      Critical: 'var(--severity-critical)',
    };

    container.innerHTML = incidents.map(inc => `
      <div class="recent-item" data-id="${inc.id}">
        <span class="severity-dot" style="background:${severityColors[inc.severity] || '#64748b'}"></span>
        <div class="ri-info">
          <div class="ri-title">${this.escape(inc.title)}</div>
          <div class="ri-meta">${inc.equipmentType} · ${inc.zone || '—'}</div>
        </div>
        <span class="ri-date">${this.formatDate(inc.timestamp)}</span>
      </div>
    `).join('');

    // Click to view detail
    container.querySelectorAll('.recent-item').forEach(el => {
      el.addEventListener('click', async () => {
        await App.showDetail(el.dataset.id);
      });
    });
  },

  formatDate(str) {
    if (!str) return '';
    const d = new Date(str);
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  },

  escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
};
