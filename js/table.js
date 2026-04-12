/* ========================================
   TABLE VIEW - Incidents List
   ======================================== */
const TableView = {
  sortCol: 'timestamp',
  sortAsc: false,
  incidents: [],

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const table = document.getElementById('incident-table');
    table.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (this.sortCol === col) {
          this.sortAsc = !this.sortAsc;
        } else {
          this.sortCol = col;
          this.sortAsc = true;
        }
        this.updateHeaders();
        this.render();
      });
    });

    const filters = ['filter-search', 'filter-equipment', 'filter-zone', 'filter-severity', 'filter-status'];
    filters.forEach(id => {
      document.getElementById(id).addEventListener('input', () => this.render());
    });

    document.getElementById('btn-export-csv').addEventListener('click', () => this.exportCSV());

    document.getElementById('btn-new-from-table').addEventListener('click', async () => {
      await Editor.openNew();
    });
  },

  exportCSV() {
    const data = this.getFilteredAndSorted();
    if(data.length === 0) return App.toast('No data to export', 'error');

    let csvContent = 'Date,Equipment,Qty,Zone,Severity,Status,Notes\n';
    
    data.forEach(inc => {
      const locale = I18n.currentLang === 'zh-TW' ? 'zh-TW' : 'en-US';
      const d = new Date(inc.timestamp).toLocaleString(locale).replace(/,/g, '');
      const eq = `"${(inc.equipmentType || '').replace(/"/g, '""')}"`;
      const qty = inc.count || 1;
      const zn = `"${(inc.zone || '').replace(/"/g, '""')}"`;
      const sev = inc.severity;
      const st = inc.status;
      const notes = `"${(inc.description || '').replace(/"/g, '""')}"`;

      csvContent += `${d},${eq},${qty},${zn},${sev},${st},${notes}\n`;
    });

    csvContent += '\n--- SUMMARY BY EQUIPMENT ---\n';
    csvContent += 'Equipment,Total Occurrences\n';
    
    const eqSummary = {};
    data.forEach(inc => {
      const eqName = inc.equipmentType || 'Other';
      const qty = parseInt(inc.count || 1);
      eqSummary[eqName] = (eqSummary[eqName] || 0) + qty;
    });
    
    for (const [eqName, total] of Object.entries(eqSummary).sort((a,b) => b[1] - a[1])) {
      csvContent += `"${eqName.replace(/"/g, '""')}",${total}\n`;
    }

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incident-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  updateHeaders() {
    const table = document.getElementById('incident-table');
    table.querySelectorAll('th.sortable').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.sort === this.sortCol) {
        th.classList.add(this.sortAsc ? 'sort-asc' : 'sort-desc');
      }
    });
  },

  async refresh() {
    this.incidents = await DB.getIncidents();
    await this.populateZoneFilter();
    this.updateHeaders();
    this.render();
  },

  async populateZoneFilter() {
    const select = document.getElementById('filter-zone');
    while (select.options.length > 1) { select.remove(1); }
    const zones = await DB.getZones();
    zones.sort((a,b) => a.order - b.order).forEach(zone => {
      const opt = document.createElement('option');
      opt.value = zone.name;
      opt.textContent = zone.name;
      select.appendChild(opt);
    });
  },

  getFilteredAndSorted() {
    let result = [...this.incidents];
    const s = document.getElementById('filter-search').value.toLowerCase();
    const eq = document.getElementById('filter-equipment').value;
    const zn = document.getElementById('filter-zone').value;
    const sev = document.getElementById('filter-severity').value;
    const st = document.getElementById('filter-status').value;

    if (s) {
      result = result.filter(i =>
        (i.title || '').toLowerCase().includes(s) ||
        (i.equipmentType || '').toLowerCase().includes(s) ||
        (i.zone || '').toLowerCase().includes(s) ||
        (i.tags || []).join(' ').toLowerCase().includes(s)
      );
    }
    if (eq) result = result.filter(i => i.equipmentType === eq);
    if (zn) result = result.filter(i => i.zone === zn);
    if (sev) result = result.filter(i => i.severity === sev);
    if (st) result = result.filter(i => i.status === st);

    result.sort((a, b) => {
      let valA = a[this.sortCol] || '';
      let valB = b[this.sortCol] || '';
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return this.sortAsc ? -1 : 1;
      if (valA > valB) return this.sortAsc ? 1 : -1;
      return 0;
    });

    return result;
  },

  render() {
    const tbody = document.getElementById('incident-tbody');
    const emptyState = document.getElementById('table-empty');
    const table = document.getElementById('incident-table');
    const data = this.getFilteredAndSorted();

    tbody.innerHTML = '';

    if (data.length === 0) {
      table.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    table.style.display = 'table';
    emptyState.style.display = 'none';

    data.forEach(inc => {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';

      const stClass = inc.status === 'Resolved' ? 'badge-resolved' : 'badge-open';

      let sevClass = '';
      if (inc.severity === 'Low') sevClass = 'badge-low';
      if (inc.severity === 'Medium') sevClass = 'badge-medium';
      if (inc.severity === 'High') sevClass = 'badge-high';
      if (inc.severity === 'Critical') sevClass = 'badge-critical';

      tr.innerHTML = `
        <td style="white-space:nowrap">${Dashboard.formatDate(inc.timestamp)}</td>
        <td>${this.escape(inc.equipmentType)}</td>
        <td style="text-align:center"><strong>x${inc.count || 1}</strong></td>
        <td>${this.escape(inc.zone)}</td>
        <td class="notes-cell">${this.escape(inc.description || inc.title)}</td>
        <td><span class="badge ${sevClass}">${inc.severity}</span></td>
        <td><span class="badge ${stClass}">${I18n.t(inc.status === 'Resolved' ? 'editor.resolved' : 'editor.open') || inc.status}</span></td>
        <td class="table-actions">
          <button class="btn-icon btn-view" title="View Detail"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
        </td>
      `;

      tr.addEventListener('click', async (e) => {
        if (e.target.closest('button')) return;
        await App.showDetail(inc.id);
      });

      const btnView = tr.querySelector('.btn-view');
      btnView.addEventListener('click', async (e) => {
        e.stopPropagation();
        await App.showDetail(inc.id);
      });

      tbody.appendChild(tr);
    });
  },

  escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
};
