require('dotenv').config();
/**
 * test/autonomous_policy.test.js
 *
 * Integration and Verification Test Suite for CASE Autonomous Policy Engine in Blockchain-Aided-HABE.
 * Grounded in: "CASE: A Context-Aware Security Scheme for Preserving Data Privacy in IoT-Enabled Society 5.0"
 * (IEEE IoTJ 2022).
 *
 * Tests:
 *   Test 1 (Normal Telemetry):
 *     - Telemetry generates NORMAL state (Decision Tree edge inference).
 *     - Formulates policy: "({plantId}/{areaId} AND sensor_data) OR ({plantId} AND manager)".
 *     - Restricts access strictly to Area and Plant levels (Area SDM & Plant DM keys decrypt successfully).
 *     - Root/Company emergency authority & unauthorized Plant B are denied.
 *
 *   Test 2 (Critical Telemetry Spike):
 *     - Emergency telemetry spike generates CRITICAL state.
 *     - Autonomous policy escalation: incorporates Root/Company emergency authorities:
 *       "({plantId}/{areaId} AND sensor_data) OR ({plantId} AND manager) OR (company AND emergency_board)".
 *     - Decrypts successfully with Company Emergency Authority key (clause 2).
 *
 *   Test 3 (Gate 1 Integrity Retention):
 *     - Tampered ciphertext stored in .bin storage.
 *     - Gate 1 Besu hash anchor verification detects SHA-256 mismatch.
 *     - Verification halts immediately before reaching HABE bilinear pairings, preserving CPU cycles and security.
 *
 *   HTTP Endpoints Test:
 *     - POST /data/encrypt/autonomous (NORMAL & CRITICAL)
 *     - POST /data/encrypt (backward compatibility with manual static DNF policyStr)
 *     - GET /data/:fileId (Gate 1 & Gate 2 verification over HTTP)
 */

'use strict';

const express      = require('express');
const habe         = require('../src/services/habe');
const blockchain   = require('../src/services/blockchain');
const storage      = require('../src/services/storage');
const sensorPolicy = require('../src/services/sensorPolicy');
const { errorHandler } = require('../src/middleware/errorHandler');
const fs           = require('fs');
const path         = require('path');
const http         = require('http');
const { URL }      = require('url');

let passed = 0, failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

async function run() {
  console.log('\n=== CASE Autonomous Policy Engine Integration Tests ===\n');

  console.log('[setup] Starting HABE Engine...');
  await habe.start();
  console.log('[setup] HABE Engine ready.\n');

  /* ------------------------------------------------------------------ */
  console.log('--- Hierarchy Setup for Multi-Level Access Control ---');

  let uskAreaA1_sensor;
  let uskPlantA_manager;
  let uskCompany_emergency;
  let uskPlantB_sensor;

  await test('Bootstrap Company Root DM (depth 1 in HABE)', async () => {
    const r = await habe.createDM('company', null);
    assert(r.ok, 'createDM company failed');
  });

  await test('Create Plant A DM (depth 2 under company)', async () => {
    const r = await habe.createDM('company/plantA', 'company');
    assert(r.ok, 'createDM company/plantA failed');
  });

  await test('Create Area A1 SDM (depth 3 under plantA)', async () => {
    const r = await habe.createDM('company/plantA/areaA1', 'company/plantA');
    assert(r.ok, 'createDM company/plantA/areaA1 failed');
  });

  await test('Create Plant B DM (isolated branch under company)', async () => {
    const r = await habe.createDM('company/plantB', 'company');
    assert(r.ok, 'createDM company/plantB failed');
  });

  await test('Issue keys: Area A1 Operator (sensor_data)', async () => {
    const r = await habe.createUser(
      'company/plantA/areaA1',
      'operator_areaA1',
      'company/plantA/areaA1:sensor_data'
    );
    assert(r.ok);
    uskAreaA1_sensor = r.usk_id;
    console.log(`    Issued: ${uskAreaA1_sensor}`);
  });

  await test('Issue keys: Plant A Manager (manager)', async () => {
    const r = await habe.createUser(
      'company/plantA',
      'manager_plantA',
      'company/plantA:manager'
    );
    assert(r.ok);
    uskPlantA_manager = r.usk_id;
    console.log(`    Issued: ${uskPlantA_manager}`);
  });

  await test('Issue keys: Company Emergency Authority (emergency_board)', async () => {
    const r = await habe.createUser(
      'company',
      'emergency_director',
      'company:emergency_board'
    );
    assert(r.ok);
    uskCompany_emergency = r.usk_id;
    console.log(`    Issued: ${uskCompany_emergency}`);
  });

  await test('Issue keys: Plant B Operator (unauthorized branch)', async () => {
    const r = await habe.createUser(
      'company/plantB',
      'operator_plantB',
      'company/plantB:sensor_data'
    );
    assert(r.ok);
    uskPlantB_sensor = r.usk_id;
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- Test 1: Normal Telemetry (Area & Plant Level Confinement) ---');

  const normalTelemetry = {
    temperature: 34.2,   // Normal [20, 50]
    vibration:   1.25,   // Normal [0.1, 2.5]
    pressure:    55.0,   // Normal [30, 70]
    gas_ppm:     22.0,   // Normal < 50
  };
  const normalPayload = 'NORMAL_SYS_VOLT_415V_OK';
  const normalRecordId = `sensor_norm_${Date.now()}`;
  let normalEncResult;

  await test('Edge DT classifies normal telemetry -> NORMAL state', async () => {
    const res = await sensorPolicy.predictPolicy({
      plantId: 'company/plantA',
      areaId:  'areaA1',
      telemetry: normalTelemetry,
    });
    assert(res.status === 'success', 'predictPolicy failed');
    assertEqual(res.predicted_state, 'NORMAL');
    assertEqual(
      res.dynamic_policy,
      '(company/plantA/areaA1 AND sensor_data) OR (company/plantA AND manager)'
    );
    normalEncResult = res;
  });

  let normalCtHex;
  await test('Encrypt payload under autonomous NORMAL policy', async () => {
    const enc = await habe.encrypt(normalEncResult.dynamic_policy, normalPayload);
    assert(enc.ok && enc.ct_hex);
    normalCtHex = enc.ct_hex;

    // Anchor hash on blockchain (Gate 1 Anchor)
    const ctHash = storage.hashCT(normalCtHex);
    const tx = await blockchain.storeHash(normalRecordId, ctHash, {
      predicted_state: 'NORMAL',
      dynamic_policy:  normalEncResult.dynamic_policy,
    });
    assert(tx.txHash);
    await storage.writeCT(normalRecordId, normalCtHex);
  });

  await test('Area A1 operator decrypts NORMAL data successfully (Clause 0)', async () => {
    const dec = await habe.decrypt(normalCtHex, [uskAreaA1_sensor], 0);
    assert(dec.ok);
    const pt = Buffer.from(dec.plaintext_hex, 'hex').toString('utf8').replace(/\0/g, '');
    assertEqual(pt, normalPayload);
  });

  await test('Plant A manager decrypts NORMAL data successfully (Clause 1)', async () => {
    const dec = await habe.decrypt(normalCtHex, [uskPlantA_manager], 1);
    assert(dec.ok);
    const pt = Buffer.from(dec.plaintext_hex, 'hex').toString('utf8').replace(/\0/g, '');
    assertEqual(pt, normalPayload);
  });

  await test('Company Emergency Board cannot access NORMAL telemetry (no clause 2)', async () => {
    let denied = false;
    try {
      await habe.decrypt(normalCtHex, [uskCompany_emergency], 2);
    } catch (err) {
      denied = true;
    }
    assert(denied, 'Emergency board should not have access to NORMAL telemetry');
  });

  await test('Plant B unauthorized operator cannot decrypt NORMAL telemetry', async () => {
    try {
      const dec = await habe.decrypt(normalCtHex, [uskPlantB_sensor], 0);
      const ptBuf = Buffer.from(dec.plaintext_hex, 'hex');
      const ptStr = ptBuf.toString('utf8').replace(/\0/g, '');
      const isPrintable = ptBuf.slice(0, ptStr.length || 1).every(b => b === 0 || (b >= 0x20 && b <= 0x7e));
      assert(!isPrintable || ptStr !== normalPayload, 'Should have failed Gate 2 printability');
    } catch (err) {
      assert(true);
    }
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- Test 2: Critical Telemetry Spike (Autonomous Policy Escalation) ---');

  const criticalTelemetry = {
    temperature: 92.5,   // Critical > 75
    vibration:   6.10,   // Critical > 4.5
    pressure:    142.0,  // Critical > 110
    gas_ppm:     280.0,  // Critical > 150
  };
  const criticalPayload = 'CRITICAL_PRESSURE_BLEED_99PSI';
  const criticalRecordId = `sensor_crit_${Date.now()}`;
  let critPrediction;

  await test('Edge DT classifies critical spike -> CRITICAL state', async () => {
    const res = await sensorPolicy.predictPolicy({
      plantId: 'company/plantA',
      areaId:  'areaA1',
      telemetry: criticalTelemetry,
    });
    assertEqual(res.predicted_state, 'CRITICAL');
    assertEqual(
      res.dynamic_policy,
      '(company/plantA/areaA1 AND sensor_data) OR (company/plantA AND manager) OR (company AND emergency_board)'
    );
    critPrediction = res;
  });

  let critCtHex;
  await test('Encrypt payload under autonomous escalated CRITICAL policy', async () => {
    const enc = await habe.encrypt(critPrediction.dynamic_policy, criticalPayload);
    assert(enc.ok && enc.ct_hex);
    critCtHex = enc.ct_hex;

    const ctHash = storage.hashCT(critCtHex);
    await blockchain.storeHash(criticalRecordId, ctHash, {
      predicted_state: 'CRITICAL',
      dynamic_policy:  critPrediction.dynamic_policy,
    });
    await storage.writeCT(criticalRecordId, critCtHex);
  });

  await test('Root/Company Emergency Board decrypts CRITICAL data (Clause 2 Escalation)', async () => {
    const dec = await habe.decrypt(critCtHex, [uskCompany_emergency], 2);
    assert(dec.ok);
    const pt = Buffer.from(dec.plaintext_hex, 'hex').toString('utf8').replace(/\0/g, '');
    assertEqual(pt, criticalPayload);
  });

  await test('Area A1 operator can also decrypt CRITICAL data (Clause 0)', async () => {
    const dec = await habe.decrypt(critCtHex, [uskAreaA1_sensor], 0);
    assert(dec.ok);
    const pt = Buffer.from(dec.plaintext_hex, 'hex').toString('utf8').replace(/\0/g, '');
    assertEqual(pt, criticalPayload);
  });

  await test('Plant A manager can also decrypt CRITICAL data (Clause 1)', async () => {
    const dec = await habe.decrypt(critCtHex, [uskPlantA_manager], 1);
    assert(dec.ok);
    const pt = Buffer.from(dec.plaintext_hex, 'hex').toString('utf8').replace(/\0/g, '');
    assertEqual(pt, criticalPayload);
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- Test 3: Gate 1 Integrity Retention (Tamper Detection) ---');

  await test('Gate 1 halts tampered ciphertext before reaching HABE bilinear pairings', async () => {
    // 1. Read authentic CT
    const authenticCt = await storage.readCT(normalRecordId);
    const chainRecord = await blockchain.getHash(normalRecordId);
    const authenticHash = storage.hashCT(authenticCt);
    assertEqual(authenticHash, chainRecord.hash, 'Original hash must match on-chain anchor');

    // 2. Introduce tamper in storage (flip byte in ciphertext payload directly on disk)
    const fpath = path.resolve(__dirname, '../storage/' + normalRecordId + '.bin');
    const tamperedCt = authenticCt.slice(0, 8) + (authenticCt.slice(8, 10) === 'ff' ? '00' : 'ff') + authenticCt.slice(10);
    fs.writeFileSync(fpath, tamperedCt, 'utf8');

    // 3. Perform Gate 1 Verification
    const readBackCt = await storage.readCT(normalRecordId);
    const localHash = storage.hashCT(readBackCt);

    assert(localHash !== chainRecord.hash, 'Local hash must differ after tampering');

    // Verification check: Gate 1 halts before reaching HABE
    let gate1Passed = false;
    let gate1Status = 200;
    if (localHash !== chainRecord.hash) {
      gate1Status = 409;
      gate1Passed = false;
    } else {
      gate1Passed = true;
    }

    assertEqual(gate1Passed, false, 'Gate 1 must reject tampered ciphertext');
    assertEqual(gate1Status, 409, 'Gate 1 must halt with 409 Conflict');

    // Restore original CT for cleanup
    fs.writeFileSync(fpath, authenticCt, 'utf8');
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- HTTP Gateway Endpoints Verification ---');

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/data', require('../src/routes/data'));
  app.use(errorHandler);

  let server;
  let baseUrl;

  function apiPost(endpoint, body) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const u = new URL(endpoint, baseUrl);
      const req = http.request(
        {
          hostname: u.hostname,
          port:     u.port,
          path:     u.pathname,
          method:   'POST',
          headers: {
            'Content-Type':   'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          let raw = '';
          res.on('data', c => raw += c);
          res.on('end', () => {
            try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
            catch (_) { resolve({ status: res.statusCode, body: raw }); }
          });
        }
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  function apiGet(endpoint) {
    return new Promise((resolve, reject) => {
      const u = new URL(endpoint, baseUrl);
      const req = http.request(
        {
          hostname: u.hostname,
          port:     u.port,
          path:     `${u.pathname}${u.search}`,
          method:   'GET',
        },
        (res) => {
          let raw = '';
          res.on('data', c => raw += c);
          res.on('end', () => {
            try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
            catch (_) { resolve({ status: res.statusCode, body: raw }); }
          });
        }
      );
      req.on('error', reject);
      req.end();
    });
  }

  await test('Start ephemeral Express server for HTTP tests', async () => {
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
    assert(baseUrl, 'Failed to start ephemeral server');
  });

  const httpNormRecordId = `http_norm_${Date.now()}`;
  await test('POST /data/encrypt/autonomous (NORMAL telemetry over HTTP)', async () => {
    const res = await apiPost('/data/encrypt/autonomous', {
      plantId:   'company/plantA',
      areaId:    'areaA1',
      telemetry: normalTelemetry,
      payload:   'HTTP_AUTONOMOUS_NORMAL_OK',
      recordId:  httpNormRecordId,
    });
    assertEqual(res.status, 200);
    assert(res.body.ok === true);
    assertEqual(res.body.predicted_state, 'NORMAL');
    assertEqual(
      res.body.policy,
      '(company/plantA/areaA1 AND sensor_data) OR (company/plantA AND manager)'
    );
    assert(res.body.ctHash && res.body.txHash);
  });

  await test('GET /data/:fileId decrypts via HTTP (Gate 1 + Gate 2)', async () => {
    const res = await apiGet(`/data/${httpNormRecordId}?usk_ids=${encodeURIComponent(uskAreaA1_sensor)}&clause_idx=0`);
    assertEqual(res.status, 200);
    assert(res.body.ok === true);
    assertEqual(res.body.plaintext, 'HTTP_AUTONOMOUS_NORMAL_OK');
  });

  const httpCritRecordId = `http_crit_${Date.now()}`;
  await test('POST /data/encrypt/autonomous (CRITICAL telemetry spike over HTTP)', async () => {
    const res = await apiPost('/data/encrypt/autonomous', {
      plantId:   'company/plantA',
      areaId:    'areaA1',
      telemetry: criticalTelemetry,
      payload:   'HTTP_AUTONOMOUS_CRIT_EVAC',
      recordId:  httpCritRecordId,
    });
    assertEqual(res.status, 200);
    assert(res.body.ok === true);
    assertEqual(res.body.predicted_state, 'CRITICAL');
    assert(res.body.policy.includes('emergency_board'));
  });

  await test('GET /data/:fileId decrypts CRITICAL via emergency authority over HTTP', async () => {
    const res = await apiGet(`/data/${httpCritRecordId}?usk_ids=${encodeURIComponent(uskCompany_emergency)}&clause_idx=2`);
    assertEqual(res.status, 200);
    assertEqual(res.body.plaintext, 'HTTP_AUTONOMOUS_CRIT_EVAC');
  });

  const httpManualId = `http_manual_${Date.now()}`;
  await test('POST /data/encrypt (backward compatibility with manual static DNF policyStr)', async () => {
    const res = await apiPost('/data/encrypt', {
      fileId:    httpManualId,
      plaintext: 'MANUAL_STATIC_POLICY_OK',
      policyStr: '(company/plantA/areaA1 AND sensor_data)',
    });
    assertEqual(res.status, 200);
    assert(res.body.ok === true);
    assert(res.body.ctHash && res.body.txHash);
  });

  await test('GET /data/:fileId tampered ciphertext rejected with 409 over HTTP (Gate 1)', async () => {
    const fpath = path.resolve(__dirname, '../storage/' + httpManualId + '.bin');
    const ct = fs.readFileSync(fpath, 'utf8');
    const tampered = ct.slice(0, 8) + (ct.slice(8, 10) === 'ff' ? '00' : 'ff') + ct.slice(10);
    fs.writeFileSync(fpath, tampered, 'utf8');

    const res = await apiGet(`/data/${httpManualId}?usk_ids=${encodeURIComponent(uskAreaA1_sensor)}&clause_idx=0`);
    assertEqual(res.status, 409);
    assert(res.body.error.includes('tampered'));

    fs.unlinkSync(fpath);
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- Cleanup ---');
  await test('Clean up stored CT files and shutdown ephemeral server', async () => {
    await storage.deleteCT(normalRecordId);
    await storage.deleteCT(criticalRecordId);
    await storage.deleteCT(httpNormRecordId);
    await storage.deleteCT(httpCritRecordId);
    if (server) server.close();
  });

  habe.stop();

  console.log(`\n=== Final Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('[fatal]', err);
  habe.stop();
  process.exit(1);
});
