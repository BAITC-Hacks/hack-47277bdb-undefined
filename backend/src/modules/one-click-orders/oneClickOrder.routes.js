const express = require('express');
const { body } = require('express-validator');
const controller = require('./oneClickOrder.controller');
const asyncHandler = require('../../utils/asyncHandler');
const validationMiddleware = require('../../middleware/validation.middleware');
const { optionalTextBody } = require('../../utils/validation');

const router = express.Router();

router.post(
  '/',
  [
    body('productId').isUUID().withMessage('productId UUID болуы керек'),
    body('cityId').isUUID().withMessage('cityId UUID болуы керек'),
    body('quantity').isInt({ min: 1, max: 10000 }).withMessage('quantity кемінде 1 болуы керек').toInt(),
    body('customerName').isString().trim().isLength({ min: 2, max: 150 }),
    body('phone').isString().trim().isLength({ min: 5, max: 30 }),
    optionalTextBody('email').isEmail().bail().normalizeEmail(),
  ],
  validationMiddleware,
  asyncHandler(controller.create),
);

module.exports = router;
