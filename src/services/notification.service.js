const { messaging } = require("../config/firebase");
const { userRepo, notificationRepo } = require("../repositories");
const { ROLES, USER_STATUS, NOTIFICATION_TYPE } = require("../constants");
const logger = require("../utils/logger");

// Must match the channel created in the Flutter app (MainActivity.kt) and AndroidManifest.xml
const ANDROID_CHANNEL_ID = "mess_alerts_v1";

// FCM "data" values must be strings; skip null/undefined.
const stringify = (obj) =>
  Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
  );

const DEAD_TOKEN_CODES = [
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
];

/** Sends one FCM push. Returns true if FCM accepted it. Never throws. */
async function sendPush(user, { title, body, type, data }) {
  if (!user.fcmToken) return false;
  try {
    await messaging.send({
      token: user.fcmToken,
      notification: { title, body },
      data: stringify({ type, ...data }),
      android: {
        priority: "high", // wake the phone immediately
        ttl: 24 * 60 * 60 * 1000, // keep for 24h if phone is offline
        notification: {
          channelId: ANDROID_CHANNEL_ID, // high-importance channel => sound + vibration + heads-up
          sound: "default",
          defaultVibrateTimings: true, // vibration for Android 7 and below
          priority: "high",
          visibility: "public",
        },
      },
      apns: {
        headers: { "apns-priority": "10" },
        payload: { aps: { sound: "default" } },
      },
    });
    return true;
  } catch (e) {
    logger.warn("FCM failed:", e.code || e.message);
    if (DEAD_TOKEN_CODES.includes(e.code))
      await userRepo.update(user.id, { fcmToken: null });
    return false;
  }
}

/** Saves the in-app notification AND sends the push. Never throws. */
async function notifyDetailed(
  userId,
  { title, body, type = NOTIFICATION_TYPE.GENERAL, data = {} },
) {
  try {
    const notification = await notificationRepo.create({
      userId,
      title,
      body,
      type,
      data,
      read: false,
    });
    const user = await userRepo.getById(userId);
    const pushed = user
      ? await sendPush(user, { title, body, type, data })
      : false;
    return { notification, pushed };
  } catch (e) {
    logger.warn("notify failed:", e.message);
    return { notification: null, pushed: false };
  }
}

/** Same as before: returns the saved in-app notification (or null). */
async function notify(userId, payload) {
  return (await notifyDetailed(userId, payload)).notification;
}

async function notifyRole(role, payload) {
  const users = await userRepo.find(
    { role, status: USER_STATUS.ACTIVE },
    { limit: 200 },
  );
  return Promise.all(users.map((u) => notify(u.id, payload)));
}

const notifyAdmins = (payload) => notifyRole(ROLES.ADMIN, payload);

/**
 * Admin broadcast: one user, one role (CUSTOMER / MAVSHI / DELIVERY), or everyone (blocked users skipped).
 * Returns { recipients, pushed } -> recipients = users who got the in-app notification,
 * pushed = phones FCM accepted the push for (users who never logged in on a phone have no token).
 */
async function broadcast({ userId, role, title, body, data = {} }) {
  let targets;
  if (userId) {
    const u = await userRepo.getById(userId);
    targets = u ? [u] : [];
  } else {
    const filters = role ? { role } : {};
    targets = (await userRepo.find(filters, { limit: 1000 })).filter(
      (u) => u.status !== USER_STATUS.BLOCKED,
    );
  }
  const type = NOTIFICATION_TYPE.ANNOUNCEMENT;
  const results = await Promise.all(
    targets.map((u) => notifyDetailed(u.id, { title, body, type, data })),
  );
  return {
    recipients: targets.length,
    pushed: results.filter((r) => r.pushed).length,
  };
}

module.exports = { notify, notifyRole, notifyAdmins, broadcast };
