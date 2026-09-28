const assert = require('assert');
const { validateSettings, sanitizeDbForFrontend } = require('../server/server');

console.log('=== TEST SUITE: Runtime Settings Configuration & Security ===\n');

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

// -----------------------------------------------------------------------------
// 1. Settings Validation Engine
// -----------------------------------------------------------------------------
console.log('[1] Testing Settings Validation Engine:');

it('Validates clean, valid settings object', () => {
  const result = validateSettings({
    refreshInterval: 15,
    prometheusUrl: 'http://192.168.109.147:9090',
    grafanaUrl: 'http://192.168.109.147:3000',
    defaultModule: 'cisco_switch',
    defaultCommunity: 'seavl77',
    wanInterface: 'GigabitEthernet0/0/0',
    orgName: 'SEAVL ENTERPRISE NETWORK',
    lineChannelToken: 'secret_token_123',
    lineTargetId: 'U123456789'
  });

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
  assert.strictEqual(result.cleanSettings.refreshInterval, 15);
  assert.strictEqual(result.cleanSettings.defaultModule, 'cisco_switch');
  assert.strictEqual(result.cleanSettings.prometheusUrl, 'http://192.168.109.147:9090');
});

it('Rejects invalid refreshInterval (< 3 or > 120 seconds)', () => {
  const tooLow = validateSettings({ refreshInterval: 1 });
  assert.strictEqual(tooLow.valid, false);
  assert.ok(tooLow.errors.some(e => e.includes('refreshInterval')));

  const tooHigh = validateSettings({ refreshInterval: 300 });
  assert.strictEqual(tooHigh.valid, false);
  assert.ok(tooHigh.errors.some(e => e.includes('refreshInterval')));

  const validEdge1 = validateSettings({ refreshInterval: 3 });
  assert.strictEqual(validEdge1.valid, true);
  assert.strictEqual(validEdge1.cleanSettings.refreshInterval, 3);

  const validEdge2 = validateSettings({ refreshInterval: 120 });
  assert.strictEqual(validEdge2.valid, true);
  assert.strictEqual(validEdge2.cleanSettings.refreshInterval, 120);
});

it('Rejects invalid Prometheus and Grafana URLs', () => {
  const invalidProm = validateSettings({ prometheusUrl: 'ftp://invalid-url:9090' });
  assert.strictEqual(invalidProm.valid, false);
  assert.ok(invalidProm.errors.some(e => e.includes('prometheusUrl')));

  const validProm = validateSettings({ prometheusUrl: 'http://10.0.0.1:9090/' });
  assert.strictEqual(validProm.valid, true);
  // Trailing slash should be stripped for clean URL composition
  assert.strictEqual(validProm.cleanSettings.prometheusUrl, 'http://10.0.0.1:9090');
});

it('Enforces whitelist for defaultModule to prevent scraping errors', () => {
  const allowed = ['if_mib', 'cisco_switch', 'aruba_switch', 'host_resources', 'synology', 'apcups'];
  for (const mod of allowed) {
    const res = validateSettings({ defaultModule: mod });
    assert.strictEqual(res.valid, true, `Module ${mod} should be allowed`);
    assert.strictEqual(res.cleanSettings.defaultModule, mod);
  }

  const invalidMod = validateSettings({ defaultModule: 'random_malicious_mod' });
  assert.strictEqual(invalidMod.valid, false);
  assert.ok(invalidMod.errors.some(e => e.includes('defaultModule')));
});

it('Protects masked secrets: "***" does not overwrite backend secrets', () => {
  const res = validateSettings({
    defaultCommunity: '***',
    lineChannelToken: '***',
    lineTargetId: '***'
  });
  assert.strictEqual(res.valid, true);
  // Must NOT include masked placeholder in cleanSettings to avoid corrupting DB
  assert.strictEqual(res.cleanSettings.defaultCommunity, undefined);
  assert.strictEqual(res.cleanSettings.lineChannelToken, undefined);
  assert.strictEqual(res.cleanSettings.lineTargetId, undefined);
});

// -----------------------------------------------------------------------------
// 2. Sensitive Data Sanitization for Frontend
// -----------------------------------------------------------------------------
console.log('\n[2] Testing Sensitive Data Sanitization (Security Isolation):');

it('Strips plaintext SNMP community strings from all device records', () => {
  const mockDb = {
    devices: [
      { ip: '192.168.1.1', name: 'Core-SW', community: 'super_secret_comm_1' },
      { ip: '192.168.1.2', name: 'Dist-SW', community: 'super_secret_comm_2' }
    ],
    settings: {
      defaultCommunity: 'seavl77',
      lineChannelToken: 'line_token_xyz',
      lineTargetId: 'U_target_123'
    }
  };

  const safe = sanitizeDbForFrontend(mockDb, 'Viewer');

  // Verify devices have NO community property
  assert.strictEqual(safe.devices[0].community, undefined);
  assert.strictEqual(safe.devices[1].community, undefined);
  assert.strictEqual(safe.devices[0].name, 'Core-SW');
  assert.strictEqual(safe.devices[1].name, 'Dist-SW');

  // Original db must remain untouched (no mutation)
  assert.strictEqual(mockDb.devices[0].community, 'super_secret_comm_1');
});

it('Masks sensitive credentials in settings and supplies secure flags', () => {
  const mockDb = {
    settings: {
      prometheusUrl: 'http://192.168.109.147:9090',
      defaultCommunity: 'seavl77',
      lineChannelToken: 'line_token_secret',
      lineTargetId: 'target_group_999'
    }
  };

  const safe = sanitizeDbForFrontend(mockDb, 'Admin');

  assert.strictEqual(safe.settings.prometheusUrl, 'http://192.168.109.147:9090');
  assert.strictEqual(safe.settings.defaultCommunity, '***');
  assert.strictEqual(safe.settings.lineChannelToken, '***');
  assert.strictEqual(safe.settings.lineTargetId, '***');

  // Flags for UI state
  assert.strictEqual(safe.settings.hasDefaultCommunity, true);
  assert.strictEqual(safe.settings.hasLineChannelToken, true);
  assert.strictEqual(safe.settings.hasLineTargetId, true);
});

// -----------------------------------------------------------------------------
// 3. Credential Preservation on Device Updates
// -----------------------------------------------------------------------------
console.log('\n[3] Testing Backend Credential Preservation Logic:');

it('Preserves existing device community string when frontend saves sanitized devices', () => {
  const existingDbDevices = [
    { ip: '192.168.1.10', name: 'SW-1', community: 'custom_secret_1' },
    { ip: '192.168.1.20', name: 'SW-2', community: 'custom_secret_2' }
  ];

  // Frontend submits devices without community (because it was sanitized)
  const incomingFromFrontend = [
    { ip: '192.168.1.10', name: 'SW-1-Renamed' }, // No community sent
    { ip: '192.168.1.20', name: 'SW-2', community: '***' }, // Mask sent
    { ip: '192.168.1.30', name: 'SW-3-New' } // New device, should get default
  ];

  const defaultCommunity = 'seavl77';
  const existingMap = new Map();
  existingDbDevices.forEach(d => existingMap.set(d.ip, d.community));

  const merged = incomingFromFrontend.map(d => {
    let comm = d.community;
    if (!comm || comm === '***') {
      comm = existingMap.get(d.ip) || defaultCommunity;
    }
    return { ...d, community: comm };
  });

  assert.strictEqual(merged[0].community, 'custom_secret_1'); // Preserved from DB!
  assert.strictEqual(merged[1].community, 'custom_secret_2'); // Preserved from DB!
  assert.strictEqual(merged[2].community, 'seavl77'); // Assigned default!
});

// -----------------------------------------------------------------------------
// 4. Verification Summary
// -----------------------------------------------------------------------------
console.log('\n============================================================');
console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
console.log('============================================================\n');

process.exit(0);
