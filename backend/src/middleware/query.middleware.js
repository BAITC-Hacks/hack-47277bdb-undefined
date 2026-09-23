const ApiError = require('../utils/apiError');

// Express 5 exposes query as a getter that reparses on every access. Retain one
// request-local object so express-validator's sanitizers/defaults reach services.
module.exports = (req, res, next) => {
  const query = req.query;
  if (Object.values(query).some((value) => typeof value !== 'string')) {
    return next(new ApiError(422, 'VALIDATION_ERROR', 'Query параметрін тек бір рет беріңіз', []));
  }
  Object.defineProperty(req, 'query', { value: query, writable: true, configurable: true });
  return next();
};
