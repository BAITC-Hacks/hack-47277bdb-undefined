const request = require('supertest');
const app = require('../src/app');

describe('Public API documentation', () => {
  test('Swagger redirects to a working HTML page with a local-script CSP', async () => {
    const response = await request(app).get('/api-docs').redirects(1).expect(200);
    expect(response.headers['content-type']).toMatch(/html/);
    expect(response.text).toContain('swagger-ui');
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    expect(response.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
  });

  test('Swagger initialization and UI assets are available without authentication', async () => {
    const init = await request(app).get('/api-docs/swagger-ui-init.js').expect(200);
    expect(init.text).toContain('SwaggerUIBundle');
    await request(app).get('/api-docs/swagger-ui-bundle.js').expect(200);
    await request(app).get('/api-docs/swagger-ui.css').expect(200);
  });

  test('OpenAPI JSON documents the main flow and all local references resolve', async () => {
    const { body: spec } = await request(app).get('/api-docs.json').expect(200);
    expect(spec.openapi).toBe('3.0.3');
    for (const path of ['/api/health', '/api/auth/login', '/api/products', '/api/cart/items', '/api/orders', '/api/admin/products']) {
      expect(spec.paths[path]).toBeDefined();
    }
    expect(spec.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
    expect(spec.components.securitySchemes.guestSession.name).toBe('X-Session-Id');
    let references = 0;
    const visit = (value) => {
      if (!value || typeof value !== 'object') return;
      if (value.$ref) {
        expect(value.$ref).toMatch(/^#\//);
        const target = value.$ref.slice(2).split('/').reduce((node, key) =>
          node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], spec);
        expect(target).toBeDefined();
        references += 1;
      }
      Object.values(value).forEach(visit);
    };
    visit(spec);
    expect(references).toBeGreaterThan(0);
  });
});
