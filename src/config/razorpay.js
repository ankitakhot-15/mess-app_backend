const Razorpay = require('razorpay');
const env = require('./env');

module.exports = new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
