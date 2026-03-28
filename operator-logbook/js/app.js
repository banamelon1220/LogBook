/* ========================================
   MAIN APP CONTROLLER - Wiring & Routing
   ======================================== */
const App = {
  currentView: 'dashboard',
  _isMainAppInitialized: false,

  async init() {
    await DB.init();
    I18n.init();

    // Setup Auth Flow
    const authed = await Auth.init();
    if (authed) {
      await this.initMainApp();
    } else {
      document.getElementById('login-screen').style.display = 'flex';
    }

    // Login Form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('login-userid').value;
      const pass = document.getElementById('login-password').value;
      const res = await Auth.login(id, pass);

      if (res.success) {
        document.getElementById('login-screen').style.display = 'none';
        await this.initMainApp();
      } else {
        const err = document.getElementById('login-error');
        err.textContent = I18n.t(res.error);
        err.style.display = 'block';
      }
    });
  },

  async initMainApp() {
    if (this._isMainAppInitialized) return;
    this._isMainAppInitialized = true;
    
    document.getElementById('app').style.display = 'flex';
    this.updateUserContext();
    this.bindGlobalEvents();

    // Module Init (synchronous bindEvents)
    Dashboard.init();
    TableView.init();
    Editor.init();
    Zones.init();
    Settings.init();
    Admin.init();

    // Render initially
    await this.navigate('dashboard');
  },

  updateUserContext() {
    const u = Auth.currentUser;
    document.getElementById('sidebar-username').textContent = u.displayName;
    document.getElementById('sidebar-avatar').textContent = u.displayName.charAt(0).toUpperCase();

    if (u.role === 'admin') {
      document.getElementById('sidebar-role').textContent = 'Admin';
      document.getElementById('nav-admin').style.display = 'block';
    } else {
      document.getElementById('sidebar-role').textContent = 'Operator';
      document.getElementById('nav-admin').style.display = 'none';
    }
  },

  bindGlobalEvents() {
    // Navigation Sidebar
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', async (e) => {
        e.preventDefault();
        const targetView = link.dataset.view;

        if (targetView === 'editor') {
          await Editor.openNew();
        } else {
          await this.navigate(targetView);
        }

        // Close mobile sidebar
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebar-overlay').classList.remove('active');
      });
    });

    // Mobile nav toggle
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.add('open');
      document.getElementById('sidebar-overlay').classList.add('active');
    });
    document.getElementById('sidebar-overlay').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebar-overlay').classList.remove('active');
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', () => {
      Auth.logout();
      window.location.reload();
    });
  },

  async navigate(viewId) {
    this.currentView = viewId;

    // Active link
    document.querySelectorAll('.nav-link').forEach(l => {
      l.classList.toggle('active', l.dataset.view === viewId);
    });

    // Toggle views
    document.querySelectorAll('.view').forEach(v => {
      v.classList.remove('active');
    });
    const target = document.getElementById(`view-${viewId}`);
    if (target) {
      target.classList.add('active');
    }

    // Refresh view specific data
    if (viewId === 'dashboard') {
      document.getElementById('mobile-title').textContent = I18n.t('nav.dashboard');
      await Dashboard.refresh();
    } else if (viewId === 'table') {
      document.getElementById('mobile-title').textContent = I18n.t('nav.table');
      await TableView.refresh();
    } else if (viewId === 'zones') {
      document.getElementById('mobile-title').textContent = I18n.t('nav.zones');
      await Zones.refresh();
    } else if (viewId === 'editor') {
      document.getElementById('mobile-title').textContent = I18n.t('editor.editTitle');
    } else if (viewId === 'admin') {
      document.getElementById('mobile-title').textContent = 'User Management';
      await Admin.refresh();
    }
  },

  // ---- Detail View Logic ----
  async showDetail(incidentId) {
    const inc = await DB.getIncidentById(incidentId);
    if (!inc) return;

    await this.navigate('detail');
    document.getElementById('mobile-title').textContent = I18n.t('table.titleCol');

    // Build DOM for detail view
    const container = document.getElementById('detail-content');
    const ts = Dashboard.formatDate(inc.timestamp);

    let sevClass = '';
    if (inc.severity === 'Low') sevClass = 'badge-low';
    if (inc.severity === 'Medium') sevClass = 'badge-medium';
    if (inc.severity === 'High') sevClass = 'badge-high';
    if (inc.severity === 'Critical') sevClass = 'badge-critical';

    const stClass = inc.status === 'Resolved' ? 'badge-resolved' : 'badge-open';

    const tagsHtml = (inc.tags || []).map(t => `<span class="tag">${Editor.escape(t)}</span>`).join('');

    // Media
    const media = await DB.getMediaForIncident(inc.id);
    const mediaHtml = media.map(m => {
      if (m.type.startsWith('image/')) {
        return `<img src="${m.dataUrl}" alt="media">`;
      }
      return `<video src="${m.dataUrl}" controls preload="metadata"></video>`;
    }).join('');

    container.innerHTML = `
      <div class="detail-header-info">
        <h2>${Editor.escape(inc.title)}</h2>
        <div class="detail-meta">
          <span>📅 ${ts}</span>
          <span>🔧 ${Editor.escape(inc.equipmentType)}</span>
          <span>📍 ${Editor.escape(inc.zone || 'None')}</span>
          <span><div class="badge ${sevClass}">${inc.severity}</div></span>
          <span><div class="badge ${stClass}">${inc.status}</div></span>
          <span>👤 ${Editor.escape(inc.createdByName || 'Unknown')}</span>
        </div>
      </div>

      <div class="detail-section">
        <h3 data-i18n="editor.notes">Notes / Details</h3>
        <div class="detail-text">${Editor.escape(inc.description || 'No notes provided.')}</div>
      </div>

      ${tagsHtml ? `
        <div class="detail-section">
          <h3 data-i18n="editor.tags">Tags</h3>
          <div class="detail-tags">${tagsHtml}</div>
        </div>
      ` : ''}

      ${mediaHtml ? `
        <div class="detail-section">
          <h3 data-i18n="editor.media">Attachments</h3>
          <div class="detail-media-grid">${mediaHtml}</div>
        </div>
      ` : ''}
    `;

    I18n.apply();

    // Wire up buttons
    const btnEdit = document.getElementById('btn-edit-incident');
    const btnDel = document.getElementById('btn-delete-incident');
    const btnBack = document.getElementById('btn-back-to-table');

    const elEdit = btnEdit.cloneNode(true);
    const elDel = btnDel.cloneNode(true);
    const elBack = btnBack.cloneNode(true);
    btnEdit.parentNode.replaceChild(elEdit, btnEdit);
    btnDel.parentNode.replaceChild(elDel, btnDel);
    btnBack.parentNode.replaceChild(elBack, btnBack);

    elBack.addEventListener('click', () => this.navigate('table'));
    elEdit.addEventListener('click', () => Editor.openEdit(inc.id));
    elDel.addEventListener('click', async () => {
      if (confirm(I18n.t('common.deleteConfirm'))) {
        await DB.deleteIncident(inc.id);
        this.toast(I18n.t('common.deleted'), 'success');
        await this.navigate('table');
      }
    });
  },

  toast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast toast-${type}`;
    el.style.display = 'block';

    setTimeout(() => {
      el.style.display = 'none';
      el.classList.remove('toast-in');
    }, 3000);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
