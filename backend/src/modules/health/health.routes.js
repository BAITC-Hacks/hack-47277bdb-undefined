const express = require('express');
const controller = require('./health.controller');
const asyncHandler = require('../../utils/asyncHandler');

const router = express.Router();

router.get('/', asyncHandler(controller.getHealth));

module.exports = router;
