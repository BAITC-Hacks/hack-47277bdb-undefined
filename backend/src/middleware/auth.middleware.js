const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const { verifyToken } = require('../utils/jwt');
const { publicUserSelect } = require('../modules/users/user.service');

const authMiddleware = async (req, res, next) => {
  try {
    const authorization = req.get('authorization');
    const bearerToken = authorization?.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : null;
    const token = bearerToken || req.cookies?.token;

    if (!token) {
      throw new ApiError(401, 'AUTH_REQUIRED', 'Авторизация қажет');
    }

    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: publicUserSelect,
    });

    if (!user || !user.isActive) {
      throw new ApiError(401, 'INVALID_TOKEN', 'Токен жарамсыз');
    }

    req.user = user;
    return next();
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    if (error.name === 'TokenExpiredError') {
      return next(new ApiError(401, 'TOKEN_EXPIRED', 'Токеннің мерзімі аяқталды'));
    }
    return next(new ApiError(401, 'INVALID_TOKEN', 'Токен жарамсыз'));
  }
};

module.exports = authMiddleware;
