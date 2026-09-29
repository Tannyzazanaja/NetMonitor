/**
 * Production Prometheus & SNMP Exporter Setup and Migration Helper
 * Safe, idempotent script executed on the server during deployment.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function log(msg) {
  console.log(`[Prometheus/SNMP Setup] ${msg}`);
}

function warn(msg) {
  console.warn(`[Prometheus/SNMP Setup WARNING] ${msg}`);
}

function runSetup() {
  log('Starting Prometheus and SNMP Exporter automated configuration...');

  const backupDir = '/etc/prometheus/backup';
  const blackboxDir = '/etc/prometheus/targets/blackbox';
  const snmpDir = '/etc/prometheus/targets/snmp';

  // 1. Ensure target and backup directories exist
  [backupDir, blackboxDir, snmpDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      log(`Created directory: ${dir}`);
    }
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // 2. Configure Prometheus (prometheus.yml)
  const promSourceCandidates = [
    '/tmp/prometheus_redesign.yml',
    path.resolve(__dirname, '../config/prometheus_redesign.yml'),
    path.resolve(__dirname, 'prometheus_redesign.yml')
  ];
  const promSource = promSourceCandidates.find(p => fs.existsSync(p));
  const promTarget = '/etc/prometheus/prometheus.yml';

  if (promSource) {
    const newPromConfig = fs.readFileSync(promSource, 'utf8');

    // Backup existing configuration if present
    if (fs.existsSync(promTarget)) {
      const backupPath = path.join(backupDir, `prometheus.yml.bak.${timestamp}`);
      fs.copyFileSync(promTarget, backupPath);
      log(`Backed up current prometheus.yml to ${backupPath}`);
    }

    // Verify syntax with promtool if available
    let isValid = true;
    try {
      execSync(`promtool check config "${promSource}"`, { stdio: 'pipe' });
      log('Verified prometheus.yml syntax with promtool (SUCCESS)');
    } catch (err) {
      // If promtool exists but failed syntax check
      if (err.status !== 127 && !err.message.includes('not found')) {
        warn(`promtool syntax check failed: ${err.stderr ? err.stderr.toString() : err.message}`);
        isValid = false;
      } else {
        log('promtool not installed, proceeding with direct deployment.');
      }
    }

    if (isValid) {
      fs.writeFileSync(promTarget, newPromConfig, 'utf8');
      log(`Successfully deployed redesigned Prometheus configuration to ${promTarget}`);
    } else {
      warn(`Keeping existing ${promTarget} due to validation error.`);
    }
  } else {
    warn('Redesigned Prometheus configuration source not found, skipping prometheus.yml update.');
  }

  // 3. Configure SNMP Exporter (snmp.yml)
  const snmpSourceCandidates = [
    '/tmp/snmp_optimized_modules.yml',
    path.resolve(__dirname, '../config/snmp_exporter/snmp_optimized_modules.yml'),
    path.resolve(__dirname, '../config/snmp_optimized_modules.yml'),
    path.resolve(__dirname, 'snmp_optimized_modules.yml')
  ];
  const snmpSource = snmpSourceCandidates.find(p => fs.existsSync(p));
  const snmpTarget = '/etc/prometheus/snmp.yml';

  if (snmpSource) {
    const modContent = fs.readFileSync(snmpSource, 'utf8');

    if (fs.existsSync(snmpTarget)) {
      // Backup current snmp.yml
      const backupPath = path.join(backupDir, `snmp.yml.bak.${timestamp}`);
      fs.copyFileSync(snmpTarget, backupPath);
      log(`Backed up current snmp.yml to ${backupPath}`);

      let content = fs.readFileSync(snmpTarget, 'utf8');

      // Ensure auths: block exists
      if (!content.includes('auths:')) {
        content = 'auths:\n' + content;
      }

      // Ensure baseline public_v2 and public_v1 exist
      if (!content.includes('public_v2:')) {
        log('Adding public_v2 auth profile to snmp.yml...');
        content = content.replace(/auths:\r?\n/, match => `${match}  public_v2:\n    community: public\n    version: 2\n`);
      }
      if (!content.includes('public_v1:')) {
        log('Adding public_v1 auth profile to snmp.yml...');
        content = content.replace(/auths:\r?\n/, match => `${match}  public_v1:\n    community: public\n    version: 1\n`);
      }

      // Read DB files and env to inject custom community auth profiles
      try {
        const dbCandidates = [
          path.resolve(__dirname, '../data/db.json'),
          path.resolve(__dirname, 'data/db.json'),
          '/var/www/netmonitor-react/data/db.json',
          '/var/www/netmonitor-react/server/data/db.json',
          '/app/data/db.json',
        ];
        const comms = new Set();
        comms.add('public');
        const envComm = (process.env.DEFAULT_SNMP_COMMUNITY || '').trim();
        if (envComm && envComm !== '***') comms.add(envComm);
        for (const p of dbCandidates) {
          if (fs.existsSync(p)) {
            try {
              const db = JSON.parse(fs.readFileSync(p, 'utf8'));
              if (db.settings?.defaultCommunity && db.settings.defaultCommunity !== '***') {
                comms.add(db.settings.defaultCommunity.trim());
              }
              if (Array.isArray(db.devices)) {
                db.devices.forEach(d => {
                  if (d && d.community && d.community !== '***') comms.add(d.community.trim());
                });
              }
            } catch {}
          }
        }
        for (const comm of comms) {
          if (comm === 'public') continue;
          const safe = comm.replace(/[^a-zA-Z0-9_-]/g, '_');
          const profiles = [`auth_${safe}_v2`, `${safe}_v2`];
          for (const prof of profiles) {
            if (!content.includes(`${prof}:`)) {
              const authSnippet = `  ${prof}:\n    community: ${comm}\n    version: 2\n`;
              content = content.replace(/auths:\r?\n/, match => `${match}${authSnippet}`);
              log(`Adding ${prof} auth profile for community '${comm}' to snmp.yml...`);
            }
          }
        }
      } catch (dbErr) {
        warn(`Could not inspect db.json for custom communities: ${dbErr.message}`);
      }

      // B: Append cisco_switch and aruba_switch modules if not present
      if (!content.includes('cisco_switch:')) {
        log('Appending cisco_switch and aruba_switch modules to snmp.yml...');
        const lines = modContent.split('\n');
        const modOnlyLines = lines.filter(l => !l.startsWith('modules:')).join('\n');

        if (content.includes('modules:')) {
          content = content.trimEnd() + '\n\n' + modOnlyLines;
        } else {
          content = content.trimEnd() + '\n\nmodules:\n' + modOnlyLines;
        }
      } else {
        log('cisco_switch module is already present in /etc/prometheus/snmp.yml (skipping duplicate append)');
      }

      // ALWAYS write the updated file to both candidate locations!
      fs.writeFileSync(snmpTarget, content, 'utf8');
      try {
        if (!fs.existsSync('/etc/snmp_exporter')) fs.mkdirSync('/etc/snmp_exporter', { recursive: true });
        fs.writeFileSync('/etc/snmp_exporter/snmp.yml', content, 'utf8');
      } catch {}
      log('Successfully saved /etc/prometheus/snmp.yml and /etc/snmp_exporter/snmp.yml with auth profiles and optimized modules');
    } else {
      log('Creating baseline /etc/prometheus/snmp.yml with auths and optimized modules...');
      let baselineAuths = `auths:\n  public_v1:\n    community: public\n    version: 1\n  public_v2:\n    community: public\n    version: 2\n`;
      const envComm = (process.env.DEFAULT_SNMP_COMMUNITY || '').trim();
      if (envComm && envComm !== 'public' && envComm !== '***') {
        const safe = envComm.replace(/[^a-zA-Z0-9_-]/g, '_');
        baselineAuths += `  ${safe}_v2:\n    community: ${envComm}\n    version: 2\n`;
      }
      const baseline = baselineAuths + '\n' + modContent;
      fs.writeFileSync(snmpTarget, baseline, 'utf8');
      try {
        if (!fs.existsSync('/etc/snmp_exporter')) fs.mkdirSync('/etc/snmp_exporter', { recursive: true });
        fs.writeFileSync('/etc/snmp_exporter/snmp.yml', baseline, 'utf8');
      } catch {}
      log(`Created ${snmpTarget} and /etc/snmp_exporter/snmp.yml successfully.`);
    }
  } else {
    warn('Optimized SNMP modules source not found, skipping snmp.yml update.');
  }

  // 4. Clean up temporary files
  ['/tmp/prometheus_redesign.yml', '/tmp/snmp_optimized_modules.yml'].forEach(tmp => {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {}
  });

  // 5. Restart services to apply new modules immediately
  try {
    execSync('pkill -HUP -f snmp_exporter 2>/dev/null || true', { stdio: 'pipe' });
    execSync('systemctl restart snmp_exporter 2>/dev/null || systemctl restart prometheus-snmp-exporter 2>/dev/null || systemctl restart snmp-exporter 2>/dev/null || true', { stdio: 'pipe' });
    execSync('curl -s -X POST http://localhost:9116/-/reload 2>/dev/null || true', { stdio: 'pipe' });
    execSync('systemctl restart prometheus 2>/dev/null || systemctl reload prometheus 2>/dev/null || true', { stdio: 'pipe' });
    execSync('curl -s -X POST http://localhost:9090/-/reload 2>/dev/null || true', { stdio: 'pipe' });
    log('Restarted Prometheus and SNMP Exporter services.');
  } catch {}

  log('Prometheus and SNMP Exporter configuration completed.');
}

if (require.main === module) {
  try {
    runSetup();
  } catch (e) {
    console.error('[Prometheus/SNMP Setup FATAL ERROR]', e);
    process.exit(1);
  }
}

module.exports = { runSetup };
