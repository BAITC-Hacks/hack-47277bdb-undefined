const express = require('express');
const controller = require('./product.controller');
const asyncHandler = require('../../utils/asyncHandler');
const validationMiddleware = require('../../middleware/validation.middleware');
const {
  listValidation,
  slugValidation,
  availabilityValidation,
  relatedValidation,
} = require('./product.validation');

const router = express.Router();

router.get('/', listValidation, validationMiddleware, asyncHandler(controller.list));
router.get(
  '/:id/availability',
  availabilityValidation,
  validationMiddleware,
  asyncHandler(controller.availability),
);
router.get(
  '/:id/related',
  relatedValidation,
  validationMiddleware,
  asyncHandler(controller.related),
);
router.get('/:slug', slugValidation, validationMiddleware, asyncHandler(controller.getBySlug));

module.exports = router;
