const express = require('express');
const controller = require('./category.controller');
const asyncHandler = require('../../utils/asyncHandler');

const router = express.Router();

router.get('/', asyncHandler(controller.list));
router.get('/tree', asyncHandler(controller.tree));
router.get('/:slug', asyncHandler(controller.getBySlug));

module.exports = router;
