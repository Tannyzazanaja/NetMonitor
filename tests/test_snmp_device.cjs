let snmp;
try {
  snmp = require('net-snmp');
} catch {
  try {
    snmp = require('../server/node_modules/net-snmp');
  } catch {
    snmp = null;
  }
}

/**
 * Phase 10 / Section 33 & 37: Real Network Hardware E2E Probe
 * Adheres strictly to Master Development Prompt:
 * - Never hardcodes organization IP, password, or community string
 * - Sourced dynamically from environment: TEST_SNMP_TARGET, TEST_SNMP_COMMUNITY, TEST_SNMP_VERSION
 * - Gracefully skips with descriptive reason if environment is not set
 */
const targetIp = process.env.TEST_SNMP_TARGET;
const testCommunity = process.env.TEST_SNMP_COMMUNITY || 'public';
const testVersionStr = (process.env.TEST_SNMP_VERSION || '2c').toLowerCase();

async function run() {
  console.log('====================================================');
  console.log('📡 REAL HARDWARE SNMP END-TO-END PROBE (SECTION 32 & 33)');
  console.log('====================================================\n');

  if (!targetIp) {
    console.log('[SKIP] Live SNMP hardware probe skipped.');
    console.log('       Reason: TEST_SNMP_TARGET environment variable is not defined.');
    console.log('       To test against physical network hardware, run:');
    console.log('       $env:TEST_SNMP_TARGET="192.0.2.1"; $env:TEST_SNMP_COMMUNITY="your_community"; node tests/test_snmp_device.cjs\n');
    process.exit(0);
  }

  if (!snmp) {
    console.log('[SKIP] net-snmp library not available in current environment.');
    process.exit(0);
  }

  const ver = testVersionStr === '1' ? snmp.Version1 : snmp.Version2c;
  console.log(`Probing hardware target: ${targetIp} (community: <CONFIGURED>, version: ${testVersionStr})...`);

  const session = snmp.createSession(targetIp, testCommunity, {
    timeout: 3000,
    retries: 1,
    version: ver
  });

  session.on('error', () => {});

  const oids = ['1.3.6.1.2.1.1.1.0', '1.3.6.1.2.1.1.5.0']; // sysDescr, sysName
  session.get(oids, (err, varbinds) => {
    try { session.close(); } catch {}
    if (err) {
      console.log(`❌ Hardware probe failed: ${err.message || err}`);
      process.exit(1);
    } else {
      const sysDescr = varbinds[0] && !snmp.isVarbindError(varbinds[0]) ? varbinds[0].value.toString() : 'N/A';
      const sysName = varbinds[1] && !snmp.isVarbindError(varbinds[1]) ? varbinds[1].value.toString() : 'N/A';
      console.log(`✅ Live hardware probe SUCCESS!`);
      console.log(`   sysName:  ${sysName}`);
      console.log(`   sysDescr: ${sysDescr.slice(0, 80)}...`);
      process.exit(0);
    }
  });
}

run();

