const prisma = require('../../config/prisma');
const { localizedEntity } = require('../../utils/localization');

const listActivePromotions = async (language) => {
  const now = new Date();
  const promotions = await prisma.promotion.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
  });
  return promotions.map((item) => localizedEntity(item, language, ['title', 'description']));
};

module.exports = { listActivePromotions };
