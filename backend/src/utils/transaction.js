const prisma = require('../config/prisma');

// Retry a fully rolled-back serialization failure, never a partially committed action.
const serializable = async (operation) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: 'Serializable', timeout: 15000 });
    } catch (error) {
      const retryable = error.code === 'P2034' ||
        (error.code === 'P2010' && ['40001', '40P01'].includes(error.meta?.code));
      if (!retryable || attempt >= 2) throw error;
    }
  }
};

module.exports = serializable;
