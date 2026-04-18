/* ========================================
   ADMIN MODULE
   ======================================== */
const Admin = {
  resetUserId: null,
  newGeneratedPass: null,

  init() {
    this.bindEvents();
    if (App.currentView === 'admin') {
      this.refresh();
    }
  },

  bindEvents() {
    // Open Add User Modal
    document.getElementById('btn-add-user').addEventListener('click', async () => {
      const users = await DB.getUsers();
      let maxId = 0;
      users.forEach(u => {
        if (!isNaN(parseInt(u.id))) {
          maxId = Math.max(maxId, parseInt(u.id));
        }
      });
      const newIdNum = maxId + 1;
      const newIdStr = newIdNum.toString().padStart(3, '0');
      this.newGeneratedPass = DB.generatePassword();

      document.getElementById('user-new-id').value = newIdStr;
      document.getElementById('user-new-name').value = '';
      document.getElementById('user-new-password').value = this.newGeneratedPass;
      
      document.getElementById('user-modal').style.display = 'flex';
    });

    // Close Add User Modal
    document.getElementById('btn-user-cancel').addEventListener('click', () => {
      document.getElementById('user-modal').style.display = 'none';
    });

    // Submit Add User
    document.getElementById('user-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const newIdStr = document.getElementById('user-new-id').value;
      const name = document.getElementById('user-new-name').value;
      const pass = this.newGeneratedPass;

      const newUser = {
        id: newIdStr,
        displayName: name,
        role: 'user',
        password: pass,
        createdAt: new Date().toISOString()
      };

      await DB.addUser(newUser);
      
      document.getElementById('user-modal').style.display = 'none';
      App.toast('User created successfully!', 'success');
      await this.refresh();
    });

    // Copy Password Buttons
    document.getElementById('btn-copy-password').addEventListener('click', () => {
      const pass = document.getElementById('user-new-password').value;
      navigator.clipboard.writeText(pass);
      App.toast('Password copied!', 'success');
    });
    document.getElementById('btn-copy-reset-password').addEventListener('click', () => {
      const pass = document.getElementById('reset-new-password').value;
      navigator.clipboard.writeText(pass);
      App.toast('Password copied!', 'success');
    });

    // Close Reset Modal
    document.getElementById('btn-reset-cancel').addEventListener('click', () => {
      document.getElementById('reset-modal').style.display = 'none';
      this.resetUserId = null;
    });

    // Confirm Reset
    document.getElementById('btn-reset-confirm').addEventListener('click', async () => {
      if (this.resetUserId) {
        const pass = document.getElementById('reset-new-password').value;
        await DB.updateUser(this.resetUserId, { password: pass });
        document.getElementById('reset-modal').style.display = 'none';
        App.toast('Password updated!', 'success');
        this.resetUserId = null;
      }
    });

    // Save Global Settings
    document.getElementById('btn-save-admin-settings').addEventListener('click', async () => {
      const typesText = document.getElementById('admin-types-input').value;
      const tagsText = document.getElementById('admin-tags-input').value;
      const notesText = document.getElementById('admin-notes-input').value;
      const severityNotesText = document.getElementById('admin-severity-notes-input').value;

      const equipmentTypes = typesText.split('\n').map(t => t.trim()).filter(t => t);
      const commonTags = tagsText.split('\n').map(t => t.trim()).filter(t => t);
      const quickNotes = notesText.split('\n').map(t => t.trim()).filter(t => t);
      const severityNotes = severityNotesText.trim();

      await DB.updateSettings({ equipmentTypes, commonTags, quickNotes, severityNotes });
      App.toast(I18n.t('admin.settingsSaved') || 'Configuration saved', 'success');
    });

    // Batch Rename Equipment
    document.getElementById('btn-batch-rename-eq').addEventListener('click', async () => {
      const oldName = document.getElementById('admin-cleanup-old').value.trim();
      const newName = document.getElementById('admin-cleanup-new').value.trim();
      if (!oldName || !newName) {
        App.toast('Please enter both old and new names', 'error');
        return;
      }
      if (!confirm(`Are you sure you want to rename ALL "${oldName}" incidents to "${newName}"?`)) return;

      const btn = document.getElementById('btn-batch-rename-eq');
      btn.textContent = 'Processing...';
      btn.disabled = true;

      try {
        const incidents = await DB.getIncidents();
        let changedCount = 0;
        for (const inc of incidents) {
          if (inc.equipmentType === oldName) {
            await DB.updateIncident(inc.id, { equipmentType: newName });
            changedCount++;
          }
        }
        App.toast(`Successfully updated ${changedCount} incidents.`, 'success');
        document.getElementById('admin-cleanup-old').value = '';
        document.getElementById('admin-cleanup-new').value = '';
      } catch (err) {
        console.error(err);
        App.toast('Error during batch operation', 'error');
      } finally {
        btn.textContent = 'Batch Rename';
        btn.disabled = false;
      }
    });
  },

  async refresh() {
    const list = document.getElementById('users-tbody');
    if (!list) return;
    list.innerHTML = '';
    const users = await DB.getUsers();

    users.forEach(u => {
      const tr = document.createElement('tr');
      const roleStr = u.role === 'admin' ? '<span class="badge badge-high">Admin</span>' : '<span class="badge badge-low">User</span>';
      
      tr.innerHTML = `
        <td>${u.id}</td>
        <td><strong>${Editor.escape(u.displayName)}</strong></td>
        <td>${roleStr}</td>
        <td>${Dashboard.formatDate(u.createdAt)}</td>
        <td>
          ${u.id !== 'admin' ? `
            <button class="btn-icon reset-user-btn" title="Reset Password" data-id="${u.id}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.13 15.57a9 9 0 1 0 3.32-8.59L2.13 8"/></svg></button>
            <button class="btn-icon delete-user-btn" style="color:var(--danger)" title="Delete User" data-id="${u.id}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
          ` : '<span class="text-muted" style="font-size:12px">Protected</span>'}
        </td>
      `;

      if (u.id !== 'admin') {
        tr.querySelector('.reset-user-btn').addEventListener('click', () => {
          this.resetUserId = u.id;
          const pass = DB.generatePassword();
          document.getElementById('reset-info').textContent = `Resetting password for ${u.id} (${u.displayName})`;
          document.getElementById('reset-new-password').value = pass;
          document.getElementById('reset-modal').style.display = 'flex';
        });

        tr.querySelector('.delete-user-btn').addEventListener('click', async () => {
          if(confirm(`Are you sure you want to delete user ${u.id}?`)) {
            await DB.deleteUser(u.id);
            App.toast('User deleted.', 'success');
            await this.refresh();
          }
        });
      }

      list.appendChild(tr);
    });

    // Load Settings
    const settings = await DB.getSettings();
    document.getElementById('admin-types-input').value = (settings.equipmentTypes || []).join('\n');
    document.getElementById('admin-tags-input').value = (settings.commonTags || []).join('\n');
    document.getElementById('admin-notes-input').value = (settings.quickNotes || []).join('\n');
    document.getElementById('admin-severity-notes-input').value = (settings.severityNotes || '');
  }
};
