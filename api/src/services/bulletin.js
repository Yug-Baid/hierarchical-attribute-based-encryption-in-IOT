'use strict';

/**
 * api/src/services/bulletin.js
 *
 * Bulletin store — creation, retrieval, and eligibility lookup.
 *
 * Bulletin schema:
 * {
 *   userAddr:       "operator1",
 *   dmAddr:         "company/plantA/areaA1",
 *   absolute_attrs: ["company/plantA/areaA1:sensor_data"],
 *   ml_scores: {
 *     "company/plantA/areaA1:sensor_data":      0.95,
 *     "company/plantA/areaA1:telemetry_data":   0.78,
 *     "company/plantA/areaA1:maintenance_data": 0.21,
 *     "company/plantA/areaA1:plant_data":       0.14,
 *     "company/plantA/areaA1:control_data":     0.03,
 *     "company/plantA/areaA1:admin_data":       0.01
 *   },
 *   context:   { role, location, device_trust, past_violations },
 *   createdAt: <ISO string>
 * }
 *
 * UNION_ATTRS = absolute_attrs ∪ { attr | ml_scores[attr] >= THRESHOLDS[attrType] }
 * Eligibility  = attrPk ∈ UNION_ATTRS
 */

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BULLETIN_PATH = path.resolve(__dirname, '../../bulletins.json');

const ELIGIBILITY_URL        = process.env.ELIGIBILITY_URL        || 'http://127.0.0.1:5001';
const ELIGIBILITY_TIMEOUT_MS = parseInt(process.env.ELIGIBILITY_TIMEOUT_MS || '5000', 10);

/**
 * Per-attribute-type confidence thresholds for the probabilistic gate.
 * absolute_attrs bypass these entirely.
 * Higher sensitivity → higher threshold required.
 *
 * Must be updated in sync with generate_data.py label rules.
 */
const THRESHOLDS = {
  sensor_data:      0.45,
  telemetry_data:   0.50,
  maintenance_data: 0.55,
  plant_data:       0.60,
  control_data:     0.70,
  admin_data:       0.85,  // effectively unreachable via ML alone for non-admin
};

/**
 * All attribute types defined in this system.
 * Order determines the order attrs appear in bulletins and union_attrs.
 * Must match generate_data.py ATTR_TYPES.
 */
const ATTR_TYPES = [
  'sensor_data',
  'telemetry_data',
  'maintenance_data',
  'plant_data',
  'control_data',
  'admin_data',
];

/**
 * Deterministic absolute_attrs by role — granted unconditionally at bulletin
 * creation, no ML score required.
 *
 * technician → sensor_data only
 *              (can earn telemetry_data via ML if context is good)
 *
 * engineer   → sensor_data + telemetry_data
 *              (can earn maintenance_data, plant_data via ML)
 *
 * manager    → sensor_data + telemetry_data + maintenance_data + plant_data
 *              (can earn control_data via ML)
 *
 * admin      → all six (full access, absolute)
 *
 * <other>    → none (ML-only path, will likely score 0 for everything)
 */
const ABSOLUTE_TYPES_BY_ROLE = {
  technician: ['sensor_data'],
  engineer:   ['sensor_data', 'telemetry_data'],
  manager:    ['sensor_data', 'telemetry_data', 'maintenance_data', 'plant_data'],
  admin:      ['sensor_data', 'telemetry_data', 'maintenance_data', 'plant_data', 'control_data', 'admin_data'],
};

// ---------------------------------------------------------------------------
// Bulletin store  (JSON file, reload-on-read for simplicity)
// ---------------------------------------------------------------------------

function _readStore() {
  try {
    if (fs.existsSync(BULLETIN_PATH)) {
      return JSON.parse(fs.readFileSync(BULLETIN_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('[bulletin] Store read failed — starting empty:', err.message);
  }
  return {};
}

function _writeStore(store) {
  fs.writeFileSync(BULLETIN_PATH, JSON.stringify(store, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// ML service client  (matches fetch pattern in eligibility.js)
// ---------------------------------------------------------------------------

/**
 * Call POST /score on the Flask service.
 * Returns raw ml_scores dict — no threshold applied here.
 *
 * @param {string}   dmAddr
 * @param {object}   context
 * @param {string[]} attributes  full attr_pk strings
 * @returns {Promise<Record<string, number>>}
 */
async function _fetchMlScores(dmAddr, context, attributes) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ELIGIBILITY_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${ELIGIBILITY_URL}/score`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ dmAddr, context, attributes }),
      signal:  controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`eligibility service timeout after ${ELIGIBILITY_TIMEOUT_MS}ms`);
    }
    throw new Error(`eligibility service unreachable: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  const body = await response.json();

  if (!response.ok) {
    const detail = Array.isArray(body.error) ? body.error.join('; ') : body.error;
    throw new Error(`eligibility /score error (${response.status}): ${detail}`);
  }

  if (!body.ml_scores || typeof body.ml_scores !== 'object') {
    throw new Error('eligibility /score returned invalid ml_scores');
  }

  return body.ml_scores;
}

// ---------------------------------------------------------------------------
// Attribute helpers
// ---------------------------------------------------------------------------

function _attrsForDm(dmAddr) {
  return ATTR_TYPES.map(t => `${dmAddr}:${t}`);
}

function _absoluteAttrs(role, dmAddr) {
  const types = ABSOLUTE_TYPES_BY_ROLE[role] || [];
  return types.map(t => `${dmAddr}:${t}`);
}

/**
 * Compute UNION_ATTRS from a stored bulletin.
 * UNION = absolute_attrs ∪ { attr | ml_scores[attr] >= THRESHOLDS[attrType] }
 * @param {object} bulletin
 * @returns {Set<string>}
 */
function _computeUnion(bulletin) {
  const union = new Set(bulletin.absolute_attrs);

  for (const [attr, score] of Object.entries(bulletin.ml_scores)) {
    const attrType  = attr.split(':')[1];
    const threshold = THRESHOLDS[attrType];
    if (threshold === undefined) continue;
    if (score >= threshold) union.add(attr);
  }

  return union;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create and persist a bulletin for a user.
 * Fails closed: ML unreachable → throws 503, no bulletin written.
 *
 * @param {object} params
 * @param {string} params.userAddr
 * @param {string} params.dmAddr
 * @param {object} params.context  { role, location, time_of_day?, device_trust, past_violations }
 * @returns {Promise<object>} the stored bulletin
 */
async function createBulletin({ userAddr, dmAddr, context }) {
  if (!userAddr || !dmAddr || !context) {
    const err = new Error('userAddr, dmAddr, and context are required');
    err.status = 400;
    throw err;
  }

  const { role, location, device_trust, past_violations } = context;
  if (!role || !location || !device_trust || past_violations === undefined) {
    const err = new Error('context must include: role, location, device_trust, past_violations');
    err.status = 400;
    throw err;
  }

  const attributes     = _attrsForDm(dmAddr);       // all 6 attr types for this DM
  const absolute_attrs = _absoluteAttrs(role, dmAddr);

  let ml_scores;
  try {
    ml_scores = await _fetchMlScores(dmAddr, context, attributes);
  } catch (err) {
    const wrapped = new Error(`ML service unavailable: ${err.message}`);
    wrapped.status = 503;
    throw wrapped;
  }

  const bulletin = {
    userAddr,
    dmAddr,
    absolute_attrs,
    ml_scores,
    context: { role, location, device_trust, past_violations },
    createdAt: new Date().toISOString(),
  };

  const store = _readStore();
  store[userAddr] = bulletin;
  _writeStore(store);

  console.log(`[bulletin] Created for ${userAddr} | dmAddr=${dmAddr} | abs=${absolute_attrs.length} | ml_attrs=${Object.keys(ml_scores).length}`);
  return bulletin;
}

/**
 * Retrieve a bulletin by userAddr. Returns null if not found.
 * @param {string} userAddr
 * @returns {object|null}
 */
function getBulletin(userAddr) {
  const store = _readStore();
  return store[userAddr] || null;
}

/**
 * Check whether attrPk ∈ UNION_ATTRS for a user.
 *
 * @param {string} userAddr
 * @param {string} attrPk
 * @returns {{ eligible: boolean, reason: string, union: string[] }}
 * @throws {Error} with .status = 404 if no bulletin exists
 */
function checkEligibility(userAddr, attrPk) {
  const bulletin = getBulletin(userAddr);
  if (!bulletin) {
    const err = new Error(`No bulletin found for '${userAddr}'. Call POST /bulletin/register first.`);
    err.status = 404;
    throw err;
  }

  const union    = _computeUnion(bulletin);
  const role     = bulletin.context?.role || '';
  let eligible   = union.has(attrPk);

  if (!eligible) {
    if (attrPk.endsWith(':manager') && (role === 'manager' || role === 'admin')) {
      eligible = true;
      union.add(attrPk);
    } else if (attrPk.endsWith(':emergency_board') && (role === 'admin' || role === 'manager')) {
      eligible = true;
      union.add(attrPk);
    } else if (attrPk.endsWith(':maintenance_team') && (role === 'engineer' || role === 'manager' || role === 'admin')) {
      eligible = true;
      union.add(attrPk);
    }
  }

  let reason;
  if (eligible) {
    reason = bulletin.absolute_attrs.includes(attrPk)
      ? 'absolute_attr'
      : 'ml_score_above_threshold';
  } else {
    reason = 'not_in_union_attrs';
  }

  return { eligible, reason, union: [...union] };
}

/**
 * Return UNION_ATTRS for a user, or null if no bulletin exists.
 * @param {string} userAddr
 * @returns {string[]|null}
 */
function getUnionAttrs(userAddr) {
  const bulletin = getBulletin(userAddr);
  if (!bulletin) return null;
  return [..._computeUnion(bulletin)];
}

module.exports = { createBulletin, getBulletin, checkEligibility, getUnionAttrs, THRESHOLDS, ATTR_TYPES };