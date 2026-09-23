const express = require('express');
const controller = require('./branch.controller');
const asyncHandler = require('../../utils/asyncHandler');

const router = express.Router();

router.get('/', asyncHandler(controller.list));

module.exports = router;
