const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { userRepo, menuRepo, orderRepo } = require('../repositories');
const settingsService = require('./settings.service');
const paymentService = require('./payment.service');
const { notify, notifyAdmins } = require('./notification.service');
const { ROLES, USER_STATUS, ORDER_STATUS: S, PAYMENT_METHOD: PM, PAYMENT_STATUS: PS, PLAN_DAYS, TRAFFIC, NOTIFICATION_TYPE: NT } = require('../constants');
const { now, todayIST, addDays, round2, planPrice, orderNumber } = require('../utils/helpers');

const ACTIVE_FOR_DELIVERY = [S.ACCEPTED, S.PREPARING, S.READY, S.OUT_FOR_DELIVERY];

// ---------- helpers ----------
const timeline = (order, status, note) => [...(order.timeline || []), { status, note: note || null, at: now() }];
const setStatus = (order, status, extra = {}, note) =>
  orderRepo.update(order.id, { status, timeline: timeline(order, status, note), ...extra });

const getOrder = async (id) => {
  const o = await orderRepo.getById(id);
  if (!o) throw new ApiError(404, 'Order not found');
  return o;
};
const expectStatus = (order, allowed, action) => {
  if (!allowed.includes(order.status)) throw new ApiError(409, `Cannot ${action} an order that is ${order.status}`);
};

exports.getOrderFor = async (user, id) => {
  const o = await getOrder(id);
  const allowed =
    user.role === ROLES.ADMIN ||
    (user.role === ROLES.CUSTOMER && o.customerId === user.id) ||
    (user.role === ROLES.MAVSHI && o.mavshiId === user.id) ||
    (user.role === ROLES.DELIVERY && o.deliveryBoyId === user.id);
  if (!allowed) throw new ApiError(404, 'Order not found');
  return o;
};

const buildEta = (settings, level = TRAFFIC.NORMAL, note = null) => {
  const extra = settings.trafficExtraMinutes[level] || 0;
  const minutes = settings.baseDeliveryMinutes + extra;
  const message = level === TRAFFIC.NORMAL
    ? `Your order is accepted. It will be delivered in about ${minutes} min.`
    : `Because of ${level.toLowerCase()} traffic, your order will take about ${minutes} min.`;
  return { baseMinutes: settings.baseDeliveryMinutes, extraMinutes: extra, estimatedMinutes: minutes, trafficLevel: level, trafficNote: note, message, updatedAt: now() };
};

async function refundIfPaid(order, reason) {
  if (order.payment.method !== PM.ONLINE || order.payment.status !== PS.PAID) return order.payment;
  const r = await paymentService.refund(order.payment.razorpayPaymentId, order.pricing.total, { orderId: order.id, reason });
  return { ...order.payment, status: PS.REFUNDED, refund: { id: r.id, status: r.status, amount: round2(r.amount / 100), reason, at: now() } };
}

// ---------- customer: quote & create ----------
async function buildQuote(customer, body) {
  const mavshi = await userRepo.getById(body.mavshiId);
  if (!mavshi || mavshi.role !== ROLES.MAVSHI || mavshi.status !== USER_STATUS.ACTIVE) throw new ApiError(404, 'This mess is not available');

  const delivery = { ...(body.delivery || {}) };
  delivery.address = delivery.address || customer.address;
  delivery.pincode = delivery.pincode || customer.pincode;
  delivery.areaName = delivery.areaName || customer.areaName || null;
  if (delivery.pincode !== mavshi.pincode) throw new ApiError(400, 'This mess does not deliver to your pincode');

  const startDate = body.startDate || todayIST();
  if (startDate < todayIST()) throw new ApiError(400, 'Start date cannot be in the past');

  const menu = await menuRepo.find({ mavshiId: mavshi.id, available: true }, { limit: 500 });
  const byId = new Map(menu.map((m) => [m.id, m]));
  const items = body.items.map((i) => {
    const m = byId.get(i.menuItemId);
    if (!m) throw new ApiError(400, `Menu item ${i.menuItemId} is not available`);
    const unitPrice = planPrice(m, body.plan);
    return { menuItemId: m.id, name: m.name, mealType: m.mealType, quantity: i.quantity, unitPrice, lineTotal: round2(unitPrice * i.quantity) };
  });

  const settings = await settingsService.get();
  const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
  const deliveryCharge = settings.deliveryCharge;
  return {
    mavshi, items, plan: body.plan, startDate, endDate: addDays(startDate, PLAN_DAYS[body.plan] - 1), delivery,
    pricing: { subtotal, deliveryCharge, total: round2(subtotal + deliveryCharge) },
  };
}

exports.preview = async (customer, body) => {
  const q = await buildQuote(customer, body);
  const { mavshi, ...rest } = q;
  return { ...rest, mavshiName: mavshi.profile?.messName || mavshi.fullName };
};

exports.create = async (customer, body) => {
  const q = await buildQuote(customer, body);
  const id = orderRepo.newId();
  const online = body.paymentMethod === PM.ONLINE;

  let rp = null;
  if (online) rp = await paymentService.createOrder({ amount: q.pricing.total, receipt: id, notes: { orderId: id } });

  const order = await orderRepo.create({
    orderNumber: orderNumber(),
    customerId: customer.id, customerName: customer.fullName, customerMobile: customer.mobile,
    mavshiId: q.mavshi.id, mavshiName: q.mavshi.profile?.messName || q.mavshi.fullName,
    plan: q.plan, startDate: q.startDate, endDate: q.endDate,
    items: q.items, pricing: q.pricing, delivery: q.delivery, notes: body.notes || null,
    status: online ? S.PAYMENT_PENDING : S.PLACED,
    payment: { method: body.paymentMethod, status: PS.PENDING, razorpayOrderId: rp ? rp.id : null, razorpayPaymentId: null, paidAt: null, refund: null },
    deliveryBoyId: null, deliveryBoy: null, eta: null, rejectionReason: null,
    timeline: [{ status: online ? S.PAYMENT_PENDING : S.PLACED, note: null, at: now() }],
  }, id);

  if (!online) await announceNewOrder(order);
  return {
    order,
    razorpay: rp ? { keyId: env.razorpay.keyId, orderId: rp.id, amount: rp.amount, currency: rp.currency } : null,
  };
};

const announceNewOrder = (order) =>
  notifyAdmins({ title: 'New order', body: `${order.orderNumber} from ${order.customerName} - ₹${order.pricing.total}`, type: NT.ORDER, data: { orderId: order.id } });

// ---------- payment ----------
exports.markPaid = async (orderId, paymentId) => {
  const order = await getOrder(orderId);
  if (order.payment.status === PS.PAID || order.status !== S.PAYMENT_PENDING) return order; // idempotent
  const updated = await orderRepo.update(order.id, {
    status: S.PLACED,
    payment: { ...order.payment, status: PS.PAID, razorpayPaymentId: paymentId, paidAt: now() },
    timeline: timeline(order, S.PLACED, 'Online payment received'),
  });
  await announceNewOrder(updated);
  await notify(order.customerId, { title: 'Payment received', body: `Order ${order.orderNumber} is placed and waiting for confirmation.`, type: NT.ORDER, data: { orderId: order.id } });
  return updated;
};

exports.confirmPayment = async (customer, { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }) => {
  const order = await getOrder(orderId);
  if (order.customerId !== customer.id) throw new ApiError(404, 'Order not found');
  if (order.payment.razorpayOrderId !== razorpay_order_id) throw new ApiError(400, 'Payment does not belong to this order');
  if (!paymentService.verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) throw new ApiError(400, 'Payment verification failed');
  return exports.markPaid(orderId, razorpay_payment_id);
};

// ---------- admin ----------
exports.adminAccept = async (admin, id, { deliveryBoyId } = {}) => {
  const order = await getOrder(id);
  expectStatus(order, [S.PLACED], 'accept');
  const settings = await settingsService.get();
  const extra = { eta: buildEta(settings), acceptedBy: admin.id, acceptedAt: now() };
  let updated = await setStatus(order, S.ACCEPTED, extra);
  if (deliveryBoyId) updated = await exports.assignDelivery(id, deliveryBoyId);

  await notify(order.customerId, { title: 'Order accepted', body: extra.eta.message, type: NT.ORDER, data: { orderId: id, status: S.ACCEPTED } });
  await notify(order.mavshiId, { title: 'New order to prepare', body: `${order.orderNumber}: ${order.items.map((i) => `${i.name} x${i.quantity}`).join(', ')}`, type: NT.ORDER, data: { orderId: id } });
  return updated;
};

exports.adminReject = async (admin, id, reason) => {
  const order = await getOrder(id);
  expectStatus(order, [S.PLACED], 'reject');
  // refund FIRST: if refund fails the order stays PLACED so admin can retry
  const payment = await refundIfPaid(order, reason);
  const updated = await setStatus(order, S.REJECTED, { rejectionReason: reason, rejectedBy: admin.id, payment }, reason);
  const refunded = payment.status === PS.REFUNDED;
  await notify(order.customerId, {
    title: 'Order rejected',
    body: `Reason: ${reason}.${refunded ? ' Your payment has been refunded (takes 5-7 working days to reflect).' : ''}`,
    type: NT.ORDER, data: { orderId: id, status: S.REJECTED },
  });
  return updated;
};

exports.adminCancel = async (admin, id, reason) => {
  const order = await getOrder(id);
  expectStatus(order, [S.ACCEPTED, S.PREPARING, S.READY], 'cancel');
  const payment = await refundIfPaid(order, reason); // refund first; on failure the order is left untouched
  const updated = await setStatus(order, S.CANCELLED, { payment, cancelReason: reason, cancelledBy: admin.id }, reason);
  const refunded = payment.status === PS.REFUNDED;
  await notify(order.customerId, { title: 'Order cancelled', body: `Reason: ${reason}.${refunded ? ' Your payment has been refunded (takes 5-7 working days to reflect).' : ''}`, type: NT.ORDER, data: { orderId: id, status: S.CANCELLED } });
  await notify(order.mavshiId, { title: 'Order cancelled', body: `${order.orderNumber}: ${reason}`, type: NT.ORDER, data: { orderId: id } });
  if (order.deliveryBoyId) await notify(order.deliveryBoyId, { title: 'Delivery cancelled', body: order.orderNumber, type: NT.DELIVERY, data: { orderId: id } });
  return updated;
};

exports.assignDelivery = async (id, deliveryBoyId) => {
  const order = await getOrder(id);
  expectStatus(order, [S.ACCEPTED, S.PREPARING, S.READY], 'assign delivery for');
  const boy = await userRepo.getById(deliveryBoyId);
  if (!boy || boy.role !== ROLES.DELIVERY || boy.status !== USER_STATUS.ACTIVE) throw new ApiError(400, 'Delivery boy not found or not active');
  if (boy.pincode !== order.delivery.pincode) throw new ApiError(400, `Delivery boy serves pincode ${boy.pincode}, order is for ${order.delivery.pincode}`);
  if (boy.isAvailable === false) throw new ApiError(400, 'Delivery boy is currently unavailable');

  const updated = await orderRepo.update(id, {
    deliveryBoyId: boy.id,
    deliveryBoy: { id: boy.id, name: boy.fullName, mobile: boy.mobile, vehicleType: boy.profile?.vehicleType || null },
    timeline: timeline(order, order.status, `Assigned to ${boy.fullName}`),
  });
  await notify(boy.id, { title: 'New delivery assigned', body: `${order.orderNumber} to ${order.delivery.address}`, type: NT.DELIVERY, data: { orderId: id } });
  await notify(order.customerId, { title: 'Delivery partner assigned', body: `${boy.fullName} will deliver your order.`, type: NT.DELIVERY, data: { orderId: id } });
  return updated;
};

// ---------- mavshi ----------
exports.mavshiSetStatus = async (mavshi, id, status) => {
  const order = await getOrder(id);
  if (order.mavshiId !== mavshi.id) throw new ApiError(404, 'Order not found');
  const flow = { [S.PREPARING]: [S.ACCEPTED], [S.READY]: [S.PREPARING, S.ACCEPTED] };
  expectStatus(order, flow[status], `mark as ${status}`);
  const updated = await setStatus(order, status);
  await notify(order.customerId, { title: status === S.READY ? 'Food is ready' : 'Preparing your food', body: `Order ${order.orderNumber}`, type: NT.ORDER, data: { orderId: id, status } });
  if (status === S.READY && order.deliveryBoyId) await notify(order.deliveryBoyId, { title: 'Order ready for pickup', body: order.orderNumber, type: NT.DELIVERY, data: { orderId: id } });
  return updated;
};

// ---------- delivery boy ----------
const ownDelivery = async (boy, id) => {
  const o = await getOrder(id);
  if (o.deliveryBoyId !== boy.id) throw new ApiError(404, 'Order not found');
  return o;
};

exports.pickup = async (boy, id) => {
  const order = await ownDelivery(boy, id);
  expectStatus(order, [S.ACCEPTED, S.PREPARING, S.READY], 'pick up');
  const updated = await setStatus(order, S.OUT_FOR_DELIVERY);
  await notify(order.customerId, { title: 'Out for delivery', body: `${boy.fullName} is on the way with ${order.orderNumber}.`, type: NT.DELIVERY, data: { orderId: id, status: S.OUT_FOR_DELIVERY } });
  return updated;
};

exports.deliver = async (boy, id) => {
  const order = await ownDelivery(boy, id);
  expectStatus(order, [S.OUT_FOR_DELIVERY], 'deliver');
  const payment = order.payment.method === PM.COD ? { ...order.payment, status: PS.PAID, paidAt: now(), collectedBy: boy.id } : order.payment;
  const updated = await setStatus(order, S.DELIVERED, { payment, deliveredAt: now() });
  await notify(order.customerId, { title: 'Delivered', body: `Order ${order.orderNumber} delivered. Enjoy your meal!`, type: NT.ORDER, data: { orderId: id, status: S.DELIVERED } });
  await notify(order.mavshiId, { title: 'Order delivered', body: order.orderNumber, type: NT.ORDER, data: { orderId: id } });
  notifyAdmins({ title: 'Order delivered', body: `${order.orderNumber} delivered by ${boy.fullName}${order.payment.method === PM.COD ? ` (COD ₹${order.pricing.total} collected)` : ''}`, type: NT.ORDER, data: { orderId: id } });
  return updated;
};

exports.setTraffic = async (boy, id, { level, note }) => {
  const order = await ownDelivery(boy, id);
  expectStatus(order, ACTIVE_FOR_DELIVERY, 'update traffic for');
  const settings = await settingsService.get();
  const eta = buildEta(settings, level, note);
  const updated = await orderRepo.update(id, { eta });
  await notify(order.customerId, { title: level === TRAFFIC.NORMAL ? 'Traffic cleared' : 'Delivery delayed by traffic', body: eta.message, type: NT.DELIVERY, data: { orderId: id } });
  return updated;
};

// ---------- customer ----------
exports.cancelByCustomer = async (customer, id, reason) => {
  const order = await getOrder(id);
  if (order.customerId !== customer.id) throw new ApiError(404, 'Order not found');
  expectStatus(order, [S.PAYMENT_PENDING, S.PLACED], 'cancel');
  const payment = await refundIfPaid(order, reason || 'Cancelled by customer');
  const updated = await setStatus(order, S.CANCELLED, { payment, cancelReason: reason || null }, reason);
  await notifyAdmins({ title: 'Order cancelled', body: `${order.orderNumber} cancelled by customer`, type: NT.ORDER, data: { orderId: id } });
  return updated;
};

exports.tracking = async (customer, id) => {
  const order = await getOrder(id);
  if (order.customerId !== customer.id) throw new ApiError(404, 'Order not found');
  const boy = order.deliveryBoyId ? await userRepo.getById(order.deliveryBoyId) : null;
  const live = ACTIVE_FOR_DELIVERY.includes(order.status);
  const loc = boy && live ? boy.currentLocation : null;
  return {
    orderId: order.id, orderNumber: order.orderNumber, status: order.status,
    rejectionReason: order.rejectionReason, refund: order.payment.refund,
    eta: order.eta,
    deliveryBoy: boy && live ? { name: boy.fullName, mobile: boy.mobile, vehicleType: boy.profile?.vehicleType, currentLocation: loc } : null,
    locationMessage: loc && loc.areaName ? `Your delivery partner is currently in ${loc.areaName}` : null,
    timeline: order.timeline,
  };
};

exports.ACTIVE_FOR_DELIVERY = ACTIVE_FOR_DELIVERY;
