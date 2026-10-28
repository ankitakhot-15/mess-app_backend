require('dotenv').config();

const bool = (v, d = false) => (v === undefined ? d : String(v).toLowerCase() === 'true');

const required = [
  'JWT_SECRET', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
  'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
  'FIREBASE_PROJECT_ID',
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 5000,
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()),
  jwt: { secret: process.env.JWT_SECRET, expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
  otp: {
    enabled: bool(process.env.OTP_ENABLED),
    devMode: bool(process.env.OTP_DEV_MODE, true),
    expiryMinutes: Number(process.env.OTP_EXPIRY_MINUTES) || 5,
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    serviceAccountBase64: process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
  },
  admin: {
    name: process.env.ADMIN_NAME || 'Super Admin',
    mobile: process.env.ADMIN_MOBILE,
    password: process.env.ADMIN_PASSWORD,
  },
};
