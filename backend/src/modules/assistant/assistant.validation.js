const { body } = require('express-validator');
const allowed = new Set(['message', 'sessionId', 'city', 'selectedProductId', 'quantity', 'pendingActionId']);
module.exports = [
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !allowed.has(key))) {
      throw new Error('Тек message, sessionId, city, selectedProductId, quantity, pendingActionId рұқсат етіледі');
    }
    return true;
  }),
  body('message').isString().bail().trim().isLength({ min: 1, max: 4000 }),
  body('sessionId').optional().isUUID().bail().toLowerCase(),
  body('selectedProductId').optional().isUUID().bail().toLowerCase(),
  body('pendingActionId').optional().isUUID().bail().toLowerCase(),
  body('city').optional().isString().bail().trim().isLength({ min: 1, max: 100 }).matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  body('quantity').optional().custom((value) => Number.isInteger(value) && value >= 1 && value <= 10000),
];
