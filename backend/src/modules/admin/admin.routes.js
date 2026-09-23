const express = require('express');
const { body, param, query } = require('express-validator');
const controller = require('./admin.controller');
const asyncHandler = require('../../utils/asyncHandler');
const authMiddleware = require('../../middleware/auth.middleware');
const adminMiddleware = require('../../middleware/admin.middleware');
const validationMiddleware = require('../../middleware/validation.middleware');
const { resources } = require('./admin-resource.service');

const router = express.Router();
const resourceNames = Object.keys(resources);
const paginationValidation = [
  query('page').default(1).isInt({ min: 1 }).toInt(),
  query('limit').default(20).isInt({ min: 1, max: 100 }).toInt(),
];
const resourceValidation = param('resource').isIn(resourceNames).withMessage('Admin ресурсы жарамсыз');
const idValidation = param('id').isUUID().withMessage('id UUID болуы керек');

router.use(asyncHandler(authMiddleware), adminMiddleware);

router.get(
  '/orders',
  [
    ...paginationValidation,
    query('status').optional().isIn(['NEW', 'CONFIRMED', 'PROCESSING', 'READY', 'SHIPPED', 'COMPLETED', 'CANCELLED']),
  ],
  validationMiddleware,
  asyncHandler(controller.listOrders),
);
router.patch(
  '/orders/:id/status',
  [
    idValidation,
    body('status').isIn(['NEW', 'CONFIRMED', 'PROCESSING', 'READY', 'SHIPPED', 'COMPLETED', 'CANCELLED']),
    body('paymentStatus').optional().isIn(['UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED']),
  ],
  validationMiddleware,
  asyncHandler(controller.updateOrderStatus),
);
router.get(
  '/requests',
  [
    ...paginationValidation,
    query('status').optional().isIn(['NEW', 'IN_PROGRESS', 'COMPLETED', 'REJECTED']),
  ],
  validationMiddleware,
  asyncHandler(controller.listRequests),
);
router.patch(
  '/requests/:id/status',
  [
    idValidation,
    body('status').isIn(['NEW', 'IN_PROGRESS', 'COMPLETED', 'REJECTED']),
  ],
  validationMiddleware,
  asyncHandler(controller.updateRequestStatus),
);

router.get(
  '/:resource',
  [resourceValidation, ...paginationValidation],
  validationMiddleware,
  asyncHandler(controller.listResource),
);
router.post('/:resource', [resourceValidation], validationMiddleware, asyncHandler(controller.createResource));
router.get(
  '/:resource/:id',
  [resourceValidation, idValidation],
  validationMiddleware,
  asyncHandler(controller.getResource),
);
router.patch(
  '/:resource/:id',
  [resourceValidation, idValidation],
  validationMiddleware,
  asyncHandler(controller.updateResource),
);
router.delete(
  '/:resource/:id',
  [resourceValidation, idValidation],
  validationMiddleware,
  asyncHandler(controller.deleteResource),
);

module.exports = router;
