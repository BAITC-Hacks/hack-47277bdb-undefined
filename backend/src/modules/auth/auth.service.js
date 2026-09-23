const bcrypt = require('bcryptjs');
const prisma = require('../../config/prisma');
const env = require('../../config/env');
const ApiError = require('../../utils/apiError');
const { signToken } = require('../../utils/jwt');
const { publicUserSelect } = require('../users/user.service');

const normalizeEmail = (email) => email.trim().toLowerCase();

const register = async ({ email, password, firstName, lastName, phone }) => {
  const normalizedEmail = normalizeEmail(email);
  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (existingUser) {
    throw new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'Бұл email бұрын тіркелген');
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);

  try {
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: passwordHash,
        firstName: firstName.trim(),
        lastName: lastName?.trim() || null,
        phone: phone?.trim() || null,
      },
      select: publicUserSelect,
    });

    return { user, token: signToken(user) };
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'Бұл email бұрын тіркелген');
    }
    throw error;
  }
};

const login = async ({ email, password }) => {
  const normalizedEmail = normalizeEmail(email);
  const userWithPassword = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  const passwordMatches = userWithPassword
    ? await bcrypt.compare(password, userWithPassword.password)
    : false;

  if (!userWithPassword || !passwordMatches || !userWithPassword.isActive) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email немесе құпиясөз дұрыс емес');
  }

  const { password: passwordHash, ...user } = userWithPassword;
  return { user, token: signToken(user) };
};

module.exports = { register, login };
