const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/**
 * Plug your SMS provider (MSG91 / Twilio / Fast2SMS) here.
 * Alternative that needs no SMS provider: Firebase Phone Auth on the app +
 * POST /auth/otp/firebase-login (already implemented).
 */
exports.sendOtpSms = async (mobile, otp) => {
  if (env.otp.devMode) { logger.info(`[DEV OTP] ${mobile} -> ${otp}`); return; }
  throw new ApiError(501, 'SMS provider not configured. Implement src/services/sms.service.js');
};
