const ApiError = require('../utils/ApiError');

module.exports = (schema, source = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[source], { abortEarly: false, stripUnknown: true, convert: true });
  if (error) {
    return next(new ApiError(422, 'Validation failed',
      error.details.map((d) => ({ field: d.path.join('.'), message: d.message.replace(/"/g, '') }))));
  }
  req[source] = value;
  next();
};
