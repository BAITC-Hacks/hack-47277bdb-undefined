const { body } = require('express-validator');

// Optional text accepts omitted/null/empty input, but false and 0 are supplied
// values: reject them before a sanitizer or service can coerce/call .trim().
const optionalTextBody = (field, message = `${field} мәтін болуы керек`) =>
  body(field)
    .if((value) => value !== undefined && value !== null && value !== '')
    .isString()
    .withMessage(message)
    .bail()
    .trim();

module.exports = { optionalTextBody };
