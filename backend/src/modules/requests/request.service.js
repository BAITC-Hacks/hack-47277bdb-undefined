const prisma = require('../../config/prisma');

const createRequest = (payload) =>
  prisma.customerRequest.create({
    data: {
      type: payload.type || 'GENERAL',
      name: payload.name.trim(),
      phone: payload.phone.trim(),
      email: payload.email?.trim().toLowerCase() || null,
      company: payload.company?.trim() || null,
      message: payload.message?.trim() || null,
    },
  });

module.exports = { createRequest };
