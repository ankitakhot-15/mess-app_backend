const { messaging } = require('../config/firebase');
const { userRepo, notificationRepo } = require('../repositories');
const { ROLES, USER_STATUS, NOTIFICATION_TYPE } = require('../constants');
const logger = require('../utils/logger');

const stringify = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v)]));

async function sendPush(user, { title, body, type, data }) {
  try {
    await messaging.send({
      token: user.fcmToken,
      notification: { title, body },
      data: stringify({ type, ...data }),
      android: { priority: 'high', notification: { sound: 'default' } },
    });
  } catch (e) {
    logger.warn('FCM failed:', e.code || e.message);
    if (e.code === 'messaging/registration-token-not-registered') await userRepo.update(user.id, { fcmToken: null });
  }
}

/** Saves an in-app notification AND sends a push if the user has an FCM token. Never throws. */
async function notify(userId, { title, body, type = NOTIFICATION_TYPE.GENERAL, data = {} }) {
  try {
    const n = await notificationRepo.create({ userId, title, body, type, data, read: false });
    const user = await userRepo.getById(userId);
    if (user && user.fcmToken) await sendPush(user, { title, body, type, data });
    return n;
  } catch (e) {
    logger.warn('notify failed:', e.message);
    return null;
  }
}

async function notifyRole(role, payload) {
  const users = await userRepo.find({ role, status: USER_STATUS.ACTIVE }, { limit: 200 });
  return Promise.all(users.map((u) => notify(u.id, payload)));
}

const notifyAdmins = (payload) => notifyRole(ROLES.ADMIN, payload);

module.exports = { notify, notifyRole, notifyAdmins };
