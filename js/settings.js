/* ========================================
   SETTINGS MODULE
   ======================================== */
const Settings = {
  init() {
    this.bindEvents();
    this.applyPreferences();
  },

  bindEvents() {
    // Save Profile
    const btnProfile = document.getElementById('btn-save-profile');
    if(btnProfile) {
      btnProfile.addEventListener('click', async () => {
        const name = document.getElementById('settings-display-name').value;
        const pass = document.getElementById('settings-new-password').value;
        const updates = { displayName: name };
        if (pass) updates.password = pass;
        
        await DB.updateUser(Auth.currentUser.id, updates);
        
        Auth.currentUser.displayName = name;
        if (pass) Auth.currentUser.password = pass;
        App.updateUserContext();
        App.toast(I18n.t('settings.saved', 'Profile saved!'), 'success');
        document.getElementById('settings-new-password').value = '';
      });
    }

    // Theme toggle
    document.getElementById('settings-theme').addEventListener('change', (e) => {
      const theme = e.target.value;
      localStorage.setItem('olb_theme', theme);
      this.applyTheme(theme);
    });

    // Language toggle
    document.getElementById('settings-language').addEventListener('change', async (e) => {
      const lang = e.target.value;
      localStorage.setItem('olb_lang', lang);
      I18n.currentLang = lang;
      I18n.apply();
      // Force refresh current view to update dynamically injected strings
      if (App.currentView === 'dashboard') await Dashboard.refresh();
      if (App.currentView === 'table') await TableView.refresh();
      if (App.currentView === 'zones') await Zones.refresh();
    });

    // Export Data
    document.getElementById('btn-export').addEventListener('click', async () => {
      const btn = document.getElementById('btn-export');
      btn.textContent = 'Exporting...';
      btn.disabled = true;

      try {
        const data = {
          users: await DB.getUsers(),
          zones: await DB.getZones(),
          incidents: await DB.getIncidents(),
          floorplan: await DB.getFloorPlan()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `factory-logbook-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } finally {
        btn.textContent = I18n.t('settings.export') || 'Export JSON';
        btn.disabled = false;
      }
    });

    // Import Data
    document.getElementById('btn-import').addEventListener('click', () => {
      if(confirm('Warning: Importing will overwrite data (if conflicting)! Proceed?')) {
        document.getElementById('import-file').click();
      }
    });

    document.getElementById('import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const parsed = JSON.parse(ev.target.result);
          if (parsed.users) await DB.saveUsers(parsed.users);
          if (parsed.zones) await DB.saveZones(parsed.zones);
          if (parsed.incidents) await DB.saveIncidents(parsed.incidents);
          if (parsed.floorplan) await DB.saveFloorPlan(parsed.floorplan);
          
          App.toast('Data imported successfully!', 'success');
          setTimeout(() => window.location.reload(), 1500);
        } catch(err) {
          App.toast('Failed to parse or import JSON file.', 'error');
        }
      };
      reader.readAsText(file);
    });
  },

  applyPreferences() {
    // Theme
    let theme = localStorage.getItem('olb_theme') || 'dark';
    document.getElementById('settings-theme').value = theme;
    this.applyTheme(theme);

    // Language
    let lang = localStorage.getItem('olb_lang') || 'en';
    document.getElementById('settings-language').value = lang;

    // Profile Settings
    if (Auth.currentUser) {
      document.getElementById('settings-display-name').value = Auth.currentUser.displayName;
    }
  },

  applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }
};
