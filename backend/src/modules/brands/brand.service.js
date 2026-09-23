const prisma = require('../../config/prisma');
const { localizedEntity } = require('../../utils/localization');

const listBrands = async (language) => {
  const brands = await prisma.brand.findMany({
    where: { isActive: true },
    orderBy: [{ name: 'asc' }],
  });

  return brands.map((brand) => localizedEntity(brand, language, ['description']));
};

module.exports = { listBrands };
