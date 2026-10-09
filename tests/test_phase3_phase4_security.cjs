/**
 * Test Suite: Phase 3 (Security API Boundary) & Phase 4 (Emergency Credential Hardening)
 * Validates RBAC enforcement, login rate limiting, setup sanitization, and PBKDF2 hashing.
 */

const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const {
  server,
  validateSettings,
  sanitizeDbForFrontend,
  verifyEmergencyCredentials,
  hashPassword,
  sessions,
  loginAttemptsMap,
  ANALYTICS_CACHE_TTL
} = require('../server/server');

console.log('====================================================');
console.log('🛡️ STARTING PHASE 3 & PHASE 4 SECURITY TEST SUITE');
console.log('====================================================\n');

let testCount = 0;
let passCount = 0;

function it(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

async function asyncIt(name, fn) {
  testCount++;
  try {
    await fn();
    passCount++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// 1. Password Hashing (PBKDF2 SHA-512) & timingSafeEqual
// -----------------------------------------------------------------------------
console.log('[1] Testing PBKDF2 Password Hashing & Timing-Safe Verification:');

it('hashPassword generates valid 128-hex character PBKDF2 hash', () => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword('TestSecurePass2026!', salt);
  assert.strictEqual(typeof hash, 'string');
  assert.strictEqual(hash.length, 128); // 64 bytes in hex
});

it('verifyEmergencyCredentials authenticates hashed password with salt', () => {
  const salt = crypto.randomBytes(16).toString('hex');
  const pass = 'HardenedBreakGlassPass!';
  const hash = hashPassword(pass, salt);

  const dbSettings = {
    emergencyUsername: 'secops_admin',
    emergencyPasswordHash: hash,
    emergencyPasswordSalt: salt
  };

  const ok = verifyEmergencyCredentials('secops_admin', pass, dbSettings);
  assert.strictEqual(ok, true, 'Valid password must authenticate against PBKDF2 hash');

  const wrong = verifyEmergencyCredentials('secops_admin', 'wrong_pass_here', dbSettings);
  assert.strictEqual(wrong, false, 'Invalid password must be rejected');

  const wrongUser = verifyEmergencyCredentials('hacker', pass, dbSettings);
  assert.strictEqual(wrongUser, false, 'Unauthorized username must be rejected');
});

it('verifyEmergencyCredentials supports local break-glass aliases with hash', () => {
  const salt = crypto.randomBytes(16).toString('hex');
  const pass = 'AliasTestPass123!';
  const hash = hashPassword(pass, salt);

  const dbSettings = {
    emergencyUsername: 'custom_admin',
    emergencyPasswordHash: hash,
    emergencyPasswordSalt: salt
  };

  // Aliases: custom_admin, emergency, localadmin, admin
  assert.strictEqual(verifyEmergencyCredentials('emergency', pass, dbSettings), true);
  assert.strictEqual(verifyEmergencyCredentials('admin', pass, dbSettings), true);
  assert.strictEqual(verifyEmergencyCredentials('localadmin', pass, dbSettings), true);
});

// -----------------------------------------------------------------------------
// 2. Sensitive Setup & Settings Sanitization
// -----------------------------------------------------------------------------
console.log('\n[2] Testing Setup & Settings Sanitization:');

it('sanitizeDbForFrontend strips password hash, salt, and emergency credentials for non-admins', () => {
  const rawDb = {
    devices: [{ ip: '10.0.0.1', name: 'SW1', community: 'snmp_secret' }],
    settings: {
      defaultCommunity: 'snmp_secret',
      emergencyUsername: 'emergency',
      emergencyPasswordHash: 'abcd1234efgh5678',
      emergencyPasswordSalt: '1234567890abcdef'
    }
  };

  // Viewer role: all emergency details stripped
  const safeViewer = sanitizeDbForFrontend(rawDb, 'Viewer');
  assert.strictEqual(safeViewer.settings.defaultCommunity, '***');
  assert.strictEqual(safeViewer.settings.emergencyPassword, undefined, 'Emergency pass stripped for Viewer');
  assert.strictEqual(safeViewer.settings.emergencyUsername, undefined, 'Emergency user stripped for Viewer');
  assert.strictEqual(safeViewer.settings.hasEmergencyAuth, undefined, 'Emergency flag stripped for Viewer');
  assert.strictEqual(safeViewer.settings.emergencyPasswordHash, undefined, 'Hash must never leak');
  assert.strictEqual(safeViewer.settings.emergencyPasswordSalt, undefined, 'Salt must never leak');

  // Editor role: all emergency details stripped
  const safeEditor = sanitizeDbForFrontend(rawDb, 'Editor');
  assert.strictEqual(safeEditor.settings.emergencyPassword, undefined, 'Emergency pass stripped for Editor');
  assert.strictEqual(safeEditor.settings.hasEmergencyAuth, undefined, 'Emergency flag stripped for Editor');

  // Admin role: emergency details masked but present
  const safeAdmin = sanitizeDbForFrontend(rawDb, 'Admin');
  assert.strictEqual(safeAdmin.settings.emergencyUsername, 'emergency');
  assert.strictEqual(safeAdmin.settings.emergencyPassword, '***');
  assert.strictEqual(safeAdmin.settings.hasEmergencyAuth, true);
  assert.strictEqual(safeAdmin.settings.emergencyPasswordHash, undefined, 'Hash must never leak even to Admin');
});

// -----------------------------------------------------------------------------
// 3. HTTP Integration Tests for Phase 3 API Boundaries
// -----------------------------------------------------------------------------
console.log('\n[3] Testing HTTP API Security Boundaries & RBAC:');

function makeRequest(testPort, method, path, body = null, cookie = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }
    if (cookie) {
      reqHeaders['Cookie'] = cookie;
    }
    const req = http.request({
      hostname: '127.0.0.1',
      port: testPort,
      path,
      method,
      headers: reqHeaders
    }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let data = {};
        try { data = JSON.parse(raw); } catch (e) { data = { raw }; }
        resolve({ status: res.statusCode, headers: res.headers, data });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runHttpSecurityTests() {
  const testPort = 5933;
  await new Promise(resolve => server.listen(testPort, '127.0.0.1', resolve));

  try {
    // 3.1 Rate Limiting Test on /api/auth/login
    await asyncIt('Login Rate Limiter returns HTTP 429 after 5 consecutive failed attempts', async () => {
      // Clear attempt map for 127.0.0.1 first
      loginAttemptsMap.clear();

      for (let i = 1; i <= 5; i++) {
        const failRes = await makeRequest(testPort, 'POST', '/api/auth/login', {
          username: 'emergency',
          password: `wrong_pass_${i}`,
          isEmergency: true
        });
        assert.strictEqual(failRes.status, 401, `Attempt ${i} should fail with 401`);
      }

      // 6th attempt should be blocked by rate limiter with 429
      const blockedRes = await makeRequest(testPort, 'POST', '/api/auth/login', {
        username: 'emergency',
        password: 'wrong_pass_6',
        isEmergency: true
      });
      assert.strictEqual(blockedRes.status, 429, 'Excessive failed logins must return HTTP 429');
      assert.ok(blockedRes.headers['retry-after'], 'Must contain Retry-After header');
      assert.ok(blockedRes.data.error.includes('Too many failed login attempts'));

      // Clean up for subsequent tests
      loginAttemptsMap.clear();
    });

    // 3.2 Setup Status Sanitization
    await asyncIt('GET /api/setup/status masks community if configured and never reveals passwords', async () => {
      const res = await makeRequest(testPort, 'GET', '/api/setup/status');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.settings.emergencyPassword, undefined, 'Must not return emergency password');
      assert.strictEqual(res.data.settings.emergencyPasswordHash, undefined, 'Must not return password hash');
      assert.ok(res.data.settings.hasEmergencyAuth === true);
    });

    // 3.3 Prometheus Proxy Endpoint Restrictions
    await asyncIt('Prometheus proxy blocks destructive endpoints with HTTP 403 Forbidden', async () => {
      // Create admin session
      const adminToken = 'test_admin_token_' + Date.now();
      sessions.set(adminToken, {
        username: 'admin',
        name: 'Admin',
        role: 'Admin',
        expires: Date.now() + 86400000
      });
      const adminCookie = `nm_session=${adminToken}`;

      // Quit endpoint
      const quitRes = await makeRequest(testPort, 'POST', '/api/prometheus/-/quit', null, adminCookie);
      assert.strictEqual(quitRes.status, 403, '/-/quit must be blocked with 403');
      assert.ok(quitRes.data.error.includes('Forbidden'));

      // Reload endpoint
      const reloadRes = await makeRequest(testPort, 'POST', '/api/prometheus/-/reload', null, adminCookie);
      assert.strictEqual(reloadRes.status, 403, '/-/reload must be blocked with 403');

      // Delete series endpoint
      const delRes = await makeRequest(testPort, 'POST', '/api/prometheus/api/v1/admin/tsdb/delete_series', null, adminCookie);
      assert.strictEqual(delRes.status, 403, 'delete_series must be blocked with 403');
    });

    // 3.4 Alert Mutations RBAC Check
    await asyncIt('POST /api/alerts/acknowledge enforces Editor role (Viewer receives 403)', async () => {
      const viewerToken = 'test_viewer_token_' + Date.now();
      sessions.set(viewerToken, {
        username: 'viewer',
        name: 'Viewer Demo',
        role: 'Viewer',
        expires: Date.now() + 86400000
      });
      const viewerCookie = `nm_session=${viewerToken}`;

      const res = await makeRequest(testPort, 'POST', '/api/alerts/acknowledge', { id: 'alert-1' }, viewerCookie);
      assert.strictEqual(res.status, 403, 'Viewer cannot acknowledge alerts');
      assert.strictEqual(res.data.code, 'FORBIDDEN');
    });

    await asyncIt('POST /api/alerts/clear-history enforces Admin role (Editor receives 403)', async () => {
      const editorToken = 'test_editor_token_' + Date.now();
      sessions.set(editorToken, {
        username: 'editor',
        name: 'Editor Demo',
        role: 'Editor',
        expires: Date.now() + 86400000
      });
      const editorCookie = `nm_session=${editorToken}`;

      const res = await makeRequest(testPort, 'POST', '/api/alerts/clear-history', {}, editorCookie);
      assert.strictEqual(res.status, 403, 'Editor cannot clear alert history');
      assert.strictEqual(res.data.code, 'FORBIDDEN');
    });

    // 3.5 Token Extraction via Query String for SSE compatibility
    await asyncIt('Authenticates via ?token= query param for SSE EventSource connections', async () => {
      const testToken = 'test_sse_token_' + Date.now();
      sessions.set(testToken, {
        username: 'sse_client',
        name: 'SSE Subscriber',
        role: 'Viewer',
        expires: Date.now() + 86400000
      });

      // GET /api/alerts/active with ?token=
      const res = await makeRequest(testPort, 'GET', `/api/alerts/active?token=${testToken}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.ok, true);
    });

    // 3.6 Bearer Token in Authorization Header
    await asyncIt('Authenticates via Authorization: Bearer <token> header', async () => {
      const bearerToken = 'test_bearer_token_' + Date.now();
      sessions.set(bearerToken, {
        username: 'bearer_client',
        name: 'API Client',
        role: 'Viewer',
        expires: Date.now() + 86400000
      });

      const res = await makeRequest(testPort, 'GET', '/api/alerts/active', null, null, {
        'Authorization': `Bearer ${bearerToken}`
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.ok, true);
    });

    // 3.7 RBAC: POST /api/storage/devices blocks Viewer
    await asyncIt('POST /api/storage/devices blocks Viewer with HTTP 403 Forbidden', async () => {
      const viewerToken = 'test_viewer_dev_' + Date.now();
      sessions.set(viewerToken, {
        username: 'viewer2',
        name: 'Viewer Two',
        role: 'Viewer',
        expires: Date.now() + 86400000
      });
      const viewerCookie = `nm_session=${viewerToken}`;

      const res = await makeRequest(testPort, 'POST', '/api/storage/devices', [{ ip: '10.99.99.1', name: 'Rogue' }], viewerCookie);
      assert.strictEqual(res.status, 403, 'Viewer must not be permitted to update devices');
    });

    // 3.8 RBAC: POST /api/auth/emergency-password blocks Editor & Viewer
    await asyncIt('POST /api/auth/emergency-password blocks Editor and Viewer with HTTP 403 Forbidden', async () => {
      const editorToken = 'test_editor_em_' + Date.now();
      sessions.set(editorToken, {
        username: 'editor_em',
        name: 'Editor Emergency Tester',
        role: 'Editor',
        expires: Date.now() + 86400000
      });
      const editorCookie = `nm_session=${editorToken}`;

      const res = await makeRequest(testPort, 'POST', '/api/auth/emergency-password', {
        newPassword: 'HackedPassword123!'
      }, editorCookie);
      assert.strictEqual(res.status, 403, 'Editor must not be permitted to change emergency password');
    });

    // 3.9 RBAC: POST /api/storage/all ignores settings/emergencyPassword when sent by Editor
    await asyncIt('POST /api/storage/all allows Editor to update devices but IGNORES settings/emergencyPassword', async () => {
      const editorToken = 'test_editor_all_' + Date.now();
      sessions.set(editorToken, {
        username: 'editor_all',
        name: 'Editor Bulk Tester',
        role: 'Editor',
        expires: Date.now() + 86400000
      });
      const editorCookie = `nm_session=${editorToken}`;

      const payload = {
        devices: [{ ip: '10.10.10.1', name: 'Core-Editor-Device' }],
        settings: {
          emergencyPassword: 'HackedViaStorageAll123!'
        }
      };

      const res = await makeRequest(testPort, 'POST', '/api/storage/all', payload, editorCookie);
      assert.strictEqual(res.status, 200, 'Editor can post storage all');

      // Verify that emergency password was NOT changed to HackedViaStorageAll123!
      const statusRes = await makeRequest(testPort, 'GET', '/api/setup/status');
      // Attempt login with the hacked password
      const loginAttempt = await makeRequest(testPort, 'POST', '/api/auth/login', {
        username: 'emergency',
        password: 'HackedViaStorageAll123!',
        isEmergency: true
      });
      assert.strictEqual(loginAttempt.status, 401, 'Emergency password must NOT have been changed by Editor');
    });

    // 3.10 RBAC: POST /api/storage/all allows Admin to update settings and emergencyPassword
    await asyncIt('POST /api/storage/all allows Admin to update settings and emergencyPassword', async () => {
      const adminToken = 'test_admin_all_' + Date.now();
      sessions.set(adminToken, {
        username: 'admin_all',
        name: 'Admin Bulk Tester',
        role: 'Admin',
        expires: Date.now() + 86400000
      });
      const adminCookie = `nm_session=${adminToken}`;

      const newPass = 'ValidAdminPassUpdate2026!';
      const payload = {
        settings: {
          emergencyPassword: newPass
        }
      };

      const res = await makeRequest(testPort, 'POST', '/api/storage/all', payload, adminCookie);
      assert.strictEqual(res.status, 200);

      // Verify that emergency password WAS updated by Admin
      const loginAttempt = await makeRequest(testPort, 'POST', '/api/auth/login', {
        username: 'emergency',
        password: newPass,
        isEmergency: true
      });
      assert.strictEqual(loginAttempt.status, 200, 'Emergency password must authenticate with new Admin password');

      // Reset emergency password back to default for test suite isolation
      await makeRequest(testPort, 'POST', '/api/storage/all', {
        settings: {
          emergencyPassword: 'emergency@netmon'
        }
      }, adminCookie);
    });

    // 3.11 Shared Dashboard: POST /api/auth/share-session provisions Viewer session with isShared: true
    await asyncIt('POST /api/auth/share-session provisions valid Viewer session with isShared: true', async () => {
      const shareRes = await makeRequest(testPort, 'POST', '/api/auth/share-session', { shareKey: 'readonly' });
      assert.strictEqual(shareRes.status, 200);
      assert.strictEqual(shareRes.data.success, true);
      assert.strictEqual(shareRes.data.user.role, 'Viewer');
      assert.strictEqual(shareRes.data.user.isShared, true);

      // Verify Set-Cookie header
      const setCookie = shareRes.headers['set-cookie'];
      assert.ok(setCookie && setCookie.length > 0);
      assert.ok(setCookie[0].includes('nm_session=share_'));
    });

    // 3.12 Shared Dashboard: Shared session can read telemetry but is strictly blocked from write operations
    await asyncIt('Shared session can read telemetry but is strictly blocked from write operations', async () => {
      const shareRes = await makeRequest(testPort, 'POST', '/api/auth/share-session', { shareKey: 'readonly' });
      const cookie = shareRes.headers['set-cookie'][0].split(';')[0];

      // Can read telemetry & devices
      const readRes = await makeRequest(testPort, 'GET', '/api/storage', null, cookie);
      assert.strictEqual(readRes.status, 200);
      assert.strictEqual(readRes.data.ok, true);
      assert.ok(Array.isArray(readRes.data.data.devices));

      // CANNOT add/delete devices (HTTP 403 Forbidden)
      const writeDev = await makeRequest(testPort, 'POST', '/api/storage/devices', [{ ip: '10.99.99.99', name: 'Hacked' }], cookie);
      assert.strictEqual(writeDev.status, 403, 'Shared viewer cannot add devices');

      // CANNOT change settings (HTTP 403 Forbidden)
      const writeSet = await makeRequest(testPort, 'POST', '/api/storage/settings', { settings: { refreshInterval: 5 } }, cookie);
      assert.strictEqual(writeSet.status, 403, 'Shared viewer cannot change settings');

      // CANNOT acknowledge alerts (HTTP 403 Forbidden)
      const ackAlert = await makeRequest(testPort, 'POST', '/api/alerts/acknowledge', { id: 'alert-1' }, cookie);
      assert.strictEqual(ackAlert.status, 403, 'Shared viewer cannot acknowledge alerts');

      // CANNOT change emergency password (HTTP 403 Forbidden)
      const changePass = await makeRequest(testPort, 'POST', '/api/auth/emergency-password', { newPassword: 'hack' }, cookie);
      assert.strictEqual(changePass.status, 403, 'Shared viewer cannot change emergency password');
    });

    // 3.13 Shared Dashboard: GET with ?share=readonly allows read access without cookies, blocks writes
    await asyncIt('GET with ?share=readonly allows read access without cookies, blocks writes', async () => {
      const readRes = await makeRequest(testPort, 'GET', '/api/storage?share=readonly');
      assert.strictEqual(readRes.status, 200);
      assert.strictEqual(readRes.data.ok, true);
      assert.ok(Array.isArray(readRes.data.data.devices));

      // POST with ?share=readonly must be rejected
      const writeRes = await makeRequest(testPort, 'POST', '/api/storage/devices?share=readonly', [{ ip: '10.99.99.99' }]);
      assert.ok(writeRes.status === 401 || writeRes.status === 403);
    });

  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log('\n====================================================');
  console.log(`TOTAL TESTS: ${testCount} | PASSED: ${passCount} | FAILED: ${testCount - passCount}`);
  console.log('====================================================\n');

  process.exit(0);
}

runHttpSecurityTests().catch(err => {
  console.error('Fatal Security Test Error:', err);
  process.exit(1);
});
