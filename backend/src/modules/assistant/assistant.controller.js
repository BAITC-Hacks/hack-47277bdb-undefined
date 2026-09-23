const { randomUUID } = require('crypto');
const service = require('./assistant.service');

exports.chat = async (req, res) => {
  const data = await service.chat({ ...req.body, identity: req.identity,
    sessionId: req.body.sessionId || req.identity.sessionId || req.get('x-session-id')?.toLowerCase() || randomUUID(),
    language: req.query.lang || req.get('accept-language') ? req.language : undefined,
  });
  res.setHeader('Content-Language', data.language);
  res.json({ success: true, data });
};
