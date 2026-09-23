const express = require('express');
const { body, param } = require('express-validator');
const controller = require('./cart.controller');
const asyncHandler = require('../../utils/asyncHandler');
const optionalAuthMiddleware = require('../../middleware/optionalAuth.middleware');
const identityMiddleware = require('../../middleware/identity.middleware');
const validationMiddleware = require('../../middleware/validation.middleware');

const router = express.Router();
const quantityValidation = body('quantity')
  .isInt({ min: 1, max: 10000 })
  .withMessage('quantity 1 немесе одан үлкен бүтін сан болуы керек')
  .toInt();

router.use(asyncHandler(optionalAuthMiddleware), identityMiddleware);
router.get('/', asyncHandler(controller.get));
router.post(
  '/items',
  [body('productId').isUUID().withMessage('productId UUID болуы керек'), quantityValidation],
  validationMiddleware,
  asyncHandler(controller.addItem),
);
router.patch(
  '/items/:itemId',
  [param('itemId').isUUID().withMessage('itemId UUID болуы керек'), quantityValidation],
  validationMiddleware,
  asyncHandler(controller.updateItem),
);
router.delete(
  '/items/:itemId',
  [param('itemId').isUUID().withMessage('itemId UUID болуы керек')],
  validationMiddleware,
  asyncHandler(controller.removeItem),
);
router.delete('/', asyncHandler(controller.clear));
router.patch(
  '/city',
  [body('cityId').isUUID().withMessage('cityId UUID болуы керек')],
  validationMiddleware,
  asyncHandler(controller.changeCity),
);

module.exports = router;
