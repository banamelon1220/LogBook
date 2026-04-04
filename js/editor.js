/* ========================================
   EDITOR VIEW - Edit / Detail
   ======================================== */
const Editor = {
  currentMedia: [],

  init() {
    this.bindEvents();
    this.initDateTimeSelectors();

    // Mini map switcher
    const mapSel = document.getElementById('editor-map-select');
    if (mapSel) {
      mapSel.addEventListener('change', (e) => {
        this._editorMapId = e.target.value;
        this.renderMiniMap();
      });
    }
  },

  bindEvents() {
    const dropzone = document.getElementById('media-dropzone');
    const input = document.getElementById('media-input');

    dropzone.addEventListener('click', () => input.click());
    input.addEventListener('change', (e) => this.handleFiles(e.target.files));

    // Drag and Drop
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      this.handleFiles(e.dataTransfer.files);
    });

    // Status toggle
    const buttons = document.querySelectorAll('.status-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Count Buttons (+/-)
    document.getElementById('btn-count-plus').addEventListener('click', () => {
      const el = document.getElementById('edit-count');
      el.value = parseInt(el.value) + 1;
    });
    document.getElementById('btn-count-minus').addEventListener('click', () => {
      const el = document.getElementById('edit-count');
      const val = parseInt(el.value);
      if (val > 1) el.value = val - 1;
    });

    // Save
    document.getElementById('btn-save-incident').addEventListener('click', async () => await this.save());
    document.getElementById('btn-save-and-more').addEventListener('click', async () => await this.save(false));
    document.getElementById('btn-cancel-edit').addEventListener('click', async () => await App.navigate('table'));
  },

  initDateTimeSelectors() {
    const yearSelect = document.getElementById('split-year');
    const monthSelect = document.getElementById('split-month');
    const daySelect = document.getElementById('split-day');

    if (!daySelect) return;

    // Years (Current +/- 1)
    const currentYear = new Date().getFullYear();
    yearSelect.innerHTML = '';
    for (let i = currentYear - 1; i <= currentYear + 1; i++) {
        yearSelect.innerHTML += `<option value="${i}">${i}</option>`;
    }

    // Months
    monthSelect.innerHTML = '';
    for (let i = 1; i <= 12; i++) {
        monthSelect.innerHTML += `<option value="${i}">${i}</option>`;
    }

    daySelect.innerHTML = '';
    for (let i = 1; i <= 31; i++) {
      daySelect.innerHTML += `<option value="${i}">${i}</option>`;
    }
  },

  handleFiles(files) {
    if (!files || files.length === 0) return;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        this.currentMedia.push({
          id: DB.uuid(),
          name: file.name,
          type: file.type,
          dataUrl: e.target.result
        });
        this.renderMediaPreview();
      };
      reader.readAsDataURL(file);
    });
  },

  renderMediaPreview() {
    const container = document.getElementById('media-preview');
    container.innerHTML = '';
    this.currentMedia.forEach(m => {
      const el = document.createElement('div');
      el.className = 'media-thumb';

      if (m.type.startsWith('image/')) {
        el.innerHTML = `<img src="${m.dataUrl}" alt="media">`;
      } else {
        el.innerHTML = `<video src="${m.dataUrl}" preload="metadata"></video>`;
      }

      const rmBtn = document.createElement('button');
      rmBtn.className = 'remove-media';
      rmBtn.innerHTML = '&times;';
      rmBtn.type = 'button';
      rmBtn.addEventListener('click', () => {
        this.currentMedia = this.currentMedia.filter(curr => curr.id !== m.id);
        this.renderMediaPreview();
      });

      el.appendChild(rmBtn);
      container.appendChild(el);
    });
  },

  async openNew() {
    await this.resetForm();
    document.getElementById('editor-title').textContent = I18n.t('editor.newTitle');

    const now = new Date();
    this.setDateTimeFields(now);
    document.getElementById('split-ampm').value = 'PM';

    // Default values
    document.getElementById('edit-severity').value = 'Low';
    document.getElementById('edit-count').value = '1';

    // Default equipment to first option
    const eqSelect = document.getElementById('edit-equipment');
    if (eqSelect.options.length > 1) {
      eqSelect.selectedIndex = 1; // skip "Select..."
      const firstEqBtn = document.querySelector('.eq-btn');
      if (firstEqBtn) firstEqBtn.classList.add('active');
    }

    // Default zone to first option
    const zoneSelect = document.getElementById('edit-zone');
    if (zoneSelect.options.length > 1) {
      zoneSelect.selectedIndex = 1;
      const firstZoneBtn = document.querySelector('.zone-btn');
      if (firstZoneBtn) firstZoneBtn.classList.add('active');
    }

    // Default first tag
    const tagsContainer = document.getElementById('quick-tags-container');
    const firstTagBtn = tagsContainer?.querySelector('button');
    if (firstTagBtn) {
      firstTagBtn.click();
    }
    
    document.querySelectorAll('.status-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.status === 'Resolved');
    });

    await App.navigate('editor');
  },

  async openEdit(id) {
    await this.resetForm();
    const inc = await DB.getIncidentById(id);
    if (!inc) return;

    document.getElementById('editor-title').textContent = I18n.t('editor.editTitle');
    document.getElementById('edit-id').value = inc.id;
    document.getElementById('edit-timestamp').value = inc.timestamp;
    
    const dateObj = new Date(inc.timestamp);
    this.setDateTimeFields(dateObj);

    document.getElementById('edit-equipment').value = inc.equipmentType || '';
    document.getElementById('edit-zone').value = inc.zone || '';
    document.getElementById('edit-severity').value = inc.severity || '';
    document.getElementById('edit-count').value = inc.count || '1';
    document.getElementById('edit-description').value = inc.description || '';
    document.getElementById('edit-tags').value = (inc.tags || []).join(', ');

    document.querySelectorAll('.status-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.status === inc.status);
    });
    this.renderMediaPreview();

    await App.navigate('editor');
  },

  setDateTimeFields(dateObj) {
    // Hidden timestamp (ISO string for DB, trimmed to min)
    const tzOffsetMs = dateObj.getTimezoneOffset() * 60000;
    const localISO = new Date(dateObj - tzOffsetMs).toISOString().slice(0,16);
    document.getElementById('edit-timestamp').value = localISO;
    
    // Split fields
    document.getElementById('split-year').value = dateObj.getFullYear();
    document.getElementById('split-month').value = dateObj.getMonth() + 1;
    document.getElementById('split-day').value = dateObj.getDate();
    document.getElementById('split-ampm').value = dateObj.getHours() < 12 ? 'AM' : 'PM';
  },

  getTimestampFromFields() {
    const year = document.getElementById('split-year').value;
    const month = parseInt(document.getElementById('split-month').value) - 1;
    const day = document.getElementById('split-day').value;
    const ampm = document.getElementById('split-ampm').value;
    const hour = ampm === 'PM' ? 15 : 9;
    const min = 0;
    
    const constructed = new Date(year, month, day, hour, min);
    const tzOffsetMs = constructed.getTimezoneOffset() * 60000;
    return new Date(constructed - tzOffsetMs).toISOString().slice(0,16);
  },

  async resetForm() {
    document.getElementById('incident-form').reset();
    document.getElementById('edit-id').value = '';
    document.querySelectorAll('.status-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.status === 'Open');
    });
    this.renderMediaPreview();

    // Load Dynamic Settings
    const settings = await DB.getSettings();
    
    // Equipment
    const eqSelect = document.getElementById('edit-equipment');
    const oldEq = eqSelect.value;
    eqSelect.innerHTML = '<option value="">Select...</option>';
    
    const eqContainer = document.getElementById('quick-equipment-container');
    eqContainer.innerHTML = '';

    (settings.equipmentTypes || []).forEach(type => {
      eqSelect.innerHTML += `<option value="${type}">${type}</option>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline btn-xs eq-btn';
      btn.textContent = type;
      btn.dataset.type = type;
      btn.addEventListener('click', () => {
        eqSelect.value = type;
        document.querySelectorAll('.eq-btn').forEach(eb => eb.classList.remove('active'));
        btn.classList.add('active');
      });
      eqContainer.appendChild(btn);
    });

    // Zones
    const zoneSelect = document.getElementById('edit-zone');
    zoneSelect.innerHTML = '<option value="">Select...</option>';
    const zones = (await DB.getZones()).sort((a,b) => a.order - b.order);
    const zonesContainer = document.getElementById('quick-zones-container');
    zonesContainer.innerHTML = '';
    zones.forEach(zone => {
      zoneSelect.innerHTML += `<option value="${zone.name}">${zone.name}</option>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline btn-xs zone-btn';
      btn.textContent = zone.name;
      btn.dataset.zone = zone.name;
      btn.addEventListener('click', () => {
        zoneSelect.value = zone.name;
        document.querySelectorAll('.zone-btn').forEach(zb => zb.classList.remove('active'));
        btn.classList.add('active');
      });
      zonesContainer.appendChild(btn);
    });
    
    // Quick Tags
    const tagsContainer = document.getElementById('quick-tags-container');
    tagsContainer.innerHTML = '';
    (settings.commonTags || []).forEach(tag => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline btn-xs';
      btn.textContent = tag;
      btn.addEventListener('click', () => {
        const input = document.getElementById('edit-tags');
        const current = input.value.split(',').map(t => t.trim()).filter(t => t);
        if (!current.includes(tag)) {
          current.push(tag);
          input.value = current.join(', ');
        }
      });
      tagsContainer.appendChild(btn);
    });

    // Quick Note Buttons (Details)
    const notesContainer = document.getElementById('quick-notes-container');
    notesContainer.innerHTML = '';
    (settings.quickNotes || []).forEach(note => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline btn-sm';
      btn.textContent = note;
      btn.addEventListener('click', () => {
        const textarea = document.getElementById('edit-description');
        const current = textarea.value.trim();
        textarea.value = current ? `${current} - ${note}` : note;
        textarea.focus();
      });
      notesContainer.appendChild(btn);
    });

    // Render mini map
    await this.renderMiniMap();
  },

  async save(shouldRedirect = true) {
    const id = document.getElementById('edit-id').value;
    const activeStatusBtn = document.querySelector('.status-btn.active');

    // Combine split fields
    const ts = this.getTimestampFromFields();

    const req = ['edit-equipment', 'edit-zone', 'edit-severity'];
    for(let f of req) {
      if(!document.getElementById(f).value) {
        App.toast(I18n.t('editor.fillRequired'), 'error');
        return;
      }
    }
    
    const saveBtn = document.getElementById('btn-save-incident');
    saveBtn.disabled = true;
    saveBtn.innerHTML = 'Saving...';

    try {
      const desc = document.getElementById('edit-description').value;
      const count = document.getElementById('edit-count').value;
      const autoTitle = desc ? (desc.length > 20 ? desc.substring(0, 20) + '...' : desc) : 'Issue in ' + document.getElementById('edit-zone').value;

      const data = {
        timestamp: ts,
        equipmentType: document.getElementById('edit-equipment').value,
        zone: document.getElementById('edit-zone').value,
        severity: document.getElementById('edit-severity').value,
        count: count,
        title: autoTitle,
        description: desc,
        tags: document.getElementById('edit-tags').value.split(',').map(t => t.trim()).filter(t => t),
        status: activeStatusBtn ? activeStatusBtn.dataset.status : 'Resolved',
        createdBy: Auth.currentUser.id,
        createdByName: Auth.currentUser.displayName
      };

      let incidentId = id;
      if (id) {
        await DB.updateIncident(id, data);
      } else {
        const inc = await DB.addIncident(data);
        incidentId = inc.id;
      }

      // ONLY fetch if editing an existing incident
      const savedMedia = id ? await DB.getMediaForIncident(incidentId) : [];
      const currentIds = this.currentMedia.map(m => m.id);

      for (const sm of savedMedia) {
        if (!currentIds.includes(sm.id)) await DB.removeMediaItem(incidentId, sm.id);
      }
      for (const m of this.currentMedia) {
        if (m.dataUrl.startsWith('data:')) {
          try {
            await DB.addMediaItem(incidentId, m);
          } catch(err) {
            console.warn('Offline media upload deferred', err);
          }
        }
      }

      App.toast(I18n.t('editor.saved'), 'success');
      
      if (shouldRedirect) await App.navigate('dashboard');
      else await this.openNew();
      
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span data-i18n="editor.save">${I18n.t('editor.save') || 'Save'}</span>`;
    }
  },

  async renderMiniMap() {
    const container = document.getElementById('editor-mini-map');
    const img = document.getElementById('editor-floorplan-img');
    const pinsEl = document.getElementById('editor-pins-container');
    const mapSelect = document.getElementById('editor-map-select');
    if (!container) return;

    const maps = await DB.getMaps();
    if (maps.length === 0) {
      container.style.display = 'none';
      return;
    }

    // Populate map selector
    mapSelect.innerHTML = maps.map(m => `<option value="${m.id}">${this.escape(m.name)}</option>`).join('');
    if (maps.length <= 1) mapSelect.style.display = 'none';
    else mapSelect.style.display = 'inline-block';

    // Pick active map
    if (!this._editorMapId || !maps.find(m => m.id === this._editorMapId)) {
      this._editorMapId = maps[0].id;
    }
    mapSelect.value = this._editorMapId;

    const activeMap = maps.find(m => m.id === this._editorMapId);
    if (!activeMap) { container.style.display = 'none'; return; }

    container.style.display = 'block';
    img.src = activeMap.url;
    pinsEl.innerHTML = '';

    const zones = await DB.getZones(this._editorMapId);
    const zoneSelect = document.getElementById('edit-zone');

    zones.forEach(z => {
      if (z.x == null || z.y == null) return;
      const isRect = z.w != null && z.h != null;
      const el = document.createElement('div');

      if (isRect) {
        el.className = 'zone-rect';
        el.style.left = z.x + '%';
        el.style.top = z.y + '%';
        el.style.width = z.w + '%';
        el.style.height = z.h + '%';
        el.style.borderColor = z.color;
        el.style.background = z.color + '20';
        el.innerHTML = `<span class="zone-rect-label" style="font-size:10px">${this.escape(z.name)}</span>`;
      } else {
        el.className = 'map-pin';
        el.style.left = z.x + '%';
        el.style.top = z.y + '%';
        el.style.backgroundColor = z.color;
        el.innerHTML = `<span class="map-pin-label" style="font-size:10px">${this.escape(z.name)}</span>`;
      }

      // Click pin to select that zone
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        zoneSelect.value = z.name;
        document.querySelectorAll('.zone-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.zone === z.name);
        });
      });
      pinsEl.appendChild(el);
    });
  },

  escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
};
