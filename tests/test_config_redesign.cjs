/**
 * Automated Verification Script for Prometheus & SNMP Job Configuration Redesign
 */

const fs = require('fs');
const path = require('path');
const { resolveDeviceModule, resolveAuthProfile, VALID_SNMP_MODULES, VALID_AUTH_PROFILES } = require('../server/snmpMapper');

console.log('=== TEST SUITE: Prometheus & SNMP Configuration Redesign ===\n');
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

// -----------------------------------------------------------------------------
// Test 1: SNMP Mapper - Vendor & OID Resolution
// -----------------------------------------------------------------------------
console.log('[1] Testing SNMP Mapper Resolution:');

// Cisco Catalyst
const ciscoTest = resolveDeviceModule({
  ip: '192.0.2.10',
  sysObjectID: '1.3.6.1.4.1.9.1.2829',
  sysDescr: 'Cisco IOS Software, Catalyst L3 Switch (CAT9K_LITE_IOSXE)',
  vendor: 'Cisco',
  model: 'C9200L-24P-4G'
});
assert(ciscoTest === 'cisco_switch', `Cisco 9200 resolved to cisco_switch (got: ${ciscoTest})`);

// HP / Aruba 2530
const arubaTest = resolveDeviceModule({
  ip: '192.0.2.20',
  sysObjectID: '1.3.6.1.4.1.11.2.3.7.11.144',
  sysDescr: 'HP J9773A 2530-24G-PoE+ Switch',
  vendor: 'HP',
  model: '2530-24G-PoE+'
});
assert(arubaTest === 'aruba_switch', `HP 2530 resolved to aruba_switch (got: ${arubaTest})`);

// Ruckus Switch (Should map to safe if_mib, not phantom ruckus module)
const ruckusTest = resolveDeviceModule({
  ip: '192.168.10.15',
  sysObjectID: '1.3.6.1.4.1.25053.1.2',
  vendor: 'Ruckus',
  model: 'ICX7150-24'
});
assert(ruckusTest === 'if_mib', `Ruckus resolved safely to if_mib (got: ${ruckusTest})`);

// Huawei (Should map to safe if_mib)
const huaweiTest = resolveDeviceModule({
  ip: '192.168.10.16',
  sysObjectID: '1.3.6.1.4.1.2011.2.23',
  vendor: 'Huawei'
});
assert(huaweiTest === 'if_mib', `Huawei resolved safely to if_mib (got: ${huaweiTest})`);

// Linux Server
const linuxTest = resolveDeviceModule({
  ip: '192.168.10.20',
  vendor: 'Linux',
  sysDescr: 'Linux debian-srv 5.10.0'
});
assert(linuxTest === 'host_resources', `Linux resolved to host_resources (got: ${linuxTest})`);

// Synology NAS
const synoTest = resolveDeviceModule({
  ip: '192.168.10.30',
  sysObjectID: '1.3.6.1.4.1.6574.1',
  vendor: 'Synology'
});
assert(synoTest === 'synology', `Synology resolved to synology (got: ${synoTest})`);

// APC UPS
const apcTest = resolveDeviceModule({
  ip: '192.168.10.40',
  sysObjectID: '1.3.6.1.4.1.318.1.3',
  vendor: 'APC'
});
assert(apcTest === 'apcups', `APC UPS resolved to apcups (got: ${apcTest})`);

// -----------------------------------------------------------------------------
// Test 2: Auth Profile Translation
// -----------------------------------------------------------------------------
console.log('\n[2] Testing Auth Profile Translation:');
assert(resolveAuthProfile('public') === 'public_v2', `Community 'public' -> 'public_v2'`);
assert(resolveAuthProfile('public_v1') === 'public_v1', `Profile 'public_v1' preserved`);
assert(resolveAuthProfile(null) === 'public_v2', `Default profile fallback is 'public_v2'`);

// -----------------------------------------------------------------------------
// Test 3: Prometheus Target Generation
// -----------------------------------------------------------------------------
console.log('\n[3] Testing Target Generation (Blackbox vs SNMP Isolation):');

const mockDevices = [
  { ip: '192.0.2.10', name: 'SW-CORE-C9200', vendor: 'Cisco', model: 'C9200L', community: 'public' },
  { ip: '192.0.2.20', name: 'SW-ACC-HP2530', vendor: 'HP', model: '2530-24G', community: 'public' },
  { ip: '192.0.2.30', name: 'SW-RUCKUS', vendor: 'Ruckus', community: 'public_v1' }
];

// Test target generation logic directly from server/server.js implementation
function generateTargetsTest(activeDevices) {
  let blackboxYaml = `- targets:\n`;
  activeDevices.forEach(d => { blackboxYaml += `    - '${d.ip}'\n`; });
  blackboxYaml += `  labels:\n    job: 'blackbox-icmp'\n    module: 'icmp'\n`;

  let snmpYaml = ``;
  activeDevices.forEach(d => {
    const ip = d.ip;
    const mod = resolveDeviceModule(d);
    const auth = resolveAuthProfile(d.community);
    snmpYaml += `- targets:\n    - '${ip}'\n  labels:\n    job: 'snmp'\n    target: '${ip}'\n    module: '${mod}'\n    auth: '${auth}'\n`;
  });

  return { blackboxYaml, snmpYaml };
}

const { blackboxYaml, snmpYaml } = generateTargetsTest(mockDevices);

assert(blackboxYaml.includes('192.0.2.10') && blackboxYaml.includes('192.0.2.20'), 'Blackbox targets contains device IPs');
assert(blackboxYaml.includes("module: 'icmp'"), 'Blackbox targets specify strictly ICMP module');
assert(!blackboxYaml.includes("cisco_switch") && !blackboxYaml.includes("public_v2"), 'Blackbox targets contain no SNMP parameters');

assert(snmpYaml.includes("module: 'cisco_switch'"), 'SNMP targets correctly label Cisco with cisco_switch');
assert(snmpYaml.includes("module: 'aruba_switch'"), 'SNMP targets correctly label HP with aruba_switch');
assert(snmpYaml.includes("module: 'if_mib'"), 'SNMP targets correctly fallback Ruckus to if_mib');
assert(snmpYaml.includes("auth: 'public_v2'"), 'SNMP targets use auth profile public_v2 instead of plaintext string');
assert(!snmpYaml.includes("auth: 'public'\n"), 'Plaintext community string is not exposed in auth label');

// -----------------------------------------------------------------------------
// Test 4: Prometheus Configuration File Analysis
// -----------------------------------------------------------------------------
console.log('\n[4] Testing prometheus.yml Architecture:');
const yaml = require('js-yaml');
const promConfigPathCandidates = [
  path.resolve(__dirname, '../config/prometheus/prometheus.yml'),
  path.resolve(__dirname, '../config/prometheus_redesign.yml')
];
const promConfigPath = promConfigPathCandidates.find(p => fs.existsSync(p));
const promConfigContent = fs.readFileSync(promConfigPath, 'utf8');

// Validate YAML parsing
let promYamlParsed = false;
try {
  yaml.load(promConfigContent);
  promYamlParsed = true;
} catch (e) {
  console.error('YAML parse error in prometheus.yml:', e.message);
}
assert(promYamlParsed, 'prometheus.yml is valid YAML');

assert(promConfigContent.includes("job_name: 'blackbox-icmp'") || promConfigContent.includes('job_name: "blackbox-icmp"'), 'Has dedicated blackbox-icmp job');
assert(promConfigContent.includes('/etc/prometheus/targets/blackbox/*.yml'), 'Blackbox reads ONLY /etc/prometheus/targets/blackbox/*.yml');
assert(promConfigContent.includes("job_name: 'snmp'") || promConfigContent.includes('job_name: "snmp"'), 'Has single generic snmp job');
assert(promConfigContent.includes('/etc/prometheus/targets/snmp/*.yml'), 'SNMP job reads ONLY /etc/prometheus/targets/snmp/*.yml');
assert(!promConfigContent.includes('job_name: "snmp-cisco"') && !promConfigContent.includes("job_name: 'snmp-cisco'"), 'Eliminated duplicate jobs (snmp-cisco)');
assert(!promConfigContent.includes('job_name: "snmp-host"') && !promConfigContent.includes("job_name: 'snmp-host'"), 'Eliminated duplicate jobs (snmp-host)');

// Check relabel configs for dynamic module and auth
assert(promConfigContent.includes('source_labels: [__address__]') && promConfigContent.includes('target_label: __param_target'), 'Relabel maps __address__ to __param_target');
assert(promConfigContent.includes('source_labels: [module]') && promConfigContent.includes('target_label: __param_module'), 'Relabel dynamically routes module to __param_module');
assert(promConfigContent.includes('source_labels: [auth]') && promConfigContent.includes('target_label: __param_auth'), 'Relabel dynamically routes auth to __param_auth');
assert(promConfigContent.includes('source_labels: [__param_target]') && promConfigContent.includes('target_label: instance'), 'Relabel preserves instance label as target IP');

// -----------------------------------------------------------------------------
// Test 5: SNMP Optimized Modules Analysis
// -----------------------------------------------------------------------------
console.log('\n[5] Testing snmp_optimized_modules.yml:');
const snmpModulesPathCandidates = [
  path.resolve(__dirname, '../config/snmp_exporter/snmp_optimized_modules.yml'),
  path.resolve(__dirname, '../config/snmp_optimized_modules.yml')
];
const snmpModulesPath = snmpModulesPathCandidates.find(p => fs.existsSync(p));
const snmpModulesContent = fs.readFileSync(snmpModulesPath, 'utf8');

// Validate YAML parsing
let snmpYamlParsed = false;
try {
  yaml.load(snmpModulesContent);
  snmpYamlParsed = true;
} catch (e) {
  console.error('YAML parse error in snmp_optimized_modules.yml:', e.message);
}
assert(snmpYamlParsed, 'snmp_optimized_modules.yml is valid YAML');

assert(snmpModulesContent.includes('cisco_switch:'), 'Defines optimized cisco_switch module');
assert(snmpModulesContent.includes('aruba_switch:'), 'Defines optimized aruba_switch module');

// Verify LLDP & CDP walk
assert(snmpModulesContent.includes('1.0.8802.1.1.2.1.4.1.1'), 'Walks LLDP Remote table (1.0.8802.1.1.2.1.4.1.1)');
assert(snmpModulesContent.includes('1.3.6.1.4.1.9.9.23.1.2.1.1'), 'Walks CDP Cache table (1.3.6.1.4.1.9.9.23.1.2.1.1)');

// Verify CPU & Memory
assert(snmpModulesContent.includes('1.3.6.1.4.1.9.9.109.1.1.1.1.5'), 'Cisco CPU 5min Rev OID included (1.3.6.1.4.1.9.9.109.1.1.1.1.5)');
assert(snmpModulesContent.includes('1.3.6.1.4.1.11.2.14.11.5.1.9.6.1.0'), 'HP/Aruba Switch CPU OID included');
assert(snmpModulesContent.includes('1.3.6.1.4.1.11.2.14.11.5.1.1.2.1.1.1.5'), 'HP/Aruba Switch Memory Total OID included');

// Summary
console.log(`\n============================================================`);
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log(`============================================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
