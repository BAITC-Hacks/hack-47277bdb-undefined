const prisma = require('../../config/prisma');
const { localizedEntity } = require('../../utils/localization');

const listBranches = async ({ citySlug, language }) => {
  const branches = await prisma.branch.findMany({
    where: {
      isActive: true,
      city: {
        isActive: true,
        ...(citySlug ? { slug: citySlug } : {}),
      },
    },
    include: { city: true },
    orderBy: [{ city: { nameKk: 'asc' } }, { nameKk: 'asc' }],
  });

  return branches.map((branch) => {
    const localized = localizedEntity(branch, language, [
      'name',
      'address',
      'workingHours',
    ]);
    localized.latitude = branch.latitude === null ? null : Number(branch.latitude);
    localized.longitude = branch.longitude === null ? null : Number(branch.longitude);
    localized.city = localizedEntity(branch.city, language, ['name']);
    return localized;
  });
};

module.exports = { listBranches };
