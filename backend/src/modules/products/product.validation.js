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
  query('inStock')
    .optional()
    .isBoolean()
    .withMessage('inStock true немесе false болуы керек')
    .toBoolean(),
  query('isNew')
    .optional()
    .isBoolean()
    .withMessage('isNew true немесе false болуы керек')
    .toBoolean(),
  query('isSpecialOffer')
    .optional()
    .isBoolean()
    .withMessage('isSpecialOffer true немесе false болуы керек')
    .toBoolean(),
  query('minPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('minPrice нөлден кем емес сан болуы керек')
    .toFloat(),
  query('maxPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('maxPrice нөлден кем емес сан болуы керек')
    .toFloat()
    .custom((value, { req }) => {
      if (req.query.minPrice !== undefined && value < Number(req.query.minPrice)) {
        throw new Error('maxPrice minPrice мәнінен кем болмауы керек');
      }
      return true;
    }),
  query('attributes')
    .optional()
    .isString()
    .isLength({ min: 3, max: 2000 })
    .withMessage('attributes пішімі дұрыс емес'),
  query('sort')
    .optional()
    .isIn([
      'default',
      'name_asc',
      'name_desc',
      'price_asc',
      'price_desc',
      'popularity_asc',
      'popularity_desc',
      'newest',
    ])
    .withMessage('sort мәні қолдау көрсетілмейді'),
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

const relatedValidation = [
  param('id').isUUID().withMessage('Тауар идентификаторы UUID болуы керек'),
  optionalTextQuery('city'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('limit 1–20 аралығында болуы керек')
    .toInt(),
];

module.exports = { listValidation, slugValidation, availabilityValidation, relatedValidation };
