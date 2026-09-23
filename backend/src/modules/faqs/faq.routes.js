const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./faq.service');

const router = express.Router();
router.get(
  '/',
  asyncHandler(async (req, res) =>
    res.json({ success: true, data: await service.listFaqs(req.language) }),
  ),
);
module.exports = router;
