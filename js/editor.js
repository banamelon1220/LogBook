/* ========================================
   EDITOR VIEW - Edit / Detail
   ======================================== */
const Editor = {
  currentMedia: [],

  init() {
    this.bindEvents();
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

    // Save
    document.getElementById('btn-save-incident').addEventListener('click', async () => await this.save());
    document.getElementById('btn-save-and-more').addEventListener('click', async () => await this.save(false));
    document.getElementById('btn-cancel-edit').addEventListener('click', async () => await App.navigate('table'));
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
    const tzOffsetMs = now.getTimezoneOffset() * 60000;
    const localISO = new Date(now - tzOffsetMs).toISOString().slice(0,16);
    document.getElementById('edit-timestamp').value = localISO;

    // Default values
    document.getElementById('edit-severity').value = 'Low';
    
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
    document.getElementById('edit-equipment').value = inc.equipmentType || '';
    document.getElementById('edit-zone').value = inc.zone || '';
    document.getElementById('edit-severity').value = inc.severity || '';
    document.getElementById('edit-description').value = inc.description || '';
    document.getElementById('edit-tags').value = (inc.tags || []).join(', ');

    document.querySelectorAll('.status-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.status === inc.status);
    });
    this.renderMediaPreview();

    await App.navigate('editor');
  },

  async resetForm() {
    document.getElementById('incident-form').reset();
    document.getElementById('edit-id').value = '';
    document.querySelectorAll('.status-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.status === 'Open');
    });
    this.renderMediaPreview();

    // Load Dynamic Settings (Equipment & Zones & Quick Tags)
    const settings = await DB.getSettings();
    
    // Equipment
    const eqSelect = document.getElementById('edit-equipment');
    const oldEq = eqSelect.value;
    eqSelect.innerHTML = '<option value="">Select...</option>';
    (settings.equipmentTypes || []).forEach(type => {
      eqSelect.innerHTML += `<option value="${type}">${type}</option>`;
    });
    if (oldEq) eqSelect.value = oldEq;

    // Zones
    const zoneSelect = document.getElementById('edit-zone');
    const oldZone = zoneSelect.value;
    zoneSelect.innerHTML = '<option value="">Select...</option>';
    const zones = (await DB.getZones()).sort((a,b) => a.order - b.order);
    
    const zonesContainer = document.getElementById('quick-zones-container');
    zonesContainer.innerHTML = '';

    zones.forEach(zone => {
      // Dropdown
      zoneSelect.innerHTML += `<option value="${zone.name}">${zone.name}</option>`;
      
      // Button
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline btn-xs zone-btn';
      btn.style.padding = '4px 10px';
      btn.style.fontSize = '13px';
      btn.textContent = zone.name;
      btn.dataset.zone = zone.name;
      
      btn.addEventListener('click', () => {
        zoneSelect.value = zone.name;
        document.querySelectorAll('.zone-btn').forEach(zb => zb.classList.remove('active'));
        btn.classList.add('active');
        // Trigger any potential change events if needed
      });
      
      zonesContainer.appendChild(btn);
    });
    
    if (oldZone) {
      zoneSelect.value = oldZone;
      const activeBtn = Array.from(document.querySelectorAll('.zone-btn')).find(b => b.dataset.zone === oldZone);
      if (activeBtn) activeBtn.classList.add('active');
    }

    // Quick Tags
    const tagsContainer = document.getElementById('quick-tags-container');
    tagsContainer.innerHTML = '';
    (settings.commonTags || []).forEach(tag => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline btn-xs';
      btn.style.padding = '2px 8px';
      btn.style.fontSize = '12px';
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
  },

  async save(shouldRedirect = true) {
    const id = document.getElementById('edit-id').value;
    const activeStatusBtn = document.querySelector('.status-btn.active');

    const req = ['edit-timestamp', 'edit-equipment', 'edit-zone', 'edit-severity'];
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
      const autoTitle = desc ? (desc.length > 20 ? desc.substring(0, 20) + '...' : desc) : 'Issue in ' + document.getElementById('edit-zone').value;

      const data = {
        timestamp: document.getElementById('edit-timestamp').value,
        equipmentType: document.getElementById('edit-equipment').value,
        zone: document.getElementById('edit-zone').value,
        severity: document.getElementById('edit-severity').value,
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

      const savedMedia = await DB.getMediaForIncident(incidentId);
      const currentIds = this.currentMedia.map(m => m.id);

      // Sync Medias
      for (const sm of savedMedia) {
        if (!currentIds.includes(sm.id)) {
          await DB.removeMediaItem(incidentId, sm.id);
        }
      }

      for (const m of this.currentMedia) {
        if (m.dataUrl.startsWith('data:')) {
          await DB.addMediaItem(incidentId, m);
        }
      }

      App.toast(I18n.t('editor.saved'), 'success');
      
      if (shouldRedirect) {
        await App.navigate('dashboard');
      } else {
        await this.openNew();
      }
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span data-i18n="editor.save">${I18n.t('editor.save') || 'Save'}</span>`;
    }
  },

  escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
};
