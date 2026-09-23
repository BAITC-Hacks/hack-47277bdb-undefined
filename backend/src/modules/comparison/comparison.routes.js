const express = require('express');
const { param } = require('express-validator');
const controller = require('./comparison.controller');
const asyncHandler = require('../../utils/asyncHandler');
const optionalAuthMiddleware = require('../../middleware/optionalAuth.middleware');
const identityMiddleware = require('../../middleware/identity.middleware');
const validationMiddleware = require('../../middleware/validation.middleware');

const router = express.Router();
const productIdValidation = [param('productId').isUUID().withMessage('productId UUID болуы керек')];

router.use(asyncHandler(optionalAuthMiddleware), identityMiddleware);
router.get('/', asyncHandler(controller.get));
router.post('/:productId', productIdValidation, validationMiddleware, asyncHandler(controller.add));
router.delete('/:productId', productIdValidation, validationMiddleware, asyncHandler(controller.remove));
router.delete('/', asyncHandler(controller.clear));

module.exports = router;
