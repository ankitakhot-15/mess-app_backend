const { settingsRepo } = require('../repositories');

const DEFAULTS = {
  deliveryCharge: 20, // only admin can change
  baseDeliveryMinutes: 25,
  trafficExtraMinutes: { NORMAL: 0, MODERATE: 10, HEAVY: 20 },
  currency: 'INR',
};

exports.get = async () => {
  const s = await settingsRepo.getById('global');
  if (!s) return settingsRepo.create(DEFAULTS, 'global');
  return { ...DEFAULTS, ...s, trafficExtraMinutes: { ...DEFAULTS.trafficExtraMinutes, ...(s.trafficExtraMinutes || {}) } };
};

exports.update = async (patch) => {
  await exports.get();
  return settingsRepo.update('global', patch);
};

exports.DEFAULTS = DEFAULTS;
