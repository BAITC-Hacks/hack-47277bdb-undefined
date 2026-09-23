const { body, param } = require('express-validator');
const { optionalTextBody } = require('../../utils/validation');

const createOrderValidation = [
  body('customerName').isString().trim().isLength({ min: 2, max: 150 }),
  body('phone').isString().trim().isLength({ min: 5, max: 30 }),
  body('email').isEmail().normalizeEmail(),
  body('customerType').isIn(['PERSON', 'COMPANY']),
  optionalTextBody('companyName').isLength({ max: 200 }),
  optionalTextBody('bin').isLength({ min: 12, max: 12 }),
  body('deliveryMethod').isIn(['PICKUP', 'DELIVERY']),
  body('paymentMethod').isIn([
    'ONLINE_CARD',
    'CASH_ON_DELIVERY',
    'POS_ON_PICKUP',
    'BANK_TRANSFER',
  ]),
  optionalTextBody('deliveryAddress').isLength({ max: 500 }),
  optionalTextBody('comment').isLength({ max: 1000 }),
];

const orderIdValidation = [param('id').isUUID().withMessage('Тапсырыс идентификаторы UUID болуы керек')];

module.exports = { createOrderValidation, orderIdValidation };
