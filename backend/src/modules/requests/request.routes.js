const express = require('express');
const { body } = require('express-validator');
const asyncHandler = require('../../utils/asyncHandler');
const validationMiddleware = require('../../middleware/validation.middleware');
const service = require('./request.service');
const { optionalTextBody } = require('../../utils/validation');

const router = express.Router();
router.post(
  '/',
  [
    body('type').optional().isIn(['GENERAL', 'CALLBACK', 'B2B', 'CUSTOM_PANEL', 'COOPERATION']),
    body('name').isString().trim().isLength({ min: 2, max: 150 }),
    body('phone').isString().trim().isLength({ min: 5, max: 30 }),
    optionalTextBody('email').isEmail().bail().normalizeEmail(),
    optionalTextBody('company').isLength({ max: 200 }),
    optionalTextBody('message').isLength({ max: 3000 }),
  ],
  validationMiddleware,
  asyncHandler(async (req, res) => {
    const data = await service.createRequest(req.body);
    return res.status(201).json({ success: true, data });
  }),
);
module.exports = router;
