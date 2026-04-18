require('dotenv').config();
/**
 * test/api.test.js
 *
 * End-to-end integration test for the full IIoT data lifecycle.
 * Runs directly against the service layer (no HTTP) so it works
 * without a running Express server.
 *
 * Run: node test/api.test.js
 *      (requires habe_cli binary to be built)
 *      (requires eligibility service running on localhost:5001)
 *
 * CHANGED: ML eligibility section replaced with bulletin service-layer tests.
 *   - Old: called checkEligibility() directly (runtime /predict flow)
 *   - New: calls createBulletin() + checkEligibility() from bulletin.js
 *   - /predict is still tested in ml/ml_test.py
 */

'use strict';

const habe       = require('../src/services/habe');
const blockchain = require('../src/services/blockchain');
const storage    = require('../src/services/storage');
const bulletin   = require('../src/services/bulletin');
const crypto     = require('crypto');
const fs         = require('fs');

/* -----------------------------------------------------------------------
 * Minimal test runner
 * ----------------------------------------------------------------------- */
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

/* -----------------------------------------------------------------------
 * Test suite
 * ----------------------------------------------------------------------- */
async function run() {
  console.log('\n=== HABE API Integration Tests ===\n');

  /* Start HABE engine */
  console.log('[setup] Starting HABE engine...');
  await habe.start();
  console.log('[setup] Engine ready.\n');

  /* ------------------------------------------------------------------ */
  console.log('--- Hierarchy Setup ---');

  await test('Create Plant A DM (depth 1)', async () => {
    const r = await habe.createDM('company/plantA', null);
    assert(r.ok, 'createDM failed');
    assertEqual(r.dm_pk, 'company/plantA');
  });

  await test('Create Plant B DM (depth 1)', async () => {
    const r = await habe.createDM('company/plantB', null);
    assert(r.ok);
  });

  await test('Create Area A1 SDM (depth 2, under Plant A)', async () => {
    const r = await habe.createDM('company/plantA/areaA1', 'company/plantA');
    assert(r.ok);
  });

  await test('Create Area B1 SDM (depth 2, under Plant B)', async () => {
    const r = await habe.createDM('company/plantB/areaB1', 'company/plantB');
    assert(r.ok);
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- User Key Issuance ---');

  let uskPlantA, uskAreaA1_sensor, uskAreaA1_plant;

  await test('Issue key to plantA_manager for plant_data attr', async () => {
    const r = await habe.createUser(
      'company/plantA',
      'plantA_manager',
      'company/plantA:plant_data'
    );
    assert(r.ok);
    uskPlantA = r.usk_id;
  });

  await test('Issue key to operator1 for areaA1:sensor_data', async () => {
    const r = await habe.createUser(
      'company/plantA/areaA1',
      'operator1',
      'company/plantA/areaA1:sensor_data'
    );
    assert(r.ok);
    uskAreaA1_sensor = r.usk_id;
  });

  await test('Issue second key to operator1 for areaA1:plant_data', async () => {
    const r = await habe.createUser(
      'company/plantA/areaA1',
      'operator1',
      'company/plantA/areaA1:plant_data'
    );
    assert(r.ok);
    uskAreaA1_plant = r.usk_id;
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- Encrypt / Store / Verify / Decrypt (DM-level policy) ---');

  const fileId1 = 'iot_reading_' + Date.now();
  const plaintext1 = 'TEMP=72.4C PRES=101.3';
  let ct1_hex;

  await test('Encrypt sensor data under plantA:plant_data policy', async () => {
    const r = await habe.encrypt(plaintext1, {
      clauses: [['company/plantA:plant_data']],
      dm_pks:  ['company/plantA'],
    });
    assert(r.ok);
    assert(r.ct_hex.length > 0);
    ct1_hex = r.ct_hex;
  });

  await test('storeHash on blockchain stub', async () => {
    const ctHash = storage.hashCT(ct1_hex);
    const r = await blockchain.storeHash(fileId1, ctHash, { sender: 'areaA1' });
    assert(r.txHash.startsWith('0x'));
  });

  await test('writeCT to local storage', async () => {
    await storage.writeCT(fileId1, ct1_hex);
    const read = await storage.readCT(fileId1);
    assertEqual(read, ct1_hex);
  });

  await test('Gate 1: hash integrity check passes', async () => {
    const ct_hex = await storage.readCT(fileId1);
    const localHash   = storage.hashCT(ct_hex);
    const chainRecord = await blockchain.getHash(fileId1);
    assertEqual(localHash, chainRecord.hash, 'Hash mismatch — tamper detected');
  });

  await test('Gate 2: plantA_manager decrypts successfully', async () => {
    const ct_hex = await storage.readCT(fileId1);
    const r = await habe.decrypt(ct_hex, [uskPlantA], 0);
    assert(r.ok);
    const ptStr = Buffer.from(r.plaintext_hex, 'hex').toString('utf8').replace(/\0/g, '');
    assertEqual(ptStr, plaintext1, `Plaintext mismatch: "${ptStr}" != "${plaintext1}"`);
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- Encrypt / Decrypt (SDM-level, depth-2) ---');

  const fileId2 = 'vibration_' + Date.now();
  const plaintext2 = 'VIBR=0.03mm RPM=1450';
  let ct2_hex;

  await test('Encrypt under areaA1:sensor_data policy', async () => {
    const r = await habe.encrypt(plaintext2, {
      clauses: [['company/plantA/areaA1:sensor_data']],
      dm_pks:  ['company/plantA/areaA1'],
    });
    assert(r.ok);
    ct2_hex = r.ct_hex;
    const ctHash = storage.hashCT(ct2_hex);
    await blockchain.storeHash(fileId2, ctHash, { sender: 'iot1' });
    await storage.writeCT(fileId2, ct2_hex);
  });

  await test('operator1 decrypts areaA1 data successfully', async () => {
    const ct_hex = await storage.readCT(fileId2);
    const r = await habe.decrypt(ct_hex, [uskAreaA1_sensor], 0);
    assert(r.ok);
    const ptStr = Buffer.from(r.plaintext_hex, 'hex').toString('utf8').replace(/\0/g, '');
    assertEqual(ptStr, plaintext2);
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- DNF: two-attribute conjunction ---');

  const fileId3 = 'report_' + Date.now();
  const plaintext3 = 'CROSS_PLANT_REPORT_X';
  let ct3_hex;

  await test('Encrypt under (areaA1:sensor_data AND areaA1:plant_data)', async () => {
    const r = await habe.encrypt(plaintext3, {
      clauses: [['company/plantA/areaA1:sensor_data',
                 'company/plantA/areaA1:plant_data']],
      dm_pks:  ['company/plantA/areaA1'],
    });
    assert(r.ok);
    ct3_hex = r.ct_hex;
    const ctHash = storage.hashCT(ct3_hex);
    await blockchain.storeHash(fileId3, ctHash, {});
    await storage.writeCT(fileId3, ct3_hex);
  });

  await test('operator1 with both keys decrypts conjunction', async () => {
    const ct_hex = await storage.readCT(fileId3);
    const r = await habe.decrypt(ct_hex, [uskAreaA1_sensor, uskAreaA1_plant], 0);
    assert(r.ok);
    const ptStr = Buffer.from(r.plaintext_hex, 'hex').toString('utf8').replace(/\0/g, '');
    assertEqual(ptStr, plaintext3);
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- Tamper Detection ---');

  await test('Gate 1 rejects tampered ciphertext', async () => {
    const ct_hex = await storage.readCT(fileId1);
    const tampered = ct_hex.slice(0, 10) + 'ff' + ct_hex.slice(12);
    const localHash   = storage.hashCT(tampered);
    const chainRecord = await blockchain.getHash(fileId1);
    assert(localHash !== chainRecord.hash, 'Tamper should have changed the hash');
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- Cleanup ---');

  await test('Delete CT files', async () => {
    await storage.deleteCT(fileId1);
    await storage.deleteCT(fileId2);
    await storage.deleteCT(fileId3);
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- Bulletin Service: createBulletin + checkEligibility ---');
  /*
   * Tests the bulletin service layer directly — no HTTP server needed.
   * Requires eligibility Flask service running on localhost:5001
   * (called once per createBulletin, not per checkEligibility).
   */

  const DM = 'company/plantA/areaA1';

  await test('createBulletin: technician good context — returns valid bulletin', async () => {
    const b = await bulletin.createBulletin({
      userAddr: 'api_test_tech_01',
      dmAddr:   DM,
      context: {
        role:            'technician',
        location:        'areaA1',
        time_of_day:     '09:00',
        device_trust:    'high',
        past_violations: 0,
      },
    });
    assert(b.userAddr === 'api_test_tech_01', 'wrong userAddr');
    assert(Array.isArray(b.absolute_attrs),       'absolute_attrs must be array');
    assert(typeof b.ml_scores === 'object',        'ml_scores must be object');
    assert(Object.keys(b.ml_scores).length === 6,  'expected 6 ml_scores');
    assert(b.absolute_attrs.includes(`${DM}:sensor_data`),
           'technician must have sensor_data as absolute');
    assert(!b.absolute_attrs.includes(`${DM}:admin_data`),
           'technician must NOT have admin_data as absolute');
  });

  await test('createBulletin: engineer — absolute includes sensor_data + telemetry_data', async () => {
    const b = await bulletin.createBulletin({
      userAddr: 'api_test_eng_01',
      dmAddr:   DM,
      context: {
        role:            'engineer',
        location:        'areaA1',
        time_of_day:     '09:00',
        device_trust:    'high',
        past_violations: 0,
      },
    });
    assert(b.absolute_attrs.includes(`${DM}:sensor_data`),    'engineer missing sensor_data');
    assert(b.absolute_attrs.includes(`${DM}:telemetry_data`), 'engineer missing telemetry_data');
    assert(!b.absolute_attrs.includes(`${DM}:control_data`),  'engineer should not have control_data absolute');
  });

  await test('createBulletin: admin — all 6 attrs in absolute_attrs', async () => {
    const b = await bulletin.createBulletin({
      userAddr: 'api_test_admin_01',
      dmAddr:   DM,
      context: {
        role:            'admin',
        location:        'areaA1',
        time_of_day:     '09:00',
        device_trust:    'high',
        past_violations: 0,
      },
    });
    const EXPECTED = ['sensor_data','telemetry_data','maintenance_data','plant_data','control_data','admin_data'];
    for (const t of EXPECTED) {
      assert(b.absolute_attrs.includes(`${DM}:${t}`), `admin missing absolute ${t}`);
    }
  });

  await test('checkEligibility: sensor_data in UNION for technician (absolute)', () => {
    const r = bulletin.checkEligibility('api_test_tech_01', `${DM}:sensor_data`);
    assert(r.eligible === true,          'sensor_data should be eligible');
    assertEqual(r.reason, 'absolute_attr', 'reason should be absolute_attr');
  });

  await test('checkEligibility: admin_data NOT in UNION for technician', () => {
    const r = bulletin.checkEligibility('api_test_tech_01', `${DM}:admin_data`);
    assert(r.eligible === false,               'admin_data should not be eligible for technician');
    assertEqual(r.reason, 'not_in_union_attrs', 'reason should be not_in_union_attrs');
  });

  await test('checkEligibility: union_attrs is superset of absolute_attrs', () => {
    const b = bulletin.getBulletin('api_test_tech_01');
    assert(b !== null, 'bulletin should exist');
    const unionSet = new Set(bulletin.getUnionAttrs('api_test_tech_01'));
    for (const a of b.absolute_attrs) {
      assert(unionSet.has(a), `absolute attr ${a} missing from union`);
    }
  });

  await test('checkEligibility: 404 error for unknown user', () => {
    try {
      bulletin.checkEligibility('nonexistent_user_xyz_abc', `${DM}:sensor_data`);
      throw new Error('Expected error to be thrown');
    } catch (err) {
      assertEqual(err.status, 404, `expected status 404, got ${err.status}`);
    }
  });

  await test('createBulletin: degraded context shrinks union (low trust, violations)', async () => {
    const b = await bulletin.createBulletin({
      userAddr: 'api_test_tech_degraded',
      dmAddr:   DM,
      context: {
        role:            'technician',
        location:        'areaA1',
        time_of_day:     '09:00',
        device_trust:    'low',
        past_violations: 4,
      },
    });
    const union = bulletin.getUnionAttrs('api_test_tech_degraded');
    // sensor_data is absolute so still in union; telemetry_data should be out
    assert(union.includes(`${DM}:sensor_data`),    'sensor_data (absolute) must still be in union');
    assert(!union.includes(`${DM}:telemetry_data`),'telemetry_data should NOT be in union with degraded context');
    assert(!union.includes(`${DM}:admin_data`),    'admin_data should NOT be in union for technician');
  });

  await test('createBulletin: 400 on missing context fields', async () => {
    try {
      await bulletin.createBulletin({
        userAddr: 'bad_user',
        dmAddr:   DM,
        context:  { role: 'technician' },  // missing location, device_trust, past_violations
      });
      throw new Error('Expected error to be thrown');
    } catch (err) {
      assertEqual(err.status, 400, `expected status 400, got ${err.status}: ${err.message}`);
    }
  });

  /* ------------------------------------------------------------------ */
  habe.stop();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('[fatal]', err);
  habe.stop();
  process.exit(1);
});