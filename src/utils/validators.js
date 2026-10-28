const Joi = require('joi');

const mobile = Joi.string().pattern(/^[6-9]\d{9}$/).messages({ 'string.pattern.base': 'Enter a valid 10 digit mobile number' });
const pincode = Joi.string().pattern(/^\d{6}$/).messages({ 'string.pattern.base': 'Pincode must be 6 digits' });
const password = Joi.string().min(8).max(64);
const location = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
  areaName: Joi.string().trim().max(100),
});
const pagination = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
};

module.exports = { Joi, mobile, pincode, password, location, pagination };
