const express = require('express');
const { param, query } = require('express-validator');
const controller = require('./catalog.controller');
const asyncHandler = require('../../utils/asyncHandler');
const validationMiddleware = require('../../middleware/validation.middleware');

const router = express.Router();

router.get(
  '/price-list',
  [
    query('city').optional().isString().trim().isLength({ min: 1, max: 100 }),
    query('format').optional().equals('xlsx').withMessage('Тек xlsx форматына қолдау көрсетіледі'),
  ],
  validationMiddleware,
  asyncHandler(controller.priceList),
);

router.get(
  '/categories/:slug/filters',
  [
    param('slug').isString().trim().isLength({ min: 1, max: 250 }),
    query('city').optional().isString().trim().isLength({ min: 1, max: 100 }),
  ],
  validationMiddleware,
  asyncHandler(controller.filters),
);

module.exports = router;
