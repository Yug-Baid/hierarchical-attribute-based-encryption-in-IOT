'use strict';

/**
 * src/routes/bulletin.js
 *
 * POST /bulletin/register
 *   Body: { userAddr, dmAddr, context: { role, location, time_of_day?, device_trust, past_violations } }
 *   Calls ML service once, stores bulletin. Fails closed on ML unavailability.
 *   → 201 { ok, bulletin, union_attrs }
 *   → 400 validation error
 *   → 503 ML service unreachable
 *
 * GET /bulletin/:userAddr
 *   → 200 { ok, bulletin, union_attrs }
 *   → 404 not found
 */

const express  = require('express');
const router   = express.Router();
const bulletin = require('../services/bulletin');
const { asyncWrap } = require('../middleware/errorHandler');

/* -----------------------------------------------------------------------
 * POST /bulletin/register
 * ----------------------------------------------------------------------- */
router.post('/register', asyncWrap(async (req, res) => {
  const { userAddr, dmAddr, context } = req.body || {};

  if (!userAddr || typeof userAddr !== 'string') {
    return res.status(400).json({ ok: false, error: 'userAddr is required (string)' });
  }
  if (!dmAddr || typeof dmAddr !== 'string') {
    return res.status(400).json({ ok: false, error: 'dmAddr is required (string)' });
  }
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return res.status(400).json({ ok: false, error: 'context is required (object)' });
  }

  // createBulletin throws with .status set on validation or ML failures
  const created = await bulletin.createBulletin({ userAddr, dmAddr, context });

  return res.status(201).json({
    ok:          true,
    bulletin:    created,
    union_attrs: bulletin.getUnionAttrs(userAddr),
  });
}));

/* -----------------------------------------------------------------------
 * GET /bulletin/:userAddr
 * ----------------------------------------------------------------------- */
router.get('/:userAddr', (req, res) => {
  const { userAddr } = req.params;
  const b = bulletin.getBulletin(userAddr);

  if (!b) {
    return res.status(404).json({ ok: false, error: `No bulletin found for '${userAddr}'` });
  }

  return res.json({
    ok:          true,
    bulletin:    b,
    union_attrs: bulletin.getUnionAttrs(userAddr),
  });
});

module.exports = router;