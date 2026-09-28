/**
 * Test Suite: Emergency Break-Glass Authentication Engine
 * Verifies local emergency login functionality when Grafana is unreachable or down.
 */

const assert = require('assert');
const http = require('http');
const {
  server,
  validateSettings,
  sanitizeDbForFrontend,
  verifyEmergencyCredentials,
  sessions
} = require('../server/server');

console.log('=== TEST SUITE: Emergency Break-Glass Authentication Engine ===\n');

let totalTests = 0;
let passedTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

async function asyncIt(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// 1. verifyEmergencyCredentials Unit Tests
// -----------------------------------------------------------------------------
console.log('[1] Testing verifyEmergencyCredentials Function:');

it('Authenticates default emergency username with default emergency password', () => {
  const ok = verifyEmergencyCredentials('emergency', 'emergency@netmon', {});
  assert.strictEqual(ok, true);
});

it('Authenticates admin username with emergency password (local break-glass alias)', () => {
  const ok = verifyEmergencyCredentials('admin', 'emergency@netmon', {});
  assert.strictEqual(ok, true);
});

it('Authenticates localadmin username with emergency password', () => {
  const ok = verifyEmergencyCredentials('localadmin', 'emergency@netmon', {});
  assert.strictEqual(ok, true);
});

it('Is case-insensitive for username', () => {
  const ok = verifyEmergencyCredentials('EMERGENCY', 'emergency@netmon', {});
  assert.strictEqual(ok, true);
});

it('Rejects incorrect emergency password', () => {
  const ok = verifyEmergencyCredentials('emergency', 'wrong_password_123', {});
  assert.strictEqual(ok, false);
});

it('Rejects unauthorized username', () => {
  const ok = verifyEmergencyCredentials('random_user', 'emergency@netmon', {});
  assert.strictEqual(ok, false);
});

it('Supports custom emergency credentials configured in dbSettings', () => {
  const customSettings = {
    emergencyUsername: 'noc_superadmin',
    emergencyPassword: 'CustomNocPassword2026!'
  };
  const okCustom = verifyEmergencyCredentials('noc_superadmin', 'CustomNocPassword2026!', customSettings);
  assert.strictEqual(okCustom, true);

  const okFallback = verifyEmergencyCredentials('admin', 'CustomNocPassword2026!', customSettings);
  assert.strictEqual(okFallback, true);

  const wrongPass = verifyEmergencyCredentials('noc_superadmin', 'emergency@netmon', customSettings);
  assert.strictEqual(wrongPass, false);
});

// -----------------------------------------------------------------------------
// 2. Settings Validation & Sanitization Tests
// -----------------------------------------------------------------------------
console.log('\n[2] Testing Settings Validation & Sanitization for Emergency Auth:');

it('Validates clean emergency credentials', () => {
  const res = validateSettings({
    emergencyUsername: 'backup_admin',
    emergencyPassword: 'secure_password_999'
  });
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.cleanSettings.emergencyUsername, 'backup_admin');
  assert.strictEqual(res.cleanSettings.emergencyPassword, 'secure_password_999');
});

it('Rejects emergency password shorter than 6 characters', () => {
  const res = validateSettings({
    emergencyPassword: '123'
  });
  assert.strictEqual(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('emergencyPassword')));
});

it('Protects masked emergency password placeholder "***"', () => {
  const res = validateSettings({
    emergencyPassword: '***'
  });
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.cleanSettings.emergencyPassword, undefined, 'Masked placeholder must not overwrite real password');
});

it('Sanitizes emergency password for frontend (masks with ***)', () => {
  const mockDb = {
    settings: {
      emergencyUsername: 'emergency',
      emergencyPassword: 'super_secret_local_pass'
    }
  };
  const safe = sanitizeDbForFrontend(mockDb, 'Admin');
  assert.strictEqual(safe.settings.emergencyUsername, 'emergency');
  assert.strictEqual(safe.settings.emergencyPassword, '***');
  assert.strictEqual(safe.settings.hasEmergencyAuth, true);
});

// -----------------------------------------------------------------------------
// 3. HTTP Integration Tests for Login Scenarios
// -----------------------------------------------------------------------------
console.log('\n[3] Testing HTTP API Scenarios with Server:');

async function runHttpTests() {
  const testPort = 5919;
  await new Promise(resolve => server.listen(testPort, '127.0.0.1', resolve));

  function makeRequest(method, path, body = null, cookie = null) {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : null;
      const headers = {};
      if (payload) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(payload);
      }
      if (cookie) {
        headers['Cookie'] = cookie;
      }
      const req = http.request({
        hostname: '127.0.0.1',
        port: testPort,
        path,
        method,
        headers
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

  try {
    await asyncIt('Explicit emergency login succeeds and grants Admin role', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        username: 'emergency',
        password: 'emergency@netmon',
        isEmergency: true
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.user.role, 'Admin');
      assert.strictEqual(res.data.user.isEmergency, true);

      // Verify Set-Cookie header
      const setCookie = res.headers['set-cookie'];
      assert.ok(setCookie && setCookie.length > 0);
      assert.ok(setCookie[0].includes('nm_session='));
    });

    await asyncIt('Explicit emergency login fails with incorrect password', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        username: 'emergency',
        password: 'wrong_password',
        isEmergency: true
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.data.success, false);
      assert.ok(res.data.error.includes('ฉุกเฉิน') || res.data.error.includes('Emergency'));
    });

    await asyncIt('Fallback emergency login succeeds when credentials match emergency password', async () => {
      // Even without isEmergency flag, username: 'emergency' is recognized
      const res = await makeRequest('POST', '/api/auth/login', {
        username: 'emergency',
        password: 'emergency@netmon'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.user.role, 'Admin');
      assert.strictEqual(res.data.user.isEmergency, true);
    });

    await asyncIt('Session validates via /api/auth/me and retains isEmergency flag', async () => {
      const loginRes = await makeRequest('POST', '/api/auth/login', {
        username: 'emergency',
        password: 'emergency@netmon',
        isEmergency: true
      });
      const cookie = loginRes.headers['set-cookie'][0].split(';')[0];

      const meRes = await makeRequest('GET', '/api/auth/me', null, cookie);
      assert.strictEqual(meRes.status, 200);
      assert.strictEqual(meRes.data.user.username, 'emergency');
      assert.strictEqual(meRes.data.user.role, 'Admin');
      assert.strictEqual(meRes.data.user.isEmergency, true);
    });

    // 4. Testing Emergency Password Change API & Settings Persistence
    await asyncIt('POST /api/auth/emergency-password rejects unauthenticated request (401)', async () => {
      const res = await makeRequest('POST', '/api/auth/emergency-password', {
        newPassword: 'BrandNewSecretPass123!'
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.data.success, false);
    });

    await asyncIt('POST /api/auth/emergency-password rejects Viewer role (403 Forbidden)', async () => {
      const viewerToken = 'test_viewer_token_' + Date.now();
      sessions.set(viewerToken, {
        username: 'viewer_user',
        name: 'Viewer',
        role: 'Viewer',
        expires: Date.now() + 60000
      });
      const res = await makeRequest('POST', '/api/auth/emergency-password', {
        newPassword: 'BrandNewSecretPass123!'
      }, `nm_session=${viewerToken}`);
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.success, false);
      sessions.delete(viewerToken);
    });

    await asyncIt('POST /api/auth/emergency-password rejects passwords shorter than 6 characters (400)', async () => {
      const loginRes = await makeRequest('POST', '/api/auth/login', {
        username: 'emergency',
        password: 'emergency@netmon',
        isEmergency: true
      });
      const adminCookie = loginRes.headers['set-cookie'][0].split(';')[0];
      const res = await makeRequest('POST', '/api/auth/emergency-password', {
        newPassword: '123'
      }, adminCookie);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.success, false);
    });

    await asyncIt('POST /api/auth/emergency-password updates password and allows login with new credentials', async () => {
      const loginRes = await makeRequest('POST', '/api/auth/login', {
        username: 'emergency',
        password: 'emergency@netmon',
        isEmergency: true
      });
      const adminCookie = loginRes.headers['set-cookie'][0].split(';')[0];
      
      const newPass = 'UpdatedBreakGlassPass2026!';
      const changeRes = await makeRequest('POST', '/api/auth/emergency-password', {
        newPassword: newPass,
        emergencyUsername: 'emergency'
      }, adminCookie);
      assert.strictEqual(changeRes.status, 200);
      assert.strictEqual(changeRes.data.success, true);

      // Verify old password fails
      const oldLogin = await makeRequest('POST', '/api/auth/login', {
        username: 'emergency',
        password: 'emergency@netmon',
        isEmergency: true
      });
      assert.strictEqual(oldLogin.status, 401);

      // Verify new password succeeds
      const newLogin = await makeRequest('POST', '/api/auth/login', {
        username: 'emergency',
        password: newPass,
        isEmergency: true
      });
      assert.strictEqual(newLogin.status, 200);
      assert.strictEqual(newLogin.data.success, true);
      assert.strictEqual(newLogin.data.user.role, 'Admin');

      // Verify alias 'admin' also succeeds with new password
      const aliasLogin = await makeRequest('POST', '/api/auth/login', {
        username: 'admin',
        password: newPass
      });
      assert.strictEqual(aliasLogin.status, 200);
      assert.strictEqual(aliasLogin.data.user.role, 'Admin');

      // Restore default password
      const newCookie = newLogin.headers['set-cookie'][0].split(';')[0];
      const restoreRes = await makeRequest('POST', '/api/auth/emergency-password', {
        newPassword: 'emergency@netmon',
        emergencyUsername: 'emergency'
      }, newCookie);
      assert.strictEqual(restoreRes.status, 200);

      // Verify default password works again
      const restoredLogin = await makeRequest('POST', '/api/auth/login', {
        username: 'emergency',
        password: 'emergency@netmon',
        isEmergency: true
      });
      assert.strictEqual(restoredLogin.status, 200);
    });

    await asyncIt('POST /api/storage/settings preserves emergency password when masked with ***', async () => {
      const loginRes = await makeRequest('POST', '/api/auth/login', {
        username: 'emergency',
        password: 'emergency@netmon',
        isEmergency: true
      });
      const adminCookie = loginRes.headers['set-cookie'][0].split(';')[0];

      // Save settings with emergencyPassword: '***'
      const saveRes = await makeRequest('POST', '/api/storage/settings', {
        settings: {
          emergencyPassword: '***',
          refreshInterval: 10
        }
      }, adminCookie);
      assert.strictEqual(saveRes.status, 200);

      // Verify login with 'emergency@netmon' still works (was not overwritten by '***')
      const verifyLogin = await makeRequest('POST', '/api/auth/login', {
        username: 'emergency',
        password: 'emergency@netmon',
        isEmergency: true
      });
      assert.strictEqual(verifyLogin.status, 200);
    });

  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log('\n============================================================');
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
  console.log('============================================================\n');

  process.exit(0);
}

runHttpTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
