const prisma = require('../../config/prisma');

const getActiveWarehousesByCity = (cityId) =>
  prisma.warehouse.findMany({
    where: { cityId, isActive: true },
    orderBy: [{ name: 'asc' }],
  });

module.exports = { getActiveWarehousesByCity };
