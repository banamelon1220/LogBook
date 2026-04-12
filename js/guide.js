/* ========================================
   REFERENCE GUIDE - Knowledge Base
   ======================================== */
const Guide = {
  _pendingImageData: null,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    // Add entry button (admin only)
    document.getElementById('btn-add-guide').addEventListener('click', () => this.openModal());

    // Modal cancel
    document.getElementById('btn-guide-cancel').addEventListener('click', () => this.closeModal());
    document.querySelector('#guide-modal .modal-overlay').addEventListener('click', () => this.closeModal());

    // Form submit
    document.getElementById('guide-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveEntry();
    });

    // Image file selector
    document.getElementById('btn-guide-select-img').addEventListener('click', () => {
      document.getElementById('guide-image-input').click();
    });
    document.getElementById('guide-image-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      document.getElementById('guide-selected-filename').textContent = file.name;

      // Compress and preview
      this.compressImage(file, (dataUrl) => {
        this._pendingImageData = dataUrl;
        document.getElementById('guide-image-preview').innerHTML =
          `<img src="${dataUrl}" style="max-width:100%;max-height:200px;border-radius:var(--radius);border:1px solid var(--border);" alt="Preview">`;
      });
    });

    // Filter by zone
    document.getElementById('guide-filter-zone').addEventListener('change', () => this.render());

    // Lightbox close
    document.getElementById('btn-guide-lightbox-close').addEventListener('click', () => this.closeLightbox());
    document.querySelector('#guide-lightbox .guide-lightbox-overlay').addEventListener('click', () => this.closeLightbox());
  },

  compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1024;
        let w = img.width;
        let h = img.height;
        if (w > MAX_WIDTH) {
          h = Math.round(h * MAX_WIDTH / w);
          w = MAX_WIDTH;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        callback(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  async refresh() {
    // Show add button for admin
    if (Auth.currentUser && Auth.currentUser.role === 'admin') {
      document.getElementById('btn-add-guide').style.display = 'inline-flex';
    } else {
      document.getElementById('btn-add-guide').style.display = 'none';
    }

    // Populate zone filter
    await this.populateZoneSelect();

    this.guides = await DB.getGuides();
    this.render();
  },

  async populateZoneSelect() {
    const zones = (await DB.getZones()).sort((a, b) => a.order - b.order);

    // Filter dropdown
    const filterSel = document.getElementById('guide-filter-zone');
    const currentFilter = filterSel.value;
    while (filterSel.options.length > 1) filterSel.remove(1);
    zones.forEach(z => {
      filterSel.innerHTML += `<option value="${this.escape(z.name)}">${this.escape(z.name)}</option>`;
    });
    filterSel.value = currentFilter;

    // Modal zone select
    const entrySel = document.getElementById('guide-entry-zone');
    entrySel.innerHTML = '<option value="">General</option>';
    zones.forEach(z => {
      entrySel.innerHTML += `<option value="${this.escape(z.name)}">${this.escape(z.name)}</option>`;
    });
  },

  render() {
    const grid = document.getElementById('guide-grid');
    const empty = document.getElementById('guide-empty');
    const filterZone = document.getElementById('guide-filter-zone').value;

    let entries = this.guides || [];
    if (filterZone) {
      entries = entries.filter(g => g.category === filterZone);
    }

    if (entries.length === 0) {
      grid.innerHTML = '';
      grid.style.display = 'none';
      empty.style.display = 'block';
      return;
    }

    grid.style.display = 'grid';
    empty.style.display = 'none';

    const isAdmin = Auth.currentUser && Auth.currentUser.role === 'admin';

    grid.innerHTML = entries.map(g => `
      <div class="guide-card" data-id="${g.id}">
        ${g.imageUrl ? `<div class="guide-card-img" data-src="${g.imageUrl}">
          <img src="${g.imageUrl}" alt="${this.escape(g.title)}" loading="lazy">
        </div>` : '<div class="guide-card-img guide-card-no-img"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>'}
        <div class="guide-card-body">
          ${g.category ? `<span class="guide-card-zone">${this.escape(g.category)}</span>` : ''}
          <h4 class="guide-card-title">${this.escape(g.title)}</h4>
          ${g.description ? `<p class="guide-card-desc">${this.escape(g.description)}</p>` : ''}
          ${isAdmin ? `<div class="guide-card-actions">
            <button class="btn-icon btn-guide-edit" data-id="${g.id}" title="Edit"><svg width="14\" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
            <button class="btn-icon btn-guide-delete" data-id="${g.id}" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
          </div>` : ''}
        </div>
      </div>
    `).join('');

    // Image click → lightbox
    grid.querySelectorAll('.guide-card-img[data-src]').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        const card = el.closest('.guide-card');
        const id = card.dataset.id;
        const entry = this.guides.find(g => g.id === id);
        this.openLightbox(el.dataset.src, entry ? entry.title : '', entry ? entry.description : '');
      });
    });

    // Admin actions
    grid.querySelectorAll('.btn-guide-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openModal(btn.dataset.id);
      });
    });
    grid.querySelectorAll('.btn-guide-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(I18n.t('guide.deleteConfirm'))) {
          await DB.deleteGuide(btn.dataset.id);
          App.toast(I18n.t('guide.deleted'), 'success');
          await this.refresh();
        }
      });
    });
  },

  openModal(editId = null) {
    const modal = document.getElementById('guide-modal');
    const title = document.getElementById('guide-modal-title');
    const form = document.getElementById('guide-form');

    form.reset();
    document.getElementById('guide-edit-id').value = '';
    document.getElementById('guide-selected-filename').textContent = 'No file selected';
    document.getElementById('guide-image-preview').innerHTML = '';
    this._pendingImageData = null;

    if (editId) {
      const entry = this.guides.find(g => g.id === editId);
      if (!entry) return;
      title.textContent = I18n.t('guide.editEntry');
      document.getElementById('guide-edit-id').value = entry.id;
      document.getElementById('guide-entry-title').value = entry.title;
      document.getElementById('guide-entry-desc').value = entry.description || '';
      document.getElementById('guide-entry-zone').value = entry.category || '';
      if (entry.imageUrl) {
        document.getElementById('guide-image-preview').innerHTML =
          `<img src="${entry.imageUrl}" style="max-width:100%;max-height:200px;border-radius:var(--radius);border:1px solid var(--border);" alt="Current">`;
      }
    } else {
      title.textContent = I18n.t('guide.addEntry');
    }

    modal.style.display = 'flex';
  },

  closeModal() {
    document.getElementById('guide-modal').style.display = 'none';
    this._pendingImageData = null;
  },

  async saveEntry() {
    const id = document.getElementById('guide-edit-id').value;
    const title = document.getElementById('guide-entry-title').value.trim();
    const description = document.getElementById('guide-entry-desc').value.trim();
    const category = document.getElementById('guide-entry-zone').value;

    if (!title) {
      App.toast(I18n.t('editor.fillRequired'), 'error');
      return;
    }

    try {
      if (id) {
        // Edit existing
        const updates = { title, description, category };
        if (this._pendingImageData) {
          updates.imageDataUrl = this._pendingImageData;
        }
        await DB.updateGuide(id, updates);
      } else {
        // New entry
        await DB.addGuide({
          title,
          description,
          category,
          imageDataUrl: this._pendingImageData
        });
      }

      App.toast(I18n.t('guide.saved'), 'success');
      this.closeModal();
      await this.refresh();
    } catch (err) {
      console.error('Guide save error:', err);
      App.toast('Save failed: ' + err.message, 'error');
    }
  },

  openLightbox(src, title, desc) {
    const lightbox = document.getElementById('guide-lightbox');
    document.getElementById('guide-lightbox-img').src = src;
    document.getElementById('guide-lightbox-caption').innerHTML =
      `<strong>${this.escape(title)}</strong>${desc ? '<br>' + this.escape(desc) : ''}`;
    lightbox.style.display = 'flex';
  },

  closeLightbox() {
    document.getElementById('guide-lightbox').style.display = 'none';
  },

  escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
};
