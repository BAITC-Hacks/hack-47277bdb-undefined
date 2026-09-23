const ApiError = require('../utils/apiError');

const notFoundMiddleware = (req, res, next) => {
  next(new ApiError(404, 'ROUTE_NOT_FOUND', 'API бағыты табылмады'));
};

module.exports = notFoundMiddleware;
