// Archive guard: do not revive a second server or run the old SQL migrations.
console.error('The separate ai/ backend is retired. Run npm start in ../backend and use POST /api/assistant/chat. See ../ASSISTANT_MIGRATION.md.');
process.exitCode = 1;
