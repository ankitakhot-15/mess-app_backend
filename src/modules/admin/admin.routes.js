const router = require('express').Router();
const validate = require('../../middleware/validate');
const { protect, authorize } = require('../../middleware/auth');
const { ROLES } = require('../../constants');
const v = require('./admin.validation');
const c = require('./admin.controller');

router.use(protect, authorize(ROLES.ADMIN));

router.get('/dashboard', c.dashboard);

// Mavshi requests
router.get('/mavshis', validate(v.listMavshis, 'query'), c.listMavshis);
router.get('/mavshis/:id', c.getMavshi);
router.patch('/mavshis/:id/approve', validate(v.approve), c.approveMavshi);
router.patch('/mavshis/:id/reject', validate(v.reject), c.rejectMavshi);
router.patch('/mavshis/:id/plan', validate(v.assignPlan), c.assignPlanToMavshi);

// Plans
router.get('/plans', c.listPlans);
router.post('/plans', validate(v.plan), c.createPlan);
router.put('/plans/:id', validate(v.planUpdate), c.updatePlan);
router.delete('/plans/:id', c.deletePlan);

// Users (all roles)
router.get('/users', validate(v.listUsers, 'query'), c.listUsers);
router.post('/users', validate(v.createUser), c.createUser);
router.get('/users/:id', c.getUser);
router.put('/users/:id', validate(v.updateUser), c.updateUser);
router.patch('/users/:id/status', validate(v.setStatus), c.setUserStatus);
router.delete('/users/:id', c.deleteUser);

// Orders
router.get('/orders', validate(v.listOrders, 'query'), c.listOrders);
router.get('/orders/:id', c.getOrder);
router.patch('/orders/:id/accept', validate(v.acceptOrder), c.acceptOrder);
router.patch('/orders/:id/reject', validate(v.rejectOrder), c.rejectOrder);
router.patch('/orders/:id/assign', validate(v.assignDelivery), c.assignDelivery);
router.get('/delivery-boys/available', validate(v.availableBoys, 'query'), c.availableDeliveryBoys);

// Settings (delivery charge - admin only)
router.get('/settings', c.getSettings);
router.put('/settings', validate(v.settings), c.updateSettings);

module.exports = router;
