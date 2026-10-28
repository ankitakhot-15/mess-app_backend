const bcrypt = require('bcryptjs');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { ok, created } = require('../../utils/response');
const { userRepo, menuRepo, orderRepo, planRepo } = require('../../repositories');
const orderService = require('../../services/order.service');
const settingsService = require('../../services/settings.service');
const { notify } = require('../../services/notification.service');
const { ROLES, USER_STATUS, ORDER_STATUS, NOTIFICATION_TYPE } = require('../../constants');
const { toPublicUser, paginate, pick, todayIST, addDays } = require('../../utils/helpers');

const getUser = async (id, role) => {
  const u = await userRepo.getById(id);
  if (!u || (role && u.role !== role)) throw new ApiError(404, `${role || 'User'} not found`);
  return u;
};

// ---------- dashboard ----------
exports.dashboard = asyncHandler(async (req, res) => {
  const [customers, mavshis, delivery, pendingMavshis, placed, accepted, delivered] = await Promise.all([
    userRepo.count({ role: ROLES.CUSTOMER }), userRepo.count({ role: ROLES.MAVSHI, status: USER_STATUS.ACTIVE }),
    userRepo.count({ role: ROLES.DELIVERY }), userRepo.count({ role: ROLES.MAVSHI, status: USER_STATUS.PENDING }),
    orderRepo.count({ status: ORDER_STATUS.PLACED }), orderRepo.count({ status: ORDER_STATUS.ACCEPTED }),
    orderRepo.count({ status: ORDER_STATUS.DELIVERED }),
  ]);
  ok(res, { customers, activeMavshis: mavshis, deliveryBoys: delivery, pendingMavshiRequests: pendingMavshis, ordersAwaitingDecision: placed, ordersAccepted: accepted, ordersDelivered: delivered });
});

// ---------- mavshi requests ----------
exports.listMavshis = asyncHandler(async (req, res) => {
  const { status, pincode, page, limit } = req.query;
  const rows = await userRepo.find({ role: ROLES.MAVSHI, ...(status ? { status } : {}), ...(pincode ? { pincode } : {}) }, { limit: 1000 });
  const p = paginate(rows.map(toPublicUser), page, limit);
  ok(res, p.rows, 'Mavshis', 200, p.meta);
});

exports.getMavshi = asyncHandler(async (req, res) => {
  const m = await getUser(req.params.id, ROLES.MAVSHI);
  ok(res, { mavshi: toPublicUser(m), menu: await menuRepo.find({ mavshiId: m.id }) });
});

const buildSubscription = async (planId, adminId) => {
  const plan = await planRepo.getById(planId);
  if (!plan || !plan.active) throw new ApiError(400, 'This plan cannot be assigned (not found or inactive). Pick another plan or reject the request.');
  const startDate = todayIST();
  return { planId: plan.id, planName: plan.name, durationDays: plan.durationDays, fee: plan.fee, startDate, endDate: addDays(startDate, plan.durationDays - 1), assignedBy: adminId };
};

exports.approveMavshi = asyncHandler(async (req, res) => {
  const m = await getUser(req.params.id, ROLES.MAVSHI);
  if (![USER_STATUS.PENDING, USER_STATUS.REJECTED].includes(m.status)) throw new ApiError(409, `Mavshi is already ${m.status}`);
  const subscription = req.body.planId ? await buildSubscription(req.body.planId, req.user.id) : m.subscription || null;
  const updated = await userRepo.update(m.id, { status: USER_STATUS.ACTIVE, rejectionReason: null, subscription, approvedBy: req.user.id, approvedAt: new Date().toISOString() });
  await notify(m.id, {
    title: 'Request accepted',
    body: subscription ? `You are approved. Plan assigned: ${subscription.planName} (till ${subscription.endDate}).` : 'You are approved. You can now manage your menu and receive orders.',
    type: NOTIFICATION_TYPE.MAVSHI_APPROVED, data: { status: USER_STATUS.ACTIVE },
  });
  ok(res, toPublicUser(updated), 'Mavshi approved');
});

exports.rejectMavshi = asyncHandler(async (req, res) => {
  const m = await getUser(req.params.id, ROLES.MAVSHI);
  if (m.status !== USER_STATUS.PENDING) throw new ApiError(409, `Only PENDING requests can be rejected (current: ${m.status})`);
  const updated = await userRepo.update(m.id, { status: USER_STATUS.REJECTED, rejectionReason: req.body.reason, rejectedBy: req.user.id });
  await notify(m.id, { title: 'Request rejected', body: `Reason: ${req.body.reason}`, type: NOTIFICATION_TYPE.MAVSHI_REJECTED, data: { status: USER_STATUS.REJECTED, reason: req.body.reason } });
  ok(res, toPublicUser(updated), 'Mavshi rejected');
});

exports.assignPlanToMavshi = asyncHandler(async (req, res) => {
  const m = await getUser(req.params.id, ROLES.MAVSHI);
  const subscription = await buildSubscription(req.body.planId, req.user.id);
  ok(res, toPublicUser(await userRepo.update(m.id, { subscription })), 'Plan assigned');
});

// ---------- plans (platform subscription plans assigned to mavshis) ----------
exports.listPlans = asyncHandler(async (req, res) => ok(res, await planRepo.find({}, { limit: 100 })));
exports.createPlan = asyncHandler(async (req, res) => created(res, await planRepo.create(req.body), 'Plan created'));
exports.updatePlan = asyncHandler(async (req, res) => {
  if (!(await planRepo.getById(req.params.id))) throw new ApiError(404, 'Plan not found');
  ok(res, await planRepo.update(req.params.id, req.body), 'Plan updated');
});
exports.deletePlan = asyncHandler(async (req, res) => {
  if (!(await planRepo.getById(req.params.id))) throw new ApiError(404, 'Plan not found');
  await planRepo.delete(req.params.id);
  ok(res, null, 'Plan deleted');
});

// ---------- manage all roles ----------
exports.listUsers = asyncHandler(async (req, res) => {
  const { role, status, pincode, search, page, limit } = req.query;
  let rows = await userRepo.find({ ...(role ? { role } : {}), ...(status ? { status } : {}), ...(pincode ? { pincode } : {}) }, { limit: 1000 });
  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter((u) => u.fullName.toLowerCase().includes(s) || u.mobile.includes(s));
  }
  const p = paginate(rows.map(toPublicUser), page, limit);
  ok(res, p.rows, 'Users', 200, p.meta);
});

exports.getUser = asyncHandler(async (req, res) => ok(res, toPublicUser(await getUser(req.params.id))));

exports.createUser = asyncHandler(async (req, res) => {
  const { password, ...rest } = req.body;
  const user = await userRepo.createUnique({ ...rest, passwordHash: await bcrypt.hash(password, 10), profile: {}, fcmToken: null, rejectionReason: null,
    ...(rest.role === ROLES.DELIVERY ? { isAvailable: true, currentLocation: null } : {}) });
  created(res, toPublicUser(user), 'User created');
});

exports.updateUser = asyncHandler(async (req, res) => { await getUser(req.params.id); ok(res, toPublicUser(await userRepo.update(req.params.id, req.body)), 'User updated'); });

exports.setUserStatus = asyncHandler(async (req, res) => {
  const u = await getUser(req.params.id);
  if (u.id === req.user.id) throw new ApiError(400, 'You cannot change your own status');
  const updated = await userRepo.update(u.id, { status: req.body.status, blockReason: req.body.status === USER_STATUS.BLOCKED ? req.body.reason || null : null });
  ok(res, toPublicUser(updated), req.body.status === USER_STATUS.BLOCKED ? 'User blocked' : 'User unblocked');
});

exports.deleteUser = asyncHandler(async (req, res) => {
  const u = await getUser(req.params.id);
  if (u.id === req.user.id) throw new ApiError(400, 'You cannot delete your own account');
  if (u.role === ROLES.MAVSHI) await Promise.all((await menuRepo.find({ mavshiId: u.id })).map((m) => menuRepo.delete(m.id)));
  await userRepo.remove(u);
  ok(res, null, 'User deleted');
});

// ---------- orders ----------
exports.listOrders = asyncHandler(async (req, res) => {
  const { status, pincode, page, limit } = req.query;
  const rows = await orderRepo.find({ ...(status ? { status } : {}) }, { limit: 1000 });
  const filtered = pincode ? rows.filter((o) => o.delivery.pincode === pincode) : rows;
  const p = paginate(filtered, page, limit);
  ok(res, p.rows, 'Orders', 200, p.meta);
});
exports.getOrder = asyncHandler(async (req, res) => ok(res, await orderService.getOrderFor(req.user, req.params.id)));
exports.acceptOrder = asyncHandler(async (req, res) => ok(res, await orderService.adminAccept(req.user, req.params.id, req.body), 'Order accepted'));
exports.rejectOrder = asyncHandler(async (req, res) => ok(res, await orderService.adminReject(req.user, req.params.id, req.body.reason), 'Order rejected'));
exports.assignDelivery = asyncHandler(async (req, res) => ok(res, await orderService.assignDelivery(req.params.id, req.body.deliveryBoyId), 'Delivery boy assigned'));
exports.availableDeliveryBoys = asyncHandler(async (req, res) => {
  const rows = await userRepo.find({ role: ROLES.DELIVERY, status: USER_STATUS.ACTIVE, pincode: req.query.pincode }, { limit: 200 });
  ok(res, rows.filter((b) => b.isAvailable !== false).map((b) => pick(toPublicUser(b), ['id', 'fullName', 'mobile', 'pincode', 'areaName', 'profile', 'currentLocation'])));
});

// ---------- settings (delivery charge etc. - admin only) ----------
exports.getSettings = asyncHandler(async (req, res) => ok(res, await settingsService.get()));
exports.updateSettings = asyncHandler(async (req, res) => {
  const current = await settingsService.get();
  const patch = { ...req.body, ...(req.body.trafficExtraMinutes ? { trafficExtraMinutes: { ...current.trafficExtraMinutes, ...req.body.trafficExtraMinutes } } : {}) };
  ok(res, await settingsService.update(patch), 'Settings updated');
});
