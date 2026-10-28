const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { ok } = require('../../utils/response');
const { notificationRepo } = require('../../repositories');

router.use(protect);

router.get('/', asyncHandler(async (req, res) => {
  const rows = await notificationRepo.find({ userId: req.user.id }, { limit: 100 });
  ok(res, rows, 'Notifications', 200, { unread: rows.filter((n) => !n.read).length });
}));

router.patch('/read-all', asyncHandler(async (req, res) => {
  const rows = await notificationRepo.find({ userId: req.user.id, read: false }, { limit: 200 });
  await Promise.all(rows.map((n) => notificationRepo.update(n.id, { read: true })));
  ok(res, null, 'All marked as read');
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  const n = await notificationRepo.getById(req.params.id);
  if (!n || n.userId !== req.user.id) throw new ApiError(404, 'Notification not found');
  ok(res, await notificationRepo.update(n.id, { read: true }));
}));

module.exports = router;
