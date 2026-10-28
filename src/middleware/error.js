const multer = require('multer');
const env = require('../config/env');
const logger = require('../utils/logger');

exports.notFound = (req, res) =>
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });

// eslint-disable-next-line no-unused-vars
exports.errorHandler = (err, req, res, next) => {
  let status = err.statusCode || 500;
  let message = err.message;

  if (err instanceof multer.MulterError) {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5 MB or smaller' : err.message;
  } else if (err.type === 'entity.parse.failed') {
    status = 400; message = 'Invalid JSON body';
  } else if (err.error && err.error.description) { // Razorpay SDK errors
    status = err.statusCode || 502; message = err.error.description;
  }

  if (status >= 500) {
    logger.error(err);
    if (env.isProd) message = 'Something went wrong. Please try again.';
  }
  res.status(status).json({ success: false, message, ...(err.errors ? { errors: err.errors } : {}) });
};
