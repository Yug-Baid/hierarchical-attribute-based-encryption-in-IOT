'use strict';
require('dotenv').config();

const http = require('http');
const fs   = require('fs');
const path = require('path');

const RUN_ID = Date.now();

function request(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3000, path: urlPath, method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

let passed = 0, failed = 0;
const timings = [];

async function test(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    const ms = Date.now() - t0;
    console.log(`  [PASS] ${name} (${ms}ms)`);
    passed++;
  } catch (err) {
    const ms = Date.now() - t0;
    console.error(`  [FAIL] ${name} (${ms}ms): ${err.message}`);
    failed++;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

function printReport() {
  console.log('\n' + '='.repeat(60));
  console.log('PERFORMANCE SUMMARY');
  console.log('='.repeat(60));
  for (const t of timings)
    console.log(`  ${t.label.padEnd(42)} ${String(t.ms + 'ms').padStart(8)}  ${t.note || ''}`);
  console.log('='.repeat(60) + '\n');
}

async function run() {
  console.log('\n=== HABE IIoT Full HTTP End-to-End Test ===\n');

  const USER_DM  = `plantA_mgr_${RUN_ID}`;
  const USER_OP  = `operator1_${RUN_ID}`;
  const FILE_DM  = `e2e_dm_${RUN_ID}`;
  const FILE_SDM = `e2e_sdm_${RUN_ID}`;
  const FILE_DNF = `e2e_dnf_${RUN_ID}`;

  let uskDM, uskSensor, uskPlant;

  /* ------------------------------------------------------------------ */
  console.log('--- Health Check ---');
  await test('GET /admin/health', async () => {
    const { status, body } = await request('GET', '/admin/health');
    assert(status === 200 && body.ok && body.engine === 'ready', JSON.stringify(body));
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- Hierarchy Bootstrap ---');
  const t0 = Date.now();
  const { status: ss, body: sb } = await request('POST', '/admin/setup');
  const setupMs = Date.now() - t0;
  assert(ss === 200, `setup failed: ${JSON.stringify(sb)}`);
  timings.push({ label: 'POST /admin/setup (6 DM/SDM nodes)', ms: setupMs, note: 'HABE + Besu auditLog' });
  console.log(`  Bootstrap: ${setupMs}ms`);
  console.log(`  Hierarchy: ${JSON.stringify(sb.hierarchy)}`);

  /* ------------------------------------------------------------------ */
  console.log('\n--- Node Registration ---');
  await test('GET /nodes', async () => {
    const { status, body } = await request('GET', '/nodes');
    assert(status === 200 && body.ok);
    console.log(`    Nodes on chain: ${body.nodes.length}`);
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- Bulletin Registration (pre-condition for key issuance) ---');

  await test('POST /bulletin/register — manager for USER_DM', async () => {
    const { status, body } = await request('POST', '/bulletin/register', {
      userAddr: USER_DM,
      dmAddr:   'company/plantA',
      context: {
        role:            'manager',
        location:        'plantA',
        time_of_day:     '09:00',
        device_trust:    'high',
        past_violations: 0,
      },
    });
    assert(status === 201, `bulletin register failed: ${JSON.stringify(body)}`);
    assert(body.ok === true);
    assert(Array.isArray(body.union_attrs), 'expected union_attrs');
  });

  await test('POST /bulletin/register — technician for USER_OP (sensor)', async () => {
    const { status, body } = await request('POST', '/bulletin/register', {
      userAddr: USER_OP,
      dmAddr:   'company/plantA/areaA1',
      context: {
        role:            'technician',
        location:        'areaA1',
        time_of_day:     '09:00',
        device_trust:    'high',
        past_violations: 0,
      },
    });
    assert(status === 201, `bulletin register failed: ${JSON.stringify(body)}`);
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- User Key Issuance ---');

  const t1 = Date.now();
  const { status: u1s, body: u1b } = await request('POST', '/register/user', {
    dmAddr:   'company/plantA',
    userAddr: USER_DM,
    attrPk:   'company/plantA:plant_data',
  });
  const u1ms = Date.now() - t1;
  assert(u1s === 200, `usk1 failed: ${JSON.stringify(u1b)}`);
  uskDM = u1b.usk_id;
  timings.push({ label: 'POST /register/user (DM-level)', ms: u1ms, note: 'bulletin lookup + CreateUser' });
  console.log(`  DM key: ${u1ms}ms  id=${uskDM}`);

  const t2 = Date.now();
  const { status: u2s, body: u2b } = await request('POST', '/register/user', {
    dmAddr:   'company/plantA/areaA1',
    userAddr: USER_OP,
    attrPk:   'company/plantA/areaA1:sensor_data',
  });
  const u2ms = Date.now() - t2;
  assert(u2s === 200, `usk2 failed: ${JSON.stringify(u2b)}`);
  uskSensor = u2b.usk_id;
  timings.push({ label: 'POST /register/user (SDM sensor)', ms: u2ms, note: 'bulletin lookup + CreateUser' });
  console.log(`  SDM sensor key: ${u2ms}ms`);

  // engineer bulletin for USER_OP so plant_data is in UNION
  await request('POST', '/bulletin/register', {
    userAddr: USER_OP,
    dmAddr:   'company/plantA/areaA1',
    context: {
      role:            'engineer',
      location:        'areaA1',
      time_of_day:     '09:00',
      device_trust:    'high',
      past_violations: 0,
    },
  });

  const t3 = Date.now();
  const { status: u3s, body: u3b } = await request('POST', '/register/user', {
    dmAddr:   'company/plantA/areaA1',
    userAddr: USER_OP,
    attrPk:   'company/plantA/areaA1:plant_data',
  });
  const u3ms = Date.now() - t3;
  assert(u3s === 200, `usk3 failed: ${JSON.stringify(u3b)}`);
  uskPlant = u3b.usk_id;
  timings.push({ label: 'POST /register/user (SDM plant)', ms: u3ms, note: 'bulletin lookup + CreateUser' });
  console.log(`  SDM plant key: ${u3ms}ms`);

  /* ------------------------------------------------------------------ */
  console.log('\n--- Encrypt + Store ---');

  const te1 = Date.now();
  const { status: e1s, body: e1b } = await request('POST', '/data', {
    fileId:     FILE_DM,
    plaintext:  'TEMP=72.4C PRES=101.3',
    policy:     { clauses: [['company/plantA:plant_data']], dm_pks: ['company/plantA'] },
    senderAddr: 'company/plantA/areaA1',
  });
  const te1ms = Date.now() - te1;
  assert(e1s === 200, `enc1 failed: ${e1b.error}`);
  timings.push({ label: 'POST /data DM-level (HABE+storeHash)', ms: te1ms, note: 'pairing + Besu tx' });
  console.log(`  DM encrypt: ${te1ms}ms  ctHash=${e1b.ctHash.slice(0,16)}...  txHash=${e1b.txHash.slice(0,16)}...`);

  const te2 = Date.now();
  const { status: e2s, body: e2b } = await request('POST', '/data', {
    fileId:     FILE_SDM,
    plaintext:  'VIBR=0.03mm RPM=1450',
    policy:     { clauses: [['company/plantA/areaA1:sensor_data']], dm_pks: ['company/plantA/areaA1'] },
    senderAddr: 'company/plantA/areaA1',
  });
  const te2ms = Date.now() - te2;
  assert(e2s === 200, `enc2 failed: ${e2b.error}`);
  timings.push({ label: 'POST /data SDM depth-2 (HABE+storeHash)', ms: te2ms, note: 'pairing + Besu tx' });
  console.log(`  SDM encrypt: ${te2ms}ms`);

  const te3 = Date.now();
  const { status: e3s, body: e3b } = await request('POST', '/data', {
    fileId:     FILE_DNF,
    plaintext:  'CROSS_PLANT_REPORT_X',
    policy: {
      clauses: [['company/plantA/areaA1:sensor_data', 'company/plantA/areaA1:plant_data']],
      dm_pks:  ['company/plantA/areaA1'],
    },
    senderAddr: 'company/plantA/areaA1',
  });
  const te3ms = Date.now() - te3;
  assert(e3s === 200, `enc3 failed: ${e3b.error}`);
  timings.push({ label: 'POST /data DNF 2-attr (HABE+storeHash)', ms: te3ms, note: 'pairing + Besu tx' });
  console.log(`  DNF encrypt: ${te3ms}ms`);

  /* ------------------------------------------------------------------ */
  console.log('\n--- Decrypt (Gate 1 + Gate 2) ---');

  const td1 = Date.now();
  const { status: d1s, body: d1b } = await request('GET',
    `/data/${FILE_DM}?usk_ids=${encodeURIComponent(uskDM)}&clause_idx=0&operatorAddr=${USER_DM}`);
  const td1ms = Date.now() - td1;
  assert(d1s === 200, `dec1 failed ${d1s}: ${JSON.stringify(d1b)}`);
  assert(d1b.plaintext === 'TEMP=72.4C PRES=101.3', `got: ${d1b.plaintext}`);
  timings.push({ label: 'GET /data DM-level (getHash+decrypt)', ms: td1ms, note: 'Gate1+Gate2' });
  console.log(`  DM decrypt: ${td1ms}ms  → "${d1b.plaintext}"`);

  const td2 = Date.now();
  const { status: d2s, body: d2b } = await request('GET',
    `/data/${FILE_SDM}?usk_ids=${encodeURIComponent(uskSensor)}&clause_idx=0&operatorAddr=${USER_OP}`);
  const td2ms = Date.now() - td2;
  assert(d2s === 200, `dec2 failed ${d2s}: ${JSON.stringify(d2b)}`);
  assert(d2b.plaintext === 'VIBR=0.03mm RPM=1450', `got: ${d2b.plaintext}`);
  timings.push({ label: 'GET /data SDM depth-2 (getHash+decrypt)', ms: td2ms, note: 'Gate1+Gate2' });
  console.log(`  SDM decrypt: ${td2ms}ms  → "${d2b.plaintext}"`);

  const td3 = Date.now();
  const uids = encodeURIComponent(uskSensor) + ',' + encodeURIComponent(uskPlant);
  const { status: d3s, body: d3b } = await request('GET',
    `/data/${FILE_DNF}?usk_ids=${uids}&clause_idx=0&operatorAddr=${USER_OP}`);
  const td3ms = Date.now() - td3;
  assert(d3s === 200, `dec3 failed ${d3s}: ${JSON.stringify(d3b)}`);
  assert(d3b.plaintext === 'CROSS_PLANT_REPORT_X', `got: ${d3b.plaintext}`);
  timings.push({ label: 'GET /data DNF 2-attr (getHash+decrypt)', ms: td3ms, note: 'Gate1+Gate2' });
  console.log(`  DNF decrypt: ${td3ms}ms  → "${d3b.plaintext}"`);

  /* ------------------------------------------------------------------ */
  console.log('\n--- Tamper Detection (Gate 1) ---');

  await test('Gate 1: tampered CT rejected with 409', async () => {
    const fid = `tamper_${RUN_ID}`;
    const { body: eb } = await request('POST', '/data', {
      fileId: fid, plaintext: 'TAMPER_TEST_DATA_XY',
      policy: { clauses: [['company/plantA:plant_data']], dm_pks: ['company/plantA'] },
      senderAddr: 'company/plantA/areaA1',
    });
    assert(eb.ok, eb.error);
    const fpath = path.resolve(__dirname, '../storage/' + fid + '.bin');
    const ct = fs.readFileSync(fpath, 'utf8');
    fs.writeFileSync(fpath, 'ff' + ct.slice(2));
    const { status, body } = await request('GET',
      `/data/${fid}?usk_ids=${encodeURIComponent(uskDM)}&clause_idx=0`);
    assert(status === 409, `Expected 409, got ${status}`);
    assert(body.error.includes('tampered'), `Expected tamper msg, got: ${body.error}`);
    fs.unlinkSync(fpath);
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- Policy Enforcement (Gate 2) ---');

  await test('Gate 2: key from wrong DM branch rejected with 403', async () => {
    const USER_B = `plantB_op_${RUN_ID}`;
    // Register bulletin first
    await request('POST', '/bulletin/register', {
      userAddr: USER_B,
      dmAddr:   'company/plantB',
      context: {
        role:            'manager',
        location:        'plantB',
        time_of_day:     '09:00',
        device_trust:    'high',
        past_violations: 0,
      },
    });
    const { status: us, body: ub } = await request('POST', '/register/user', {
      dmAddr:   'company/plantB',
      userAddr: USER_B,
      attrPk:   'company/plantB:plant_data',
    });
    assert(us === 200, `key issue failed: ${ub.error}`);
    const uskB = ub.usk_id;
    const { status, body } = await request('GET',
      `/data/${FILE_DM}?usk_ids=${encodeURIComponent(uskB)}&clause_idx=0`);
    assert(status === 403, `Expected 403, got ${status}: ${JSON.stringify(body)}`);
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- Bulletin Gate (HTTP-level) ---');

  await test('Bulletin gate: no bulletin → 403 (not 400)', async () => {
    // New flow: no context in body, missing bulletin → 403
    const { status, body } = await request('POST', '/register/user', {
      dmAddr:   'company/plantA/areaA1',
      userAddr: `no_bulletin_${RUN_ID}`,
      attrPk:   'company/plantA/areaA1:sensor_data',
    });
    assert(status === 403, `Expected 403, got ${status}: ${JSON.stringify(body)}`);
    assert(body.error.includes('bulletin'), `Expected bulletin error, got: ${body.error}`);
  });

  await test('Bulletin gate: attr not in UNION_ATTRS → 403', async () => {
    // Register a technician bulletin — admin_data will not be in union
    const USER_DENY = `deny_test_${RUN_ID}`;
    await request('POST', '/bulletin/register', {
      userAddr: USER_DENY,
      dmAddr:   'company/plantA/areaA1',
      context: {
        role:            'technician',
        location:        'areaA1',
        time_of_day:     '09:00',
        device_trust:    'high',
        past_violations: 0,
      },
    });
    const { status, body } = await request('POST', '/register/user', {
      dmAddr:   'company/plantA/areaA1',
      userAddr: USER_DENY,
      attrPk:   'company/plantA/areaA1:admin_data',
    });
    assert(status === 403, `Expected 403, got ${status}: ${JSON.stringify(body)}`);
    assert(body.reason === 'not_in_union_attrs', `Unexpected reason: ${body.reason}`);
    assert(Array.isArray(body.union_attrs), 'Expected union_attrs in denial response');
  });

  await test('Bulletin gate: context change revokes probabilistic attr', async () => {
    const USER_CTX = `ctx_change_${RUN_ID}`;

    // Good context — telemetry_data should be in UNION
    const { body: b1 } = await request('POST', '/bulletin/register', {
      userAddr: USER_CTX,
      dmAddr:   'company/plantA/areaA1',
      context: {
        role:            'technician',
        location:        'areaA1',
        time_of_day:     '09:00',
        device_trust:    'high',
        past_violations: 0,
      },
    });
    assert(b1.union_attrs.includes('company/plantA/areaA1:telemetry_data'),
           `telemetry_data should be in UNION with good context, got: ${JSON.stringify(b1.union_attrs)}`);

    // Degrade context — re-register bulletin
    const { body: b2 } = await request('POST', '/bulletin/register', {
      userAddr: USER_CTX,
      dmAddr:   'company/plantA/areaA1',
      context: {
        role:            'technician',
        location:        'areaA1',
        time_of_day:     '09:00',
        device_trust:    'low',
        past_violations: 4,
      },
    });
    assert(!b2.union_attrs.includes('company/plantA/areaA1:telemetry_data'),
           `telemetry_data should NOT be in UNION with degraded context, got: ${JSON.stringify(b2.union_attrs)}`);

    // Key issuance for telemetry_data must now be denied
    const { status, body } = await request('POST', '/register/user', {
      dmAddr:   'company/plantA/areaA1',
      userAddr: USER_CTX,
      attrPk:   'company/plantA/areaA1:telemetry_data',
    });
    assert(status === 403, `Expected 403 after context degraded, got ${status}`);
    assert(body.reason === 'not_in_union_attrs', `Unexpected reason: ${body.reason}`);
  });

  await test('GET /bulletin/:userAddr returns bulletin + union_attrs', async () => {
    const { status, body } = await request('GET', `/bulletin/${USER_DM}`);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.ok === true);
    assert(body.bulletin.userAddr === USER_DM);
    assert(Array.isArray(body.union_attrs));
  });

  await test('GET /bulletin/:userAddr 404 for unknown user', async () => {
    const { status } = await request('GET', '/bulletin/totally_unknown_user_xyz');
    assert(status === 404, `Expected 404, got ${status}`);
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- Cleanup ---');
  await test('DELETE all test files', async () => {
    for (const fid of [FILE_DM, FILE_SDM, FILE_DNF]) {
      const { status, body } = await request('DELETE', `/data/${fid}`, { ownerAddr: USER_DM });
      assert(status === 200, `delete ${fid} failed: ${body.error}`);
    }
  });

  /* ------------------------------------------------------------------ */
  printReport();
  console.log(`=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error('[fatal]', err.message); process.exit(1); });