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
    const user = await DB.getUserById(userId);
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
