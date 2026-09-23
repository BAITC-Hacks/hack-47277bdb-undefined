const { body, param } = require('express-validator');

const createOrderValidation = [
  body('customerName').isString().trim().isLength({ min: 2, max: 150 }),
  body('phone').isString().trim().isLength({ min: 5, max: 30 }),
  body('email').isEmail().normalizeEmail(),
  body('customerType').isIn(['PERSON', 'COMPANY']),
  body('companyName').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 200 }),
  body('bin').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ min: 12, max: 12 }),
  body('deliveryMethod').isIn(['PICKUP', 'DELIVERY']),
  body('paymentMethod').isIn([
    'ONLINE_CARD',
    'CASH_ON_DELIVERY',
    'POS_ON_PICKUP',
    'BANK_TRANSFER',
  ]),
  body('deliveryAddress').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 500 }),
  body('comment').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 1000 }),
];

const orderIdValidation = [param('id').isUUID().withMessage('Тапсырыс идентификаторы UUID болуы керек')];

module.exports = { createOrderValidation, orderIdValidation };
