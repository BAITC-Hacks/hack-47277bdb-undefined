const express = require('express');
const { param } = require('express-validator');
const controller = require('./favorite.controller');
const asyncHandler = require('../../utils/asyncHandler');
const authMiddleware = require('../../middleware/auth.middleware');
const validationMiddleware = require('../../middleware/validation.middleware');

const router = express.Router();
const productIdValidation = [
  param('productId').isUUID().withMessage('Тауар идентификаторы UUID болуы керек'),
];

router.use(asyncHandler(authMiddleware));
router.get('/', asyncHandler(controller.list));
router.post('/:productId', productIdValidation, validationMiddleware, asyncHandler(controller.add));
router.delete(
  '/:productId',
  productIdValidation,
  validationMiddleware,
  asyncHandler(controller.remove),
);

module.exports = router;
