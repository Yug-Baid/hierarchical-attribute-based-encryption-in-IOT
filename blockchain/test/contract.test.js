'use strict';

const { ethers } = require('ethers');
const fs         = require('fs');
const path       = require('path');

const DEPLOY_PATH  = path.resolve(__dirname, '../config/deployment.json');
const RPC_URL      = process.env.RPC_URL || 'http://localhost:8545';
const DEPLOYER_KEY = process.env.DEPLOYER_KEY || process.env.DM_KEY;

/* Generate a fresh random address each run — avoids "Already registered"
 * on a live append-only chain where previous test runs left state.       */
const DM_WALLET  = ethers.Wallet.createRandom();
const DM_ADDRESS = DM_WALLET.address;

let passed = 0, failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message.split('\n')[0]}`);
    failed++;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `expected "${b}", got "${a}"`);
}

async function run() {
  console.log('\n=== HABERegistry Contract Tests ===\n');

  if (!fs.existsSync(DEPLOY_PATH)) {
    console.error('deployment.json not found. Run deploy.js first.');
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(DEPLOY_PATH, 'utf8'));
  const provider   = new ethers.JsonRpcProvider(RPC_URL);
  const deployer   = new ethers.Wallet(DEPLOYER_KEY, provider);
  const contract   = new ethers.Contract(deployment.address, deployment.abi, deployer);

  console.log(`Contract : ${deployment.address}`);
  console.log(`Deployer : ${deployer.address}`);
  console.log(`DM addr  : ${DM_ADDRESS}  (fresh random — generated this run)\n`);

  /* ------------------------------------------------------------------ */
  console.log('--- registerNode ---');

  await test('Deployer (RM) is registered at deploy time', async () => {
    const [role] = await contract.getNode(deployer.address);
    assertEqual(Number(role), 1, 'RM role should be 1');
  });

  await test('RM registers a DM node (fresh address)', async () => {
    const tx = await contract.registerNode(DM_ADDRESS, 2, deployer.address);
    await tx.wait();
    const [role, parent] = await contract.getNode(DM_ADDRESS);
    assertEqual(Number(role), 2, 'DM role should be 2');
    assertEqual(parent.toLowerCase(), deployer.address.toLowerCase());
  });

  await test('Reject duplicate registerNode', async () => {
    let threw = false;
    try {
      const tx = await contract.registerNode(DM_ADDRESS, 2, deployer.address);
      await tx.wait();
    } catch (_) { threw = true; }
    assert(threw, 'Should revert on duplicate');
  });

  await test('Non-admin cannot registerNode', async () => {
    const stranger = ethers.Wallet.createRandom().connect(provider);
    const freshAddr = ethers.Wallet.createRandom().address;
    let threw = false;
    try {
      // stranger has no ETH so estimateGas will revert with "Only admin"
      await stranger.estimateGas(
        await contract.registerNode.populateTransaction(freshAddr, 2, deployer.address)
      );
    } catch (_) { threw = true; }
    assert(threw, 'Non-admin should be rejected');
  });

  await test('Role RM (1) rejected by registerNode', async () => {
    const freshAddr = ethers.Wallet.createRandom().address;
    let threw = false;
    try {
      await contract.registerNode(freshAddr, 1, deployer.address); // Role.RM = 1
    } catch (_) { threw = true; }
    assert(threw, 'Should revert: Invalid role');
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- storeHash ---');

  const fileId   = 'test_file_' + Date.now();
  const testHash = ethers.keccak256(ethers.toUtf8Bytes('test ciphertext'));
  const meta     = JSON.stringify({ sender: deployer.address });

  await test('RM stores a ciphertext hash', async () => {
    const tx = await contract.storeHash(fileId, testHash, meta);
    await tx.wait();
  });

  await test('Reject duplicate storeHash for same fileId', async () => {
    let threw = false;
    try {
      const tx = await contract.storeHash(fileId, testHash, meta);
      await tx.wait();
    } catch (_) { threw = true; }
    assert(threw, 'Should revert on duplicate fileId');
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- getHash ---');

  await test('getHash returns correct hash', async () => {
    const [hash] = await contract.getHash(fileId);
    assertEqual(hash.toLowerCase(), testHash.toLowerCase(), 'Hash mismatch');
  });

  await test('getHash reverts for unknown fileId', async () => {
    let threw = false;
    try { await contract.getHash('nonexistent_xyz_' + Date.now()); }
    catch (_) { threw = true; }
    assert(threw, 'Should revert for unknown fileId');
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- auditLog ---');

  await test('RM emits auditLog event', async () => {
    const tx = await contract.auditLog('testEvent', JSON.stringify({ ok: true }));
    const receipt = await tx.wait();
    const iface = new ethers.Interface(deployment.abi);
    const found = receipt.logs.some(log => {
      try { const p = iface.parseLog(log); return p && p.name === 'AuditLog'; }
      catch (_) { return false; }
    });
    assert(found, 'AuditLog event should be in receipt');
  });

  await test('Unregistered address cannot call auditLog', async () => {
    const stranger = ethers.Wallet.createRandom().connect(provider);
    const strangerContract = contract.connect(stranger);
    let threw = false;
    try {
      await stranger.estimateGas(
        await strangerContract.auditLog.populateTransaction('testEvent', '{}')
      );
    } catch (_) { threw = true; }
    assert(threw, 'Unregistered caller should be rejected');
  });

  /* ------------------------------------------------------------------ */
  console.log('\n--- listNodes ---');

  await test('listNodes includes deployer (RM)', async () => {
    const nodes = await contract.listNodes();
    const addrs = nodes.map(a => a.toLowerCase());
    assert(addrs.includes(deployer.address.toLowerCase()), 'Deployer not in list');
  });

  await test('listNodes includes freshly registered DM', async () => {
    const nodes = await contract.listNodes();
    const addrs = nodes.map(a => a.toLowerCase());
    assert(addrs.includes(DM_ADDRESS.toLowerCase()), 'Fresh DM not in list');
  });

  await test('listNodes count grows after registration', async () => {
    const before = (await contract.listNodes()).length;
    const extra  = ethers.Wallet.createRandom().address;
    const tx     = await contract.registerNode(extra, 2, deployer.address);
    await tx.wait();
    const after  = (await contract.listNodes()).length;
    assertEqual(after, before + 1, `Expected ${before + 1} nodes, got ${after}`);
  });

  /* ------------------------------------------------------------------ */
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error('[fatal]', err.message); process.exit(1); });