/**
 * src/services/blockchain.js
 *
 * Stub implementation of the Hyperledger Besu smart contract interface.
 * Auto-switches to the real ethers.js implementation when BESU_ENABLED=true.
 */

'use strict';
require('dotenv').config();

/* Auto-switch to real Besu implementation when enabled */
if (process.env.BESU_ENABLED === 'true') {
  module.exports = require('./blockchain.besu');
  return;
}

//  *   registerNode(addr, role, parentAddr)
//  *   storeHash(fileId, hash, meta)
//  *   getHash(fileId)  → { hash, meta, timestamp }
//  *   auditLog(event)  → emits timestamped log entry
//  *
//  * When BESU_ENABLED=true is set in the environment, this module will
//  * swap to the real ethers.js implementation in blockchain.besu.js.
//  * Until then, all state is held in memory and logged to ./logs/audit.log.
//  *
//  * STUB CONTRACT ADDRESSES (for when you wire Besu):
//  *   Set CONTRACT_ADDRESS and RPC_URL in .env
//  */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUDIT_LOG_PATH = path.resolve(__dirname, '../../logs/audit.log');
const STUB_TAG = '[blockchain:stub]';

/* Ensure log directory exists */
fs.mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true });

/* -----------------------------------------------------------------------
 * In-memory stores (replace with Besu calls when ready)
 * ----------------------------------------------------------------------- */
const nodeRegistry = new Map();   /* addr → { role, parentAddr, timestamp } */
const hashStore    = new Map();   /* fileId → { hash, meta, timestamp }      */

/* -----------------------------------------------------------------------
 * Audit log helper
 * ----------------------------------------------------------------------- */
function writeAudit(event, data) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ...data,
  };
  const line = JSON.stringify(entry) + '\n';
  fs.appendFileSync(AUDIT_LOG_PATH, line);
  console.log(`${STUB_TAG} audit:`, entry);
  return entry;
}

/* -----------------------------------------------------------------------
 * registerNode(addr, role, parentAddr)
 *
 * Records node metadata on-chain (stubbed: in-memory + audit log).
 * Called by the API when a new DM/SDM is provisioned.
 *
 * Besu equivalent:
 *   contract.registerNode(addr, role, parentAddr)  →  tx receipt
 * ----------------------------------------------------------------------- */
async function registerNode(addr, role, parentAddr) {
  if (nodeRegistry.has(addr)) {
    throw new Error(`Node already registered: ${addr}`);
  }
  const record = {
    addr,
    role,
    parentAddr: parentAddr || null,
    timestamp: new Date().toISOString(),
  };
  nodeRegistry.set(addr, record);
  writeAudit('registerNode', record);
  /* Stub returns a fake tx hash */
  return {
    txHash: '0x' + crypto.randomBytes(32).toString('hex'),
    ...record,
  };
}

/* -----------------------------------------------------------------------
 * storeHash(fileId, hash, meta)
 *
 * Stores SHA-256(CT) on-chain for integrity verification.
 * Append-only: throws if fileId already exists.
 *
 * Besu equivalent:
 *   contract.storeHash(fileId, hash, JSON.stringify(meta))  →  tx receipt
 * ----------------------------------------------------------------------- */
async function storeHash(fileId, hash, meta = {}) {
  if (hashStore.has(fileId)) {
    throw new Error(`fileId already stored: ${fileId}`);
  }
  const record = {
    fileId,
    hash,            /* hex string, SHA-256 of raw CT bytes */
    meta,
    timestamp: new Date().toISOString(),
  };
  hashStore.set(fileId, record);
  writeAudit('storeHash', record);
  return {
    txHash: '0x' + crypto.randomBytes(32).toString('hex'),
    ...record,
  };
}

/* -----------------------------------------------------------------------
 * getHash(fileId)
 *
 * Retrieves stored hash record for pre-decrypt integrity check.
 *
 * Besu equivalent:
 *   contract.getHash(fileId)  →  { hash, meta, timestamp }
 * ----------------------------------------------------------------------- */
async function getHash(fileId) {
  const record = hashStore.get(fileId);
  if (!record) {
    throw new Error(`fileId not found on chain: ${fileId}`);
  }
  return record;
}

/* -----------------------------------------------------------------------
 * auditLog(event, data)
 *
 * Emits a timestamped audit event.
 * In Besu: emits an on-chain event (indexed, queryable).
 * Here: writes to audit.log + console.
 * ----------------------------------------------------------------------- */
async function auditLog(event, data = {}) {
  return writeAudit(event, data);
}

/* -----------------------------------------------------------------------
 * getNode(addr) — not on the smart contract, but useful for the API
 * ----------------------------------------------------------------------- */
async function getNode(addr) {
  const record = nodeRegistry.get(addr);
  if (!record) throw new Error(`Node not found: ${addr}`);
  return record;
}

/* -----------------------------------------------------------------------
 * listNodes() — debug helper
 * ----------------------------------------------------------------------- */
async function listNodes() {
  return Array.from(nodeRegistry.values());
}

/* -----------------------------------------------------------------------
 * Export
 * ----------------------------------------------------------------------- */
module.exports = {
  registerNode,
  storeHash,
  getHash,
  auditLog,
  getNode,
  listNodes,
  /* Expose stores for testing */
  _nodeRegistry: nodeRegistry,
  _hashStore:    hashStore,
};