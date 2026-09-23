const prisma = require('../../config/prisma');

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

module.exports = { publicUserSelect, findPublicUserById };
