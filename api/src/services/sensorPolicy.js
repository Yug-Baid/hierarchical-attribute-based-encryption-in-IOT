/**
 * src/services/sensorPolicy.js
 *
 * CASE Autonomous Context-Aware Policy Engine Client
 * Grounded in: "CASE: A Context-Aware Security Scheme for Preserving Data Privacy
 * in IoT-Enabled Society 5.0", IEEE IoTJ 2022.
 *
 * Calls Python Flask microservice (POST /predict_policy) to classify incoming
 * sensor telemetry at the edge and formulate dynamic hierarchical HABE DNF policy strings.
 */

'use strict';

const http = require('http');
const { URL } = require('url');

const ELIGIBILITY_URL = process.env.ELIGIBILITY_URL || 'http://127.0.0.1:5001';

/**
 * Call ML service to predict state and generate dynamic HABE policy string.
 *
 * @param {Object} params
 * @param {string} params.plantId
 * @param {string} params.areaId
 * @param {Object} params.telemetry
 * @param {number} params.telemetry.temperature
 * @param {number} params.telemetry.vibration
 * @param {number} params.telemetry.pressure
 * @param {number} params.telemetry.gas_ppm
 * @returns {Promise<{status: string, predicted_state: string, dynamic_policy: string}>}
 */
async function predictPolicy({ plantId, areaId, telemetry }) {
  if (!plantId || typeof plantId !== 'string') {
    throw new Error('plantId is required and must be a string');
  }
  if (!areaId || typeof areaId !== 'string') {
    throw new Error('areaId is required and must be a string');
  }
  if (!telemetry || typeof telemetry !== 'object') {
    throw new Error('telemetry is required and must be an object');
  }

  const payload = JSON.stringify({ plantId, areaId, telemetry });
  const parsedUrl = new URL(`${ELIGIBILITY_URL}/predict_policy`);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: parsedUrl.hostname,
        port:     parsedUrl.port || 5001,
        path:     parsedUrl.pathname,
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 5000,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(rawData);
          } catch (err) {
            return reject(new Error(`Failed to parse ML service response: ${rawData}`));
          }

          if (res.statusCode >= 200 && res.statusCode < 300 && parsed.status === 'success') {
            resolve(parsed);
          } else {
            const errMsg = parsed.error || parsed.message || `ML service error (${res.statusCode})`;
            reject(new Error(errMsg));
          }
        });
      }
    );

    req.on('error', (err) => {
      reject(new Error(`Sensor policy service unreachable: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Sensor policy request timed out after 5000ms'));
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Parses a DNF policy string or validates a policy object into the HABE engine format:
 * {
 *   clauses: [ [attr1, attr2], [attr3] ],
 *   dm_pks:  [ dm1, dm2 ]
 * }
 *
 * Supports expressions such as:
 *   "({plantId}/{areaId} AND sensor_data) OR ({plantId} AND manager)"
 *   "(company/plantA/areaA1:sensor_data) OR (company/plantA:manager)"
 *
 * @param {string|Object} policyInput
 * @returns {{clauses: string[][], dm_pks: string[]}}
 */
function parseDnfPolicy(policyInput) {
  if (!policyInput) {
    throw new Error('Policy cannot be empty');
  }

  // If already an object with clauses and dm_pks
  if (typeof policyInput === 'object') {
    if (Array.isArray(policyInput.clauses) && Array.isArray(policyInput.dm_pks)) {
      if (policyInput.clauses.length !== policyInput.dm_pks.length) {
        throw new Error('policy.clauses and policy.dm_pks must have matching length');
      }
      return policyInput;
    }
  }

  if (typeof policyInput !== 'string') {
    throw new Error('Policy must be a DNF string or an object with { clauses, dm_pks }');
  }

  const str = policyInput.trim();
  if (!str) {
    throw new Error('Policy string is empty');
  }

  // Split clauses by top-level OR (case-insensitive)
  // Handles " OR ", " or ", " | "
  const rawClauses = str.split(/\s+(?:OR|or|\|)\s+/);
  const clauses = [];
  const dm_pks = [];

  for (const rawClause of rawClauses) {
    // Strip surrounding parentheses and whitespace
    let clauseStr = rawClause.trim();
    while (clauseStr.startsWith('(') && clauseStr.endsWith(')')) {
      clauseStr = clauseStr.slice(1, -1).trim();
    }
    if (!clauseStr) continue;

    // Split conjunctions by AND (case-insensitive)
    const tokens = clauseStr.split(/\s+(?:AND|and|&)\s+/).map(t => t.trim()).filter(Boolean);
    if (tokens.length === 0) continue;

    let dmPk = '';
    const clauseAttrs = [];

    // Check if tokens are in format: [dmPk, attr1, attr2, ...]
    // or if tokens already contain colon "dmPk:attr"
    if (tokens.length >= 2 && !tokens[0].includes(':')) {
      dmPk = tokens[0];
      for (let i = 1; i < tokens.length; i++) {
        const attr = tokens[i];
        if (attr.includes(':')) {
          clauseAttrs.push(attr);
        } else {
          clauseAttrs.push(`${dmPk}:${attr}`);
        }
      }
    } else {
      // Each token might be "dmPk:attr" or single token
      for (const tok of tokens) {
        if (tok.includes(':')) {
          const parts = tok.split(':');
          if (!dmPk) dmPk = parts[0];
          clauseAttrs.push(tok);
        } else {
          // If no colon, might be standalone DM or attribute
          if (!dmPk) {
            dmPk = tok;
          } else {
            clauseAttrs.push(`${dmPk}:${tok}`);
          }
        }
      }
    }

    if (!dmPk) {
      throw new Error(`Could not determine DM PK for clause: "${rawClause}"`);
    }
    if (clauseAttrs.length === 0) {
      throw new Error(`Clause has no attributes: "${rawClause}"`);
    }

    dm_pks.push(dmPk);
    clauses.push(clauseAttrs);
  }

  if (clauses.length === 0) {
    throw new Error(`No valid clauses found in policy string: "${policyInput}"`);
  }

  return { clauses, dm_pks };
}

module.exports = {
  predictPolicy,
  parseDnfPolicy,
};

