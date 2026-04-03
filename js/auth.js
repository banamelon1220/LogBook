/* ========================================
   AUTH - Authentication Module
   ======================================== */
const Auth = {
  currentUser: null,

  async init() {
    // Check for existing session
    const session = DB.getSession();
    if (session) {
      const user = await DB.getUserById(session.userId);
      if (user) {
        this.currentUser = user;
        return true;
      } else {
        DB.clearSession();
      }
    }

    // Check if first run -> show admin password
    if (DB._firstRunPassword) {
      setTimeout(() => {
        const msg = `🔐 Admin account created!\n\nUser ID: admin\nPassword: ${DB._firstRunPassword}\n\nPlease save this password and change it after login.`;
        alert(msg);
        DB._firstRunPassword = null;
      }, 300);
    }

    return false;
  },

  async login(userId, password) {
    let user = null;
    try {
      user = await DB.getUserById(userId);
    } catch (err) {
      console.warn('Login: Failed to fetch user from DB:', err);
    }

    // --- 緊急救援：如果你忘記密碼或帳號不見了，或者資料庫連不上 ---
    // 輸入帳號 'admin' 和密碼 'admin' 會允許登入 (並嘗試建立/更新)
    if (userId === 'admin' && password === 'admin') {
      try {
        if (!user) {
          user = await DB.addUser({
            id: 'admin',
            displayName: 'Admin (Recovered)',
            role: 'admin',
            password: 'admin',
            createdAt: new Date().toISOString()
          });
        } else {
          await DB.updateUser('admin', { password: 'admin' });
          user.password = 'admin';
        }
      } catch (err) {
        console.warn('Login: Failed to write admin to DB, using local session.', err);
        user = {
          id: 'admin',
          displayName: 'Admin (Offline/Local)',
          role: 'admin',
          password: 'admin'
        };
      }
    }

    if (!user) return { success: false, error: 'login.error.invalid' };
    if (user.password !== password) return { success: false, error: 'login.error.invalid' };

    this.currentUser = user;
    DB.setSession(userId);
    return { success: true, user };
  },

  logout() {
    this.currentUser = null;
    DB.clearSession();
  },

  isAdmin() {
    return this.currentUser?.role === 'admin';
  },

  async updateProfile(displayName, newPassword) {
    const updates = {};
    if (displayName) updates.displayName = displayName;
    if (newPassword) updates.password = newPassword;

    const updated = await DB.updateUser(this.currentUser.id, updates);
    if (updated) this.currentUser = updated;
    return updated;
  },

  async createUser(displayName) {
    const newId = await DB.getNextUserId();
    const password = DB.generatePassword();
    const user = {
      id: newId,
      displayName: displayName || `User ${newId}`,
      role: 'user',
      password,
      createdAt: new Date().toISOString()
    };
    await DB.addUser(user);
    return { user, password };
  },

  async resetUserPassword(userId) {
    const newPassword = DB.generatePassword();
    await DB.updateUser(userId, { password: newPassword });
    return newPassword;
  },

  async deleteUser(userId) {
    if (userId === 'admin') return false;
    await DB.deleteUser(userId);
    return true;
  }
};
