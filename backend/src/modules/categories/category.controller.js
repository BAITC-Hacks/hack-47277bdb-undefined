const categoryService = require('./category.service');

const list = async (req, res) => {
  const data = await categoryService.listCategories(req.language);
  return res.json({ success: true, data });
};

const tree = async (req, res) => {
  const data = await categoryService.getCategoryTree(req.language);
  return res.json({ success: true, data });
};

const getBySlug = async (req, res) => {
  const data = await categoryService.getCategoryBySlug(req.params.slug, req.language);
  return res.json({ success: true, data });
};

module.exports = { list, tree, getBySlug };
