const productService = require('./product.service');

const list = async (req, res) => {
  const result = await productService.listProducts({
    query: req.query,
    language: req.language,
  });
  return res.json({ success: true, data: result.data, pagination: result.pagination });
};

const getBySlug = async (req, res) => {
  const data = await productService.getProductBySlug({
    slug: req.params.slug,
    citySlug: req.query.city,
    language: req.language,
  });
  return res.json({ success: true, data });
};

const availability = async (req, res) => {
  const data = await productService.getProductAvailability({
    productId: req.params.id,
    citySlug: req.query.city,
    language: req.language,
  });
  return res.json({ success: true, data });
};

module.exports = { list, getBySlug, availability };
