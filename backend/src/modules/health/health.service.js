const prisma = require('../../config/prisma');

const checkDatabase = async () => {
  await prisma.$queryRaw`SELECT 1`;
  return true;
};

module.exports = { checkDatabase };
