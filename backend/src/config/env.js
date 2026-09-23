const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const requiredVariables = ['DATABASE_URL', 'JWT_SECRET'];
const missingVariables = requiredVariables.filter((name) => !process.env[name]?.trim());

if (missingVariables.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingVariables.join(', ')}. ` +
      'Copy .env.example to .env and provide valid values.',
  );
}

const port = Number.parseInt(process.env.PORT || '3000', 10);
const bcryptRounds = Number.parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
const assistantProposalTtl = Number(process.env.ASSISTANT_PROPOSAL_TTL_SECONDS || '900');
if (!Number.isInteger(assistantProposalTtl) || assistantProposalTtl < 60 || assistantProposalTtl > 3600) {
  throw new Error('ASSISTANT_PROPOSAL_TTL_SECONDS must be an integer between 60 and 3600.');
}
if (process.env.ASSISTANT_LLM_ENABLED && !['true', 'false'].includes(process.env.ASSISTANT_LLM_ENABLED)) {
  throw new Error('ASSISTANT_LLM_ENABLED must be true or false.');
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

if (!Number.isInteger(bcryptRounds) || bcryptRounds < 4 || bcryptRounds > 15) {
  throw new Error('BCRYPT_ROUNDS must be an integer between 4 and 15.');
}

module.exports = Object.freeze({
  port,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  bcryptRounds,
  openaiApiKey: process.env.OPENAI_API_KEY?.trim() || '',
  openaiModel: process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini',
  assistantLlmEnabled: process.env.ASSISTANT_LLM_ENABLED === 'true',
  assistantProposalTtl,
});
