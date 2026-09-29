const snmp = require('net-snmp');

const targetIp = '192.168.255.71';
const communities = ['seavl77', 'public'];
const versions = [snmp.Version2c, snmp.Version1];

async function testCommunity(comm, ver) {
  return new Promise((resolve) => {
    const verName = ver === snmp.Version1 ? 'v1' : 'v2c';
    console.log(`Testing ${targetIp} with community='${comm}', version=${verName}...`);
    const session = snmp.createSession(targetIp, comm, {
      timeout: 2500,
      retries: 1,
      version: ver
    });
    session.on('error', err => {
      // ignore socket errors
    });

    const oids = ['1.3.6.1.2.1.1.1.0', '1.3.6.1.2.1.1.5.0']; // sysDescr, sysName
    session.get(oids, (err, varbinds) => {
      try { session.close(); } catch {}
      if (err) {
        console.log(`  [FAILED] ${comm} (${verName}): ${err.message || err}`);
        resolve({ ok: false, error: err.message || String(err) });
      } else {
        const sysDescr = varbinds[0] && !snmp.isVarbindError(varbinds[0]) ? varbinds[0].value.toString() : 'N/A';
        const sysName = varbinds[1] && !snmp.isVarbindError(varbinds[1]) ? varbinds[1].value.toString() : 'N/A';
        console.log(`  [SUCCESS] ${comm} (${verName}): sysName="${sysName}", sysDescr="${sysDescr.slice(0, 50)}..."`);
        resolve({ ok: true, comm, ver: verName, sysName, sysDescr });
      }
    });
  });
}

async function run() {
  console.log(`=== Probing SNMP on ${targetIp} ===`);
  for (const comm of communities) {
    for (const ver of versions) {
      const res = await testCommunity(comm, ver);
      if (res.ok) {
        console.log(`\n🎉 WORKING SNMP CONFIG FOUND for ${targetIp}: community="${comm}", version=${res.ver}`);
        process.exit(0);
      }
    }
  }
  console.log(`\n❌ All SNMP probes failed on ${targetIp}. SNMP is likely disabled or blocked on this device.`);
  process.exit(0);
}

run();
