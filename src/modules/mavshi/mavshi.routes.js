const router = require('express').Router();
const { Joi, pincode } = require('../../utils/validators');
const validate = require('../../middleware/validate');
const upload = require('../../middleware/upload');
const { protect, authorize, requireApprovedMavshi } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { ok, created } = require('../../utils/response');
const { userRepo, menuRepo, orderRepo } = require('../../repositories');
const { menuPricing } = require('../auth/auth.validation');
const { uploadImage, deleteImage } = require('../../services/cloudinary.service');
const { notifyAdmins } = require('../../services/notification.service');
const orderService = require('../../services/order.service');
const { ROLES, USER_STATUS, ORDER_STATUS, NOTIFICATION_TYPE } = require('../../constants');
const { toPublicUser, pick } = require('../../utils/helpers');

router.use(protect, authorize(ROLES.MAVSHI));

// Works even while PENDING / REJECTED so the app can show the admin's message
router.get('/status', asyncHandler(async (req, res) => {
  const u = req.user;
  ok(res, { status: u.status, rejectionReason: u.rejectionReason, subscription: u.subscription, user: toPublicUser(u) });
}));

const profileSchema = Joi.object({
  fullName: Joi.string().trim().min(3).max(80),
  address: Joi.string().trim().min(5).max(250),
  areaName: Joi.string().trim().max(100),
  pincode,
  messName: Joi.string().trim().max(100),
  cookingExperienceYears: Joi.number().min(0).max(70),
  messStartMonth: Joi.number().integer().min(1).max(12),
  messStartYear: Joi.number().integer().min(1980).max(new Date().getFullYear()),
}).min(1);

// Update details. A REJECTED mavshi who edits & saves is re-submitted for review.
router.put('/profile', validate(profileSchema), asyncHandler(async (req, res) => {
  const u = req.user;
  const patch = {
    ...pick(req.body, ['fullName', 'address', 'areaName', 'pincode']),
    profile: { ...u.profile, ...pick(req.body, ['messName', 'cookingExperienceYears', 'messStartMonth', 'messStartYear']) },
  };
  if (u.status === USER_STATUS.REJECTED) {
    patch.status = USER_STATUS.PENDING;
    await notifyAdmins({ title: 'Mavshi re-submitted request', body: `${u.fullName} updated details after rejection.`, type: NOTIFICATION_TYPE.MAVSHI_REQUEST, data: { mavshiId: u.id } });
  }
  ok(res, toPublicUser(await userRepo.update(u.id, patch)), 'Profile updated');
}));

// ---------- menu & pricing ----------
router.get('/menu', asyncHandler(async (req, res) => ok(res, await menuRepo.find({ mavshiId: req.user.id }, { limit: 500 }))));

const own = async (req) => {
  const m = await menuRepo.getById(req.params.id);
  if (!m || m.mavshiId !== req.user.id) throw new ApiError(404, 'Menu item not found');
  return m;
};

router.post('/menu', requireApprovedMavshi, validate(menuPricing), asyncHandler(async (req, res) =>
  created(res, await menuRepo.create({ ...req.body, mavshiId: req.user.id, available: true, image: null }, undefined), 'Menu item added')));

router.put('/menu/:id', requireApprovedMavshi,
  validate(menuPricing.fork(['name', 'mealType', 'price'], (s) => s.optional()).keys({ available: Joi.boolean() }).min(1)),
  asyncHandler(async (req, res) => { await own(req); ok(res, await menuRepo.update(req.params.id, req.body), 'Menu item updated'); }));

router.delete('/menu/:id', requireApprovedMavshi, asyncHandler(async (req, res) => {
  const m = await own(req);
  await deleteImage(m.imageId);
  await menuRepo.delete(m.id);
  ok(res, null, 'Menu item deleted');
}));

router.post('/menu/:id/image', requireApprovedMavshi, upload.single('image'), asyncHandler(async (req, res) => {
  const m = await own(req);
  const img = await uploadImage(req.file, 'menu');
  await deleteImage(m.imageId);
  ok(res, await menuRepo.update(m.id, { image: img.url, imageId: img.publicId }), 'Image uploaded');
}));

// ---------- orders ----------
router.get('/orders', requireApprovedMavshi, validate(Joi.object({ status: Joi.string().valid(...Object.values(ORDER_STATUS)) }), 'query'),
  asyncHandler(async (req, res) => {
    const rows = await orderRepo.find({ mavshiId: req.user.id, ...(req.query.status ? { status: req.query.status } : {}) });
    // mavshi only sees orders admin has accepted (not pending / rejected ones)
    const visible = rows.filter((o) => ![ORDER_STATUS.PAYMENT_PENDING, ORDER_STATUS.PLACED, ORDER_STATUS.REJECTED, ORDER_STATUS.CANCELLED].includes(o.status));
    ok(res, visible);
  }));

router.patch('/orders/:id/status', requireApprovedMavshi,
  validate(Joi.object({ status: Joi.string().valid(ORDER_STATUS.PREPARING, ORDER_STATUS.READY).required() })),
  asyncHandler(async (req, res) => ok(res, await orderService.mavshiSetStatus(req.user, req.params.id, req.body.status), 'Order updated')));

module.exports = router;
