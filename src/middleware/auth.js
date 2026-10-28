const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { userRepo } = require('../repositories');
const { USER_STATUS, ROLES } = require('../constants');

const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, env.jwt.secret, { expiresIn: env.jwt.expiresIn });

/** Verifies JWT and loads the current user from Firestore (so blocked users are cut off immediately). */
const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new ApiError(401, 'Authentication required');
  let decoded;
  try { decoded = jwt.verify(token, env.jwt.secret); } catch { throw new ApiError(401, 'Invalid or expired token'); }
  const user = await userRepo.getById(decoded.id);
  if (!user) throw new ApiError(401, 'Account no longer exists');
  if (user.status === USER_STATUS.BLOCKED) throw new ApiError(403, 'Your account is blocked. Contact admin.');
  req.user = user;
  next();
});

/** Role based access: authorize(ROLES.ADMIN, ROLES.MAVSHI) */
const authorize = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : next(new ApiError(403, 'You do not have permission for this action'));

/** Mavshi must be approved by admin before using business features. */
const requireApprovedMavshi = (req, res, next) => {
  if (req.user.role === ROLES.MAVSHI && req.user.status !== USER_STATUS.ACTIVE) {
    const msg = req.user.status === USER_STATUS.REJECTED
      ? `Your request was rejected: ${req.user.rejectionReason || 'no reason given'}`
      : 'Your request is still under admin review';
    return next(new ApiError(403, msg));
  }
  next();
};

module.exports = { signToken, protect, authorize, requireApprovedMavshi };
