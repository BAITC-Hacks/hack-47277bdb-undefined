const service = require('./oneClickOrder.service');

const create = async (req, res) => {
  const data = await service.createOneClickOrder(req.body);
  return res.status(201).json({ success: true, data });
};

module.exports = { create };
