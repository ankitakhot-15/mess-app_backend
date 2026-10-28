const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { Joi, password } = require('../../utils/validators');
const validate = require('../../middleware/validate');
const upload = require('../../middleware/upload');
const { protect } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { ok } = require('../../utils/response');
const { userRepo } = require('../../repositories');
const { uploadImage, deleteImage } = require('../../services/cloudinary.service');
const { toPublicUser } = require('../../utils/helpers');

router.use(protect);

router.get('/me', asyncHandler(async (req, res) => ok(res, toPublicUser(req.user))));

router.put('/me/fcm-token', validate(Joi.object({ token: Joi.string().required() })),
  asyncHandler(async (req, res) => { await userRepo.update(req.user.id, { fcmToken: req.body.token }); ok(res, null, 'Push token saved'); }));

router.put('/me/password', validate(Joi.object({ currentPassword: Joi.string().required(), newPassword: password.required() })),
  asyncHandler(async (req, res) => {
    const okPw = req.user.passwordHash && await bcrypt.compare(req.body.currentPassword, req.user.passwordHash);
    if (!okPw) throw new ApiError(400, 'Current password is incorrect');
    await userRepo.update(req.user.id, { passwordHash: await bcrypt.hash(req.body.newPassword, 10) });
    ok(res, null, 'Password changed');
  }));

router.post('/me/photo', upload.single('photo'), asyncHandler(async (req, res) => {
  const img = await uploadImage(req.file, 'profiles');
  await deleteImage(req.user.profilePhotoId);
  const user = await userRepo.update(req.user.id, { profilePhoto: img.url, profilePhotoId: img.publicId });
  ok(res, toPublicUser(user), 'Photo updated');
}));

module.exports = router;
