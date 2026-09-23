const resourceService = require('./admin-resource.service');
const orderService = require('../orders/order.service');
const prisma = require('../../config/prisma');
const { buildPagination } = require('../../utils/pagination');

const listResource = async (req, res) => {
  const result = await resourceService.listResource(req.params.resource, req.query);
  return res.json({ success: true, data: result.data, pagination: result.pagination });
};
const getResource = async (req, res) =>
  res.json({ success: true, data: await resourceService.getResource(req.params.resource, req.params.id) });
const createResource = async (req, res) =>
  res.status(201).json({ success: true, data: await resourceService.createResource(req.params.resource, req.body) });
const updateResource = async (req, res) =>
  res.json({ success: true, data: await resourceService.updateResource(req.params.resource, req.params.id, req.body) });
const deleteResource = async (req, res) => {
  const data = await resourceService.deleteResource(req.params.resource, req.params.id);
  return res.json({ success: true, data });
};

const listOrders = async (req, res) => {
  const result = await orderService.listAdminOrders(req.query);
  return res.json({
    success: true,
    data: result.orders.map((order) => orderService.serializeOrder(order, req.language)),
    pagination: buildPagination(req.query.page, req.query.limit, result.total),
  });
};
const updateOrderStatus = async (req, res) =>
  res.json({ success: true, data: await orderService.updateOrderStatus(req.params.id, req.body) });

const listRequests = async (req, res) => {
  const skip = (req.query.page - 1) * req.query.limit;
  const where = req.query.status ? { status: req.query.status } : {};
  const [data, total] = await prisma.$transaction([
    prisma.customerRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: req.query.limit }),
    prisma.customerRequest.count({ where }),
  ]);
  return res.json({
    success: true,
    data,
    pagination: buildPagination(req.query.page, req.query.limit, total),
  });
};
const updateRequestStatus = async (req, res) =>
  res.json({
    success: true,
    data: await prisma.customerRequest.update({
      where: { id: req.params.id },
      data: { status: req.body.status },
    }),
  });

module.exports = {
  listResource,
  getResource,
  createResource,
  updateResource,
  deleteResource,
  listOrders,
  updateOrderStatus,
  listRequests,
  updateRequestStatus,
};
