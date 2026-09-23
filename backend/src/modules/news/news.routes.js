const express = require('express');
const { param, query } = require('express-validator');
const asyncHandler = require('../../utils/asyncHandler');
const validationMiddleware = require('../../middleware/validation.middleware');
const service = require('./news.service');

const router = express.Router();
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  validationMiddleware,
  asyncHandler(async (req, res) => {
    const result = await service.listNews(req.query, req.language);
    return res.json({ success: true, data: result.data, pagination: result.pagination });
  }),
);
router.get(
  '/:slug',
  [param('slug').isString().trim().isLength({ min: 1, max: 250 })],
  validationMiddleware,
  asyncHandler(async (req, res) => {
    const data = await service.getNewsBySlug(req.params.slug, req.language);
    return res.json({ success: true, data });
  }),
);
module.exports = router;
