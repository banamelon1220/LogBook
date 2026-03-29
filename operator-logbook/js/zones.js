/* ========================================
   ZONES - Zone Management Settings & Map
   ======================================== */
const Zones = {
  activeId: null,
  pendingX: null,
  pendingY: null,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    document.getElementById('btn-add-zone').addEventListener('click', () => {
      this.openModal(null);
    });

    document.getElementById('btn-zone-cancel').addEventListener('click', () => {
      document.getElementById('zone-modal').style.display = 'none';
      this.pendingX = null;
      this.pendingY = null;
    });

    document.getElementById('zone-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.save();
    });

    document.getElementById('btn-upload-plan').addEventListener('click', () => {
      document.getElementById('floorplan-input').click();
    });

    document.getElementById('floorplan-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Basic validation
      if (!file.type.startsWith('image/')) {
        App.toast(I18n.t('zones.invalidFileType') || 'Please upload an image file.', 'error');
        return;
      }

      if (file.size > 0.9 * 1024 * 1024) { // 0.9MB limit for Firestore
        App.toast(I18n.t('zones.fileTooLarge') || 'File is too large for free tier (max 0.9MB). Please compress.', 'error');
        return;
      }

      const btn = document.getElementById('btn-upload-plan');
      const originalText = btn.textContent;
      btn.textContent = 'Uploading...';
      btn.disabled = true;

      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          await DB.saveFloorPlan(ev.target.result);
          await this.refresh();
          App.toast(I18n.t('zones.uploadSuccess') || 'Floor plan updated successfully!', 'success');
        } catch (err) {
          console.error('Floor plan upload failed:', err);
          App.toast(I18n.t('zones.uploadError') || 'Upload failed. Check Storage rules or network.', 'error');
        } finally {
          btn.textContent = originalText;
          btn.disabled = false;
          // Reset input to allow re-uploading the same file if it failed
          e.target.value = '';
        }
      };
      reader.onerror = () => {
        App.toast('Error reading file.', 'error');
        btn.textContent = originalText;
        btn.disabled = false;
      };
      reader.readAsDataURL(file);
    });

    const mapWrapper = document.getElementById('admin-map-wrapper');
    const selectionBox = document.getElementById('selection-box');
    let isDrawing = false;
    let startX, startY;

    mapWrapper.addEventListener('mousedown', (e) => {
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
      
      const boxLeft = parseInt(selectionBox.style.left);
      const boxTop = parseInt(selectionBox.style.top);
      const boxWidth = parseInt(selectionBox.style.width);
      const boxHeight = parseInt(selectionBox.style.height);

      selectionBox.style.display = 'none';

      // if box is too small, treat as a point click (min 10px)
      if (boxWidth < 10 && boxHeight < 10) {
        this.pendingX = (boxLeft / rect.width) * 100;
        this.pendingY = (boxTop / rect.height) * 100;
        this.pendingW = 5; // Default width
        this.pendingH = 5; // Default height
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
      this.pendingW = zone.w || 5;
      this.pendingH = zone.h || 5;
    }

    document.getElementById('zone-modal').style.display = 'flex';
  },

  async refresh() {
    const list = document.getElementById('zones-list');
    list.innerHTML = '';
    
    const zonesArray = await DB.getZones();
    const zones = zonesArray.sort((a,b) => a.order - b.order);

    const planBase64 = await DB.getFloorPlan();
    const mapWrapper = document.getElementById('admin-map-wrapper');
    const img = document.getElementById('admin-floorplan-img');
    const pinContainer = document.getElementById('admin-pins-container');
    pinContainer.innerHTML = '';

    if (planBase64) {
      mapWrapper.style.display = 'block';
      img.src = planBase64;
      zones.forEach(z => {
        if (z.x != null && z.y != null) {
          const isRect = z.w != null && z.h != null;
          const el = document.createElement('div');
          
          if (isRect) {
            el.className = 'zone-rect';
            el.style.left = z.x + '%';
            el.style.top = z.y + '%';
            el.style.width = z.w + '%';
            el.style.height = z.h + '%';
            el.style.borderColor = z.color;
            el.style.background = z.color + '20'; // 20 hex for low opacity
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
    }

    if (zones.length === 0) {
      list.innerHTML = `<div class="empty-state"><p>${I18n.t('zones.empty')}</p></div>`;
      return;
    }

    zones.forEach(zone => {
      const el = document.createElement('div');
      el.className = 'zone-item';
      let coordsDisplay = (zone.x != null && zone.y != null) ? `<span style="font-size:10px;color:gray">📍 Pinned</span>` : '';
      el.innerHTML = `
        <div class="zone-color" style="background-color: ${zone.color}"></div>
        <div class="zone-name">${this.escape(zone.name)} ${coordsDisplay}</div>
        <div class="zone-actions">
          <button class="btn-icon btn-edit-zone" title="Edit"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
          <button class="btn-icon btn-del-zone" style="color:var(--danger)" title="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div>
      `;

      el.querySelector('.btn-edit-zone').addEventListener('click', () => {
        this.openModal(zone);
      });

      el.querySelector('.btn-del-zone').addEventListener('click', async () => {
        if(confirm(I18n.t('zones.deleteConfirm'))) {
          await DB.deleteZone(zone.id);
          await this.refresh();
          App.toast(I18n.t('zones.deleted'), 'success');
        }
      });

      list.appendChild(el);
    });
  },

  async save() {
    const name = document.getElementById('zone-name').value;
    const color = document.getElementById('zone-color').value;

    const data = { name, color };
    if (this.pendingX != null && this.pendingY != null) {
      data.x = this.pendingX;
      data.y = this.pendingY;
      data.w = this.pendingW || 5;
      data.h = this.pendingH || 5;
    }

    if (this.activeId) {
      await DB.updateZone(this.activeId, data);
    } else {
      await DB.addZone(data);
    }

    document.getElementById('zone-modal').style.display = 'none';
    this.pendingX = null;
    this.pendingY = null;
    this.pendingW = null;
    this.pendingH = null;
    await this.refresh();
    App.toast(I18n.t('zones.saved'), 'success');
  },

  escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
};
