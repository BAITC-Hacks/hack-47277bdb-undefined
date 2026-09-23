const { processAssistantFile, validateAssistantFile, LIMITS } = require('./file-service');
const { extractSpecificationLines } = require('./specifications');

module.exports = { processAssistantFile, validateAssistantFile, extractSpecificationLines, LIMITS };
