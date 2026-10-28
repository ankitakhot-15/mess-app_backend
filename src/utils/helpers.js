const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const now = () => new Date().toISOString();
const todayIST = () => new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
const addDays = (yyyyMmDd, days) => {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const pick = (obj, keys) =>
  keys.reduce((acc, k) => (obj[k] !== undefined ? { ...acc, [k]: obj[k] } : acc), {});

const toPublicUser = (u) => {
  if (!u) return u;
  const { passwordHash, fcmToken, ...rest } = u;
  return rest;
};

const paginate = (rows, page = 1, limit = 20) => {
  const start = (page - 1) * limit;
  return {
    rows: rows.slice(start, start + limit),
    meta: { page, limit, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / limit)) },
  };
};

const orderNumber = () => `MESS-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`;

// price of one menu item for a plan (DAY / WEEK / MONTH)
const planPrice = (item, plan) => {
  if (plan === 'WEEK') return item.weeklyPrice ?? round2(item.price * 7);
  if (plan === 'MONTH') return item.monthlyPrice ?? round2(item.price * 30);
  return item.price;
};
const planPrices = (item) => ({ DAY: planPrice(item, 'DAY'), WEEK: planPrice(item, 'WEEK'), MONTH: planPrice(item, 'MONTH') });

module.exports = { now, todayIST, addDays, round2, pick, toPublicUser, paginate, orderNumber, planPrice, planPrices };
