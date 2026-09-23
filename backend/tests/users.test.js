const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/prisma');
const { signToken } = require('../src/utils/jwt');

let users = [];
let token;
let passwordHash;
const originalProfile = { firstName: 'Original', lastName: 'Customer', phone: '+77000000000' };

beforeAll(async () => {
  const marker = `profile-test-${randomUUID()}`;
  passwordHash = await bcrypt.hash(`Test-only-${randomUUID()}`, 4);
  users = await prisma.$transaction(['owner', 'other'].map((name) => prisma.user.create({
    data: { email: `${marker}-${name}@example.test`, password: passwordHash, ...originalProfile },
  })));
  token = signToken(users[0]);
});

beforeEach(async () => {
  await prisma.user.update({ where: { id: users[0].id }, data: originalProfile });
});

afterAll(async () => {
  try {
    if (users.length) await prisma.user.deleteMany({ where: { id: { in: users.map(({ id }) => id) } } });
  } finally {
    await prisma.$disconnect();
  }
});

const authenticated = (method) => request(app)[method]('/api/users/me').set('Authorization', `Bearer ${token}`);

describe('authenticated user profile integration', () => {
  test.each(['get', 'patch'])('%s requires a valid JWT', async (method) => {
    const response = await request(app)[method]('/api/users/me').send(method === 'patch' ? { firstName: 'Changed' } : undefined);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_REQUIRED');
  });

  test('returns the same public account as auth/me without a password hash', async () => {
    const [profile, currentUser] = await Promise.all([
      authenticated('get'),
      request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`),
    ]);
    expect(profile.status).toBe(200);
    expect(profile.body).toEqual(currentUser.body);
    expect(profile.body.data).toMatchObject({ id: users[0].id, email: users[0].email, role: 'CUSTOMER', ...originalProfile });
    expect(profile.body.data).not.toHaveProperty('password');
    expect(JSON.stringify(profile.body)).not.toContain(passwordHash);
  });

  test('updates only the owner profile, trims strings, and preserves security fields', async () => {
    const response = await authenticated('patch').send({ firstName: '  Жаңа  ', lastName: '  Аты  ', phone: '  +77111111111  ' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: users[0].id, firstName: 'Жаңа', lastName: 'Аты', phone: '+77111111111', email: users[0].email, role: 'CUSTOMER' });
    expect(response.body.data).not.toHaveProperty('password');
    const [owner, other] = await Promise.all(users.map(({ id }) => prisma.user.findUnique({ where: { id } })));
    expect(owner).toMatchObject({ password: passwordHash, email: users[0].email, role: 'CUSTOMER', isActive: true });
    expect(other).toMatchObject(originalProfile);
    const persisted = await authenticated('get');
    expect(persisted.body.data).toEqual(response.body.data);
  });

  test('preserves omitted values on a partial update', async () => {
    const response = await authenticated('patch').send({ firstName: 'Updated' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ firstName: 'Updated', lastName: 'Customer', phone: '+77000000000' });
  });

  test.each([{ lastName: null, phone: null }, { lastName: '', phone: '   ' }])('clears optional surname and phone with %j', async (body) => {
    const response = await authenticated('patch').send(body);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ firstName: 'Original', lastName: null, phone: null });
  });

  test.each([
    { role: 'ADMIN' }, { email: 'changed@example.test' }, { password: 'Not-an-allowed-update' },
    { isActive: false }, { id: randomUUID() }, { nested: { role: 'ADMIN' } },
  ])('rejects account/security/unknown fields without making any update: %j', async (forbidden) => {
    const response = await authenticated('patch').send({ firstName: 'Should not persist', ...forbidden });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    const owner = await prisma.user.findUnique({ where: { id: users[0].id } });
    expect(owner).toMatchObject({ ...originalProfile, email: users[0].email, role: 'CUSTOMER', password: passwordHash, isActive: true });
  });

  test.each([
    {}, [], { firstName: null }, { firstName: '   ' }, { firstName: 'a'.repeat(101) },
    { lastName: false }, { lastName: 'a'.repeat(101) }, { phone: 12345 },
    { phone: '1234' }, { phone: '1'.repeat(31) },
  ])('rejects empty or invalid profile payloads: %j', async (payload) => {
    const response = await authenticated('patch').send(payload);
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.user.findUnique({ where: { id: users[0].id } })).toMatchObject(originalProfile);
  });

  test('documents the profile operations and strict writable field schema', async () => {
    const response = await request(app).get('/api-docs.json');
    expect(response.status).toBe(200);
    expect(response.body.paths['/api/users/me'].get.security).toEqual([{ bearerAuth: [] }]);
    expect(response.body.paths['/api/users/me'].patch.security).toEqual([{ bearerAuth: [] }]);
    expect(response.body.components.schemas.ProfileUpdateInput.additionalProperties).toBe(false);
    expect(Object.keys(response.body.components.schemas.ProfileUpdateInput.properties)).toEqual(['firstName', 'lastName', 'phone']);
  });
});
