exports.ok = (res, data = null, message = 'Success', status = 200, meta) =>
  res.status(status).json({ success: true, message, data, ...(meta ? { meta } : {}) });

exports.created = (res, data, message = 'Created') => exports.ok(res, data, message, 201);
