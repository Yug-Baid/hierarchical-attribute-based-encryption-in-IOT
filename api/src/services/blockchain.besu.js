'use strict';
require('dotenv').config();
/**
 * src/services/blockchain.besu.js
 *
 * Real Hyperledger Besu implementation of the blockchain service.
 * Replaces blockchain.js (stub) when BESU_ENABLED=true in .env.
 *
 * Same interface as blockchain.js — routes don't change at all.
 *
 * Reads deployment.json written by scripts/deploy.js for the
 * contract address and ABI.
 *
 * FIX: HABE hierarchical string identifiers (e.g. "company/plantA/areaA1")
 * are NOT Ethereum addresses. ethers v6 treats any non-0x string as an ENS
 * name and throws UNSUPPORTED_OPERATION on private networks with no ENS.
 * Solution: derive a deterministic 0x address from each HABE string via
 * keccak256, and maintain an in-process reverse map so listNodes/getNode
 * can restore the original HABE strings in API responses.
 */
const { ethers } = require('ethers');
const fs         = require('fs');
const path       = require('path');

/* -----------------------------------------------------------------------
 * Load deployment config
 * ----------------------------------------------------------------------- */
const DEPLOY_PATH = path.resolve(__dirname, '../../../blockchain/config/deployment.json');

if (!fs.existsSync(DEPLOY_PATH)) {
  throw new Error(
    `deployment.json not found at ${DEPLOY_PATH}.\n` +
    `Run: cd blockchain && node scripts/deploy.js`
  );
}

const deployment = JSON.parse(fs.readFileSync(DEPLOY_PATH, 'utf8'));

/* -----------------------------------------------------------------------
 * Provider + wallet
 * ----------------------------------------------------------------------- */
const RPC_URL     = process.env.RPC_URL             || 'http://localhost:8545';
const PRIVATE_KEY = process.env.OPERATOR_PRIVATE_KEY ||
  '0x8f2a55949038a9610f50fb23b5883af3b4ecb3c3bb792cbcefbd1542c692be63';

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(deployment.address, deployment.abi, wallet);

console.log(`[blockchain:besu] Contract at ${deployment.address} on chainId=${deployment.chainId}`);

/* -----------------------------------------------------------------------
 * HABE string ↔ Ethereum address mapping
 *
 * HABE node identifiers are hierarchical strings like "company/plantA/areaA1".
 * Ethereum contract functions expect address types (0x..., 20 bytes).
 * We derive a deterministic address from each string via keccak256 and
 * maintain a reverse map so the original HABE strings survive round-trips.
 * ----------------------------------------------------------------------- */

/** ethAddr (lowercase) → original HABE string */
const ethToHabe = new Map();

/**
 * Derive a deterministic Ethereum address from a HABE identifier string.
 * Returns ethers.ZeroAddress unchanged (used for parentAddr of root nodes).
 */
function habeAddrToEth(habeAddr) {
  if (!habeAddr || habeAddr === ethers.ZeroAddress) return ethers.ZeroAddress;
  // Already a 0x address — pass through (e.g. the wallet's own address)
  if (/^0x[0-9a-fA-F]{40}$/.test(habeAddr)) return ethers.getAddress(habeAddr);
  // Derive: keccak256 of UTF-8 bytes, take last 20 bytes as address
  const hash = ethers.keccak256(ethers.toUtf8Bytes(habeAddr));
  return ethers.getAddress('0x' + hash.slice(26)); // slice(26) = drop '0x' + first 12 bytes
}

/**
 * Record the HABE→ETH mapping in both directions so getNode/listNodes
 * can restore original strings. Safe to call multiple times.
 */
function cacheMapping(habeAddr, ethAddr) {
  if (!habeAddr || habeAddr === ethers.ZeroAddress) return;
  ethToHabe.set(ethAddr.toLowerCase(), habeAddr);
}

/**
 * Restore the HABE string from an on-chain address.
 * Falls back to the raw address if the mapping isn't cached
 * (e.g. after a process restart — see Known Limitations in README).
 */
function ethToHabeStr(ethAddr) {
  if (!ethAddr || ethAddr === ethers.ZeroAddress) return null;
  return ethToHabe.get(ethAddr.toLowerCase()) || ethAddr;
}

/* -----------------------------------------------------------------------
 * Role mapping — matches Solidity enum Role { UNREGISTERED, RM, DM, SDM }
 * ----------------------------------------------------------------------- */
const ROLE = { RM: 1n, DM: 2n, SDM: 3n };
const ROLE_NAMES = ['UNREGISTERED', 'RM', 'DM', 'SDM'];

function roleFromString(roleStr) {
  switch (roleStr.toUpperCase()) {
    case 'RM':  return ROLE.RM;
    case 'DM':  return ROLE.DM;
    case 'SDM': return ROLE.SDM;
    default: throw new Error(`Unknown role: ${roleStr}`);
  }
}

/* -----------------------------------------------------------------------
 * Wait for tx confirmation helper
 * ----------------------------------------------------------------------- */
async function sendTx(txPromise) {
  /* Reset cached nonce before sending — prevents NONCE_EXPIRED on rapid sequential calls */
  wallet._nonce = undefined;
  const tx      = await txPromise;
  const receipt = await tx.wait(1);
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString() };
}

/* -----------------------------------------------------------------------
 * registerNode(addr, role, parentAddr)
 *
 * addr and parentAddr are HABE string identifiers ("company/plantA/areaA1").
 * They are converted to deterministic Ethereum addresses before being sent
 * to the contract. The reverse mapping is cached for getNode/listNodes.
 * ----------------------------------------------------------------------- */
async function registerNode(addr, role, parentAddr) {
  const roleEnum  = roleFromString(role);
  const ethAddr   = habeAddrToEth(addr);
  const ethParent = parentAddr ? habeAddrToEth(parentAddr) : ethers.ZeroAddress;

  // Cache both directions before the tx so the map is populated even if tx fails
  cacheMapping(addr,       ethAddr);
  cacheMapping(parentAddr, ethParent);

  const result = await sendTx(contract.registerNode(ethAddr, roleEnum, ethParent));

  return {
    txHash:     result.txHash,
    addr,                          // original HABE string
    role,
    parentAddr: parentAddr || null,
    timestamp:  new Date().toISOString(),
  };
}

/* -----------------------------------------------------------------------
 * storeHash(fileId, hash, meta)
 *
 * hash: hex string from storage.hashCT() — converted to bytes32.
 * meta: object — JSON-stringified for on-chain storage.
 * ----------------------------------------------------------------------- */
async function storeHash(fileId, hash, meta = {}) {
  /* Convert hex hash string to bytes32 */
  const hashBytes = ethers.hexlify('0x' + hash);  /* ensure 0x prefix */
  const metaStr   = JSON.stringify(meta);

  const result = await sendTx(contract.storeHash(fileId, hashBytes, metaStr));

  return {
    txHash:    result.txHash,
    fileId,
    hash,
    meta,
    timestamp: new Date().toISOString(),
  };
}

/* -----------------------------------------------------------------------
 * getHash(fileId) → { hash, meta, timestamp }
 * ----------------------------------------------------------------------- */
async function getHash(fileId) {
  const [hashBytes, metaStr, timestamp] = await contract.getHash(fileId);

  /* Convert bytes32 back to hex string (strip 0x prefix) */
  const hash = hashBytes.slice(2);  /* remove 0x */

  let meta = {};
  try { meta = JSON.parse(metaStr); } catch (_) { meta = { raw: metaStr }; }

  return {
    fileId,
    hash,
    meta,
    timestamp: new Date(Number(timestamp) * 1000).toISOString(),
  };
}

/* -----------------------------------------------------------------------
 * auditLog(eventName, data)
 * ----------------------------------------------------------------------- */
async function auditLog(eventName, data = {}) {
  const dataStr = JSON.stringify(data);
  const result  = await sendTx(contract.auditLog(eventName, dataStr));
  return {
    txHash:    result.txHash,
    event:     eventName,
    data,
    timestamp: new Date().toISOString(),
  };
}

/* -----------------------------------------------------------------------
 * getNode(addr)
 *
 * addr may be a HABE string or a 0x address — both are handled.
 * ----------------------------------------------------------------------- */
async function getNode(addr) {
  const ethAddr = habeAddrToEth(addr);
  const [role, parentAddr, timestamp] = await contract.getNode(ethAddr);

  return {
    addr:       ethToHabeStr(ethAddr) || addr,   // restore HABE string if cached
    role:       ROLE_NAMES[Number(role)] || 'UNKNOWN',
    parentAddr: parentAddr === ethers.ZeroAddress
                  ? null
                  : ethToHabeStr(parentAddr),
    timestamp:  new Date(Number(timestamp) * 1000).toISOString(),
  };
}

/* -----------------------------------------------------------------------
 * listNodes()
 *
 * contract.listNodes() returns raw Ethereum addresses.
 * We restore HABE strings via the reverse map.
 * ----------------------------------------------------------------------- */
async function listNodes() {
  const addrs = await contract.listNodes();
  return Promise.all(addrs.map(ethAddr => getNode(ethToHabeStr(ethAddr) || ethAddr)));
}

/* -----------------------------------------------------------------------
 * Export — identical interface to blockchain.js stub
 * ----------------------------------------------------------------------- */
module.exports = {
  registerNode,
  storeHash,
  getHash,
  auditLog,
  getNode,
  listNodes,
};