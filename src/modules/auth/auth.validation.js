const env = require('../../config/env');
const { Joi, mobile, pincode, password, location } = require('../../utils/validators');

const base = {
  fullName: Joi.string().trim().min(3).max(80).required(),
  mobile: mobile.required(),
  address: Joi.string().trim().min(5).max(250).required(),
  areaName: Joi.string().trim().max(100),
  pincode: pincode.required(),
};

const menuPricing = Joi.object({
  name: Joi.string().trim().max(100).required(),
  description: Joi.string().trim().max(300).allow(''),
  mealType: Joi.string().valid('BREAKFAST', 'LUNCH', 'DINNER', 'FULL_DAY').required(),
  foodType: Joi.string().valid('VEG', 'NON_VEG', 'BOTH').default('VEG'),
  price: Joi.number().positive().max(100000).required(),          // price for 1 day
  weeklyPrice: Joi.number().positive().max(1000000),               // optional, default price*7
  monthlyPrice: Joi.number().positive().max(10000000),             // optional, default price*30
});

const thisYear = new Date().getFullYear();

exports.menuPricing = menuPricing;

exports.registerMavshi = Joi.object({
  ...base,
  password: password.required(),
  messName: Joi.string().trim().max(100),
  cookingExperienceYears: Joi.number().min(0).max(70).required(),
  messStartMonth: Joi.number().integer().min(1).max(12).required(),
  messStartYear: Joi.number().integer().min(1980).max(thisYear).required(),
  pricing: Joi.array().items(menuPricing).min(1).max(50).required(),
});

exports.registerDelivery = Joi.object({
  ...base,
  password: password.required(),
  vehicleType: Joi.string().valid('BIKE', 'SCOOTER', 'CYCLE').required(),
  vehicleNumber: Joi.string().trim().max(20),
  licenseNumber: Joi.string().trim().max(30),
});

exports.registerCustomer = Joi.object({
  ...base,
  email: Joi.string().email(),
  password: env.otp.enabled ? password : password.required(), // password not needed once OTP login is enabled
  location,
});

exports.login = Joi.object({ mobile: mobile.required(), password: Joi.string().required() });
exports.sendOtp = Joi.object({ mobile: mobile.required() });
exports.verifyOtp = Joi.object({ mobile: mobile.required(), otp: Joi.string().length(6).required() });
exports.firebaseLogin = Joi.object({ idToken: Joi.string().required() });
