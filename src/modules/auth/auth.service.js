const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const env = require('../../config/env');
const { auth: firebaseAuth } = require('../../config/firebase');
const ApiError = require('../../utils/ApiError');
const { userRepo, menuRepo, otpRepo } = require('../../repositories');
const { signToken } = require('../../middleware/auth');
const { notifyAdmins } = require('../../services/notification.service');
const { sendOtpSms } = require('../../services/sms.service');
const { ROLES, USER_STATUS, NOTIFICATION_TYPE } = require('../../constants');
const { toPublicUser, pick, now } = require('../../utils/helpers');

const hash = (pw) => bcrypt.hash(pw, 10);
const common = (p) => pick(p, ['fullName', 'mobile', 'address', 'areaName', 'pincode']);

const session = (user, message) => {
  let notice = null;
  if (user.role === ROLES.MAVSHI) {
    if (user.status === USER_STATUS.PENDING) notice = 'Your request is under admin review. You will be notified once it is accepted or rejected.';
    if (user.status === USER_STATUS.REJECTED) notice = `Your request was rejected. Reason: ${user.rejectionReason || 'not specified'}`;
  }
  return { token: signToken(user), user: toPublicUser(user), notice, message };
};

exports.registerMavshi = async (p) => {
  const user = await userRepo.createUnique({
    ...common(p),
    role: ROLES.MAVSHI,
    status: USER_STATUS.PENDING,
    passwordHash: await hash(p.password),
    profile: pick(p, ['messName', 'cookingExperienceYears', 'messStartMonth', 'messStartYear']),
    rejectionReason: null,
    subscription: null,
    fcmToken: null,
  });
  await Promise.all(p.pricing.map((m) => menuRepo.create({ ...m, mavshiId: user.id, available: true, image: null })));
  await notifyAdmins({
    title: 'New Mavshi request',
    body: `${user.fullName} (${user.pincode}) wants to join. Please review.`,
    type: NOTIFICATION_TYPE.MAVSHI_REQUEST,
    data: { mavshiId: user.id },
  });
  return session(user, 'Registered. Waiting for admin approval.');
};

exports.registerDelivery = async (p) => {
  const mess = await userRepo.findOne({ role: ROLES.MAVSHI, status: USER_STATUS.ACTIVE, pincode: p.pincode });
  if (!mess) throw new ApiError(400, 'Delivery service is not available in this pincode yet. Choose a pincode where a mess is available.');
  const user = await userRepo.createUnique({
    ...common(p),
    role: ROLES.DELIVERY,
    status: USER_STATUS.ACTIVE,
    passwordHash: await hash(p.password),
    profile: pick(p, ['vehicleType', 'vehicleNumber', 'licenseNumber']),
    isAvailable: true,
    currentLocation: null,
    fcmToken: null,
  });
  await notifyAdmins({ title: 'New delivery partner', body: `${user.fullName} joined in ${user.pincode}.`, type: NOTIFICATION_TYPE.USER, data: { userId: user.id, role: ROLES.DELIVERY } });
  return session(user, 'Delivery partner registered');
};

exports.registerCustomer = async (p) => {
  const user = await userRepo.createUnique({
    ...common(p),
    ...pick(p, ['email']),
    role: ROLES.CUSTOMER,
    status: USER_STATUS.ACTIVE,
    passwordHash: p.password ? await hash(p.password) : null,
    location: p.location || null,
    fcmToken: null,
  });
  await notifyAdmins({ title: 'New customer', body: `${user.fullName} (${user.pincode || 'no pincode'}) registered.`, type: NOTIFICATION_TYPE.USER, data: { userId: user.id, role: ROLES.CUSTOMER } });
  return session(user, 'Customer registered');
};

exports.login = async ({ mobile, password }) => {
  const user = await userRepo.findByMobile(mobile);
  if (!user) throw new ApiError(401, 'Invalid mobile or password');
  if (user.role === ROLES.CUSTOMER && env.otp.enabled) throw new ApiError(400, 'Customers must log in with OTP');
  if (!user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) throw new ApiError(401, 'Invalid mobile or password');
  if (user.status === USER_STATUS.BLOCKED) throw new ApiError(403, 'Your account is blocked. Contact admin.');
  return session(user, 'Login successful');
};

// ---------- Customer OTP (optional) ----------
const hashOtp = (mobile, otp) => crypto.createHmac('sha256', env.jwt.secret).update(`${mobile}:${otp}`).digest('hex');

const ensureOtpEnabled = () => { if (!env.otp.enabled) throw new ApiError(400, 'OTP login is not enabled'); };

exports.sendOtp = async ({ mobile }) => {
  ensureOtpEnabled();
  const user = await userRepo.findByMobile(mobile);
  if (!user || user.role !== ROLES.CUSTOMER) throw new ApiError(404, 'No customer account for this mobile. Please register first.');
  const existing = await otpRepo.getById(mobile);
  if (existing && Date.now() - new Date(existing.lastSentAt).getTime() < 30000) throw new ApiError(429, 'Please wait 30 seconds before requesting another OTP');
  const otp = String(crypto.randomInt(100000, 1000000));
  const doc = { hash: hashOtp(mobile, otp), expiresAt: Date.now() + env.otp.expiryMinutes * 60000, attempts: 0, lastSentAt: now() };
  if (existing) await otpRepo.update(mobile, doc); else await otpRepo.create(doc, mobile);
  await sendOtpSms(mobile, otp);
  return { expiresInMinutes: env.otp.expiryMinutes, ...(env.otp.devMode ? { devOtp: otp } : {}) };
};

exports.verifyOtp = async ({ mobile, otp }) => {
  ensureOtpEnabled();
  const rec = await otpRepo.getById(mobile);
  if (!rec || rec.expiresAt < Date.now()) throw new ApiError(400, 'OTP expired. Request a new one.');
  if (rec.attempts >= 5) throw new ApiError(429, 'Too many wrong attempts. Request a new OTP.');
  const a = Buffer.from(rec.hash); const b = Buffer.from(hashOtp(mobile, otp));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    await otpRepo.update(mobile, { attempts: rec.attempts + 1 });
    throw new ApiError(400, 'Incorrect OTP');
  }
  await otpRepo.delete(mobile);
  const user = await userRepo.findByMobile(mobile);
  if (!user || user.role !== ROLES.CUSTOMER) throw new ApiError(404, 'Customer not found');
  if (user.status === USER_STATUS.BLOCKED) throw new ApiError(403, 'Your account is blocked. Contact admin.');
  return session(user, 'Login successful');
};

/** Option B: app verifies phone with Firebase Phone Auth and sends the Firebase ID token. */
exports.firebaseLogin = async ({ idToken }) => {
  let decoded;
  try { decoded = await firebaseAuth.verifyIdToken(idToken); } catch { throw new ApiError(401, 'Invalid Firebase token'); }
  if (!decoded.phone_number) throw new ApiError(400, 'Token has no verified phone number');
  const mobile = decoded.phone_number.replace(/\D/g, '').slice(-10);
  const user = await userRepo.findByMobile(mobile);
  if (!user || user.role !== ROLES.CUSTOMER) throw new ApiError(404, 'No customer account for this mobile. Please register first.');
  if (user.status === USER_STATUS.BLOCKED) throw new ApiError(403, 'Your account is blocked. Contact admin.');
  return session(user, 'Login successful');
};
