const { Joi, mobile, pincode, password, pagination } = require('../../utils/validators');
const { ROLES, USER_STATUS, ORDER_STATUS } = require('../../constants');

exports.listUsers = Joi.object({
  role: Joi.string().valid(...Object.values(ROLES)),
  status: Joi.string().valid(...Object.values(USER_STATUS)),
  pincode, search: Joi.string().trim().max(50), ...pagination,
});
exports.listMavshis = Joi.object({ status: Joi.string().valid(...Object.values(USER_STATUS)), pincode, ...pagination });
exports.createUser = Joi.object({
  role: Joi.string().valid(...Object.values(ROLES)).required(),
  fullName: Joi.string().trim().min(3).max(80).required(),
  mobile: mobile.required(),
  password: password.required(),
  address: Joi.string().trim().max(250), areaName: Joi.string().trim().max(100), pincode,
  status: Joi.string().valid(USER_STATUS.ACTIVE, USER_STATUS.PENDING).default(USER_STATUS.ACTIVE),
});
exports.updateUser = Joi.object({
  fullName: Joi.string().trim().min(3).max(80), address: Joi.string().trim().max(250),
  areaName: Joi.string().trim().max(100), pincode, email: Joi.string().email(),
}).min(1);
exports.setStatus = Joi.object({
  status: Joi.string().valid(USER_STATUS.ACTIVE, USER_STATUS.BLOCKED).required(),
  reason: Joi.string().trim().max(200),
});
exports.approve = Joi.object({ planId: Joi.string(), note: Joi.string().trim().max(200) });
exports.reject = Joi.object({ reason: Joi.string().trim().min(5).max(300).required() });
exports.assignPlan = Joi.object({ planId: Joi.string().required() });
exports.plan = Joi.object({
  name: Joi.string().trim().max(80).required(), description: Joi.string().trim().max(300).allow(''),
  durationDays: Joi.number().integer().min(1).max(3650).required(), fee: Joi.number().min(0).required(), active: Joi.boolean().default(true),
});
exports.planUpdate = exports.plan.fork(['name', 'durationDays', 'fee'], (s) => s.optional()).min(1);
exports.listOrders = Joi.object({ status: Joi.string().valid(...Object.values(ORDER_STATUS)), pincode, ...pagination });
exports.acceptOrder = Joi.object({ deliveryBoyId: Joi.string() });
exports.rejectOrder = Joi.object({ reason: Joi.string().trim().min(5).max(300).required() });
exports.assignDelivery = Joi.object({ deliveryBoyId: Joi.string().required() });
exports.availableBoys = Joi.object({ pincode: pincode.required() });
exports.settings = Joi.object({
  deliveryCharge: Joi.number().min(0).max(1000),
  baseDeliveryMinutes: Joi.number().integer().min(5).max(240),
  trafficExtraMinutes: Joi.object({
    NORMAL: Joi.number().integer().min(0).max(120), MODERATE: Joi.number().integer().min(0).max(120), HEAVY: Joi.number().integer().min(0).max(240),
  }),
}).min(1);
