const express = require('express');
const { param } = require('express-validator');
const asyncHandler = require('../../utils/asyncHandler');
const validationMiddleware = require('../../middleware/validation.middleware');
const service = require('./page.service');

const router = express.Router();
router.get(
  '/:slug',
  [param('slug').isString().trim().isLength({ min: 1, max: 250 })],
  validationMiddleware,
  asyncHandler(async (req, res) =>
    res.json({ success: true, data: await service.getPage(req.params.slug, req.language) }),
  ),
);
module.exports = router;
