const service = require('./favorite.service');

const list = async (req, res) => {
  const data = await service.listFavorites(req.user.id, req.language);
  return res.json({ success: true, data });
};
const add = async (req, res) => {
  const data = await service.addFavorite(req.user.id, req.params.productId);
  return res.status(201).json({ success: true, data });
};
const remove = async (req, res) => {
  await service.removeFavorite(req.user.id, req.params.productId);
  return res.status(204).send();
};

module.exports = { list, add, remove };
