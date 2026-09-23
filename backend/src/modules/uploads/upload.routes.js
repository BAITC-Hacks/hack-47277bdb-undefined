const express = require('express');
const { param } = require('express-validator');
const controller = require('./upload.controller');
const validationMiddleware = require('../../middleware/validation.middleware');

const router = express.Router();
router.get(
  '/:filename',
  [
    param('filename')
      .matches(/^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/i)
      .withMessage('Файл атауы дұрыс емес'),
  ],
  validationMiddleware,
  controller.serveFile,
);
module.exports = router;
