const healthService = require('./health.service');
const ApiError = require('../../utils/apiError');

const getHealth = async (req, res) => {
  try {
    await healthService.checkDatabase();
    return res.json({
      success: true,
      data: {
        status: 'OK',
        database: 'connected',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Дерекқорға қосылу мүмкін болмады');
  }
};

module.exports = { getHealth };
