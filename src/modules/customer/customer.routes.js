const router = require('express').Router();
const { Joi, pincode, location } = require('../../utils/validators');
const validate = require('../../middleware/validate');
const { protect, authorize } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { ok, created } = require('../../utils/response');
const { userRepo, menuRepo, orderRepo } = require('../../repositories');
const orderService = require('../../services/order.service');
const { ROLES, USER_STATUS, ORDER_STATUS, PLAN_DAYS, PAYMENT_METHOD } = require('../../constants');
const { toPublicUser, pick, planPrices } = require('../../utils/helpers');

router.use(protect, authorize(ROLES.CUSTOMER));

router.put('/profile', validate(Joi.object({
  fullName: Joi.string().trim().min(3).max(80), email: Joi.string().email(),
  address: Joi.string().trim().min(5).max(250), areaName: Joi.string().trim().max(100), pincode, location,
}).min(1)), asyncHandler(async (req, res) =>
  ok(res, toPublicUser(await userRepo.update(req.user.id, req.body)), 'Profile updated')));

// ---------- discover mess in my area ----------
const messCard = (m) => ({
  id: m.id, messName: m.profile?.messName || m.fullName, ownerName: m.fullName, areaName: m.areaName || null,
  address: m.address, pincode: m.pincode, cookingExperienceYears: m.profile?.cookingExperienceYears,
  messStartMonth: m.profile?.messStartMonth, messStartYear: m.profile?.messStartYear, profilePhoto: m.profilePhoto || null,
});

router.get('/messes', validate(Joi.object({ pincode }), 'query'), asyncHandler(async (req, res) => {
  const pin = req.query.pincode || req.user.pincode;
  const list = await userRepo.find({ role: ROLES.MAVSHI, status: USER_STATUS.ACTIVE, pincode: pin }, { limit: 100 });
  ok(res, list.map(messCard), list.length ? 'Messes in your area' : 'No mess available in this area yet', 200, { pincode: pin });
}));

// Menu with day / week / month prices. Delivery charge is NOT included here.
router.get('/messes/:id', asyncHandler(async (req, res) => {
  const m = await userRepo.getById(req.params.id);
  if (!m || m.role !== ROLES.MAVSHI || m.status !== USER_STATUS.ACTIVE) throw new ApiError(404, 'Mess not found');
  const menu = (await menuRepo.find({ mavshiId: m.id, available: true }, { limit: 500 })).map((i) => ({
    id: i.id, name: i.name, description: i.description, mealType: i.mealType, foodType: i.foodType, image: i.image,
    prices: planPrices(i),
  }));
  ok(res, { mess: messCard(m), menu, plans: Object.keys(PLAN_DAYS), note: 'Prices are for food only. Delivery charge is added at checkout.' });
}));

// ---------- orders ----------
const orderSchema = Joi.object({
  mavshiId: Joi.string().required(),
  plan: Joi.string().valid(...Object.keys(PLAN_DAYS)).required(), // DAY | WEEK | MONTH
  items: Joi.array().items(Joi.object({ menuItemId: Joi.string().required(), quantity: Joi.number().integer().min(1).max(20).default(1) })).min(1).max(30).required(),
  startDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).messages({ 'string.pattern.base': 'startDate must be YYYY-MM-DD' }),
  delivery: Joi.object({ address: Joi.string().trim().min(5).max(250), pincode, areaName: Joi.string().trim().max(100), location }),
  paymentMethod: Joi.string().valid(...Object.values(PAYMENT_METHOD)).default(PAYMENT_METHOD.ONLINE),
  notes: Joi.string().trim().max(300).allow(''),
});

router.post('/orders/preview', validate(orderSchema), asyncHandler(async (req, res) => ok(res, await orderService.preview(req.user, req.body), 'Order summary')));
router.post('/orders', validate(orderSchema), asyncHandler(async (req, res) => created(res, await orderService.create(req.user, req.body), 'Order created')));

router.get('/orders', validate(Joi.object({ status: Joi.string().valid(...Object.values(ORDER_STATUS)) }), 'query'),
  asyncHandler(async (req, res) => ok(res, await orderRepo.find({ customerId: req.user.id, ...(req.query.status ? { status: req.query.status } : {}) }))));

router.get('/orders/:id', asyncHandler(async (req, res) => ok(res, await orderService.getOrderFor(req.user, req.params.id))));
router.get('/orders/:id/tracking', asyncHandler(async (req, res) => ok(res, await orderService.tracking(req.user, req.params.id))));
router.post('/orders/:id/cancel', validate(Joi.object({ reason: Joi.string().trim().max(200) })),
  asyncHandler(async (req, res) => ok(res, await orderService.cancelByCustomer(req.user, req.params.id, req.body.reason), 'Order cancelled')));

module.exports = router;
