'use strict';

/**
 * src/routes/nodes.js
 *
 * Node registration — mirrors the PPT's "Blockchain-Maintained Hierarchy".
 *
 * POST /register
 *   Body: { addr, role, parentAddr? }
 *   1. registerNode on Besu (stub)
 *   2. habe_create_dm or habe_create_user depending on role
 *   3. Return { ok, dm_pk|usk_id, txHash }
 *
 * GET /nodes
 *   Returns all registered nodes (debug / admin).
 *
 * Role values (must match PPT hierarchy):
 *   "RM"  — root master (Company). Created once at server start via /admin/setup.
 *   "DM"  — domain master (Plant A/B). depth-1 DMs, parent = RM addr.
 *   "SDM" — sub-domain master (Area). depth-2 DMs, parent = DM addr.
 *
 * addr is treated as both the Besu address and the HABE pk string
 * (e.g. "company/plantA"). In production, separate these.
 *
 * CHANGED (bulletin redesign):
 *   POST /register/user — context field removed from request body.
 *   Eligibility is now a pure bulletin lookup (no runtime ML inference).
 *   Call POST /bulletin/register first to provision a bulletin for the user.
 */

const express    = require('express');
const router     = express.Router();
const habe       = require('../services/habe');
const blockchain = require('../services/blockchain');
const { asyncWrap } = require('../middleware/errorHandler');
const bulletin   = require('../services/bulletin');

/* -----------------------------------------------------------------------
 * POST /register  — unchanged
 * ----------------------------------------------------------------------- */
router.post('/', asyncWrap(async (req, res) => {
  const { addr, role, parentAddr } = req.body;

  if (!addr || !role) {
    return res.status(400).json({ ok: false, error: 'addr and role required' });
  }

  const validRoles = ['DM', 'SDM'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({
      ok: false,
      error: `role must be one of: ${validRoles.join(', ')}`,
    });
  }

  /* 1. Record on-chain (stub) */
  const txRecord = await blockchain.registerNode(addr, role, parentAddr || null);

  /* 2. Create HABE key
   *    DM  → create_dm (parent = parentAddr or null for depth-1)
   *    SDM → create_dm (parent = parentAddr, depth-2)
   *    Both are CreateDM in HABE terms; SDM is simply a depth-2 DM.
   */
  const habeResult = await habe.createDM(addr, parentAddr || null);

  await blockchain.auditLog('nodeRegistered', {
    addr, role, parentAddr: parentAddr || null,
    dm_pk: habeResult.dm_pk,
  });

  res.json({
    ok:      true,
    addr,
    role,
    dm_pk:   habeResult.dm_pk,
    txHash:  txRecord.txHash,
  });
}));

/* -----------------------------------------------------------------------
 * POST /register/user
 *
 * Issue a user attribute secret key from a DM to an entity.
 * Body: { dmAddr, userAddr, attrPk }
 *
 * CHANGED: context removed. Eligibility is now a bulletin lookup only.
 * No runtime ML inference. Bulletin must exist before this is called.
 * ----------------------------------------------------------------------- */
router.post('/user', asyncWrap(async (req, res) => {
  const { dmAddr, userAddr, attrPk } = req.body;

  if (!dmAddr || !userAddr || !attrPk) {
    return res.status(400).json({
      ok: false, error: 'dmAddr, userAddr, attrPk required',
    });
  }

  // Bulletin eligibility check — synchronous, no ML inference
  let eligibility;
  try {
    eligibility = bulletin.checkEligibility(userAddr, attrPk);
  } catch (err) {
    if (err.status === 404) {
      // No bulletin: treat as denial, audit it
      await blockchain.auditLog('userKeyDenied', {
        dmAddr, userAddr, attrPk,
        reason: 'no_bulletin_registered',
      });
      return res.status(403).json({
        ok:     false,
        error:  'key issuance denied: no bulletin registered for this user',
        detail: err.message,
      });
    }
    throw err;
  }

  if (!eligibility.eligible) {
    await blockchain.auditLog('userKeyDenied', {
      dmAddr, userAddr, attrPk,
      reason: eligibility.reason,
    });
    return res.status(403).json({
      ok:          false,
      error:       'key issuance denied by bulletin eligibility check',
      reason:      eligibility.reason,
      union_attrs: eligibility.union,
    });
  }

  // Eligible — issue key
  const result = await habe.createUser(dmAddr, userAddr, attrPk);

  await blockchain.auditLog('userKeyIssued', {
    dmAddr, userAddr, attrPk, usk_id: result.usk_id,
  });

  res.json({
    ok:     true,
    usk_id: result.usk_id,
  });
}));

/* -----------------------------------------------------------------------
 * GET /nodes  — unchanged
 * ----------------------------------------------------------------------- */
router.get('/', asyncWrap(async (req, res) => {
  const nodes = await blockchain.listNodes();
  res.json({ ok: true, nodes });
}));

/* -----------------------------------------------------------------------
 * GET /nodes/:addr  — unchanged
 * ----------------------------------------------------------------------- */
router.get('/:addr', asyncWrap(async (req, res) => {
  const node = await blockchain.getNode(req.params.addr);
  res.json({ ok: true, node });
}));

module.exports = router;