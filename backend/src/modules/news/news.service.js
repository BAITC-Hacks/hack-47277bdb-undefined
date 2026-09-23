const prisma = require('../../config/prisma');
const ApiError = require('../../utils/apiError');
const { localizedEntity } = require('../../utils/localization');
const { getPagination, buildPagination } = require('../../utils/pagination');

const listNews = async (query, language) => {
  const { page, limit, skip } = getPagination(query);
  const where = { isPublished: true, publishedAt: { lte: new Date() } };
  const [items, total] = await prisma.$transaction([
    prisma.news.findMany({ where, orderBy: { publishedAt: 'desc' }, skip, take: limit }),
    prisma.news.count({ where }),
  ]);
  return {
    data: items.map((item) => localizedEntity(item, language, ['title', 'excerpt', 'content'])),
    pagination: buildPagination(page, limit, total),
  };
};

const getNewsBySlug = async (slug, language) => {
  const item = await prisma.news.findFirst({
    where: { slug, isPublished: true, publishedAt: { lte: new Date() } },
  });
  if (!item) throw new ApiError(404, 'NEWS_NOT_FOUND', 'Жаңалық табылмады');
  return localizedEntity(item, language, ['title', 'excerpt', 'content']);
};

module.exports = { listNews, getNewsBySlug };
