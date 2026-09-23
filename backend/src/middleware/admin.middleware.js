const ApiError = require('../utils/apiError');

const adminMiddleware = (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(401, 'AUTH_REQUIRED', 'Авторизация қажет'));
  }

  if (req.user.role !== 'ADMIN') {
    return next(new ApiError(403, 'ADMIN_REQUIRED', 'Әкімші рұқсаты қажет'));
  }

  return next();
};

module.exports = adminMiddleware;
