const express = require('express');
const controller = require('./auth.controller');
const asyncHandler = require('../../utils/asyncHandler');
const authMiddleware = require('../../middleware/auth.middleware');
const validationMiddleware = require('../../middleware/validation.middleware');
const { authRateLimiter } = require('../../middleware/rateLimit.middleware');
const { registerValidation, loginValidation } = require('./auth.validation');

const router = express.Router();

router.post(
  '/register',
  authRateLimiter,
  registerValidation,
  validationMiddleware,
  asyncHandler(controller.register),
);
router.post(
  '/login',
  authRateLimiter,
  loginValidation,
  validationMiddleware,
  asyncHandler(controller.login),
);
router.get('/me', asyncHandler(authMiddleware), asyncHandler(controller.me));

module.exports = router;
