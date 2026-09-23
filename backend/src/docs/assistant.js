const { ref } = require('./schemas');
const uuid = { type: 'string', format: 'uuid' };
const schemas = {
  AssistantChatInput: { type: 'object', additionalProperties: false, required: ['message'], properties: {
    message: { type: 'string', minLength: 1, maxLength: 4000, example: 'Маған 16А автомат керек' },
    sessionId: { ...uuid, description: 'Persistent conversation UUID. Guest body shorthand for X-Session-Id; when both are present they must match. Account ownership is always derived from JWT, never this field.' },
    city: { type: 'string', example: 'almaty', description: 'Active city slug; remembered for this owner/session. Required before product price/stock/cart proposals.' },
    selectedProductId: { ...uuid, description: 'Explicit selection from verified catalog results; not a slug.' },
    quantity: { type: 'integer', minimum: 1, maximum: 10000 },
    pendingActionId: { ...uuid, description: 'Echo the current pendingAction.id with confirmation. Recommended to prevent stale multi-tab confirmation. A field alone never authorizes a cart write.' },
  } },
  AssistantPendingAction: { type: 'object', required: ['id', 'type', 'productId', 'quantity', 'city', 'unitPrice', 'expiresAt', 'requiresConfirmation'], properties: {
    id: uuid, type: { type: 'string', enum: ['ADD_TO_CART'] }, productId: uuid, productName: { type: 'string' },
    quantity: { type: 'integer' }, city: { type: 'string' }, unitPrice: { type: 'number', description: 'Current backend quote, revalidated on confirmation.' },
    expiresAt: { type: 'string', format: 'date-time' }, requiresConfirmation: { type: 'boolean', enum: [true] },
  } },
  AssistantChatResult: { type: 'object', required: ['type', 'message', 'sessionId', 'language', 'intent', 'mode'], properties: {
    type: { type: 'string', enum: ['message', 'products', 'product', 'stock', 'certificates', 'alternatives', 'knowledge', 'pending_action', 'cart'] },
    message: { type: 'string' }, sessionId: uuid, language: { type: 'string', enum: ['kk', 'ru'] }, city: { type: 'string', nullable: true },
    intent: { type: 'string' }, mode: { type: 'string', enum: ['rules', 'rules_fallback', 'openai'] }, code: { type: 'string' },
    pendingAction: ref('AssistantPendingAction'), product: ref('ProductDetail'), products: { type: 'array', items: ref('ProductCard') },
    alternatives: { type: 'array', items: { type: 'object', properties: { product: ref('ProductCard'), reasons: { type: 'array', items: { type: 'string' } }, warnings: { type: 'array', items: { type: 'string' } }, matchedAttributes: { type: 'array', items: { type: 'string' } }, differences: { type: 'array', items: { type: 'string' } } } } },
    certificates: { type: 'array', items: { type: 'object', properties: { url: { type: 'string' }, productId: uuid } } },
    availability: ref('Availability'), cart: ref('Cart'), cartUrl: { type: 'string', example: '/cart' }, checkoutUrl: { type: 'string', example: '/checkout' },
    sources: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, title: { type: 'string' }, content: { type: 'string' }, url: { type: 'string' } } } },
  } },
};
const paths = {
  '/api/assistant/chat': { post: {
    tags: ['Assistant'], summary: 'Session-aware Kazakh-first assistant using the existing catalog and cart',
    description: 'No second backend/database. A request to add creates only a pending action; a later exact “Иә, қос” / “Да, добавь” / “Yes, add” can consume it once. Pass pendingActionId from the quote. Product/city/quantity, current price, stock including existing cart quantity, and cart fingerprint are revalidated atomically. Other turns cancel the old pending action; changed/expired context requires a new quote. Guest data never merges into an authenticated account. Never send card numbers, expiry, CVV or PIN. File upload is not exposed yet. Rate limit: 30/min/IP plus global API limits.',
    security: [{ bearerAuth: [] }, { guestSession: [] }],
    parameters: [{ in: 'query', name: 'lang', schema: { type: 'string', enum: ['kk', 'ru'] }, description: 'Or Accept-Language; absent means stored conversation language, initially kk.' }],
    requestBody: { required: true, content: { 'application/json': { schema: ref('AssistantChatInput') } } },
    responses: {
      200: { description: 'Read-only answer, non-mutating proposal, or explicitly confirmed cart result.', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', enum: [true] }, data: ref('AssistantChatResult') } } } } },
      ...Object.fromEntries([400, 401, 404, 409, 422, 429, 500, 503].map((status) => [status, { $ref: `#/components/responses/Error${status}` }])),
    },
  } },
};
module.exports = { schemas, paths };
