const prisma = require('../../config/prisma');
const { localizedEntity } = require('../../utils/localization');

const listFaqs = async (language) => {
  const items = await prisma.faq.findMany({
    where: { isPublished: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  return items.map((item) => localizedEntity(item, language, ['question', 'answer']));
};
module.exports = { listFaqs };
