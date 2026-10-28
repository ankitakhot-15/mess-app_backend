const cloudinary = require('../config/cloudinary');
const ApiError = require('../utils/ApiError');

exports.uploadImage = (file, folder) => {
  if (!file) throw new ApiError(400, 'Image file is required');
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: `mess-app/${folder}`, resource_type: 'image', transformation: [{ width: 1200, crop: 'limit', quality: 'auto' }] },
      (err, r) => (err ? reject(new ApiError(502, 'Image upload failed')) : resolve({ url: r.secure_url, publicId: r.public_id }))
    ).end(file.buffer);
  });
};

exports.deleteImage = (publicId) => (publicId ? cloudinary.uploader.destroy(publicId).catch(() => null) : null);
