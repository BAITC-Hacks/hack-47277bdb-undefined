const prisma = require('../../config/prisma');
const ApiError = require('../../utils/apiError');

const publicUserSelect = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

const findPublicUserById = (id) =>
  prisma.user.findUnique({
    where: { id },
    select: publicUserSelect,
  });

const updateUserProfile = (id, { firstName, lastName, phone }) => {
  // Construct the update explicitly; account identity and privilege fields never
  // reach Prisma, even if this service is reused outside the HTTP controller.
  const data = {
    ...(firstName !== undefined ? { firstName: firstName.trim() } : {}),
    ...(lastName !== undefined ? { lastName: lastName?.trim() || null } : {}),
    ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
  };
  if (Object.keys(data).length === 0) {
    throw new ApiError(422, 'EMPTY_UPDATE', 'Өзгертілетін профиль өрісі жоқ');
  }
  return prisma.user.update({ where: { id }, data, select: publicUserSelect });
};

module.exports = { publicUserSelect, findPublicUserById, updateUserProfile };
