/**
 * src/routes/data.js
 *
 * Data lifecycle — implements the PPT's "Workflow: Data Lifecycle" and CASE
 * Autonomous Context-Aware Policy Engine integration.
 *
 * Routes:
 *   POST /data / /data/encrypt
 *     IoT -> SDM -> manual encrypt (static DNF or policy object) -> storeHash -> persist .bin
 *     Body: { fileId, recordId, plaintext, payload, policy, policyStr, senderAddr }
 *     Returns: { ok, fileId, recordId, ctHash, txHash, receipt }
 *
 *   POST /data/encrypt/autonomous / /data/autonomous
 *     IoT Telemetry -> Edge DT Classifier (CASE Paper) -> dynamic DNF policy -> encrypt -> storeHash -> persist .bin
 *     Body: { plantId, areaId, telemetry: { temperature, vibration, pressure, gas_ppm }, payload, recordId }
 *     Returns: { ok, recordId, fileId, predicted_state, policy, dynamic_policy, ctHash, txHash, receipt }
 *
 *   GET /data/:fileId
 *     Operator fetch -> verify hash (Gate 1) -> decrypt (Gate 2)
 *     Query: ?usk_ids=id1,id2&clause_idx=0&operatorAddr=xxx
 *     Returns: { ok, plaintext, fileId, recordId, plaintext_hex }
 *
 *   DELETE /data/:fileId
 *     Owner-initiated deletion.
 *     Body: { ownerAddr }
 *     Returns: { ok, deleted }
 */

'use strict';

const express      = require('express');
const router       = express.Router();
const habe         = require('../services/habe');
const blockchain   = require('../services/blockchain');
const storage      = require('../services/storage');
const sensorPolicy = require('../services/sensorPolicy');
const { asyncWrap } = require('../middleware/errorHandler');

/* -----------------------------------------------------------------------
 * Manual Encryption Handler (POST / and POST /encrypt)
 * Backward compatible: accepts policy (object) or policyStr (string DNF)
 * ----------------------------------------------------------------------- */
const handleManualEncrypt = asyncWrap(async (req, res) => {
  const { fileId, recordId, plaintext, payload, policy, policyStr, senderAddr } = req.body;
  const id = recordId || fileId;
  const pt = payload !== undefined ? payload : plaintext;
  const polInput = policy || policyStr;

  /* Validate */
  if (!id || pt === undefined || !polInput) {
    return res.status(400).json({
      ok: false,
      error: 'fileId (or recordId), plaintext (or payload), and policy (or policyStr) required',
    });
  }

  const parsedPolicy = sensorPolicy.parseDnfPolicy(polInput);

  /* Step 1: Encrypt via HABE engine */
  const { ct_hex } = await habe.encrypt(pt, parsedPolicy);

  /* Step 2: Compute SHA-256(CT) for on-chain integrity anchor */
  const ctHash = storage.hashCT(ct_hex);

  /* Step 3: Store hash on Besu (stub or contract) */
  const txRecord = await blockchain.storeHash(id, ctHash, {
    senderAddr: senderAddr || 'unknown',
    clauses:    parsedPolicy.clauses.length,
    ts:         new Date().toISOString(),
  });

  /* Step 4: Persist CT to .bin storage */
  await storage.writeCT(id, ct_hex);

  await blockchain.auditLog('dataStored', {
    fileId: id,
    recordId: id,
    ctHash,
    senderAddr: senderAddr || 'unknown',
  });

  res.json({
    ok:       true,
    fileId:   id,
    recordId: id,
    ctHash,
    txHash:   txRecord.txHash,
    receipt:  txRecord,
  });
});

router.post('/', handleManualEncrypt);
router.post('/encrypt', handleManualEncrypt);

/* -----------------------------------------------------------------------
 * Autonomous Encryption Handler (POST /encrypt/autonomous and POST /autonomous)
 * Grounded in CASE Paper Algorithm 1 & Edge Decision Tree Policy Formulation
 * ----------------------------------------------------------------------- */
const handleAutonomousEncrypt = asyncWrap(async (req, res) => {
  const { plantId, areaId, telemetry, payload, plaintext, recordId, fileId, senderAddr } = req.body;
  const pt = payload !== undefined ? payload : plaintext;
  const recId = recordId || fileId || `sensor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  /* 1. Accept & validate { plantId, areaId, telemetry, payload } */
  if (!plantId || !areaId || !telemetry || pt === undefined) {
    return res.status(400).json({
      ok: false,
      error: 'plantId, areaId, telemetry, and payload are required',
    });
  }

  /* 2. Extract context state and dynamic_policy via sensorPolicyService */
  const policyPrediction = await sensorPolicy.predictPolicy({ plantId, areaId, telemetry });
  const { predicted_state, dynamic_policy } = policyPrediction;

  /* 3. Encrypt payload via habeService.encrypt(dynamic_policy, payload) */
  const { ct_hex } = await habe.encrypt(dynamic_policy, pt);

  /* 4. Compute sha256(ciphertext) and store it on Hyperledger Besu (Gate 1 Anchor) */
  const ctHash = storage.hashCT(ct_hex);
  const txRecord = await blockchain.storeHash(recId, ctHash, {
    senderAddr: senderAddr || `${plantId}/${areaId}`,
    plantId,
    areaId,
    predicted_state,
    dynamic_policy,
    ts: new Date().toISOString(),
  });

  /* 5. Save encrypted record and metadata (recordId, predicted_state, dynamic_policy, timestamp) */
  await storage.writeCT(recId, ct_hex);

  await blockchain.auditLog('dataStoredAutonomous', {
    recordId: recId,
    fileId: recId,
    ctHash,
    predicted_state,
    dynamic_policy,
    plantId,
    areaId,
    senderAddr: senderAddr || `${plantId}/${areaId}`,
    timestamp: new Date().toISOString(),
  });

  /* 6. Return response containing recordId, predicted_state, policy, and transaction receipt */
  res.json({
    ok:              true,
    recordId:        recId,
    fileId:          recId,
    predicted_state,
    policy:          dynamic_policy,
    dynamic_policy,
    ctHash,
    txHash:          txRecord.txHash,
    receipt:         txRecord,
  });
});

router.post('/encrypt/autonomous', handleAutonomousEncrypt);
router.post('/autonomous', handleAutonomousEncrypt);

router.post('/predict_policy', asyncWrap(async (req, res) => {
  const { plantId, areaId, telemetry } = req.body;
  const result = await sensorPolicy.predictPolicy({ plantId, areaId, telemetry });
  res.json(result);
}));

/* -----------------------------------------------------------------------
 * GET /data/:fileId  — Verify integrity and decrypt
 *
 * PPT step 4 (Decryption) + "User Flow" (Gate 1 + Gate 2):
 *   Gate 1 (Besu):  getHash(fileId) -> h_stored
 *                   SHA-256(CT_local) ?= h_stored  -> abort 409 if mismatch
 *   Gate 2 (HABE):  HABE.Dec(CT, SK) -> M iff SK |= pi -> 403 if denied
 * ----------------------------------------------------------------------- */
router.get('/:fileId', asyncWrap(async (req, res) => {
  const { fileId } = req.params;
  const { usk_ids, clause_idx = '0', operatorAddr } = req.query;

  if (!usk_ids) {
    return res.status(400).json({
      ok: false, error: 'usk_ids query param required (comma-separated)',
    });
  }

  const uskIdList   = usk_ids.split(',').map(s => s.trim()).filter(Boolean);
  const clauseIndex = parseInt(clause_idx, 10) || 0;

  /* Derive true operator from USK key identifier if generic or mismatched */
  let effectiveOperator = operatorAddr ? operatorAddr.trim() : '';
  const firstUsk = uskIdList[0] || '';
  const uskParts = firstUsk.split('|');
  const uskUser = uskParts.length >= 2 ? uskParts[1].trim() : '';

  if (!effectiveOperator || effectiveOperator === 'unknown' || (effectiveOperator === 'operator_alice' && uskUser && uskUser !== 'operator_alice')) {
    effectiveOperator = uskUser || effectiveOperator || 'unknown';
  }

  /* Step 1: Fetch CT from local storage */
  const ct_hex = await storage.readCT(fileId);

  /* Gate 1: Verify integrity against on-chain hash */
  const localHash   = storage.hashCT(ct_hex);
  const chainRecord = await blockchain.getHash(fileId);

  if (localHash !== chainRecord.hash) {
    await blockchain.auditLog('tamperDetected', {
      fileId,
      localHash,
      chainHash:    chainRecord.hash,
      operatorAddr: effectiveOperator,
    });
    return res.status(409).json({
      ok:    false,
      error: 'Integrity check failed: ciphertext tampered',
      fileId,
      recordId: fileId,
    });
  }

  /* Gate 2: Decrypt via HABE with intelligent multi-clause candidate evaluation */
  let decryptResult = null;
  let successfulClause = clauseIndex;
  let lastError = null;
  const candidateClauses = [clauseIndex, 0, 1, 2].filter((v, i, a) => a.indexOf(v) === i);

  for (const cIdx of candidateClauses) {
    try {
      const res = await habe.decrypt(ct_hex, uskIdList, cIdx);
      const ptBuf = Buffer.from(res.plaintext_hex, 'hex');
      const ptStr = ptBuf.toString('utf8').replace(/\0/g, '');
      const isPrintable = ptBuf.slice(0, ptStr.length || 1).every(b => b === 0 || (b >= 0x20 && b <= 0x7e));
      if (isPrintable && ptStr.trim().length > 0) {
        decryptResult = { ...res, plaintext: ptStr, clause_used: cIdx };
        successfulClause = cIdx;
        break;
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (!decryptResult) {
    await blockchain.auditLog('decryptDenied', {
      fileId, operatorAddr: effectiveOperator, reason: lastError?.message || 'Bilinear pairing failed on all clauses',
    });
    return res.status(403).json({
      ok:     false,
      error:  'Decryption denied: policy not satisfied',
      detail: lastError?.message || 'Invalid secret key: bilinear pairings produced unprintable noise',
    });
  }

  await blockchain.auditLog('dataAccessed', {
    fileId, operatorAddr: effectiveOperator, clauseUsed: successfulClause,
  });

  res.json({
    ok:            true,
    fileId,
    recordId:      fileId,
    plaintext:     decryptResult.plaintext,
    plaintext_hex: decryptResult.plaintext_hex,
    clause_used:   successfulClause,
    operatorAddr:  effectiveOperator,
  });
}));

/* -----------------------------------------------------------------------
 * DELETE /data/:fileId
 * ----------------------------------------------------------------------- */
router.delete('/:fileId', asyncWrap(async (req, res) => {
  const { fileId } = req.params;
  const { ownerAddr } = req.body || {};

  await storage.deleteCT(fileId);

  await blockchain.auditLog('dataDeleted', {
    fileId, ownerAddr: ownerAddr || 'unknown',
  });

  res.json({ ok: true, deleted: fileId });
}));

module.exports = router;
