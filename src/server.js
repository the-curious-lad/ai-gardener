'use strict';

const { connectDB } = require('./config/db');
const config = require('./config/env');
const app = require('./app');

async function start() {
  await connectDB();

  app.listen(config.port, () => {
    console.log(`[Server] AI Gardener running on http://localhost:${config.port}`);
  });
}

start().catch((err) => {
  console.error('[Server] Failed to start:', err.message);
  process.exit(1);
});
