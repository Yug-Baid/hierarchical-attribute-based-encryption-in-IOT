/**
 * src/routes/data.js
 *
 * Data lifecycle — implements the PPT's "Workflow: Data Lifecycle" exactly.
 *
 * POST /data
 *   IoT → SDM → encrypt → storeHash → persist .bin
 *   Body: { fileId, plaintext, policy: { clauses, dm_pks }, senderAddr }
 *   Returns: { ok, fileId, ctHash, txHash }
 *
 * GET /data/:fileId
 *   Operator fetch → verify hash (Gate 1) → decrypt (Gate 2)
 *   Query: ?usk_ids=id1,id2&clause_idx=0&operatorAddr=xxx
 *   Returns: { ok, plaintext, fileId }
 *
 * DELETE /data/:fileId
 *   Owner-initiated deletion.
 *   Body: { ownerAddr }
 *   Returns: { ok, deleted }
 */

'use strict';

const express    = require('express');
const router     = express.Router();
const habe       = require('../services/habe');
const blockchain = require('../services/blockchain');
const storage    = require('../services/storage');
const { asyncWrap } = require('../middleware/errorHandler');

/* -----------------------------------------------------------------------
 * POST /data  — Encrypt and store
 *
 * PPT step 2 (Encryption at SDM) + step 3 (Blockchain Logging):
 *   CT = HABE.Enc(PK, Data, π)
 *   h  = SHA-256(CT)
 *   storeHash(fileId, h, meta) on Besu
 * ----------------------------------------------------------------------- */
router.post('/', asyncWrap(async (req, res) => {
  const { fileId, plaintext, policy, senderAddr } = req.body;

  /* Validate */
  if (!fileId || !plaintext || !policy) {
    return res.status(400).json({
      ok: false, error: 'fileId, plaintext, policy required',
    });
  }
  if (!policy.clauses || !policy.dm_pks ||
      policy.clauses.length !== policy.dm_pks.length) {
    return res.status(400).json({
      ok: false,
      error: 'policy.clauses and policy.dm_pks must be equal-length arrays',
    });
  }

  /* Step 1: Encrypt via HABE engine */
  const { ct_hex } = await habe.encrypt(plaintext, policy);

  /* Step 2: Compute SHA-256(CT) for on-chain integrity anchor */
  const ctHash = storage.hashCT(ct_hex);

  /* Step 3: Store hash on Besu (stub) */
  const txRecord = await blockchain.storeHash(fileId, ctHash, {
    senderAddr: senderAddr || 'unknown',
    clauses:    policy.clauses.length,
    ts:         new Date().toISOString(),
  });

  /* Step 4: Persist CT to .bin storage */
  await storage.writeCT(fileId, ct_hex);

  await blockchain.auditLog('dataStored', {
    fileId, ctHash, senderAddr: senderAddr || 'unknown',
  });

  res.json({
    ok:     true,
    fileId,
    ctHash,
    txHash: txRecord.txHash,
  });
}));

/* -----------------------------------------------------------------------
 * GET /data/:fileId  — Verify integrity and decrypt
 *
 * PPT step 4 (Decryption) + "User Flow" (Gate 1 + Gate 2):
 *
 *   Gate 1 (Besu):  getHash(fileId) → h_stored
 *                   SHA-256(CT_local) ?= h_stored  → abort if mismatch
 *   Gate 2 (HABE):  HABE.Dec(CT, SK) → M iff SK |= π
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

  /* Step 1: Fetch CT from local storage */
  const ct_hex = await storage.readCT(fileId);

  /* Gate 1: Verify integrity against on-chain hash */
  const localHash  = storage.hashCT(ct_hex);
  const chainRecord = await blockchain.getHash(fileId);

  if (localHash !== chainRecord.hash) {
    await blockchain.auditLog('tamperDetected', {
      fileId,
      localHash,
      chainHash: chainRecord.hash,
      operatorAddr: operatorAddr || 'unknown',
    });
    return res.status(409).json({
      ok:    false,
      error: 'Integrity check failed: ciphertext tampered',
      fileId,
    });
  }

  /* Gate 2: Decrypt via HABE */
  let decryptResult;
  try {
    decryptResult = await habe.decrypt(ct_hex, uskIdList, clauseIndex);
  } catch (err) {
    await blockchain.auditLog('decryptDenied', {
      fileId, operatorAddr: operatorAddr || 'unknown', reason: err.message,
    });
    return res.status(403).json({
      ok:    false,
      error: 'Decryption denied: policy not satisfied',
      detail: err.message,
    });
  }

  /* Convert plaintext hex to utf8 string, stripping null bytes */
  const ptBuf   = Buffer.from(decryptResult.plaintext_hex, 'hex');
  const ptStr   = ptBuf.toString('utf8').replace(/\0/g, '');

  /* Gate 2 validation: check plaintext is valid printable ASCII/UTF-8.
   * When the wrong key is used, HABE produces random bytes that fail this check. */
  const isPrintable = ptBuf.slice(0, ptStr.length || 1).every(b => b === 0 || (b >= 0x20 && b <= 0x7e));
  if (!isPrintable || ptStr.trim().length === 0) {
    await blockchain.auditLog('decryptDenied', {
      fileId, operatorAddr: operatorAddr || 'unknown', reason: 'plaintext failed printability check',
    });
    return res.status(403).json({
      ok:    false,
      error: 'Decryption denied: policy not satisfied',
    });
  }

  await blockchain.auditLog('dataAccessed', {
    fileId, operatorAddr: operatorAddr || 'unknown',
  });

  res.json({
    ok:        true,
    fileId,
    plaintext: ptStr,
    plaintext_hex: decryptResult.plaintext_hex,
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