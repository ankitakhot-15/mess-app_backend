const crypto = require('crypto');
const razorpay = require('../config/razorpay');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const toPaise = (rupees) => Math.round(rupees * 100);
const safeEqual = (a, b) => {
  const x = Buffer.from(a || ''); const y = Buffer.from(b || '');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

exports.createOrder = ({ amount, receipt, notes }) =>
  razorpay.orders.create({ amount: toPaise(amount), currency: 'INR', receipt, notes });

exports.verifyPaymentSignature = (orderId, paymentId, signature) => {
  const expected = crypto.createHmac('sha256', env.razorpay.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature);
};

exports.verifyWebhookSignature = (rawBody, signature) => {
  if (!env.razorpay.webhookSecret) throw new ApiError(500, 'Webhook secret not configured');
  const expected = crypto.createHmac('sha256', env.razorpay.webhookSecret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
};

exports.refund = async (paymentId, amount, notes = {}) => {
  try {
    return await razorpay.payments.refund(paymentId, { amount: toPaise(amount), speed: 'normal', notes });
  } catch (e) {
    throw new ApiError(502, `Refund failed: ${(e.error && e.error.description) || e.message}`);
  }
};
