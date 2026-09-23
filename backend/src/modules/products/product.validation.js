const { param, query } = require('express-validator');

const optionalTextQuery = (field) =>
  query(field)
    .optional()
    .isString()
    .withMessage(`${field} мәтін болуы керек`)
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage(`${field} 1–200 таңба аралығында болуы керек`);

const listValidation = [
  optionalTextQuery('q'),
  optionalTextQuery('city'),
  optionalTextQuery('category'),
  optionalTextQuery('brand'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page 1 немесе одан үлкен бүтін сан болуы керек')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit 1–100 аралығындағы бүтін сан болуы керек')
    .toInt(),
];

const slugValidation = [
  param('slug')
    .isString()
    .trim()
    .isLength({ min: 1, max: 250 })
    .withMessage('Тауар slug мәні дұрыс емес'),
  optionalTextQuery('city'),
];

const availabilityValidation = [
  param('id').isUUID().withMessage('Тауар идентификаторы UUID болуы керек'),
  optionalTextQuery('city'),
];

module.exports = { listValidation, slugValidation, availabilityValidation };
