/**
 * test_phase6_traffic.cjs
 * Comprehensive Unit & Integration Tests for Phase 6:
 * Traffic Semantics, Formatting & Optimization (Sections 20, 21, 22, 23)
 */

const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const {
  formatTrafficMbps,
  formatTrafficRate,
  formatTrafficBytesPerSec
} = require('../src/utils/trafficFormat.js');
const {
  server,
  sessions
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
  console.log('📊 STARTING PHASE 6: TRAFFIC SEMANTICS & UNIT TEST SUITE');
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

  // [1] Unit Tests: Unit & No-Data Differentiation
  console.log('[1] Testing Traffic Formatter Semantics (0 vs No Data):');

  test('0 Mbps is formatted as 0.00 Mbps with isNoData=false', () => {
    const res = formatTrafficMbps(0);
    assert.strictEqual(res.val, '0.00');
    assert.strictEqual(res.unit, 'Mbps');
    assert.strictEqual(res.isNoData, false);
    assert.strictEqual(res.formatted, '0.00 Mbps');
  });

  test('null, undefined, and NaN format as No Data with isNoData=true', () => {
    const resNull = formatTrafficMbps(null);
    assert.strictEqual(resNull.val, 'No Data');
    assert.strictEqual(resNull.isNoData, true);

    const resUndef = formatTrafficMbps(undefined);
    assert.strictEqual(resUndef.val, 'No Data');
    assert.strictEqual(resUndef.isNoData, true);

    const resNaN = formatTrafficMbps(NaN);
    assert.strictEqual(resNaN.val, 'No Data');
    assert.strictEqual(resNaN.isNoData, true);
  });

  test('Scales traffic units accurately (bps, Kbps, Mbps, Gbps)', () => {
    const resGbps = formatTrafficMbps(1250);
    assert.strictEqual(resGbps.unit, 'Gbps');
    assert.strictEqual(resGbps.val, '1.25');

    const resMbps = formatTrafficMbps(45.5);
    assert.strictEqual(resMbps.unit, 'Mbps');
    assert.strictEqual(resMbps.val, '45.50');

    const resKbps = formatTrafficMbps(0.05);
    assert.strictEqual(resKbps.unit, 'Kbps');
    assert.strictEqual(resKbps.val, '50.0');

    const resBps = formatTrafficMbps(0.00005);
    assert.strictEqual(resBps.unit, 'bps');
  });

  test('formatTrafficRate converts raw bits-per-second to Mbps accurately', () => {
    const res = formatTrafficRate(100000000); // 100 Mbps in bps
    assert.strictEqual(res.unit, 'Mbps');
    assert.strictEqual(res.val, '100.00');
  });

  test('formatTrafficBytesPerSec distinctly formats bytes vs bits', () => {
    const res = formatTrafficBytesPerSec(1048576); // 1 MB/s
    assert.strictEqual(res.unit, 'MB/s');
    assert.strictEqual(res.val, '1.00');
  });

  // [2] Integration Tests: Traffic REST Endpoint & SSE
  const TEST_PORT = 5093;
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));

  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username: 'testuser', role: 'Viewer', expires: Date.now() + 60000 });

  console.log('\n[2] Testing Server Traffic REST & SSE Endpoints:');

  await asyncTest('GET /api/traffic returns status and data structure', async () => {
    const res = await makeRequest(`http://127.0.0.1:${TEST_PORT}/api/traffic?token=${token}`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.ok, true);
    assert.ok(res.body.data);
    assert.ok(res.body.data.status === 'ok' || res.body.data.status === 'no_data');
  });

  await asyncTest('GET /api/storage/stream/traffic connects to SSE and streams data', async () => {
    const ssePromise = new Promise((resolve, reject) => {
      const parsed = new URL(`http://127.0.0.1:${TEST_PORT}/api/storage/stream/traffic?token=${token}`);
      const req = http.request({
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: { 'Accept': 'text/event-stream' }
      }, (res) => {
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.headers['content-type'], 'text/event-stream');
        res.on('data', (chunk) => {
          const str = chunk.toString();
          if (str.includes(': keepalive') || str.includes('data:')) {
            req.destroy();
            resolve(true);
          }
        });
      });
      req.on('error', reject);
      req.end();
    });

    const received = await ssePromise;
    assert.strictEqual(received, true, 'SSE stream connection established');
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
  console.error('Test suite error:', err);
  process.exit(1);
});
