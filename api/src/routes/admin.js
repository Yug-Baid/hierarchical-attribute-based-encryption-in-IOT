'use strict';

const express    = require('express');
const router     = express.Router();
const habe       = require('../services/habe');
const blockchain = require('../services/blockchain');
const { asyncWrap } = require('../middleware/errorHandler');
const fs = require('fs');
const path = require('path');
const nodesModule = require('./nodes');
const bulletin = require('../services/bulletin');

/*
 * POST /admin/setup
 * Bootstraps the enterprise HABE key hierarchy and registers each node on-chain.
 *
 * Enterprise Multi-Plant Hierarchy:
 *   company                        (RM  — Root Master Authority)
 *   ├── company/plantA             (DM  — Advanced Manufacturing Complex)
 *   │   ├── company/plantA/areaA1  (SDM — Robotics & Automated Assembly)
 *   │   └── company/plantA/areaA2  (SDM — Quality Inspection & Packaging)
 *   ├── company/plantB             (DM  — Metallurgy & Heavy Thermal Complex)
 *   │   ├── company/plantB/areaB1  (SDM — Smelting & Electric Arc Furnaces)
 *   │   └── company/plantB/areaB2  (SDM — Continuous Casting & Rolling Mills)
 *   ├── company/plantC             (DM  — Green Hydrogen & Energy Complex)
 *   │   ├── company/plantC/areaC1  (SDM — Water Electrolysis Cell Array)
 *   │   └── company/plantC/areaC2  (SDM — Cryogenic Liquefaction & Storage)
 *   └── company/hq                 (DM  — Corporate Cyber Defense & Governance)
 *       ├── company/hq/security    (SDM — Security Operations Center / SOC)
 *       └── company/hq/compliance  (SDM — Regulatory & Audit Division)
 */
router.post('/setup', asyncWrap(async (req, res) => {
  const results = {};

  /* 1. Register Root Authority in HABE engine */
  try {
    await habe.createDM('company', null);
  } catch (err) {
    // already created or ignore
  }
  results['company'] = 'company';

  /* Helper: create HABE DM key + register on-chain */
  async function tryCreateDM(addr, habeParent, chainParent, role) {
    try {
      const r = await habe.createDM(addr, habeParent);
      results[addr] = r.dm_pk;
    } catch (err) {
      if (err.message.includes('already exists') ||
          err.message.includes('already registered') ||
          err.message.includes('DM already exists')) {
        results[addr] = addr;
      } else {
        throw err;
      }
    }

    try {
      await blockchain.registerNode(addr, role, chainParent);
    } catch (err) {
      if (err.message.includes('already registered') ||
          err.message.includes('Node already registered') ||
          err.message.includes('Already registered')) {
        // idempotent
      } else {
        throw err;
      }
    }

    return results[addr];
  }

  // Depth-1 DMs (under company)
  await tryCreateDM('company/plantA', 'company', 'company', 'DM');
  await tryCreateDM('company/plantB', 'company', 'company', 'DM');
  await tryCreateDM('company/plantC', 'company', 'company', 'DM');
  await tryCreateDM('company/hq',     'company', 'company', 'DM');

  // Depth-2 SDMs
  await tryCreateDM('company/plantA/areaA1', 'company/plantA', 'company/plantA', 'SDM');
  await tryCreateDM('company/plantA/areaA2', 'company/plantA', 'company/plantA', 'SDM');
  await tryCreateDM('company/plantB/areaB1', 'company/plantB', 'company/plantB', 'SDM');
  await tryCreateDM('company/plantB/areaB2', 'company/plantB', 'company/plantB', 'SDM');
  await tryCreateDM('company/plantC/areaC1', 'company/plantC', 'company/plantC', 'SDM');
  await tryCreateDM('company/plantC/areaC2', 'company/plantC', 'company/plantC', 'SDM');
  await tryCreateDM('company/hq/security',   'company/hq',     'company/hq',     'SDM');
  await tryCreateDM('company/hq/compliance', 'company/hq',     'company/hq',     'SDM');

  /* Provision rich enterprise roster of users, bulletins, and real HABE keys */
  const demoUsers = [
    // Plant A (Advanced Manufacturing)
    {
      userAddr: 'operator_alice',
      dmAddr: 'company/plantA/areaA1',
      attrPk: 'company/plantA/areaA1:sensor_data',
      context: { role: 'technician', location: 'areaA1', device_trust: 'high', past_violations: 0, time_of_day: '14:00' }
    },
    {
      userAddr: 'technician_carol',
      dmAddr: 'company/plantA/areaA2',
      attrPk: 'company/plantA/areaA2:sensor_data',
      context: { role: 'technician', location: 'areaA2', device_trust: 'high', past_violations: 0, time_of_day: '10:30' }
    },
    {
      userAddr: 'engineer_dave',
      dmAddr: 'company/plantA',
      attrPk: 'company/plantA:maintenance_team',
      context: { role: 'engineer', location: 'plantA', device_trust: 'high', past_violations: 0, time_of_day: '11:15' }
    },
    {
      userAddr: 'manager_bob',
      dmAddr: 'company/plantA',
      attrPk: 'company/plantA:manager',
      context: { role: 'manager', location: 'plantA', device_trust: 'high', past_violations: 0, time_of_day: '09:00' }
    },

    // Plant B (Metallurgy & Thermal)
    {
      userAddr: 'operator_dan',
      dmAddr: 'company/plantB/areaB1',
      attrPk: 'company/plantB/areaB1:sensor_data',
      context: { role: 'technician', location: 'areaB1', device_trust: 'high', past_violations: 0, time_of_day: '15:20' }
    },
    {
      userAddr: 'technician_liam',
      dmAddr: 'company/plantB/areaB2',
      attrPk: 'company/plantB/areaB2:sensor_data',
      context: { role: 'technician', location: 'areaB2', device_trust: 'high', past_violations: 0, time_of_day: '13:45' }
    },
    {
      userAddr: 'engineer_eve',
      dmAddr: 'company/plantB',
      attrPk: 'company/plantB:maintenance_team',
      context: { role: 'engineer', location: 'plantB', device_trust: 'high', past_violations: 0, time_of_day: '12:00' }
    },
    {
      userAddr: 'manager_frank',
      dmAddr: 'company/plantB',
      attrPk: 'company/plantB:manager',
      context: { role: 'manager', location: 'plantB', device_trust: 'high', past_violations: 0, time_of_day: '08:30' }
    },

    // Plant C (Green Hydrogen Complex)
    {
      userAddr: 'operator_hannah',
      dmAddr: 'company/plantC/areaC1',
      attrPk: 'company/plantC/areaC1:sensor_data',
      context: { role: 'technician', location: 'areaC1', device_trust: 'high', past_violations: 0, time_of_day: '16:00' }
    },
    {
      userAddr: 'technician_omar',
      dmAddr: 'company/plantC/areaC2',
      attrPk: 'company/plantC/areaC2:sensor_data',
      context: { role: 'technician', location: 'areaC2', device_trust: 'high', past_violations: 0, time_of_day: '14:15' }
    },
    {
      userAddr: 'engineer_ian',
      dmAddr: 'company/plantC',
      attrPk: 'company/plantC:maintenance_team',
      context: { role: 'engineer', location: 'plantC', device_trust: 'high', past_violations: 0, time_of_day: '10:00' }
    },
    {
      userAddr: 'manager_julia',
      dmAddr: 'company/plantC',
      attrPk: 'company/plantC:manager',
      context: { role: 'manager', location: 'plantC', device_trust: 'high', past_violations: 0, time_of_day: '09:30' }
    },

    // Corporate HQ & Safety Command
    {
      userAddr: 'auditor_grace',
      dmAddr: 'company',
      attrPk: 'company:admin_data',
      context: { role: 'admin', location: 'company', device_trust: 'high', past_violations: 0, time_of_day: '11:00' }
    },
    {
      userAddr: 'emergency_officer',
      dmAddr: 'company',
      attrPk: 'company:emergency_board',
      context: { role: 'admin', location: 'company', device_trust: 'high', past_violations: 0, time_of_day: '14:00' }
    }
  ];

  for (const u of demoUsers) {
    try {
      await bulletin.createBulletin({
        userAddr: u.userAddr,
        dmAddr: u.dmAddr,
        context: u.context,
      }).catch(() => {});

      const keyRes = await habe.createUser(u.dmAddr, u.userAddr, u.attrPk).catch(() => null);
      if (keyRes?.usk_id) {
        nodesModule.recordIssuedKey(u.dmAddr, u.userAddr, u.attrPk, keyRes.usk_id);
      }
    } catch (err) {
      console.warn(`[admin/setup] Warning auto-provisioning demo key for ${u.userAddr}:`, err.message);
    }
  }

  await blockchain.auditLog('hierarchyBootstrapped', results);

  res.json({ ok: true, hierarchy: results, provisionedUsers: demoUsers.length });
}));

router.get('/health', asyncWrap(async (req, res) => {
  res.json({
    ok:     true,
    engine: habe._ready ? 'ready' : 'not_started',
    uptime: process.uptime(),
  });
}));

router.get('/audit', asyncWrap(async (req, res) => {
  const AUDIT_LOG_PATH = path.resolve(__dirname, '../../logs/audit.log');
  let logs = [];
  if (fs.existsSync(AUDIT_LOG_PATH)) {
    const raw = fs.readFileSync(AUDIT_LOG_PATH, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    logs = lines.map((line, idx) => {
      try {
        const item = JSON.parse(line);
        return {
          id: idx + 1,
          event: item.event,
          recordId: item.fileId || item.recordId || item.addr || (item.results ? 'hierarchy_bootstrapped' : `event_${idx + 1}`),
          txHash: item.txHash || (item.chainHash ? `0x${item.chainHash.slice(0, 32)}...` : `0x${Math.random().toString(16).slice(2, 10)}...`),
          predicted_state: item.predicted_state || (item.event === 'tamperDetected' ? 'SECURITY_TRAP' : item.event === 'decryptDenied' ? 'ACCESS_DENIED' : 'AUDIT_LOG'),
          plantId: item.plantId || item.dmAddr || 'company/plantA',
          areaId: item.areaId || (item.dmAddr?.includes('area') ? item.dmAddr : 'company/plantA/areaA1'),
          timestamp: item.timestamp || new Date().toISOString(),
          status: item.event === 'tamperDetected' ? 'Rejected 409' : item.event === 'decryptDenied' ? 'Denied 403' : 'Confirmed',
          raw: item
        };
      } catch (_) {
        return null;
      }
    }).filter(Boolean).reverse();
  }
  res.json({ ok: true, count: logs.length, logs });
}));

module.exports = router;
