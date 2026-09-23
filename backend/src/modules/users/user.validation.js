const { body } = require('express-validator');

const EDITABLE_FIELDS = new Set(['firstName', 'lastName', 'phone']);

const updateProfileValidation = [
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Профиль деректері JSON object болуы керек');
    }
    const fields = Object.keys(value);
    if (fields.length === 0) throw new Error('Өзгертілетін профиль өрісі жоқ');
    if (fields.some((field) => !EDITABLE_FIELDS.has(field))) {
      throw new Error('Тек firstName, lastName және phone өрістерін өзгертуге болады');
    }
    return true;
  }),
  body('firstName')
    .optional()
    .isString().withMessage('Аты мәтін болуы керек').bail()
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Аты 1–100 таңба аралығында болуы керек'),
  body('lastName')
    .optional({ nullable: true })
    .isString().withMessage('Тегі мәтін болуы керек').bail()
    .trim()
    .isLength({ max: 100 }).withMessage('Тегі 100 таңбадан аспауы керек'),
  body('phone')
    .optional({ nullable: true })
    .isString().withMessage('Телефон мәтін болуы керек').bail()
    .trim()
    .custom((value) => value === '' || (value.length >= 5 && value.length <= 30))
    .withMessage('Телефон 5–30 таңба аралығында болуы керек; тазарту үшін бос мән беріңіз'),
];

module.exports = { updateProfileValidation };
