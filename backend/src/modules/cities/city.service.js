const prisma = require('../../config/prisma');
const ApiError = require('../../utils/apiError');
const { localizedEntity } = require('../../utils/localization');

const toCity = (city, language) => localizedEntity(city, language, ['name']);

const listCities = async (language) => {
  const cities = await prisma.city.findMany({
    where: { isActive: true },
    orderBy: [{ nameKk: 'asc' }],
  });

  return cities.map((city) => toCity(city, language));
};

const getCityBySlug = async (slug, language) => {
  const city = await prisma.city.findFirst({
    where: { slug, isActive: true },
    include: {
      branches: {
        where: { isActive: true },
        orderBy: [{ nameKk: 'asc' }],
      },
    },
  });

  if (!city) {
    throw new ApiError(404, 'CITY_NOT_FOUND', 'Қала табылмады');
  }

  const localized = toCity(city, language);
  localized.branches = city.branches.map((branch) =>
    localizedEntity(branch, language, ['name', 'address', 'workingHours']),
  );
  return localized;
};

const findActiveCity = (slug) =>
  prisma.city.findFirst({ where: { slug, isActive: true } });

module.exports = { listCities, getCityBySlug, findActiveCity, toCity };
