const router = require('express').Router();
const { Joi, location } = require('../../utils/validators');
const validate = require('../../middleware/validate');
const { protect, authorize } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const { userRepo, orderRepo } = require('../../repositories');
const orderService = require('../../services/order.service');
const { ROLES, TRAFFIC } = require('../../constants');

router.use(protect, authorize(ROLES.DELIVERY));

router.get('/orders', validate(Joi.object({ type: Joi.string().valid('active', 'history').default('active') }), 'query'),
  asyncHandler(async (req, res) => {
    const rows = await orderRepo.find({ deliveryBoyId: req.user.id });
    const active = orderService.ACTIVE_FOR_DELIVERY;
    ok(res, rows.filter((o) => (req.query.type === 'active' ? active.includes(o.status) : o.status === 'DELIVERED')));
  }));

router.get('/orders/:id', asyncHandler(async (req, res) => ok(res, await orderService.getOrderFor(req.user, req.params.id))));
router.patch('/orders/:id/pickup', asyncHandler(async (req, res) => ok(res, await orderService.pickup(req.user, req.params.id), 'Marked out for delivery')));
router.patch('/orders/:id/deliver', asyncHandler(async (req, res) => ok(res, await orderService.deliver(req.user, req.params.id), 'Order delivered')));

// Heavy traffic etc. -> recalculates ETA and notifies the customer
router.patch('/orders/:id/traffic',
  validate(Joi.object({ level: Joi.string().valid(...Object.values(TRAFFIC)).required(), note: Joi.string().trim().max(200) })),
  asyncHandler(async (req, res) => ok(res, await orderService.setTraffic(req.user, req.params.id, req.body), 'Traffic updated')));

// App sends GPS (+ reverse-geocoded area name) every ~15-30 s while on a delivery
router.patch('/location', validate(location),
  asyncHandler(async (req, res) => {
    const currentLocation = { ...req.body, updatedAt: new Date().toISOString() };
    await userRepo.update(req.user.id, { currentLocation });
    ok(res, currentLocation, 'Location updated');
  }));

router.patch('/availability', validate(Joi.object({ isAvailable: Joi.boolean().required() })),
  asyncHandler(async (req, res) => {
    await userRepo.update(req.user.id, { isAvailable: req.body.isAvailable });
    ok(res, { isAvailable: req.body.isAvailable }, 'Availability updated');
  }));

module.exports = router;
