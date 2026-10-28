const { db } = require('../config/firebase');
const { now } = require('../utils/helpers');

/**
 * Generic Firestore repository shared by every collection.
 * filters: { field: value }  OR  [[field, op, value], ...]
 */
class BaseRepository {
  constructor(name) {
    this.name = name;
    this.col = db.collection(name);
  }

  newId() { return this.col.doc().id; }

  query(filters = {}) {
    const list = Array.isArray(filters) ? filters : Object.entries(filters).map(([k, v]) => [k, '==', v]);
    let q = this.col;
    for (const [f, op, v] of list) if (v !== undefined) q = q.where(f, op, v);
    return q;
  }

  async create(data, id) {
    const ref = id ? this.col.doc(id) : this.col.doc();
    const doc = { ...data, createdAt: now(), updatedAt: now() };
    await ref.set(doc);
    return { id: ref.id, ...doc };
  }

  async getById(id) {
    if (!id) return null;
    const snap = await this.col.doc(id).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  }

  async update(id, data) {
    await this.col.doc(id).update({ ...data, updatedAt: now() });
    return this.getById(id);
  }

  async delete(id) { await this.col.doc(id).delete(); }

  // Sorted in memory (newest first by default) so no composite indexes are needed.
  async find(filters = {}, { limit = 500, sort = 'createdAt', order = 'desc' } = {}) {
    const snap = await this.query(filters).limit(limit).get();
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const dir = order === 'desc' ? -1 : 1;
    return rows.sort((a, b) => dir * String(a[sort] || '').localeCompare(String(b[sort] || '')));
  }

  async findOne(filters) {
    const snap = await this.query(filters).limit(1).get();
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  }

  async count(filters = {}) {
    const snap = await this.query(filters).count().get();
    return snap.data().count;
  }
}

module.exports = BaseRepository;
