const service = require('./comparison.service');

const get = async (req, res) => {
  const data = await service.getComparison(req.identity, req.language);
  return res.json({ success: true, data });
};
const add = async (req, res) => {
  const data = await service.addItem(req.identity, req.params.productId);
  return res.status(201).json({ success: true, data });
};
const remove = async (req, res) => {
  await service.removeItem(req.identity, req.params.productId);
  return res.status(204).send();
};
const clear = async (req, res) => {
  await service.clear(req.identity);
  return res.status(204).send();
};

module.exports = { get, add, remove, clear };
