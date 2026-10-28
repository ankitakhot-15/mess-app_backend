const router = require('express').Router();
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const { userRepo } = require('../../repositories');
const { ROLES, USER_STATUS } = require('../../constants');

/** Pincodes where an approved mess exists (used by delivery boy registration & customer area picker). */
router.get('/service-areas', asyncHandler(async (req, res) => {
  const messes = await userRepo.find({ role: ROLES.MAVSHI, status: USER_STATUS.ACTIVE }, { limit: 1000 });
  const map = {};
  messes.forEach((m) => {
    map[m.pincode] = map[m.pincode] || { pincode: m.pincode, areas: new Set(), messCount: 0 };
    if (m.areaName) map[m.pincode].areas.add(m.areaName);
    map[m.pincode].messCount += 1;
  });
  ok(res, Object.values(map).map((a) => ({ ...a, areas: [...a.areas] })));
}));

module.exports = router;
