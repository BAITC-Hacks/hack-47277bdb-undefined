const service = require('./order.service');

const create = async (req, res) => {
  const order = await service.createOrder({
    identity: req.identity,
    payload: req.body,
    language: req.language,
  });
  return res.status(201).json({ success: true, data: service.serializeOrder(order, req.language) });
};
const mine = async (req, res) => {
  const data = await service.listUserOrders(req.user.id, req.language);
  return res.json({ success: true, data });
};
const getById = async (req, res) => {
  const data = await service.getUserOrder(req.user.id, req.params.id, req.language);
  return res.json({ success: true, data });
};

module.exports = { create, mine, getById };
