const express = require('express');
const controller = require('./upload.controller');
const asyncHandler = require('../../utils/asyncHandler');
const authMiddleware = require('../../middleware/auth.middleware');
const adminMiddleware = require('../../middleware/admin.middleware');
const { upload } = require('../../config/upload');

const router = express.Router();
router.post(
  '/',
  asyncHandler(authMiddleware),
  adminMiddleware,
  upload.single('file'),
  controller.uploadFile,
);
module.exports = router;
