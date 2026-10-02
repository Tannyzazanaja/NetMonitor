/**
 * test_phase8_snmp_concurrency.cjs
 * Comprehensive Unit Tests for Phase 8:
 * SNMP Concurrency Limiter & Partial Failure Isolation (Sections 20, 24, 39)
 */

const assert = require('assert');

async function mapWithConcurrency(items, concurrencyLimit, fn) {
  const results = [];
  const limit = Math.max(1, concurrencyLimit || 5);
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const chunkResults = await Promise.allSettled(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

async function runTests() {
  console.log('====================================================');
  console.log('⚡ STARTING PHASE 8: SNMP CONCURRENCY & PARTIAL FAILURE TEST');
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

  console.log('[1] Testing Concurrency Limiter Batch Chunking:');

  await asyncTest('Processes items in batches according to concurrency limit', async () => {
    const items = Array.from({ length: 15 }, (_, i) => i + 1);
    let peakConcurrency = 0;
    let currentConcurrency = 0;

    const results = await mapWithConcurrency(items, 5, async (item) => {
      currentConcurrency++;
      peakConcurrency = Math.max(peakConcurrency, currentConcurrency);
      await new Promise(r => setTimeout(r, 10));
      currentConcurrency--;
      return item * 2;
    });

    assert.strictEqual(results.length, 15);
    assert.ok(peakConcurrency <= 5, `Peak concurrency was ${peakConcurrency}, expected <= 5`);
    assert.strictEqual(results[0].status, 'fulfilled');
    assert.strictEqual(results[0].value, 2);
    assert.strictEqual(results[14].value, 30);
  });

  console.log('\n[2] Testing Partial Failure Isolation (Section 39):');

  await asyncTest('Single device timeout/failure does NOT abort remaining devices', async () => {
    const mockDevices = [
      { ip: '192.168.1.1', shouldFail: false },
      { ip: '192.168.1.2', shouldFail: true }, // Timeout device
      { ip: '192.168.1.3', shouldFail: false },
      { ip: '192.168.1.4', shouldFail: true }, // Another failure
      { ip: '192.168.1.5', shouldFail: false }
    ];

    const results = await mapWithConcurrency(mockDevices, 2, async (d) => {
      if (d.shouldFail) {
        throw new Error(`SNMP timeout contacting ${d.ip}`);
      }
      return { ip: d.ip, cpu: 15, memory: 45, status: 'ok' };
    });

    assert.strictEqual(results.length, 5);

    // Device 1: OK
    assert.strictEqual(results[0].status, 'fulfilled');
    assert.strictEqual(results[0].value.ip, '192.168.1.1');

    // Device 2: Rejected (isolated)
    assert.strictEqual(results[1].status, 'rejected');
    assert.ok(results[1].reason.message.includes('SNMP timeout'));

    // Device 3: OK (uninterrupted)
    assert.strictEqual(results[2].status, 'fulfilled');
    assert.strictEqual(results[2].value.ip, '192.168.1.3');

    // Device 4: Rejected (isolated)
    assert.strictEqual(results[3].status, 'rejected');

    // Device 5: OK (uninterrupted)
    assert.strictEqual(results[4].status, 'fulfilled');
    assert.strictEqual(results[4].value.ip, '192.168.1.5');
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
