'use strict';
require('dotenv').config();
/**
 * src/server.js
 *
 * Express API Gateway entry point.
 *
 * Routes:
 *   POST   /admin/setup          Bootstrap RM→DM→SDM hierarchy
 *   GET    /admin/health         Engine + uptime check
 *
 *   POST   /register             Register a new DM or SDM node
 *   POST   /register/user        Issue a user attribute secret key
 *   GET    /nodes                List all registered nodes
 *   GET    /nodes/:addr          Get a specific node
 *
 *   POST   /data                 Encrypt + storeHash + persist CT
 *   GET    /data/:fileId         Verify hash + decrypt (Gate 1 + Gate 2)
 *   DELETE /data/:fileId         Delete CT (owner only)
 *
 *   POST   /bulletin/register    Create user bulletin (ML pre-computation)  [NEW]
 *   GET    /bulletin/:userAddr   Retrieve bulletin + union_attrs             [NEW]
 */
const express = require('express');
const habe    = require('./services/habe');
const { errorHandler } = require('./middleware/errorHandler');
const { pingEligibilityService } = require('./services/eligibility');

const app  = express();
const PORT = process.env.PORT || 3000;

/* -----------------------------------------------------------------------
 * Middleware
 * ----------------------------------------------------------------------- */
app.use(express.json({ limit: '10mb' }));  /* CT hex can be large */

/* Request logger */
app.use((req, _res, next) => {
  console.log(`→ ${req.method} ${req.path}`);
  next();
});

/* -----------------------------------------------------------------------
 * Routes
 * ----------------------------------------------------------------------- */
app.use('/admin',    require('./routes/admin'));
app.use('/register', require('./routes/nodes'));
app.use('/nodes',    require('./routes/nodes'));
app.use('/data',     require('./routes/data'));
app.use('/bulletin', require('./routes/bulletin'));   // NEW

/* -----------------------------------------------------------------------
 * Error handler (must be last)
 * ----------------------------------------------------------------------- */
app.use(errorHandler);

/* -----------------------------------------------------------------------
 * Start
 * ----------------------------------------------------------------------- */
async function main() {
  console.log('[server] Starting HABE engine...');
  try {
    await habe.start();
    console.log('[server] HABE engine ready.');
  } catch (err) {
    console.error('[server] Failed to start HABE engine:', err.message);
    console.error('[server] Make sure habe_cli is built: cd ../habe && make cli');
    process.exit(1);
  }

  pingEligibilityService();   // unchanged — pings /health on startup
  app.listen(PORT, () => {
    console.log(`[server] Listening on http://localhost:${PORT}`);
    console.log('[server] Routes:');
    console.log('  POST   /admin/setup');
    console.log('  GET    /admin/health');
    console.log('  POST   /register');
    console.log('  POST   /register/user');
    console.log('  GET    /nodes');
    console.log('  POST   /data');
    console.log('  GET    /data/:fileId?usk_ids=...&clause_idx=0');
    console.log('  DELETE /data/:fileId');
    console.log('  POST   /bulletin/register');
    console.log('  GET    /bulletin/:userAddr');
  });

  /* Graceful shutdown */
  process.on('SIGTERM', () => { habe.stop(); process.exit(0); });
  process.on('SIGINT',  () => { habe.stop(); process.exit(0); });
}

main();