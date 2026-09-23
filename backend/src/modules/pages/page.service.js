const prisma = require('../../config/prisma');
const ApiError = require('../../utils/apiError');
const { localizedEntity } = require('../../utils/localization');

const getPage = async (slug, language) => {
  const page = await prisma.contentPage.findFirst({ where: { slug, isPublished: true } });
  if (!page) throw new ApiError(404, 'PAGE_NOT_FOUND', 'Бет табылмады');
  return localizedEntity(page, language, ['title', 'content']);
};
module.exports = { getPage };
