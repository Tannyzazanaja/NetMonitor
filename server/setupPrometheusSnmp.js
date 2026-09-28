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

      // A: Ensure standard auth profiles exist (public_v2)
      if (!content.includes('public_v2:')) {
        log('Adding public_v2 auth profile to snmp.yml...');
        if (content.includes('auths:')) {
          content = content.replace('auths:\n', 'auths:\n  public_v2:\n    community: public\n    version: 2\n');
        }
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

        fs.writeFileSync(snmpTarget, content, 'utf8');
        log('Successfully merged optimized modules into /etc/prometheus/snmp.yml');
      } else {
        log('cisco_switch module is already present in /etc/prometheus/snmp.yml (skipping duplicate append)');
      }
    } else {
      // If snmp.yml does not exist at all, create it with baseline auths + modules
      log('Creating baseline /etc/prometheus/snmp.yml with auths and optimized modules...');
      const baseline = `auths:\n  public_v1:\n    community: public\n    version: 1\n  public_v2:\n    community: public\n    version: 2\n\n` + modContent;
      fs.writeFileSync(snmpTarget, baseline, 'utf8');
      log(`Created ${snmpTarget} successfully.`);
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
    execSync('systemctl restart prometheus-snmp-exporter 2>/dev/null || systemctl restart snmp_exporter 2>/dev/null || true', { stdio: 'pipe' });
    execSync('systemctl restart prometheus 2>/dev/null || true', { stdio: 'pipe' });
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
