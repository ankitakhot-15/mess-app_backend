/** Creates the first admin, default settings and sample mavshi plans. Run once: npm run seed */
const bcrypt = require('bcryptjs');
const env = require('../src/config/env');
const { userRepo, planRepo } = require('../src/repositories');
const settings = require('../src/services/settings.service');
const { ROLES, USER_STATUS } = require('../src/constants');

(async () => {
  if (!env.admin.mobile || !env.admin.password) throw new Error('Set ADMIN_MOBILE and ADMIN_PASSWORD in .env');
  if (!(await userRepo.findByMobile(env.admin.mobile))) {
    await userRepo.createUnique({
      role: ROLES.ADMIN, status: USER_STATUS.ACTIVE, fullName: env.admin.name, mobile: env.admin.mobile,
      passwordHash: await bcrypt.hash(env.admin.password, 10), profile: {}, fcmToken: null,
    });
    console.log('Admin created:', env.admin.mobile);
  } else console.log('Admin already exists');

  await settings.get();
  if ((await planRepo.find({}, { limit: 1 })).length === 0) {
    await planRepo.create({ name: 'Free Trial (30 days)', description: 'Starter plan', durationDays: 30, fee: 0, active: true });
    await planRepo.create({ name: 'Standard (90 days)', description: 'Quarterly plan', durationDays: 90, fee: 499, active: true });
    await planRepo.create({ name: 'Premium (365 days)', description: 'Yearly plan', durationDays: 365, fee: 1499, active: true });
    console.log('Sample plans created');
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
