/* ========================================
   DASHBOARD - Charts & Stats
   ======================================== */
const Dashboard = {
  charts: {},
  activeMapId: localStorage.getItem('olb_dash_map_id'),

  init() {
    document.getElementById('dash-period').addEventListener('change', () => this.refresh());
    document.getElementById('dash-map-select').addEventListener('change', (e) => {
      this.activeMapId = e.target.value;
      localStorage.setItem('olb_dash_map_id', this.activeMapId);
      this.refresh();
    });
  },

  async refresh() {
    const period = document.getElementById('dash-period').value;
    const allIncidents = await DB.getIncidents();
    const incidents = this.filterByPeriod(allIncidents, period);
    const maps = await DB.getMaps();

    // Populate Map Selector
    const mapSelect = document.getElementById('dash-map-select');
    mapSelect.innerHTML = maps.map(m => `<option value="${m.id}">${this.escape(m.name)}</option>`).join('');
    
    if (maps.length > 1) {
      mapSelect.style.display = 'block';
    } else {
      mapSelect.style.display = 'none';
    }

    // Determine active map
    if (!this.activeMapId && maps.length > 0) {
      this.activeMapId = maps[0].id;
    } else if (this.activeMapId && !maps.find(m => m.id === this.activeMapId)) {
      this.activeMapId = maps.length > 0 ? maps[0].id : null;
    }
    
    if (this.activeMapId) {
      mapSelect.value = this.activeMapId;
    }

    const activeMap = maps.find(m => m.id === this.activeMapId);
    const zones = activeMap ? await DB.getZones(this.activeMapId) : [];

    this.renderStats(incidents, allIncidents);
    this.renderMap(activeMap, allIncidents, zones);
    this.renderEquipmentChart(incidents);
    this.renderSeverityChart(incidents);
    this.renderDayChart(incidents);
    this.renderTrendChart(incidents, period);
    this.renderRecentOpen(allIncidents);
  },

  renderMap(activeMap, allIncidents, zones) {
    const container = document.getElementById('dash-map-container');
    const img = document.getElementById('dash-floorplan-img');
    const pins = document.getElementById('dash-pins-container');

    if (!activeMap) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    img.src = activeMap.url;
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
          el.style.background = z.color + '15'; 
          
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
    const totalCount = incidents.reduce((sum, i) => sum + parseInt(i.count || 1), 0);
    const openCount = allIncidents.filter(i => i.status === 'Open')
                                 .reduce((sum, i) => sum + parseInt(i.count || 1), 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekCount = allIncidents.filter(i => new Date(i.timestamp) >= weekAgo)
                                 .reduce((sum, i) => sum + parseInt(i.count || 1), 0);

    const eqCount = {};
    incidents.forEach(i => {
      const c = parseInt(i.count || 1);
      eqCount[i.equipmentType] = (eqCount[i.equipmentType] || 0) + c;
    });
    const topEq = Object.entries(eqCount).sort((a, b) => b[1] - a[1])[0];

    document.getElementById('stat-total-val').textContent = totalCount;
    document.getElementById('stat-open-val').textContent = openCount;
    document.getElementById('stat-week-val').textContent = weekCount;
    document.getElementById('stat-top-val').textContent = topEq ? `${topEq[0]} (${topEq[1]})` : '—';
  },

  renderEquipmentChart(incidents) {
    const eqCount = {};
    incidents.forEach(inc => {
      const type = inc.equipmentType || 'Other';
      const c = parseInt(inc.count || 1);
      eqCount[type] = (eqCount[type] || 0) + c;
    });

    const sortedTypes = Object.entries(eqCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const types = sortedTypes.map(t => t[0]);
    const counts = sortedTypes.map(t => t[1]);
    
    // Fallback if empty
    if (types.length === 0) {
      types.push('None');
      counts.push(0);
    }

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
    const counts = levels.map(l => 
      incidents.filter(i => i.severity === l)
               .reduce((sum, i) => sum + parseInt(i.count || 1), 0)
    );
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

    // For longer periods, aggregate by week for clearer display
    if (days > 30) {
      // Aggregate by week
      const weekBuckets = {};
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const key = weekStart.toISOString().split('T')[0];
        if (!weekBuckets[key]) weekBuckets[key] = { label: weekStart.toLocaleDateString('en', { month: 'short', day: 'numeric' }), count: 0 };
        const dateStr = d.toISOString().split('T')[0];
        weekBuckets[key].count += incidents.filter(inc => inc.timestamp?.startsWith(dateStr))
                                          .reduce((sum, i) => sum + parseInt(i.count || 1), 0);
      }
      Object.values(weekBuckets).forEach(wb => {
        labels.push(wb.label);
        data.push(wb.count);
      });
    } else {
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        labels.push(d.toLocaleDateString('en', { month: 'short', day: 'numeric' }));
        data.push(incidents.filter(inc => inc.timestamp?.startsWith(dateStr))
                           .reduce((sum, i) => sum + parseInt(i.count || 1), 0));
      }
    }

    const showEvery = Math.max(1, Math.floor(labels.length / 10));

    if (this.charts.trend) this.charts.trend.destroy();

    const ctx = document.getElementById('chart-trend').getContext('2d');

    this.charts.trend = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: 'rgba(14, 165, 233, 0.3)',
          borderColor: '#0ea5e9',
          borderWidth: 1.5,
          borderRadius: 4,
          barPercentage: days > 30 ? 0.7 : 0.5,
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

    container.querySelectorAll('.recent-item').forEach(el => {
      el.addEventListener('click', async () => {
        await App.showDetail(el.dataset.id);
      });
    });
  },

  formatDate(str) {
    if (!str) return '';
    const d = new Date(str);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const h = d.getHours();
    const shift = (h >= 3 && h < 15)
      ? (I18n.currentLang === 'zh-TW' ? '日班' : 'DS')
      : (I18n.currentLang === 'zh-TW' ? '夜班' : 'NS');
    return `${mm}/${dd} ${shift}`;
  },

  escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
};
