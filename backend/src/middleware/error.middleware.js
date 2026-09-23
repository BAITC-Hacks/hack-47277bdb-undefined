const { Prisma } = require('@prisma/client');
const env = require('../config/env');
const ApiError = require('../utils/apiError');
const multer = require('multer');

const normalizeError = (error) => {
  if (error instanceof ApiError) return error;

  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return new ApiError(400, 'INVALID_JSON', 'JSON пішімі дұрыс емес');
  }

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return new ApiError(413, 'FILE_TOO_LARGE', 'Файл көлемі 5 МБ-тан аспауы керек');
    }
    return new ApiError(422, 'UPLOAD_ERROR', 'Файлды жүктеу мүмкін болмады');
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return new ApiError(409, 'DUPLICATE_VALUE', 'Бұл мән бұрыннан бар');
    }
    if (error.code === 'P2025') {
      return new ApiError(404, 'RESOURCE_NOT_FOUND', 'Ресурс табылмады');
    }
    if (error.code === 'P2003') {
      return new ApiError(409, 'RELATED_RESOURCE_CONFLICT', 'Байланысты ресурс табылмады немесе қолданылуда');
    }
    if (error.code === 'P2004' || (error.code === 'P2010' && error.meta?.code === '23514')) {
      return new ApiError(409, 'DATA_CONSTRAINT_CONFLICT', 'Өзгеріс деректер тұтастығы шартына қайшы');
    }
    if (error.code === 'P2034' ||
        (error.code === 'P2010' && ['40001', '40P01'].includes(error.meta?.code))) {
      return new ApiError(409, 'TRANSACTION_CONFLICT', 'Сұрау басқа операциямен қайшы келді. Қайталап көріңіз.');
    }
    return new ApiError(500, 'DATABASE_ERROR', 'Дерекқор сұрауын орындау мүмкін болмады');
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return new ApiError(503, 'DATABASE_UNAVAILABLE', 'Дерекқорға қосылу мүмкін болмады');
  }

  return new ApiError(500, 'INTERNAL_SERVER_ERROR', 'Серверде күтпеген қате пайда болды');
};

const errorMiddleware = (error, req, res, next) => {
  if (res.headersSent) return next(error);

  const normalized = normalizeError(error);
  if (env.nodeEnv !== 'test' && normalized.statusCode >= 500) {
    console.error(`[${normalized.code}]`, error);
  }

  const response = {
    success: false,
    error: {
      code: normalized.code,
      message: normalized.message,
    },
  };

  if (normalized.details !== undefined) {
    response.error.details = normalized.details;
  }

  return res.status(normalized.statusCode).json(response);
};

module.exports = errorMiddleware;
