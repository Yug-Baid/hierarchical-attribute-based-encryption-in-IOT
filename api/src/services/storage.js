/**
 * src/services/storage.js
 *
 * Local filesystem storage for encrypted ciphertext blobs (.bin files).
 * Files are named: storage/<fileId>.bin
 *
 * Interface is intentionally narrow so it can be swapped for S3/IPFS
 * without touching the routes.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const STORAGE_DIR = path.resolve(__dirname, '../../storage');

/* Ensure storage directory exists at module load */
fs.mkdirSync(STORAGE_DIR, { recursive: true });

/* Sanitize fileId to prevent path traversal */
function safePath(fileId) {
  const clean = path.basename(fileId).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  if (!clean) throw new Error('Invalid fileId');
  return path.join(STORAGE_DIR, clean + '.bin');
}

/**
 * Write ciphertext hex to disk.
 * @param {string} fileId  - unique identifier for this ciphertext
 * @param {string} ctHex   - hex-encoded ciphertext bytes
 */
async function writeCT(fileId, ctHex) {
  const fpath = safePath(fileId);
  if (fs.existsSync(fpath)) throw new Error(`fileId already stored: ${fileId}`);
  fs.writeFileSync(fpath, ctHex, 'utf8');
  return { fileId, path: fpath, size: ctHex.length / 2 };
}

/**
 * Read ciphertext hex from disk.
 * @param {string} fileId
 * @returns {string} ctHex
 */
async function readCT(fileId) {
  const fpath = safePath(fileId);
  if (!fs.existsSync(fpath)) throw new Error(`CT not found: ${fileId}`);
  return fs.readFileSync(fpath, 'utf8').trim();
}

/**
 * Delete a ciphertext file (owner-initiated deletion only).
 */
async function deleteCT(fileId) {
  const fpath = safePath(fileId);
  if (!fs.existsSync(fpath)) throw new Error(`CT not found: ${fileId}`);
  fs.unlinkSync(fpath);
  const bakPath = fpath + '.bak';
  if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath);
  return { deleted: fileId };
}

/**
 * Compute SHA-256 of the raw CT bytes.
 * Used to verify integrity against the on-chain hash.
 * @param {string} ctHex
 * @returns {string} hex digest
 */
function hashCT(ctHex) {
  const { createHash } = require('crypto');
  const buf = Buffer.from(ctHex, 'hex');
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Injects byte-level tampering into the ciphertext on disk.
 * Creates an immutable backup (.bak) of the original if not already backed up.
 *
 * @param {string} fileId
 * @param {number} offset  - byte index to corrupt (default: 8)
 * @returns {Promise<{fileId: string, originalHash: string, tamperedHash: string}>}
 */
async function tamperCT(fileId, offset = 8) {
  const fpath = safePath(fileId);
  if (!fs.existsSync(fpath)) throw new Error(`CT not found: ${fileId}`);
  
  const bakPath = fpath + '.bak';
  const originalHex = fs.readFileSync(fpath, 'utf8').trim();
  
  if (!fs.existsSync(bakPath)) {
    fs.writeFileSync(bakPath, originalHex, 'utf8');
  }

  const buf = Buffer.from(originalHex, 'hex');
  const targetByte = Math.min(Math.max(0, offset), buf.length - 1);
  buf[targetByte] = buf[targetByte] ^ 0xff; // Invert all 8 bits of target byte
  
  const corruptedHex = buf.toString('hex');
  fs.writeFileSync(fpath, corruptedHex, 'utf8');

  return {
    fileId,
    originalHash: hashCT(originalHex),
    tamperedHash: hashCT(corruptedHex),
  };
}

/**
 * Restores the original pristine ciphertext from backup (.bak).
 *
 * @param {string} fileId
 * @returns {Promise<{fileId: string, hash: string, restored: boolean}>}
 */
async function restoreCT(fileId) {
  const fpath = safePath(fileId);
  const bakPath = fpath + '.bak';

  if (fs.existsSync(bakPath)) {
    const originalHex = fs.readFileSync(bakPath, 'utf8').trim();
    fs.writeFileSync(fpath, originalHex, 'utf8');
    fs.unlinkSync(bakPath);
    return { fileId, hash: hashCT(originalHex), restored: true };
  }

  if (!fs.existsSync(fpath)) throw new Error(`CT not found: ${fileId}`);
  const currentHex = fs.readFileSync(fpath, 'utf8').trim();
  return { fileId, hash: hashCT(currentHex), restored: false };
}

/**
 * Check whether a ciphertext file is currently tampered.
 */
function isCTTampered(fileId) {
  try {
    const fpath = safePath(fileId);
    return fs.existsSync(fpath + '.bak');
  } catch (_) {
    return false;
  }
}

/**
 * List all stored record files.
 */
function listStoredFiles() {
  if (!fs.existsSync(STORAGE_DIR)) return [];
  const files = fs.readdirSync(STORAGE_DIR);
  return files
    .filter(f => f.endsWith('.bin'))
    .map(f => {
      const fileId = f.replace(/\.bin$/, '');
      const isTampered = fs.existsSync(path.join(STORAGE_DIR, f + '.bak'));
      return { fileId, isTampered };
    });
}

module.exports = { 
  writeCT, 
  readCT, 
  deleteCT, 
  hashCT, 
  tamperCT, 
  restoreCT, 
  isCTTampered, 
  listStoredFiles 
};
