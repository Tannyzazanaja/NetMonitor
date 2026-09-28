/**
 * Unit Test: WAN Gateway & System Traffic PromQL Hierarchy
 * Verifies that buildWanPromQL correctly constructs robust queries
 * without fragile hardcoded IPs or missing fallback clauses.
 */

const assert = require('assert');

function buildWanPromQL(dir = 'in', wanIf = '', wanIp = '') {
  const metricHC = dir === 'in' ? 'ifHCInOctets' : 'ifHCOutOctets';
  const metricStd = dir === 'in' ? 'ifInOctets' : 'ifOutOctets';

  const clauses = [];

  const cleanIf = (wanIf || '').trim();
  const cleanIp = (wanIp || '').trim();
  if (cleanIf && !['auto', 'default', 'none'].includes(cleanIf.toLowerCase())) {
    if (cleanIp) {
      clauses.push(`((sum(rate(${metricHC}{instance=~".*${cleanIp}.*", ifDescr=~".*${cleanIf}.*"}[5m]) or rate(${metricStd}{instance=~".*${cleanIp}.*", ifDescr=~".*${cleanIf}.*"}[5m])) * 8 / 1000000) > 0)`);
    } else {
      clauses.push(`((sum(rate(${metricHC}{ifDescr=~".*${cleanIf}.*"}[5m]) or rate(${metricStd}{ifDescr=~".*${cleanIf}.*"}[5m])) * 8 / 1000000) > 0)`);
      clauses.push(`((sum(rate(${metricHC}{ifName=~".*${cleanIf}.*"}[5m]) or rate(${metricStd}{ifName=~".*${cleanIf}.*"}[5m])) * 8 / 1000000) > 0)`);
      clauses.push(`((sum(rate(${metricHC}{ifAlias=~".*${cleanIf}.*"}[5m]) or rate(${metricStd}{ifAlias=~".*${cleanIf}.*"}[5m])) * 8 / 1000000) > 0)`);
    }
  }

  clauses.push(`((sum(rate(${metricHC}{ifAlias=~"(?i).*(internet|palo|wan|tot|ais|true|isp|gateway).*"}[5m]) or rate(${metricStd}{ifAlias=~"(?i).*(internet|palo|wan|tot|ais|true|isp|gateway).*"}[5m])) * 8 / 1000000) > 0)`);
  clauses.push(`((sum(rate(${metricHC}{ifAlias=~"(?i).*(uplink|core|backbone).*"}[5m]) or rate(${metricStd}{ifAlias=~"(?i).*(uplink|core|backbone).*"}[5m])) * 8 / 1000000) > 0)`);
  clauses.push(`((sum(rate(${metricHC}{ifDescr=~"(?i)(ten|twenty|port-channel).*"}[5m]) or rate(${metricStd}{ifDescr=~"(?i)(ten|twenty|port-channel).*"}[5m])) * 8 / 1000000) > 0)`);
  clauses.push(`((max(sum by (instance) (rate(${metricHC}[5m]) or rate(${metricStd}[5m]))) * 8 / 1000000) > 0)`);
  clauses.push(`vector(0)`);

  return clauses.join(' or ');
}

console.log('=== TEST: WAN PromQL Hierarchy Builder ===');

// Test 1: Inbound query with configured interface
const qInCustom = buildWanPromQL('in', 'Port-channel2', '192.168.255.27');
assert(qInCustom.includes('ifHCInOctets'), 'Should query ifHCInOctets');
assert(qInCustom.includes('ifInOctets'), 'Should include 32-bit ifInOctets fallback');
assert(qInCustom.includes('192.168.255.27'), 'Should include configured IP');
assert(qInCustom.includes('Port-channel2'), 'Should include configured interface');
assert(qInCustom.includes('vector(0)'), 'Should end with safe vector(0) baseline');
console.log('✓ Test 1: Custom WAN interface with IP passed');

// Test 2: Outbound query without explicit IP
const qOutIf = buildWanPromQL('out', 'GigabitEthernet0/0/0');
assert(qOutIf.includes('ifHCOutOctets'), 'Should query ifHCOutOctets');
assert(qOutIf.includes('ifOutOctets'), 'Should include 32-bit ifOutOctets fallback');
assert(qOutIf.includes('GigabitEthernet0/0/0'), 'Should include configured interface');
assert(qOutIf.includes('uplink|core|backbone'), 'Should include uplink fallback');
assert(qOutIf.includes('vector(0)'), 'Should end with safe vector(0) baseline');
console.log('✓ Test 2: Custom WAN interface without IP passed');

// Test 3: Auto mode (no custom interface)
const qInAuto = buildWanPromQL('in', 'auto');
assert(!qInAuto.includes('ifDescr=~".*auto.*"'), 'Should not treat "auto" as literal interface');
assert(qInAuto.includes('internet|palo|wan|tot|ais|true|isp|gateway'), 'Should include ISP aliases');
assert(qInAuto.includes('uplink|core|backbone'), 'Should include uplink aliases');
assert(qInAuto.includes('vector(0)'), 'Should end with safe vector(0) baseline');
console.log('✓ Test 3: Auto detection mode passed');

// Test 4: Positive value filter (> 0)
assert(qInAuto.includes('> 0'), 'Clauses must include > 0 to prevent zero-value short-circuiting in PromQL');
console.log('✓ Test 4: Non-zero fallback filter passed');

console.log('ALL WAN PROMQL TESTS PASSED SUCCESSFULLY! 🎉');
