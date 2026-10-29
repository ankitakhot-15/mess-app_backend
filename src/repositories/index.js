const { db } = require('../config/firebase');
const BaseRepository = require('./BaseRepository');
const ApiError = require('../utils/ApiError');
const { now } = require('../utils/helpers');

class UserRepository extends BaseRepository {
  constructor() { super('users'); }

  findByMobile(mobile) { return this.findOne({ mobile }); }

  /** Creates a user and guarantees the mobile number is unique (transaction on mobile_index). */
  async createUnique(data) {
    const userRef = this.col.doc();
    const idxRef = db.collection('mobile_index').doc(data.mobile);
    const doc = { ...data, createdAt: now(), updatedAt: now() };
    await db.runTransaction(async (t) => {
      const s = await t.get(idxRef);
      if (s.exists) throw new ApiError(409, 'This mobile number is already registered');
      t.set(idxRef, { userId: userRef.id });
      t.set(userRef, doc);
    });
    return { id: userRef.id, ...doc };
  }

  async remove(user) {
    const batch = db.batch();
    batch.delete(this.col.doc(user.id));
    batch.delete(db.collection('mobile_index').doc(user.mobile));
    await batch.commit();
  }
}

module.exports = {
  userRepo: new UserRepository(),
  menuRepo: new BaseRepository('menuItems'),
  orderRepo: new BaseRepository('orders'),
  planRepo: new BaseRepository('plans'),
  notificationRepo: new BaseRepository('notifications'),
  otpRepo: new BaseRepository('otps'),
  settingsRepo: new BaseRepository('settings'),
  broadcastRepo: new BaseRepository('broadcasts'),
};
