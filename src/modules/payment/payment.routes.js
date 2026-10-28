const router = require('express').Router();
const { Joi } = require('../../utils/validators');
const validate = require('../../middleware/validate');
const { protect, authorize } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { ok } = require('../../utils/response');
const orderService = require('../../services/order.service');
const paymentService = require('../../services/payment.service');
const { ROLES } = require('../../constants');

// Razorpay webhook (raw body, signature verified). Safety net if the app closes before /verify.
router.post('/webhook', asyncHandler(async (req, res) => {
  const raw = req.body; // Buffer (express.raw in app.js)
  if (!Buffer.isBuffer(raw)) throw new ApiError(400, 'Invalid webhook body');
  if (!paymentService.verifyWebhookSignature(raw, req.headers['x-razorpay-signature'])) throw new ApiError(400, 'Invalid signature');
  const event = JSON.parse(raw.toString('utf8'));
  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    const p = event.payload.payment.entity;
    const orderId = p.notes && p.notes.orderId;
    if (orderId) await orderService.markPaid(orderId, p.id);
  }
  res.json({ received: true });
}));

router.post('/verify', protect, authorize(ROLES.CUSTOMER),
  validate(Joi.object({
    orderId: Joi.string().required(),
    razorpay_order_id: Joi.string().required(),
    razorpay_payment_id: Joi.string().required(),
    razorpay_signature: Joi.string().required(),
  })),
  asyncHandler(async (req, res) => ok(res, await orderService.confirmPayment(req.user, req.body), 'Payment verified. Order placed.')));

module.exports = router;
