/* ========================================
   ZONES - Zone Management Settings & Map
   ======================================== */
const Zones = {
  activeId: null,
  activeMapId: null,
  pendingX: null,
  pendingY: null,
  pendingW: null,
  pendingH: null,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    // --- Zone Events ---
    document.getElementById('btn-add-zone').addEventListener('click', () => {
      this.openModal(null);
    });

    document.getElementById('btn-zone-cancel').addEventListener('click', () => {
      document.getElementById('zone-modal').style.display = 'none';
      this.clearPendingCoords();
    });

    document.getElementById('zone-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.save();
    });

    // --- Map Events ---
    document.getElementById('btn-add-map').addEventListener('click', () => {
      this.openMapModal(null);
    });

    document.getElementById('btn-map-cancel').addEventListener('click', () => {
      document.getElementById('map-modal').style.display = 'none';
    });

    document.getElementById('btn-select-map-file').addEventListener('click', () => {
      document.getElementById('map-image-input').click();
    });

    document.getElementById('map-image-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        document.getElementById('selected-map-filename').textContent = file.name;
      }
    });

    document.getElementById('map-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveMap();
    });

    // --- Interaction Logic (Mapping) ---
    const mapWrapper = document.getElementById('admin-map-wrapper');
    const selectionBox = document.getElementById('selection-box');
    let isDrawing = false;
    let startX, startY;

    mapWrapper.addEventListener('mousedown', (e) => {
      // If clicking existing zone/pin, don't start new drawing
      if (e.target.closest('.map-pin') || e.target.closest('.zone-rect')) return;
      
      isDrawing = true;
      const rect = mapWrapper.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;

      selectionBox.style.left = startX + 'px';
      selectionBox.style.top = startY + 'px';
      selectionBox.style.width = '0px';
      selectionBox.style.height = '0px';
      selectionBox.style.display = 'block';
      
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDrawing) return;
      const rect = mapWrapper.getBoundingClientRect();
      const currentX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const currentY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      selectionBox.style.left = left + 'px';
      selectionBox.style.top = top + 'px';
      selectionBox.style.width = width + 'px';
      selectionBox.style.height = height + 'px';
    });

    window.addEventListener('mouseup', (e) => {
      if (!isDrawing) return;
      isDrawing = false;
      const rect = mapWrapper.getBoundingClientRect();
      
      const boxLeft = parseFloat(selectionBox.style.left);
      const boxTop = parseFloat(selectionBox.style.top);
      const boxWidth = parseFloat(selectionBox.style.width);
      const boxHeight = parseFloat(selectionBox.style.height);

      selectionBox.style.display = 'none';

      // if box is too small, treat as a point click (min 10px)
      if (boxWidth < 10 && boxHeight < 10) {
        this.pendingX = (boxLeft / rect.width) * 100;
        this.pendingY = (boxTop / rect.height) * 100;
        this.pendingW = null; 
        this.pendingH = null;
      } else {
        this.pendingX = (boxLeft / rect.width) * 100;
        this.pendingY = (boxTop / rect.height) * 100;
        this.pendingW = (boxWidth / rect.width) * 100;
        this.pendingH = (boxHeight / rect.height) * 100;
      }

      this.openModal(null);
    });
  },

  openModal(zone) {
    this.activeId = zone ? zone.id : null;
    document.getElementById('zone-modal-title').textContent = zone ? I18n.t('zones.editZone') : I18n.t('zones.addZone');
    document.getElementById('zone-name').value = zone ? zone.name : '';
    document.getElementById('zone-color').value = zone ? zone.color : '#0ea5e9';
    
    if (zone) {
      this.pendingX = zone.x;
      this.pendingY = zone.y;
      this.pendingW = zone.w;
      this.pendingH = zone.h;
    }
    document.getElementById('zone-modal').style.display = 'flex';
  },

  openMapModal(map) {
    const isEdit = !!map;
    document.getElementById('map-modal-title').textContent = isEdit ? I18n.t('common.edit') : I18n.t('zones.addMap');
    document.getElementById('map-edit-id').value = isEdit ? map.id : '';
    document.getElementById('map-name').value = isEdit ? map.name : '';
    document.getElementById('map-upload-group').style.display = isEdit ? 'none' : 'block';
    document.getElementById('map-image-input').value = '';
    document.getElementById('selected-map-filename').textContent = 'No file selected';
    document.getElementById('map-modal').style.display = 'flex';
  },

  async refresh() {
    const maps = await DB.getMaps();
    this.renderMaps(maps);

    // Default to first map if none active
    if (!this.activeMapId && maps.length > 0) {
      this.activeMapId = maps[0].id;
    }

    const activeMap = maps.find(m => m.id === this.activeMapId);
    const mapWrapper = document.getElementById('admin-map-wrapper');
    const img = document.getElementById('admin-floorplan-img');
    const pinContainer = document.getElementById('admin-pins-container');
    const titleEl = document.getElementById('active-map-name-title');

    pinContainer.innerHTML = '';

    if (activeMap) {
      mapWrapper.style.display = 'block';
      img.src = activeMap.url;
      titleEl.textContent = activeMap.name;

      const zonesOnMap = await DB.getZones(this.activeMapId);
      zonesOnMap.forEach(z => {
        if (z.x != null && z.y != null) {
          const el = document.createElement('div');
          const isRect = z.w != null && z.h != null;
          
          if (isRect) {
            el.className = 'zone-rect';
            el.style.left = z.x + '%';
            el.style.top = z.y + '%';
            el.style.width = z.w + '%';
            el.style.height = z.h + '%';
            el.style.borderColor = z.color;
            el.style.background = z.color + '20';
            el.innerHTML = `<span class="zone-rect-label">${this.escape(z.name)}</span>`;
          } else {
            el.className = 'map-pin';
            el.style.left = z.x + '%';
            el.style.top = z.y + '%';
            el.style.backgroundColor = z.color;
            el.innerHTML = `<span class="map-pin-label">${this.escape(z.name)}</span>`;
          }

          el.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openModal(z);
          });
          pinContainer.appendChild(el);
        }
      });
    } else {
      mapWrapper.style.display = 'none';
      img.src = '';
      titleEl.textContent = I18n.t('zones.noMaps');
    }

    // Refresh general zones list (all zones)
    const zonesList = document.getElementById('zones-list');
    zonesList.innerHTML = '';
    const allZones = await DB.getZones();
    allZones.sort((a,b) => (a.order || 0) - (b.order || 0)).forEach(zone => {
      const el = document.createElement('div');
      el.className = 'zone-item';
      const mapInfo = maps.find(m => m.id === zone.mapId);
      const hint = mapInfo ? `<span style="font-size:10px;color:gray">📍 ${mapInfo.name}</span>` : '';
      
      el.innerHTML = `
        <div class="zone-color" style="background-color: ${zone.color}"></div>
        <div class="zone-name">${this.escape(zone.name)} ${hint}</div>
        <div class="zone-actions">
          <button class="btn-icon btn-edit-zone" title="Edit"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
          <button class="btn-icon btn-del-zone" style="color:var(--danger)" title="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div>
      `;
      el.querySelector('.btn-edit-zone').onclick = () => this.openModal(zone);
      el.querySelector('.btn-del-zone').onclick = async () => {
        if(confirm(I18n.t('zones.deleteConfirm'))) {
          await DB.deleteZone(zone.id);
          this.refresh();
        }
      };
      zonesList.appendChild(el);
    });
  },

  renderMaps(maps) {
    const list = document.getElementById('maps-list');
    list.innerHTML = '';
    if (maps.length === 0) {
      list.innerHTML = `<div class="empty-state"><p>${I18n.t('zones.noMaps')}</p></div>`;
      return;
    }

    maps.forEach(map => {
      const el = document.createElement('div');
      el.className = `zone-item ${map.id === this.activeMapId ? 'active' : ''}`;
      el.style.cursor = 'pointer';
      el.innerHTML = `
        <div class="zone-name" style="font-weight:600">${this.escape(map.name)}</div>
        <div class="zone-actions">
          <button class="btn-icon btn-edit-map" title="Rename"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="btn-icon btn-del-map" style="color:var(--danger)" title="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div>
      `;
      el.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        this.activeMapId = map.id;
        this.refresh();
      });
      el.querySelector('.btn-edit-map').onclick = () => this.openMapModal(map);
      el.querySelector('.btn-del-map').onclick = async () => {
        if(confirm(I18n.t('zones.deleteMapConfirm'))) {
          await DB.deleteMap(map.id);
          if (this.activeMapId === map.id) this.activeMapId = null;
          this.refresh();
        }
      };
      list.appendChild(el);
    });
  },

  async save() {
    const name = document.getElementById('zone-name').value;
    const color = document.getElementById('zone-color').value;

    const data = { 
      name, 
      color,
      mapId: this.activeMapId
    };

    if (this.pendingX != null && this.pendingY != null) {
      data.x = this.pendingX;
      data.y = this.pendingY;
      data.w = this.pendingW;
      data.h = this.pendingH;
    }

    try {
      if (this.activeId) {
        await DB.updateZone(this.activeId, data);
      } else {
        await DB.addZone(data);
      }
      document.getElementById('zone-modal').style.display = 'none';
      this.clearPendingCoords();
      await this.refresh();
      App.toast(I18n.t('zones.saved'), 'success');
    } catch (err) {
      console.error(err);
      App.toast('Save failed', 'error');
    }
  },

  async saveMap() {
    const id = document.getElementById('map-edit-id').value;
    const name = document.getElementById('map-name').value;
    const fileInput = document.getElementById('map-image-input');

    const btn = document.querySelector('#map-form button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
      if (id) {
        await DB.updateMap(id, { name });
      } else {
        const file = fileInput.files[0];
        if (!file) {
          App.toast('Please select an image', 'error');
          return;
        }
        const dataUrl = await this.readAsDataURL(file);
        const newMap = await DB.addMap(name, dataUrl);
        this.activeMapId = newMap.id;
      }
      document.getElementById('map-modal').style.display = 'none';
      await this.refresh();
      App.toast(I18n.t('zones.saved'), 'success');
    } catch (err) {
      console.error(err);
      App.toast('Map save failed', 'error');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  },

  clearPendingCoords() {
    this.pendingX = null;
    this.pendingY = null;
    this.pendingW = null;
    this.pendingH = null;
  },

  readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  },

  escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
};
