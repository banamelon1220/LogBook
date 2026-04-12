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

    // Migration: Move existing floorPlanBase64 to a map record
    const settings = await this.getSettings();
    if (settings.floorPlanBase64) {
      const maps = await this.getMaps();
      if (maps.length === 0) {
        console.log('Migrating existing floor plan to Maps collection...');
        await this.addMap('Default Map', settings.floorPlanBase64);
        await firestore.collection('settings').doc('general').update({
          floorPlanBase64: firebase.firestore.FieldValue.delete()
        });
      }
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
    // Create default settings if none exist
    if (!settings.equipmentTypes || !settings.commonTags) {
      await this.updateSettings({
        equipmentTypes: settings.equipmentTypes || ['Conveyor', 'Sensor', 'PLC', 'Freezer', 'Other'],
        commonTags: settings.commonTags || ['jam', 'motor', 'belt', 'electrical', 'mechanical', 'operator error']
      });
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
    firestore.collection('incidents').doc(incident.id).set(incident).catch(e => console.warn('Offline add', e));
    return incident;
  },

  async updateIncident(id, updates) {
    updates.updatedAt = new Date().toISOString();
    firestore.collection('incidents').doc(id).update(updates).catch(e => console.warn('Offline update', e));
    return;
  },

  async deleteIncident(id) {
    // Delete associated media first
    await this.deleteMediaForIncident(id);
    await firestore.collection('incidents').doc(id).delete();
  },
  // --- Zones ---
  async getZones(mapId = null) {
    let query = firestore.collection('zones');
    if (mapId) {
      query = query.where('mapId', '==', mapId);
    }
    const snap = await query.get();
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

  // --- Maps ---
  async getMaps() {
    const snap = await firestore.collection('maps').orderBy('order', 'asc').get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async addMap(name, base64Image) {
    const id = this.uuid();
    const filePath = `maps/${id}.jpg`;
    const url = await this._uploadBase64(filePath, base64Image);
    const maps = await this.getMaps();
    
    const mapData = {
      id,
      name,
      url,
      filePath,
      order: maps.length,
      createdAt: new Date().toISOString()
    };

    await firestore.collection('maps').doc(id).set(mapData);
    return mapData;
  },

  async updateMap(id, updates) {
    await firestore.collection('maps').doc(id).update(updates);
  },

  async deleteMap(id) {
    const doc = await firestore.collection('maps').doc(id).get();
    if (doc.exists) {
      const data = doc.data();
      if (data.filePath) {
        try {
          await storage.ref().child(data.filePath).delete();
        } catch(e) { console.error('Failed deleting map file', e); }
      }
      // Unlink zones from this map
      const zones = await this.getZones(id);
      const batch = firestore.batch();
      zones.forEach(z => {
        batch.update(firestore.collection('zones').doc(z.id), { mapId: null });
      });
      await batch.commit();

      await firestore.collection('maps').doc(id).delete();
    }
  },

  // Deprecated: replaced by Maps collection
  async getFloorPlan() {
    const maps = await this.getMaps();
    return maps.length > 0 ? maps[0].url : null;
  },

  async saveFloorPlan(base64Image) {
    // For backwards compatibility, update the first map or create one
    const maps = await this.getMaps();
    if (maps.length > 0) {
      const filePath = `maps/${maps[0].id}.jpg`;
      const url = await this._uploadBase64(filePath, base64Image);
      await this.updateMap(maps[0].id, { url, filePath });
    } else {
      await this.addMap('Default Map', base64Image);
    }
  },

  // --- Settings (Equipment Types / Common Tags) ---
  async getSettings() {
    const doc = await firestore.collection('settings').doc('general').get();
    if (doc.exists) return doc.data();
    return {};
  },

  async updateSettings(updates) {
    await firestore.collection('settings').doc('general').set(updates, { merge: true });
    return this.getSettings();
  },

  // Helper
  async _uploadBase64(path, base64Str) {
    try {
      const ref = storage.ref().child(path);
      await ref.putString(base64Str, 'data_url');
      return await ref.getDownloadURL();
    } catch (err) {
      console.error('Firebase Storage Upload Error:', err.code, err.message);
      if (err.code === 'storage/unauthorized') {
        console.warn('Check your Firebase Storage Security Rules! They might be blocking writes.');
      }
      throw err;
    }
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
    const mediaId = this.uuid();
    const filePath = `incidents/${incidentId}/${mediaId}_${fileData.name}`;

    const item = {
      id: mediaId,
      name: fileData.name,
      type: fileData.type,
      dataUrl: fileData.dataUrl,
      filePath: filePath
    };

    // Save to Firestore first (offline cache)
    firestore.collection('incidents').doc(incidentId).collection('media').doc(mediaId).set(item).catch(e => console.warn('Offline media link', e));

    // Upload in background to avoid blocking the UI offline
    this._uploadBase64(filePath, fileData.dataUrl).then(url => {
      firestore.collection('incidents').doc(incidentId).collection('media').doc(mediaId).update({ dataUrl: url });
    }).catch(e => console.warn('Media upload background fail', e));

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

  // --- Reference Guide ---
  async getGuides() {
    const snap = await firestore.collection('guides').orderBy('createdAt', 'desc').get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async addGuide(entry) {
    const id = this.uuid();
    let imageUrl = '';
    let filePath = '';

    if (entry.imageDataUrl) {
      filePath = `guides/${id}.jpg`;
      imageUrl = await this._uploadBase64(filePath, entry.imageDataUrl);
    }

    const data = {
      id,
      title: entry.title,
      description: entry.description || '',
      category: entry.category || '',
      imageUrl,
      filePath,
      createdAt: new Date().toISOString()
    };

    await firestore.collection('guides').doc(id).set(data);
    return data;
  },

  async updateGuide(id, updates) {
    if (updates.imageDataUrl) {
      const filePath = `guides/${id}.jpg`;
      const imageUrl = await this._uploadBase64(filePath, updates.imageDataUrl);
      updates.imageUrl = imageUrl;
      updates.filePath = filePath;
      delete updates.imageDataUrl;
    }
    updates.updatedAt = new Date().toISOString();
    await firestore.collection('guides').doc(id).update(updates);
  },

  async deleteGuide(id) {
    const doc = await firestore.collection('guides').doc(id).get();
    if (doc.exists) {
      const data = doc.data();
      if (data.filePath) {
        try { await storage.ref().child(data.filePath).delete(); }
        catch(e) { console.warn('Failed to delete guide image', e); }
      }
      await firestore.collection('guides').doc(id).delete();
    }
  },

  // When a zone is renamed, update all guide entries using it as category
  async updateGuideCategoriesForZoneRename(oldName, newName) {
    const guides = await this.getGuides();
    const batch = firestore.batch();
    guides.forEach(g => {
      if (g.category === oldName) {
        batch.update(firestore.collection('guides').doc(g.id), { category: newName });
      }
    });
    await batch.commit();
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
