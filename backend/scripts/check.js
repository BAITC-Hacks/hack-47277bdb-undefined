const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');

const findJavaScriptFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findJavaScriptFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
  });

const checkSyntax = () => {
  const files = [
    ...['src', 'prisma', 'scripts', 'tests'].flatMap((folder) =>
      findJavaScriptFiles(path.join(projectRoot, folder)),
    ),
    path.join(projectRoot, 'jest.config.js'),
  ];

  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }

  console.log(`Syntax check passed for ${files.length} JavaScript files.`);
};

const checkImports = () => {
  const files = findJavaScriptFiles(path.join(projectRoot, 'src')).filter(
    (file) => path.basename(file) !== 'server.js',
  );
  files.forEach((file) => require(file));
  console.log(`Import check passed for ${files.length} source files.`);
};

const checkStockCalculations = () => {
  const {
    calculateWarehouseAvailableStock,
    calculateCityAvailableStock,
  } = require('../src/modules/products/product.service');

  const warehouseAvailable = calculateWarehouseAvailableStock({ quantity: 12, reserved: 5 });
  const cityAvailable = calculateCityAvailableStock([
    { quantity: 12, reserved: 5 },
    { quantity: 4, reserved: 1 },
  ]);

  if (warehouseAvailable !== 7 || cityAvailable !== 10) {
    throw new Error('Stock availability calculation check failed.');
  }

  console.log('Stock availability calculation checks passed.');
};

const runHttpChecks = async () => {
  process.env.NODE_ENV = 'test';
  const app = require('../src/app');
  const prisma = require('../src/config/prisma');
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const checks = [
    { path: '/api/products?page=0', status: 422, code: 'VALIDATION_ERROR' },
    {
      path: '/api/auth/register',
      status: 422,
      code: 'VALIDATION_ERROR',
      options: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'invalid', password: 'short' }),
      },
    },
    { path: '/api/not-a-route', status: 404, code: 'ROUTE_NOT_FOUND' },
  ];

  try {
    for (const check of checks) {
      const response = await fetch(`${baseUrl}${check.path}`, check.options);
      const body = await response.json();
      if (
        response.status !== check.status ||
        body.success !== false ||
        body.error?.code !== check.code
      ) {
        throw new Error(`HTTP check failed for ${check.path}`);
      }
      console.log(`HTTP check passed: ${check.path} -> ${response.status}`);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
};

const main = async () => {
  checkSyntax();
  checkImports();
  checkStockCalculations();
  await runHttpChecks();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
