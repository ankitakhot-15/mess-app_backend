const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const s = require('./auth.service');

exports.registerMavshi = asyncHandler(async (req, res) => created(res, await s.registerMavshi(req.body), 'Mavshi registered'));
exports.registerDelivery = asyncHandler(async (req, res) => created(res, await s.registerDelivery(req.body), 'Delivery partner registered'));
exports.registerCustomer = asyncHandler(async (req, res) => created(res, await s.registerCustomer(req.body), 'Customer registered'));
exports.login = asyncHandler(async (req, res) => ok(res, await s.login(req.body), 'Login successful'));
exports.sendOtp = asyncHandler(async (req, res) => ok(res, await s.sendOtp(req.body), 'OTP sent'));
exports.verifyOtp = asyncHandler(async (req, res) => ok(res, await s.verifyOtp(req.body), 'Login successful'));
exports.firebaseLogin = asyncHandler(async (req, res) => ok(res, await s.firebaseLogin(req.body), 'Login successful'));
