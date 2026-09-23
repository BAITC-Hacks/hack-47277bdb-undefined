const prisma = require('../../config/prisma');
const ApiError = require('../../utils/apiError');
const { localizedEntity } = require('../../utils/localization');

const toCategory = (category, language) =>
  localizedEntity(category, language, ['name', 'description']);

const toAttributeDefinition = (definition, language) =>
  localizedEntity(definition, language, ['name']);

const listCategories = async (language) => {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { nameKk: 'asc' }],
  });

  return categories.map((category) => toCategory(category, language));
};

const getCategoryTree = async (language) => {
  const categories = await listCategories(language);
  const byId = new Map(
    categories.map((category) => [category.id, { ...category, children: [] }]),
  );
  const roots = [];

  for (const category of byId.values()) {
    const parent = category.parentId ? byId.get(category.parentId) : null;
    if (parent) parent.children.push(category);
    else roots.push(category);
  }

  return roots;
};

const getCategoryBySlug = async (slug, language) => {
  const category = await prisma.category.findFirst({
    where: { slug, isActive: true },
    include: {
      children: {
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { nameKk: 'asc' }],
      },
      attributeDefinitions: {
        orderBy: [{ sortOrder: 'asc' }, { nameKk: 'asc' }],
      },
    },
  });

  if (!category) {
    throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Санат табылмады');
  }

  const localized = toCategory(category, language);
  localized.children = category.children.map((child) => toCategory(child, language));
  localized.attributeDefinitions = category.attributeDefinitions.map((definition) =>
    toAttributeDefinition(definition, language),
  );
  return localized;
};

module.exports = { listCategories, getCategoryTree, getCategoryBySlug };
