const { validationResult } = require('express-validator');
const ApiError = require('../utils/apiError');

const validationMiddleware = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = result.array().map((error) => ({
    field: error.path,
    message: error.msg,
  }));

  return next(new ApiError(422, 'VALIDATION_ERROR', 'Деректер дұрыс емес', details));
};

module.exports = validationMiddleware;
