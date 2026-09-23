const express = require('express');
const controller = require('./city.controller');
const asyncHandler = require('../../utils/asyncHandler');

const router = express.Router();

router.get('/', asyncHandler(controller.list));
router.get('/:slug', asyncHandler(controller.getBySlug));

module.exports = router;
