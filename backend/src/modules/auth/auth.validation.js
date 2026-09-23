const { body } = require('express-validator');
const { optionalTextBody } = require('../../utils/validation');

const emailValidation = body('email')
  .isString()
  .withMessage('Email мәтін болуы керек')
  .trim()
  .isEmail()
  .withMessage('Email пішімі дұрыс емес')
  .normalizeEmail();

const passwordValidation = body('password')
  .isString()
  .withMessage('Құпиясөз мәтін болуы керек')
  .isLength({ min: 8 })
  .withMessage('Құпиясөз кемінде 8 таңбадан тұруы керек');

const registerValidation = [
  emailValidation,
  passwordValidation,
  body('firstName')
    .isString()
    .withMessage('Аты мәтін болуы керек')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Аты 1–100 таңба аралығында болуы керек'),
  optionalTextBody('lastName', 'Тегі мәтін болуы керек')
    .isLength({ max: 100 })
    .withMessage('Тегі 100 таңбадан аспауы керек'),
  optionalTextBody('phone', 'Телефон мәтін болуы керек')
    .isLength({ min: 5, max: 30 })
    .withMessage('Телефон 5–30 таңба аралығында болуы керек'),
];

const loginValidation = [emailValidation, passwordValidation];

module.exports = { registerValidation, loginValidation };
