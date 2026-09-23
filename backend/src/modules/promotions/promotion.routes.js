const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./promotion.service');

const router = express.Router();
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await service.listActivePromotions(req.language);
    return res.json({ success: true, data });
  }),
);
module.exports = router;
