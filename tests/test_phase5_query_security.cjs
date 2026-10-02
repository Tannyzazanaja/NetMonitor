/**
 * test_phase5_query_security.cjs
 * Comprehensive Unit & Integration Tests for Phase 5:
 * Prometheus Proxy & Analytics Deep Query Security (Sections 10 & 11)
 */

const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const {
  server,
  sessions,
  checkQueryRateLimit,
  queryRateLimitMap
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
  console.log('🛡️ STARTING PHASE 5: PROMETHEUS & ANALYTICS SECURITY TEST SUITE');
  console.log('====================================================\n');

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

  // Section 1: Query Rate Limiter Unit Tests
  console.log('[1] Testing Query Rate Limiter:');
  test('Allows queries up to 60 queries/min', () => {
    const testIp = '198.51.100.1';
    queryRateLimitMap.delete(testIp);
    for (let i = 0; i < 60; i++) {
      const res = checkQueryRateLimit(testIp);
      assert.strictEqual(res.allowed, true, `Query ${i + 1} should be allowed`);
    }
  });

  test('Blocks queries exceeding 60 queries/min with Retry-After', () => {
    const testIp = '198.51.100.1';
    const res = checkQueryRateLimit(testIp);
    assert.strictEqual(res.allowed, false, '61st query should be blocked');
    assert.ok(res.retryAfter > 0, 'Must provide retryAfter duration');
  });

  // Section 2: HTTP Integration Tests
  const TEST_PORT = 5092;
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));

  const adminToken = crypto.randomBytes(32).toString('hex');
  sessions.set(adminToken, { username: 'admin', role: 'Admin', expires: Date.now() + 60000 });

  const viewerToken = crypto.randomBytes(32).toString('hex');
  sessions.set(viewerToken, { username: 'viewer', role: 'Viewer', expires: Date.now() + 60000 });

  console.log('\n[2] Testing Analytics Step & Time Range Security:');

  await asyncTest('POST /api/analytics/query_range rejects invalid step regex (HTTP 400)', async () => {
    const res = await makeRequest(`http://127.0.0.1:${TEST_PORT}/api/analytics/query_range?token=${adminToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        query: 'rate(ifHCInOctets[5m])',
        start: '1700000000',
        end: '1700003600',
        step: 'invalid_step'
      }
    });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.ok, false);
    assert.ok(res.body.error.includes('Invalid step parameter format'));
  });

  await asyncTest('POST /api/analytics/query_range rejects step < 1s (HTTP 400)', async () => {
    const res = await makeRequest(`http://127.0.0.1:${TEST_PORT}/api/analytics/query_range?token=${adminToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        query: 'rate(ifHCInOctets[5m])',
        start: '1700000000',
        end: '1700003600',
        step: '0s'
      }
    });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.ok, false);
    assert.ok(res.body.error.includes('Step must be at least 1s'));
  });

  await asyncTest('POST /api/analytics/query_range rejects end < start (HTTP 400)', async () => {
    const res = await makeRequest(`http://127.0.0.1:${TEST_PORT}/api/analytics/query_range?token=${adminToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        query: 'rate(ifHCInOctets[5m])',
        start: '1700003600',
        end: '1700000000',
        step: '30s'
      }
    });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.ok, false);
    assert.ok(res.body.error.includes('End time must be greater than or equal to start time'));
  });

  console.log('\n[3] Testing /api/admin/prometheus/query RBAC:');

  await asyncTest('Rejects unauthenticated request to /api/admin/prometheus/query (HTTP 401)', async () => {
    const res = await makeRequest(`http://127.0.0.1:${TEST_PORT}/api/admin/prometheus/query?query=up`);
    assert.strictEqual(res.statusCode, 401);
  });

  await asyncTest('Rejects Viewer role to /api/admin/prometheus/query (HTTP 403 Forbidden)', async () => {
    const res = await makeRequest(`http://127.0.0.1:${TEST_PORT}/api/admin/prometheus/query?query=up&token=${viewerToken}`);
    assert.strictEqual(res.statusCode, 403);
  });

  await asyncTest('Allows Admin role to execute /api/admin/prometheus/query', async () => {
    const res = await makeRequest(`http://127.0.0.1:${TEST_PORT}/api/admin/prometheus/query?query=up&token=${adminToken}`);
    // Will return 200 (if Prometheus mock/running) or 502 (Prometheus unreachable in test environment)
    // but MUST NOT be 401 or 403!
    assert.ok(res.statusCode === 200 || res.statusCode === 502, `Status must be 200 or 502, got ${res.statusCode}`);
  });

  console.log('\n[4] Testing Prometheus Proxy Step Validation:');

  await asyncTest('GET /api/prometheus/api/v1/query_range rejects malformed step (HTTP 400)', async () => {
    const res = await makeRequest(`http://127.0.0.1:${TEST_PORT}/api/prometheus/api/v1/query_range?step=malformed&token=${adminToken}`);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.status, 'error');
    assert.ok(res.body.error.includes('Invalid step parameter format'));
  });

  console.log('\n====================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
