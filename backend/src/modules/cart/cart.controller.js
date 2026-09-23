const service = require('./cart.service');

const get = async (req, res) => {
  const data = await service.getCart(req.identity, req.language);
  return res.json({ success: true, data });
};
const addItem = async (req, res) => {
  const data = await service.addItem(req.identity, req.body, req.language);
  return res.status(201).json({ success: true, data });
};
const updateItem = async (req, res) => {
  const data = await service.updateItem(
    req.identity,
    req.params.itemId,
    req.body.quantity,
    req.language,
  );
  return res.json({ success: true, data });
};
const removeItem = async (req, res) => {
  const data = await service.removeItem(req.identity, req.params.itemId, req.language);
  return res.json({ success: true, data });
};
const clear = async (req, res) => {
  await service.clearCart(req.identity);
  return res.status(204).send();
};
const changeCity = async (req, res) => {
  const data = await service.changeCity(req.identity, req.body.cityId, req.language);
  return res.json({ success: true, data });
};

module.exports = { get, addItem, updateItem, removeItem, clear, changeCity };
