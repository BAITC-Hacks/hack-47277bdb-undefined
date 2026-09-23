const express = require('express');
const { rateLimit } = require('express-rate-limit');
const env = require('../../config/env');
const ApiError = require('../../utils/apiError');
const asyncHandler = require('../../utils/asyncHandler');
const optionalAuth = require('../../middleware/optionalAuth.middleware');
const identity = require('../../middleware/identity.middleware');
const validate = require('../../middleware/validation.middleware');
const validation = require('./assistant.validation');
const controller = require('./assistant.controller');

const router = express.Router();
const limiter = rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
  skip: () => env.nodeEnv === 'test',
  handler: (req, res, next) => next(new ApiError(429, 'ASSISTANT_RATE_LIMITED', 'Ассистентке сұраулар тым жиі жіберілді. Біраз күтіңіз.')),
});
// The body sessionId shorthand is validated before passing through the SAME
// guest identity middleware as the regular cart. No body user/role is accepted.
const sessionBridge = (req, res, next) => {
  const header = req.get('x-session-id')?.trim().toLowerCase();
  if (header && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(header)) {
    return next(new ApiError(422, 'INVALID_SESSION_ID', 'X-Session-Id UUID болуы керек'));
  }
  if (header && req.body.sessionId && header !== req.body.sessionId) {
    return next(new ApiError(422, 'SESSION_ID_MISMATCH', 'sessionId және X-Session-Id сәйкес болуы керек'));
  }
  if (!header && req.body.sessionId) req.headers['x-session-id'] = req.body.sessionId;
  return next();
};
router.post('/chat', limiter, validation, validate, asyncHandler(optionalAuth), sessionBridge, identity, asyncHandler(controller.chat));
module.exports = router;
