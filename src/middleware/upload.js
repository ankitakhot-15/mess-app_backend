const multer = require('multer');
const ApiError = require('../utils/ApiError');

module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    /^image\/(jpe?g|png|webp)$/.test(file.mimetype)
      ? cb(null, true)
      : cb(new ApiError(400, 'Only JPG, PNG or WEBP images are allowed')),
});
