const express = require('express');
const controller = require('./order.controller');
const asyncHandler = require('../../utils/asyncHandler');
const authMiddleware = require('../../middleware/auth.middleware');
const optionalAuthMiddleware = require('../../middleware/optionalAuth.middleware');
const identityMiddleware = require('../../middleware/identity.middleware');
const validationMiddleware = require('../../middleware/validation.middleware');
const { createOrderValidation, orderIdValidation } = require('./order.validation');

const router = express.Router();

router.post(
  '/',
  asyncHandler(optionalAuthMiddleware),
  identityMiddleware,
  createOrderValidation,
  validationMiddleware,
  asyncHandler(controller.create),
);
router.get('/me', asyncHandler(authMiddleware), asyncHandler(controller.mine));
router.get(
  '/:id',
  asyncHandler(authMiddleware),
  orderIdValidation,
  validationMiddleware,
  asyncHandler(controller.getById),
);

module.exports = router;
