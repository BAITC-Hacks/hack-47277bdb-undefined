const express = require('express');
const controller = require('./user.controller');
const asyncHandler = require('../../utils/asyncHandler');
const authMiddleware = require('../../middleware/auth.middleware');
const validationMiddleware = require('../../middleware/validation.middleware');
const { updateProfileValidation } = require('./user.validation');

const router = express.Router();

router.use(asyncHandler(authMiddleware));
router.get('/me', controller.me);
router.patch('/me', updateProfileValidation, validationMiddleware, asyncHandler(controller.updateMe));

module.exports = router;
