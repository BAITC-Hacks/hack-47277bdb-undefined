const app = require('./app');
const env = require('./config/env');
const prisma = require('./config/prisma');

const server = app.listen(env.port, (error) => {
  // Express 5 passes listen errors to this callback too. Do not report a
  // successful startup when another development server already owns the port.
  if (error) {
    console.error(`Backend could not listen on port ${env.port}: ${error.code || 'LISTEN_ERROR'}`);
    process.exitCode = 1;
    void prisma.$disconnect().catch(() => {});
    return;
  }
  console.log(`EKT Store API listening on http://localhost:${env.port}`);
});

const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down gracefully.`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
  shutdown('UNHANDLED_REJECTION');
});

module.exports = server;
