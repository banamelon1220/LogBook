/* ========================================
   DB - Firebase Data Layer
   ======================================== */
const DB = {
  // --- Helpers ---
  uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
  },

  generatePassword() {
    return String(Math.floor(10000000 + Math.random() * 90000000));
  },

  async getNextUserId() {
    const users = await this.getUsers();
    const numbered = users
      .filter(u => /^\d+$/.test(u.id))
      .map(u => parseInt(u.id));
    const max = numbered.length > 0 ? Math.max(...numbered) : 0;
    return String(max + 1).padStart(3, '0');
  },

  // --- Init ---
  async init() {
    // Create admin if no users exist
    const users = await this.getUsers();
    if (users.length === 0) {
      const adminPass = this.generatePassword();
      await this.addUser({
        id: 'admin',
        displayName: 'Jack',
        role: 'admin',
        password: adminPass,
        createdAt: new Date().toISOString()
      });
      // Store the password temporarily in memory to show on first login screen
      this._firstRunPassword = adminPass;
    }

    // Create default zones if none exist
    const zones = await this.getZones();
    if (zones.length === 0) {
      await Promise.all([
        this.addZone({ id: this.uuid(), name: 'Line A', color: '#0ea5e9', order: 0 }),
        this.addZone({ id: this.uuid(), name: 'Line B', color: '#f59e0b', order: 1 }),
        this.addZone({ id: this.uuid(), name: 'Freezer Room', color: '#8b5cf6', order: 2 })
      ]);
    }
  },

  // --- Users ---
  async getUsers() {
    const snap = await firestore.collection('users').get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async saveUsers(users) {
    const batch = firestore.batch();
    users.forEach(u => {
      const ref = firestore.collection('users').doc(u.id);
      batch.set(ref, u);
    });
    await batch.commit();
  },

  async getUserById(id) {
    const doc = await firestore.collection('users').doc(id).get();
    if (doc.exists) return { id: doc.id, ...doc.data() };
    return null;
  },

  async addUser(user) {
    const id = user.id || this.uuid();
    user.id = id;
    await firestore.collection('users').doc(id).set(user);
    return user;
  },

  async updateUser(id, updates) {
    await firestore.collection('users').doc(id).update(updates);
    return this.getUserById(id);
  },

  async deleteUser(id) {
    await firestore.collection('users').doc(id).delete();
  },

  // --- Sessions (Remains synchronous via localStorage) ---
  getSession() {
    const session = localStorage.getItem('olb_session');
    if (!session) return null;
    return JSON.parse(session);
  },

  setSession(userId) {
    localStorage.setItem('olb_session', JSON.stringify({
      userId,
      timestamp: Date.now()
    }));
  },

  clearSession() {
    localStorage.removeItem('olb_session');
  },

  // --- Incidents ---
  async getIncidents() {
    // Adding ordered query by createdAt (or similar timestamp) if needed later
    const snap = await firestore.collection('incidents').get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async saveIncidents(incidents) {
    const batch = firestore.batch();
    incidents.forEach(inc => {
      const ref = firestore.collection('incidents').doc(inc.id);
      batch.set(ref, inc);
    });
    await batch.commit();
  },

  async getIncidentById(id) {
    const doc = await firestore.collection('incidents').doc(id).get();
    if (doc.exists) return { id: doc.id, ...doc.data() };
    return null;
  },

  async addIncident(incident) {
    incident.id = incident.id || this.uuid();
    incident.createdAt = incident.createdAt || new Date().toISOString();
    await firestore.collection('incidents').doc(incident.id).set(incident);
    return incident;
  },

  async updateIncident(id, updates) {
    updates.updatedAt = new Date().toISOString();
    await firestore.collection('incidents').doc(id).update(updates);
    return this.getIncidentById(id);
  },

  async deleteIncident(id) {
    // Delete associated media first
    await this.deleteMediaForIncident(id);
    await firestore.collection('incidents').doc(id).delete();
  },

  // --- Zones ---
  async getZones() {
    const snap = await firestore.collection('zones').get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async saveZones(zones) {
    const batch = firestore.batch();
    zones.forEach(z => {
      const ref = firestore.collection('zones').doc(z.id);
      batch.set(ref, z);
    });
    await batch.commit();
  },

  async addZone(zone) {
    zone.id = zone.id || this.uuid();
    zone.order = zone.order !== undefined ? zone.order : (await this.getZones()).length;
    await firestore.collection('zones').doc(zone.id).set(zone);
    return zone;
  },

  async updateZone(id, updates) {
    await firestore.collection('zones').doc(id).update(updates);
  },

  async deleteZone(id) {
    const doc = await firestore.collection('zones').doc(id).get();
    if (doc.exists) {
      const zoneData = doc.data();
      // Cascade delete: remove this zone name from incidents
      const incidents = await this.getIncidents();
      const batch = firestore.batch();
      incidents.forEach(inc => {
        if (inc.zone === zoneData.name) {
          batch.update(firestore.collection('incidents').doc(inc.id), { zone: '' });
        }
      });
      await batch.commit();
    }
    await firestore.collection('zones').doc(id).delete();
  },

  // --- Floor Plan ---
  async getFloorPlan() {
    const doc = await firestore.collection('settings').doc('general').get();
    if (doc.exists && doc.data().floorPlanUrl) {
      return doc.data().floorPlanUrl;
    }
    return null;
  },

  async saveFloorPlan(base64Image) {
    if (base64Image) {
      const url = await this._uploadBase64('floorplan/current_map.jpg', base64Image);
      await firestore.collection('settings').doc('general').set({ floorPlanUrl: url }, { merge: true });
    } else {
      await firestore.collection('settings').doc('general').set({ floorPlanUrl: null }, { merge: true });
    }
  },

  // Helper
  async _uploadBase64(path, base64Str) {
    const ref = storage.ref().child(path);
    await ref.putString(base64Str, 'data_url');
    return await ref.getDownloadURL();
  },

  // --- Media (Images / Videos) ---
  async getMedia() {
    // Stub for UI compatibility if needed
    return {};
  },

  async saveMedia(mediaDict) {
    // Stub for export/import
  },

  async addMediaItem(incidentId, fileData) {
    // fileData = { name, type, dataUrl }
    const mediaId = this.uuid();
    const filePath = `incidents/${incidentId}/${mediaId}_${fileData.name}`;
    const url = await this._uploadBase64(filePath, fileData.dataUrl);
    
    // We store the remote url as 'dataUrl' to maintain backwards compatibility with the UI
    const item = {
      id: mediaId,
      name: fileData.name,
      type: fileData.type,
      dataUrl: url,
      filePath: filePath
    };

    await firestore.collection('incidents').doc(incidentId).collection('media').doc(mediaId).set(item);
    return item;
  },

  async getMediaForIncident(incidentId) {
    const snap = await firestore.collection('incidents').doc(incidentId).collection('media').get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async removeMediaItem(incidentId, mediaId) {
    const ref = firestore.collection('incidents').doc(incidentId).collection('media').doc(mediaId);
    const doc = await ref.get();
    if (doc.exists) {
      const data = doc.data();
      if (data.filePath) {
        try {
          await storage.ref().child(data.filePath).delete();
        } catch(e) { console.error('Failed deleting media file', e); }
      }
      await ref.delete();
    }
  },

  async deleteMediaForIncident(incidentId) {
    const mediaList = await this.getMediaForIncident(incidentId);
    for (const item of mediaList) {
      await this.removeMediaItem(incidentId, item.id);
    }
  },

  // --- Export / Import ---
  async exportAll() {
    return JSON.stringify({
      version: 2,
      exportedAt: new Date().toISOString(),
      users: await this.getUsers(),
      incidents: await this.getIncidents(),
      zones: await this.getZones()
    }, null, 2);
  },

  async importAll(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      if (!data.version || !data.incidents) throw new Error('Invalid format');
      if (data.users && data.users.length > 0) await this.saveUsers(data.users);
      if (data.incidents && data.incidents.length > 0) await this.saveIncidents(data.incidents);
      if (data.zones && data.zones.length > 0) await this.saveZones(data.zones);
      return true;
    } catch (e) {
      console.error('Import error:', e);
      return false;
    }
  }
};
