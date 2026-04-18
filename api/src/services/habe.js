/**
 * src/services/habe.js
 *
 * Manages a single persistent habe_cli child process.
 * All HABE operations are serialized through a request queue so
 * concurrent API calls don't interleave stdin/stdout.
 *
 * Protocol: newline-delimited JSON (NDJSON) over stdin/stdout.
 *   Request:  one JSON line written to stdin
 *   Response: one JSON line read from stdout
 */

'use strict';

const { spawn }    = require('child_process');
const path         = require('path');
const readline     = require('readline');
const EventEmitter = require('events');

/* Path to compiled habe_cli binary — resolve relative to project root */
const HABE_CLI_BIN = path.resolve(__dirname, '../../../habe/habe_cli');

class HABEEngine extends EventEmitter {
  constructor() {
    super();
    this._proc       = null;
    this._rl         = null;
    this._queue      = [];   /* pending { resolve, reject } */
    this._ready      = false;
    this._starting   = false;
  }

  /* ------------------------------------------------------------------ */
  /* Start the child process and wait for it to emit the ready line      */
  /* ------------------------------------------------------------------ */
  async start() {
    if (this._ready) return;
    if (this._starting) {
      /* Already starting — wait for the ready event */
      return new Promise((res, rej) => {
        this.once('ready', res);
        this.once('error', rej);
      });
    }
    this._starting = true;

    this._proc = spawn(HABE_CLI_BIN, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this._proc.on('error', (err) => {
      console.error('[habe] spawn error:', err.message);
      this.emit('error', err);
    });

    this._proc.on('exit', (code, signal) => {
      console.error(`[habe] child exited code=${code} signal=${signal}`);
      this._ready    = false;
      this._starting = false;
      /* Reject any pending requests */
      for (const { reject } of this._queue)
        reject(new Error('habe_cli process exited unexpectedly'));
      this._queue = [];
    });

    /* Stderr → our stderr for debugging */
    this._proc.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg.includes('ready')) {
        this._ready    = true;
        this._starting = false;
        this.emit('ready');
      }
      console.error('[habe]', msg);
    });

    /* Stdout: one JSON response per line */
    this._rl = readline.createInterface({ input: this._proc.stdout });
    this._rl.on('line', (line) => {
      const pending = this._queue.shift();
      if (!pending) {
        console.error('[habe] unexpected response (no pending request):', line);
        return;
      }
      let parsed;
      try { parsed = JSON.parse(line); }
      catch (e) {
        pending.reject(new Error(`habe_cli non-JSON response: ${line}`));
        return;
      }
      if (parsed.ok) pending.resolve(parsed);
      else pending.reject(new Error(parsed.error || 'habe_cli error'));
    });

    /* Send setup command first */
    await this._send({ cmd: 'setup' });
    return;
  }

  /* ------------------------------------------------------------------ */
  /* Internal: serialize a request onto the queue                        */
  /* ------------------------------------------------------------------ */
  _send(req) {
    return new Promise((resolve, reject) => {
      if (!this._proc || this._proc.killed) {
        return reject(new Error('habe_cli not running'));
      }
      this._queue.push({ resolve, reject });
      this._proc.stdin.write(JSON.stringify(req) + '\n');
    });
  }

  /* ------------------------------------------------------------------ */
  /* Public API — mirrors habe_cli commands                              */
  /* ------------------------------------------------------------------ */

  /**
   * Register a DM in the key hierarchy.
   * @param {string} childPk  - PK string for the new DM (e.g. "company/plantA")
   * @param {string|null} parentPk - PK string of parent DM, or null for depth-1
   * @returns {Promise<{dm_pk: string}>}
   */
  async createDM(childPk, parentPk = null) {
    return this._send({
      cmd:       'create_dm',
      child_pk:  childPk,
      parent_pk: parentPk ?? 'null',
    });
  }

  /**
   * Issue a user secret key for a given attribute under a DM.
   * @param {string} dmPk   - Issuing DM's PK string
   * @param {string} userPk - User's PK string (identifier)
   * @param {string} attrPk - Attribute PK string
   * @returns {Promise<{usk_id: string}>}
   */
  async createUser(dmPk, userPk, attrPk) {
    return this._send({
      cmd:     'create_user',
      dm_pk:   dmPk,
      user_pk: userPk,
      attr_pk: attrPk,
    });
  }

  /**
   * Encrypt plaintext under a DNF policy.
   * @param {Buffer|string} plaintext - Up to 32 bytes (padded with zeros)
   * @param {Object} policy
   *   policy.clauses  {string[][]} - DNF clauses: array of attribute arrays
   *   policy.dm_pks   {string[]}   - DM PK string for each clause
   * @returns {Promise<{ct_hex: string}>}
   */
  async encrypt(plaintext, policy) {
    /* Normalize plaintext to 32-byte zero-padded hex */
    let buf;
    if (Buffer.isBuffer(plaintext)) {
      buf = Buffer.alloc(32);
      plaintext.copy(buf, 0, 0, Math.min(plaintext.length, 32));
    } else {
      buf = Buffer.alloc(32);
      const src = Buffer.from(plaintext, 'utf8');
      src.copy(buf, 0, 0, Math.min(src.length, 32));
    }
    return this._send({
      cmd:           'encrypt',
      plaintext_hex: buf.toString('hex'),
      clauses:       policy.clauses,
      dm_pks:        policy.dm_pks,
    });
  }

  /**
   * Decrypt a ciphertext using a list of user secret keys.
   * @param {string} ctHex      - Hex-encoded serialized ciphertext
   * @param {string[]} uskIds   - Array of usk_id handles from createUser
   * @param {number} clauseIdx  - Which conjunctive clause to use
   * @returns {Promise<{plaintext_hex: string}>}
   */
  async decrypt(ctHex, uskIds, clauseIdx = 0) {
    return this._send({
      cmd:         'decrypt',
      ct_hex:      ctHex,
      usk_ids:     uskIds,
      clause_idx:  clauseIdx,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                            */
  /* ------------------------------------------------------------------ */
  stop() {
    if (this._proc && !this._proc.killed) {
      this._proc.stdin.end();
      this._proc.kill('SIGTERM');
    }
    this._ready = false;
  }
}

/* Singleton — one engine per process */
const engine = new HABEEngine();

module.exports = engine;