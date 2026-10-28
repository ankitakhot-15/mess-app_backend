const service = require('./tracking.service');

exports.trackOrder = async (req, res, next) => {
  try {
    // ADJUST: req.user.id / req.user.uid / req.user._id, whichever your auth middleware sets
    const customerId = req.user.id || req.user.uid || req.user._id;
    const data = await service.trackOrder(customerId, req.params.id);
    res.json({ success: true, message: 'Tracking', data });
  } catch (err) {
    next(err);
  }
};