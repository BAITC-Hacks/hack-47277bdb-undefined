const rateLimit = require('express-rate-limit');

const commonOptions = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
};

const apiRateLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  limit: 300,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Сұраулар саны тым көп. Кейінірек қайталап көріңіз.',
    },
  },
});

const authRateLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Кіру әрекеттері тым көп. Кейінірек қайталап көріңіз.',
    },
  },
});

module.exports = { apiRateLimiter, authRateLimiter };
