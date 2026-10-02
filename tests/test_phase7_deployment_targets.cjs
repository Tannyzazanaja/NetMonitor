/**
 * test_phase7_deployment_targets.cjs
 * Comprehensive Unit Tests for Phase 7:
 * Deployment Consistency, Startup Permissions & Target Validation (Sections 26, 27, 28, 48)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const {
  canWriteTargetDirectory,
  resolveTargetPaths,
  generateTargetsYaml
} = require('../server/server.js');
const {
  validateTargets,
  SUPPORTED_SNMP_MODULES
} = require('../scripts/validate-prometheus-targets.js');

async function runTests() {
  console.log('====================================================');
  console.log('📦 STARTING PHASE 7: DEPLOYMENT CONSISTENCY & TARGET VALIDATION');
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

  // [1] canWriteTargetDirectory & Startup Permission Checks (Section 26 & 48)
  console.log('[1] Testing Target Directory Writable Permission Verification:');

  test('canWriteTargetDirectory correctly identifies writable directory', () => {
    const paths = resolveTargetPaths();
    const res = canWriteTargetDirectory(paths.baseDir);
    assert.strictEqual(res.writable, true);
    assert.strictEqual(res.path, paths.baseDir);
  });

  test('resolveTargetPaths returns canonical target file structure', () => {
    const paths = resolveTargetPaths();
    assert.ok(paths.baseDir);
    assert.ok(paths.blackboxFile.endsWith('netmonitor.yml'));
    assert.ok(paths.snmpFile.endsWith('netmonitor.yml'));
  });

  // [2] Target Configuration Validator (Section 27)
  console.log('\n[2] Testing Prometheus Target Validator (Section 27):');

  test('Valid blackbox and SNMP targets pass validation with 0 issues', () => {
    const validBb = `- targets:\n    - '192.168.1.1'\n  labels:\n    job: 'blackbox'\n    target: '192.168.1.1'\n`;
    const validSnmp = `- targets:\n    - '192.168.1.1'\n  labels:\n    job: 'snmp'\n    target: '192.168.1.1'\n    module: 'cisco_switch'\n    auth: 'public_v2'\n`;
    const res = validateTargets({ blackboxYaml: validBb, snmpYaml: validSnmp });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.issues.length, 0);
  });

  test('Detects invalid target IP syntax', () => {
    const badIpBb = `- targets:\n    - '999.999.999.999'\n  labels:\n    job: 'blackbox'\n    target: '999.999.999.999'\n`;
    const res = validateTargets({ blackboxYaml: badIpBb, snmpYaml: '[]' });
    assert.strictEqual(res.valid, false);
    assert.ok(res.issues.some(i => i.includes('Invalid target IP format')));
  });

  test('Detects duplicate target IP within same job', () => {
    const dupBb = `- targets:\n    - '192.168.1.10'\n  labels:\n    job: 'blackbox'\n- targets:\n    - '192.168.1.10'\n  labels:\n    job: 'blackbox'\n`;
    const res = validateTargets({ blackboxYaml: dupBb, snmpYaml: '[]' });
    assert.strictEqual(res.valid, false);
    assert.ok(res.issues.some(i => i.includes('Duplicate target IP detected')));
  });

  test('Detects unsupported or phantom SNMP module', () => {
    const phantomModSnmp = `- targets:\n    - '192.168.1.20'\n  labels:\n    job: 'snmp'\n    module: 'phantom_unsupported_module'\n    auth: 'public_v2'\n`;
    const res = validateTargets({ blackboxYaml: '[]', snmpYaml: phantomModSnmp });
    assert.strictEqual(res.valid, false);
    assert.ok(res.issues.some(i => i.includes('references unsupported SNMP module')));
  });

  test('Detects missing required labels on SNMP target', () => {
    const missingLabelSnmp = `- targets:\n    - '192.168.1.30'\n  labels:\n    job: 'snmp'\n`;
    const res = validateTargets({ blackboxYaml: '[]', snmpYaml: missingLabelSnmp });
    assert.strictEqual(res.valid, false);
    assert.ok(res.issues.some(i => i.includes("missing 'module' label")));
    assert.ok(res.issues.some(i => i.includes("missing 'auth' label")));
  });

  test('Empty active devices generates valid empty [] YAML without crash', () => {
    const { blackboxYaml, snmpYaml } = generateTargetsYaml([]);
    assert.ok(blackboxYaml.includes('[]'));
    assert.ok(snmpYaml.includes('[]'));
    const res = validateTargets({ blackboxYaml, snmpYaml });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.issues.length, 0);
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
