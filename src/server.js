'use strict';

const { connectDB } = require('./config/db');
const config = require('./config/env');
const app = require('./app');

async function start() {
  await connectDB();

  const server = app.listen(config.port, () => {
    console.log(`[Server] AI Gardener running on http://localhost:${config.port}`);
  });
  // Prevent Node from closing connections before Render's load balancer during multi-step LLM turns
  server.keepAliveTimeout = 120000;
  server.headersTimeout = 125000;
}

start().catch((err) => {
  console.error('[Server] Failed to start:', err.message);
  process.exit(1);
});
