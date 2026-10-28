const router = require('express').Router();

router.use('/auth', require('../modules/auth/auth.routes'));
router.use('/public', require('../modules/public/public.routes'));
router.use('/users', require('../modules/user/user.routes'));
router.use('/notifications', require('../modules/notification/notification.routes'));
router.use('/admin', require('../modules/admin/admin.routes'));
router.use('/mavshi', require('../modules/mavshi/mavshi.routes'));
router.use('/delivery', require('../modules/delivery/delivery.routes'));
router.use('/customer', require('../modules/customer/customer.routes'));
router.use('/payments', require('../modules/payment/payment.routes'));

module.exports = router;
