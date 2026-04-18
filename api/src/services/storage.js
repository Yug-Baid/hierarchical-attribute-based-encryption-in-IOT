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

module.exports = { writeCT, readCT, deleteCT, hashCT };