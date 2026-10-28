const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const validate = require('../../middleware/validate');
const v = require('./auth.validation');
const c = require('./auth.controller');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Try again later.' } });
router.use(limiter);

router.post('/register/mavshi', validate(v.registerMavshi), c.registerMavshi);
router.post('/register/delivery', validate(v.registerDelivery), c.registerDelivery);
router.post('/register/customer', validate(v.registerCustomer), c.registerCustomer);
router.post('/login', validate(v.login), c.login);                         // admin, mavshi, delivery (+ customer when OTP is off)
router.post('/otp/send', validate(v.sendOtp), c.sendOtp);                  // customer OTP (optional)
router.post('/otp/verify', validate(v.verifyOtp), c.verifyOtp);
router.post('/otp/firebase-login', validate(v.firebaseLogin), c.firebaseLogin);

module.exports = router;
