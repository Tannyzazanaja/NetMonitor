/**
 * test_phase11_backup_restore.cjs
 * Comprehensive Unit & Integration Tests for Phase 11:
 * Database Backup & Atomic Restore Service (Sections 46, 47, 49)
 */

const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  server,
  sessions,
  createDatabaseBackup,
  validateBackupPayload,
  restoreDatabaseFromBackup
} = require('../server/server.js');

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: body ? JSON.parse(body) : {}
            });
          } catch {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: body
            });
          }
        });
      }
    );
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('💾 STARTING PHASE 11: BACKUP & RESTORE TEST SUITE');
  console.log('====================================================\n');

  const dbPath = path.resolve(__dirname, '../data/db.json');
  const originalDbSnapshot = fs.existsSync(dbPath) ? fs.readFileSync(dbPath, 'utf8') : null;

  try {
    let passed = 0;
    let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // [1] Unit Tests: Backup creation & Checksum
  console.log('[1] Testing Backup Service Unit Logic:');

  const mockDb = {
    devices: [
      { ip: '192.168.10.1', name: 'Switch-A', vendor: 'Cisco', type: 'switch', community: 'public' }
    ],
    settings: {
      orgName: 'Enterprise Unit Test Corp',
      prometheusUrl: 'http://127.0.0.1:9090'
    },
    topology: { nodes: [], edges: [] },
    alerts: [],
    deletedIps: []
  };

  let generatedBackup = null;

  test('createDatabaseBackup generates valid schema and SHA-256 checksum', () => {
    generatedBackup = createDatabaseBackup(mockDb);
    assert.strictEqual(generatedBackup.schemaVersion, '1.1.0');
    assert.ok(generatedBackup.exportTimestamp);
    assert.strictEqual(typeof generatedBackup.checksum, 'string');
    assert.strictEqual(generatedBackup.checksum.length, 64);
    assert.strictEqual(generatedBackup.data.devices.length, 1);
  });

  test('validateBackupPayload accepts valid backup with intact checksum', () => {
    const res = validateBackupPayload(generatedBackup);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.cleanData.devices.length, 1);
  });

  test('validateBackupPayload rejects corrupted checksum', () => {
    const corrupted = JSON.parse(JSON.stringify(generatedBackup));
    corrupted.data.devices.push({ ip: '10.0.0.99', name: 'Injected Device' });
    const res = validateBackupPayload(corrupted);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes('checksum mismatch'));
  });

  test('restoreDatabaseFromBackup merges backup cleanly', () => {
    const restored = restoreDatabaseFromBackup(generatedBackup, mockDb);
    assert.strictEqual(restored.devices.length, 1);
    assert.strictEqual(restored.devices[0].ip, '192.168.10.1');
    assert.strictEqual(restored.settings.orgName, 'Enterprise Unit Test Corp');
  });

  // [2] HTTP Integration Tests
  console.log('\n[2] Testing Admin Backup & Restore HTTP Endpoints:');

  const TEST_PORT = 5094;
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));

  const adminToken = crypto.randomBytes(32).toString('hex');
  sessions.set(adminToken, { username: 'admin', role: 'Admin', expires: Date.now() + 60000 });

  const viewerToken = crypto.randomBytes(32).toString('hex');
  sessions.set(viewerToken, { username: 'viewer', role: 'Viewer', expires: Date.now() + 60000 });

  await asyncTest('GET /api/admin/backup rejects unauthenticated request (HTTP 401)', async () => {
    const res = await makeRequest(`http://127.0.0.1:${TEST_PORT}/api/admin/backup`);
    assert.strictEqual(res.statusCode, 401);
  });

  await asyncTest('GET /api/admin/backup rejects Viewer role (HTTP 403 Forbidden)', async () => {
    const res = await makeRequest(`http://127.0.0.1:${TEST_PORT}/api/admin/backup?token=${viewerToken}`);
    assert.strictEqual(res.statusCode, 403);
  });

  await asyncTest('GET /api/admin/backup allows Admin role and returns valid backup JSON', async () => {
    const res = await makeRequest(`http://127.0.0.1:${TEST_PORT}/api/admin/backup?token=${adminToken}`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.ok, true);
    assert.ok(res.body.backup);
    assert.strictEqual(res.body.backup.schemaVersion, '1.1.0');
    assert.ok(res.body.backup.checksum);
  });

  await asyncTest('POST /api/admin/restore rejects Viewer role (HTTP 403 Forbidden)', async () => {
    const res = await makeRequest(`http://127.0.0.1:${TEST_PORT}/api/admin/restore?token=${viewerToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: generatedBackup
    });
    assert.strictEqual(res.statusCode, 403);
  });

  await asyncTest('POST /api/admin/restore allows Admin and restores database payload', async () => {
    const res = await makeRequest(`http://127.0.0.1:${TEST_PORT}/api/admin/restore?token=${adminToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: generatedBackup
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.ok, true);
    assert.ok(res.body.message.includes('successfully restored'));
  });

    console.log('\n====================================================');
    console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log('====================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    if (originalDbSnapshot && fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, originalDbSnapshot, 'utf8');
      try {
        restoreDatabaseFromBackup(JSON.parse(originalDbSnapshot));
      } catch {}
    }
  }
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
