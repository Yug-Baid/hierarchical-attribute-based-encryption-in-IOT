'use strict';

const express    = require('express');
const router     = express.Router();
const habe       = require('../services/habe');
const blockchain = require('../services/blockchain');
const { asyncWrap } = require('../middleware/errorHandler');

/*
 * POST /admin/setup
 * Bootstraps the HABE key hierarchy and registers each node on-chain.
 *
 * Both operations are idempotent — duplicate HABE keys and duplicate
 * blockchain registrations are silently swallowed so setup can be
 * called multiple times safely.
 *
 * Key hierarchy:
 *   company                        (RM  — HABE setup() handles key creation)
 *   ├── company/plantA             (DM  — depth 1)
 *   │   ├── company/plantA/areaA1  (SDM — depth 2)
 *   │   └── company/plantA/areaA2  (SDM — depth 2)
 *   └── company/plantB             (DM  — depth 1)
 *       ├── company/plantB/areaB1  (SDM — depth 2)
 *       └── company/plantB/areaB2  (SDM — depth 2)
 *
 * IMPORTANT — two different "parent" concepts:
 *
 *   habeParent  (passed to habe.createDM)
 *     The C engine looks this up in its in-memory dm_store.
 *     depth-1 DMs → null  (C engine treats null/"null" as RM implicitly)
 *     depth-2 SDMs → 'company/plantA' / 'company/plantB' (must exist in dm_store)
 *
 *   chainParent  (passed to blockchain.registerNode)
 *     The on-chain hierarchy link. Uses 'company' for depth-1 nodes so
 *     the RM root is correctly reflected in /nodes output.
 */
router.post('/setup', asyncWrap(async (req, res) => {
  const results = {};

  /* ------------------------------------------------------------------ */
  /* company (RM) — no blockchain call needed.                           */
  /* The constructor already registered msg.sender as RM at deploy time. */
  /* registerNode() explicitly rejects Role.RM (role must be DM or SDM). */
  /* The HABE engine ran setup() at start() — no createDM call needed.   */
  /* ------------------------------------------------------------------ */
  results['company'] = 'company';

  /* ------------------------------------------------------------------ */
  /* Helper: create HABE DM key + register on-chain
   *
   * @param addr        - HABE/chain identifier for this node
   * @param habeParent  - parent passed to habe.createDM (null for depth-1)
   * @param chainParent - parent passed to blockchain.registerNode
   * @param role        - 'DM' or 'SDM'
   * ------------------------------------------------------------------ */
  async function tryCreateDM(addr, habeParent, chainParent, role) {
    // 1. Create HABE key
    try {
      const r = await habe.createDM(addr, habeParent);
      results[addr] = r.dm_pk;
    } catch (err) {
      if (err.message.includes('already exists') ||
          err.message.includes('already registered') ||
          err.message.includes('DM already exists')) {
        results[addr] = addr;
      } else {
        throw err;
      }
    }

    // 2. Register on blockchain
    try {
      await blockchain.registerNode(addr, role, chainParent);
    } catch (err) {
      if (err.message.includes('already registered') ||
          err.message.includes('Node already registered') ||
          err.message.includes('Already registered')) {
        // idempotent — already on chain, fine
      } else {
        throw err;
      }
    }

    return results[addr];
  }

  // depth-1 DMs
  // habeParent  = null       → C engine uses RM implicitly (no dm_store lookup)
  // chainParent = 'company'  → correct on-chain hierarchy link to RM
  await tryCreateDM('company/plantA', null, 'company', 'DM');
  await tryCreateDM('company/plantB', null, 'company', 'DM');

  // depth-2 SDMs
  // habeParent  = plant string → C engine looks this up in dm_store (must exist)
  // chainParent = plant string → on-chain hierarchy link
  await tryCreateDM('company/plantA/areaA1', 'company/plantA', 'company/plantA', 'SDM');
  await tryCreateDM('company/plantA/areaA2', 'company/plantA', 'company/plantA', 'SDM');
  await tryCreateDM('company/plantB/areaB1', 'company/plantB', 'company/plantB', 'SDM');
  await tryCreateDM('company/plantB/areaB2', 'company/plantB', 'company/plantB', 'SDM');

  await blockchain.auditLog('hierarchyBootstrapped', results);

  res.json({ ok: true, hierarchy: results });
}));

router.get('/health', asyncWrap(async (req, res) => {
  res.json({
    ok:     true,
    engine: habe._ready ? 'ready' : 'not_started',
    uptime: process.uptime(),
  });
}));

module.exports = router;