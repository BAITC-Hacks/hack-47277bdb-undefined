const slugify = require('slugify');

const createSlug = (value) =>
  slugify(value, {
    lower: true,
    strict: true,
    trim: true,
  });

module.exports = createSlug;
