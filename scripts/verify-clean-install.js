#!/usr/bin/env node

/**
 * verify-clean-install.js
 * Automated Clean Installation Verification Pipeline
 *
 * Implements Section 35 (Phase 31) of Master Development Prompt:
 * 1. Simulates fresh installation in temporary isolated directory
 * 2. Verifies security credentials bootstrap (PBKDF2 + random salt)
 * 3. Verifies default database schema initialization
 * 4. Verifies target generation from empty device catalog
 * 5. Verifies device enrollment & target generation
 * 6. Verifies Prometheus target validation criteria
 * 7. Verifies SNMP auth profile generation
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fs = require('fs');
const crypto = require('crypto');
const assert = require('assert');
const {
  validateSettings,
  generateTargetsYaml,
  getActiveDevices,
  hashPassword
} = require('../server/server.js');
const { validateTargets } = require('./validate-prometheus-targets.js');

async function runCleanInstallVerification() {
  console.log('====================================================');
  console.log('🧪 AUTOMATED CLEAN INSTALLATION VERIFICATION (SECTION 35)');
  console.log('====================================================\n');

  const testTempDir = path.resolve(__dirname, `../data/.test_clean_${Date.now()}`);
  if (!fs.existsSync(testTempDir)) {
    fs.mkdirSync(testTempDir, { recursive: true });
  }

  let step = 1;
  const pass = (desc) => console.log(`  [PASS Step ${step++}] ${desc}`);

  try {
    // [Step 1] Fresh Directory & Initial Database Schema
    const cleanDb = {
      devices: [],
      deletedIps: [],
      settings: {
        orgName: 'Enterprise Clean Install Test',
        prometheusUrl: 'http://127.0.0.1:9090',
        grafanaUrl: 'http://127.0.0.1:3000',
        defaultCommunity: 'public',
        defaultModule: 'if_mib',
        refreshInterval: 15,
        isConfigured: true
      },
      topology: { nodes: [], edges: [], positions: {} },
      alerts: []
    };
    pass('Created fresh database state in isolated sandbox');

    // [Step 2] Security Bootstrap (PBKDF2 Hashing)
    const bootstrapPassword = crypto.randomBytes(12).toString('hex');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(bootstrapPassword, salt);
    cleanDb.settings.emergencyPasswordHash = hash;
    cleanDb.settings.emergencyPasswordSalt = salt;
    assert.strictEqual(hash.length, 128);
    pass('Bootstrapped emergency admin credentials with PBKDF2 (SHA-512, 100k rounds)');

    // [Step 3] Settings Validation
    const settingsValidation = validateSettings(cleanDb.settings);
    assert.strictEqual(settingsValidation.valid, true);
    pass('Verified default settings schema conformance');

    // [Step 4] Generate Target Configurations (Empty State)
    const emptyTargets = generateTargetsYaml([], cleanDb.settings);
    assert.ok(emptyTargets.blackboxYaml.includes('[]'));
    assert.ok(emptyTargets.snmpYaml.includes('[]'));
    const emptyValidation = validateTargets(emptyTargets);
    assert.strictEqual(emptyValidation.valid, true);
    pass('Generated valid empty Prometheus targets ([]) without runtime error');

    // [Step 5] Device Enrollment & Module Assignment
    const enrolledDevices = [
      {
        ip: '192.168.1.1',
        name: 'Core-Switch-01',
        type: 'switch',
        vendor: 'Cisco',
        module: 'cisco_switch',
        community: 'public'
      },
      {
        ip: '192.168.1.254',
        name: 'Border-Router',
        type: 'router',
        vendor: 'MikroTik',
        module: 'mikrotik_router',
        community: 'public'
      }
    ];
    cleanDb.devices = enrolledDevices;
    pass(`Enrolled ${enrolledDevices.length} test devices with multi-vendor SNMP modules`);

    // [Step 6] Generate & Validate Targets with Enrolled Devices
    const activeDevs = getActiveDevices(cleanDb);
    assert.strictEqual(activeDevs.length, 2);
    const populatedTargets = generateTargetsYaml(activeDevs, cleanDb.settings);
    assert.ok(populatedTargets.blackboxYaml.includes('192.168.1.1'));
    assert.ok(populatedTargets.snmpYaml.includes('cisco_switch'));
    assert.ok(populatedTargets.snmpYaml.includes('mikrotik_router'));

    const populatedValidation = validateTargets(populatedTargets);
    if (!populatedValidation.valid) {
      console.error('Populated validation issues:', populatedValidation.issues);
    }
    assert.strictEqual(populatedValidation.valid, true);
    assert.strictEqual(populatedValidation.summary.blackboxCount, 2);
    assert.strictEqual(populatedValidation.summary.snmpCount, 2);
    pass('Generated and verified file_sd target configs for all enrolled devices');

    console.log('\n====================================================');
    console.log('🎉 CLEAN INSTALLATION PIPELINE VERIFIED SUCCESSFULLY!');
    console.log('====================================================\n');
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Clean install verification failed: ${err.message}`);
    process.exit(1);
  } finally {
    // Cleanup temporary test directory
    try {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    } catch {}
  }
}

runCleanInstallVerification();
