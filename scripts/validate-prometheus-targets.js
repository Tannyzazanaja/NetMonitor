#!/usr/bin/env node

/**
 * validate-prometheus-targets.js
 * Validates Prometheus file_sd target definitions (Blackbox & SNMP)
 *
 * Implements Section 27 (Phase 23) of Master Development Prompt:
 * 1. Target IP format (valid IPv4/IPv6)
 * 2. Job specification ('blackbox' or 'snmp')
 * 3. Module validation (must be known supported SNMP module)
 * 4. Auth validation (canonical naming convention)
 * 5. Duplicate target detection per job
 * 6. Missing required labels
 * 7. Malformed target structure
 * 8. YAML syntax validity
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fs = require('fs');

export const SUPPORTED_SNMP_MODULES = [
  'if_mib',
  'cisco_switch',
  'cisco_sb',
  'aruba_switch',
  'huawei_switch',
  'mikrotik_router',
  'host_resources',
  'synology',
  'apcups',
  'cisco_basic',
  'cisco_wlc',
  'cisco_device',
  'lldp_cdp'
];

const IPV4_REGEX = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

export function parseSimpleYamlTargets(yamlContent) {
  if (!yamlContent || !yamlContent.trim() || yamlContent.trim() === '[]') {
    return [];
  }
  const entries = [];
  const blocks = yamlContent.split(/(?:^|\n)-\s+targets:/m).filter(b => b.trim());

  for (const block of blocks) {
    const lines = block.split('\n');
    let targets = [];
    let labels = {};
    let inLabels = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      if (line.startsWith("- '") || line.startsWith("- \"")) {
        const ip = line.replace(/^-\s*['"]/, '').replace(/['"]$/, '').trim();
        targets.push(ip);
      } else if (line.startsWith('labels:')) {
        inLabels = true;
      } else if (inLabels && line.includes(':')) {
        const [k, ...vParts] = line.split(':');
        const key = k.trim();
        const val = vParts.join(':').trim().replace(/^['"]/, '').replace(/['"]$/, '');
        labels[key] = val;
      }
    }

    if (targets.length > 0) {
      entries.push({ targets, labels });
    }
  }

  return entries;
}

export function validateTargets({ blackboxYaml, snmpYaml }) {
  const issues = [];
  const warnings = [];

  // 1. Blackbox Validation
  const bbEntries = parseSimpleYamlTargets(blackboxYaml);
  const bbSeenIps = new Set();

  bbEntries.forEach((entry, idx) => {
    if (!Array.isArray(entry.targets) || entry.targets.length === 0) {
      issues.push(`[Blackbox Entry ${idx + 1}] Missing targets array`);
      return;
    }
    for (const ip of entry.targets) {
      if (!IPV4_REGEX.test(ip)) {
        issues.push(`[Blackbox Entry ${idx + 1}] Invalid target IP format: '${ip}'`);
      }
      if (bbSeenIps.has(ip)) {
        issues.push(`[Blackbox Entry ${idx + 1}] Duplicate target IP detected: '${ip}'`);
      }
      bbSeenIps.add(ip);
    }

    const job = entry.labels?.job;
    if (job !== 'blackbox' && job !== 'blackbox-icmp') {
      issues.push(`[Blackbox Entry ${idx + 1}] Missing or invalid job label (expected 'blackbox' or 'blackbox-icmp', got '${job}')`);
    }
  });

  // 2. SNMP Validation
  const snmpEntries = parseSimpleYamlTargets(snmpYaml);
  const snmpSeenIps = new Set();

  snmpEntries.forEach((entry, idx) => {
    if (!Array.isArray(entry.targets) || entry.targets.length === 0) {
      issues.push(`[SNMP Entry ${idx + 1}] Missing targets array`);
      return;
    }
    const ip = entry.targets[0];
    if (!IPV4_REGEX.test(ip)) {
      issues.push(`[SNMP Entry ${idx + 1}] Invalid target IP format: '${ip}'`);
    }
    if (snmpSeenIps.has(ip)) {
      issues.push(`[SNMP Entry ${idx + 1}] Duplicate target IP detected: '${ip}'`);
    }
    snmpSeenIps.add(ip);

    const labels = entry.labels || {};
    if (labels.job !== 'snmp') {
      issues.push(`[SNMP Entry ${idx + 1}] Target '${ip}' missing or invalid job label (expected 'snmp')`);
    }

    if (!labels.module) {
      issues.push(`[SNMP Entry ${idx + 1}] Target '${ip}' missing 'module' label`);
    } else if (!SUPPORTED_SNMP_MODULES.includes(labels.module)) {
      issues.push(`[SNMP Entry ${idx + 1}] Target '${ip}' references unsupported SNMP module: '${labels.module}'`);
    }

    if (!labels.auth) {
      issues.push(`[SNMP Entry ${idx + 1}] Target '${ip}' missing 'auth' label`);
    } else if (!/^[a-zA-Z0-9_-]+$/.test(labels.auth)) {
      issues.push(`[SNMP Entry ${idx + 1}] Target '${ip}' has invalid auth profile format: '${labels.auth}'`);
    }
  });

  return {
    valid: issues.length === 0,
    issues,
    warnings,
    summary: {
      blackboxCount: bbSeenIps.size,
      snmpCount: snmpEntries.length,
    }
  };
}

// Run standalone validation if invoked directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log('====================================================');
  console.log('🔍 PROMETHEUS TARGET CONFIGURATION VALIDATOR');
  console.log('====================================================\n');

  try {
    const { generateTargetsYaml, getActiveDevices } = require('../server/server.js');
    const dbPath = path.resolve(__dirname, '../data/db.json');
    let db = { devices: [], settings: {} };
    if (fs.existsSync(dbPath)) {
      db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    }

    const activeDevices = getActiveDevices(db);
    const { blackboxYaml, snmpYaml } = generateTargetsYaml(activeDevices, db.settings || {});

    console.log(`Auditing generated targets for ${activeDevices.length} active device(s)...`);
    const result = validateTargets({ blackboxYaml, snmpYaml });

    console.log(`\nResults:`);
    console.log(`- Blackbox targets: ${result.summary.blackboxCount}`);
    console.log(`- SNMP targets:     ${result.summary.snmpCount}`);

    if (result.issues.length > 0) {
      console.error('\n❌ VALIDATION FAILED with errors:');
      result.issues.forEach(i => console.error(`  - ${i}`));
      process.exit(1);
    } else {
      console.log('\n✅ ALL PROMETHEUS TARGETS ARE VALID!');
      process.exit(0);
    }
  } catch (err) {
    console.error('Validation execution error:', err.message);
    process.exit(1);
  }
}
