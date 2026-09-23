const prisma = require('../../config/prisma');
const ApiError = require('../../utils/apiError');
const { getLocalizedValue } = require('../../utils/localization');
const { resolveCatalogCity } = require('../products/product-query.service');

const getCategoryFilters = async ({ slug, citySlug, language }) => {
  const [category, city] = await Promise.all([
    prisma.category.findFirst({ where: { slug, isActive: true } }),
    citySlug ? resolveCatalogCity(citySlug) : Promise.resolve(null),
  ]);
  if (!category) throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Санат табылмады');

  const productWhere = {
    categoryId: category.id,
    isActive: true,
    ...(city ? { offers: { some: { cityId: city.id, isActive: true } } } : {}),
  };
  const [products, definitions, priceRange] = await Promise.all([
    prisma.product.findMany({
      where: productWhere,
      select: { brand: { select: { id: true, slug: true, name: true, logoUrl: true } } },
    }),
    prisma.attributeDefinition.findMany({
      where: { categoryId: category.id, filterable: true },
      include: {
        values: {
          where: { product: productWhere },
          select: { textValue: true, numberValue: true, booleanValue: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { nameKk: 'asc' }],
    }),
    city
      ? prisma.productOffer.aggregate({
          where: {
            cityId: city.id,
            isActive: true,
            product: productWhere,
          },
          _min: { webPrice: true },
          _max: { webPrice: true },
        })
      : Promise.resolve({ _min: { webPrice: null }, _max: { webPrice: null } }),
  ]);

  const brandMap = new Map();
  products.forEach(({ brand }) => {
    if (brand) brandMap.set(brand.id, brand);
  });

  const attributes = definitions.map((definition) => {
    const values = definition.values
      .map((entry) => {
        if (definition.type === 'NUMBER') {
          return entry.numberValue === null ? null : Number(entry.numberValue);
        }
        if (definition.type === 'BOOLEAN') return entry.booleanValue;
        return entry.textValue;
      })
      .filter((value) => value !== null && value !== undefined);
    const uniqueValues = [...new Set(values.map((value) => JSON.stringify(value)))].map(
      (value) => JSON.parse(value),
    );
    uniqueValues.sort((left, right) =>
      typeof left === 'number'
        ? left - right
        : String(left).localeCompare(String(right), language === 'ru' ? 'ru-RU' : 'kk-KZ'),
    );
    return {
      key: definition.key,
      name: getLocalizedValue(definition, 'name', language),
      type: definition.type,
      unit: definition.unit,
      possibleValues: uniqueValues,
    };
  });

  return {
    category: {
      id: category.id,
      slug: category.slug,
      name: getLocalizedValue(category, 'name', language),
    },
    city: city ? { id: city.id, slug: city.slug } : null,
    brands: [...brandMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    price: {
      min: priceRange._min.webPrice === null ? 0 : Number(priceRange._min.webPrice),
      max: priceRange._max.webPrice === null ? 0 : Number(priceRange._max.webPrice),
    },
    attributes,
  };
};

module.exports = { getCategoryFilters };
