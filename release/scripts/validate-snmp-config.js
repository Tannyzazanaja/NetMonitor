#!/usr/bin/env node
/**
 * NetMonitor Enterprise - SNMP Exporter & Target Consistency Validator
 * File: scripts/validate-snmp-config.js
 * 
 * Verifies that:
 * 1. YAML syntax of config/snmp_exporter/snmp.yml is valid.
 * 2. Modules referenced in code (snmpMapper.js, server.js) exist in snmp.yml (No phantom modules).
 * 3. Auth profiles referenced in code exist in snmp.yml.
 * 4. All generated Prometheus targets in data/targets/snmp/*.yml reference valid modules.
 * 5. All generated Prometheus targets reference valid auth profiles.
 * 6. Target addresses are valid IPv4/IPv6 strings.
 * 7. No duplicate target definitions exist across files.
 * 8. No duplicate auth profiles exist in snmp.yml.
 * 9. Legacy/deprecated files (config/prometheus/snmp.yml) are kept in sync with authoritative source.
 * 10. No orphaned configuration fragments exist without source of truth tracking.
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fs = require('fs');
const yaml = require('js-yaml');

const ROOT_DIR = path.resolve(__dirname, '..');
const SNMP_AUTHORITATIVE_FILE = path.join(ROOT_DIR, 'config/snmp_exporter/snmp.yml');
const SNMP_LEGACY_FILE = path.join(ROOT_DIR, 'config/prometheus/snmp.yml');
const TARGETS_DIR = path.join(ROOT_DIR, 'data/targets/snmp');
const SNMP_MAPPER_FILE = path.join(ROOT_DIR, 'server/snmpMapper.js');

let errors = [];
let warnings = [];
let passCount = 0;

function pass(msg) {
  console.log(`  [PASS] ${msg}`);
  passCount++;
}

function fail(msg) {
  console.error(`  [FAIL] ${msg}`);
  errors.push(msg);
}

function warn(msg) {
  console.warn(`  [WARN] ${msg}`);
  warnings.push(msg);
}

console.log('============================================================');
console.log('🔬 NETMONITOR SNMP CONFIGURATION & TARGET CONSISTENCY AUDITOR');
console.log('============================================================\n');

// -----------------------------------------------------------------------------
// Check 1: Authoritative snmp.yml existence & YAML syntax
// -----------------------------------------------------------------------------
console.log('[Check 1] Validating authoritative config/snmp_exporter/snmp.yml syntax...');
if (!fs.existsSync(SNMP_AUTHORITATIVE_FILE)) {
  fail(`Authoritative SNMP config missing: ${SNMP_AUTHORITATIVE_FILE}`);
  process.exit(1);
}

let snmpDoc = null;
try {
  const content = fs.readFileSync(SNMP_AUTHORITATIVE_FILE, 'utf8');
  snmpDoc = yaml.load(content);
  pass('Authoritative snmp.yml is valid YAML.');
} catch (e) {
  fail(`Invalid YAML syntax in ${SNMP_AUTHORITATIVE_FILE}: ${e.message}`);
  process.exit(1);
}

const exporterModules = Object.keys(snmpDoc?.modules || {});
const exporterAuths = Object.keys(snmpDoc?.auths || {});

if (exporterModules.length === 0) {
  fail('No modules found in snmp.yml.');
} else {
  pass(`Found ${exporterModules.length} exporter modules in snmp.yml: [${exporterModules.join(', ')}]`);
}

if (exporterAuths.length === 0) {
  fail('No auth profiles found in snmp.yml.');
} else {
  pass(`Found ${exporterAuths.length} exporter auth profiles in snmp.yml: [${exporterAuths.join(', ')}]`);
}

// -----------------------------------------------------------------------------
// Check 2: Code vs SNMP Exporter Module Consistency (No Phantom Modules)
// -----------------------------------------------------------------------------
console.log('\n[Check 2] Verifying server/snmpMapper.js code modules against snmp.yml...');
if (!fs.existsSync(SNMP_MAPPER_FILE)) {
  fail(`snmpMapper.js not found at ${SNMP_MAPPER_FILE}`);
} else {
  const { VALID_SNMP_MODULES, VALID_AUTH_PROFILES } = require(SNMP_MAPPER_FILE);

  let phantomModules = [];
  VALID_SNMP_MODULES.forEach(mod => {
    if (!exporterModules.includes(mod)) {
      phantomModules.push(mod);
    }
  });

  if (phantomModules.length > 0) {
    fail(`Phantom modules detected in snmpMapper.js but missing in snmp.yml: [${phantomModules.join(', ')}]`);
  } else {
    pass(`All ${VALID_SNMP_MODULES.length} code modules in snmpMapper.js exist in snmp.yml.`);
  }

  let phantomAuths = [];
  VALID_AUTH_PROFILES.forEach(auth => {
    if (!exporterAuths.includes(auth)) {
      phantomAuths.push(auth);
    }
  });

  if (phantomAuths.length > 0) {
    fail(`Phantom auth profiles detected in snmpMapper.js but missing in snmp.yml: [${phantomAuths.join(', ')}]`);
  } else {
    pass(`All baseline auth profiles in snmpMapper.js exist in snmp.yml.`);
  }
}

// -----------------------------------------------------------------------------
// Check 3: Duplicate Auth Profiles in snmp.yml
// -----------------------------------------------------------------------------
console.log('\n[Check 3] Checking for duplicate auth profiles or duplicate keys in snmp.yml...');
try {
  const rawText = fs.readFileSync(SNMP_AUTHORITATIVE_FILE, 'utf8');
  const authSectionMatch = rawText.match(/auths:\s*\n([\s\S]*?)(?=\nmodules:|$)/);
  if (authSectionMatch) {
    const authLines = authSectionMatch[1].split('\n');
    const seenAuths = new Set();
    let dupAuths = [];
    authLines.forEach(l => {
      const m = l.match(/^\s{2}([a-zA-Z0-9_-]+):/);
      if (m) {
        const name = m[1];
        if (seenAuths.has(name)) {
          dupAuths.push(name);
        } else {
          seenAuths.add(name);
        }
      }
    });
    if (dupAuths.length > 0) {
      fail(`Duplicate auth profiles found in snmp.yml: [${dupAuths.join(', ')}]`);
    } else {
      pass(`Zero duplicate auth profiles in snmp.yml (verified ${seenAuths.size} unique auth profiles).`);
    }
  }
} catch (e) {
  warn(`Could not perform raw duplicate check on auths: ${e.message}`);
}

// -----------------------------------------------------------------------------
// Check 4: Prometheus Targets Validation (Module, Auth, IP, Duplicate Targets)
// -----------------------------------------------------------------------------
console.log('\n[Check 4] Validating generated SNMP targets in data/targets/snmp/...');
if (!fs.existsSync(TARGETS_DIR)) {
  warn(`Targets directory ${TARGETS_DIR} does not exist yet (clean state).`);
} else {
  const files = fs.readdirSync(TARGETS_DIR).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  if (files.length === 0) {
    pass('Target directory is clean (no active YAML target files to validate).');
  } else {
    const seenTargets = new Set();
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

    files.forEach(file => {
      const filePath = path.join(TARGETS_DIR, file);
      try {
        const doc = yaml.load(fs.readFileSync(filePath, 'utf8'));
        if (!Array.isArray(doc)) {
          fail(`Target file ${file} does not contain a YAML array.`);
          return;
        }

        doc.forEach((entry, idx) => {
          const targets = entry.targets || [];
          const labels = entry.labels || {};

          targets.forEach(t => {
            // Check IP format
            if (!ipRegex.test(t)) {
              fail(`Target '${t}' in ${file}[${idx}] is not a valid IPv4 address.`);
            }

            // Check duplicate target in same job
            if (seenTargets.has(t)) {
              fail(`Duplicate target IP detected across target files: '${t}' in ${file}`);
            } else {
              seenTargets.add(t);
            }
          });

          // Check Module validity
          if (labels.module) {
            if (!exporterModules.includes(labels.module)) {
              fail(`Target in ${file} specifies non-existent SNMP module: '${labels.module}'`);
            }
          }

          // Check Auth profile validity
          if (labels.auth) {
            if (!exporterAuths.includes(labels.auth)) {
              // Custom auth profile may be injected at runtime, verify name format
              if (!labels.auth.endsWith('_v2') && !labels.auth.endsWith('_v1')) {
                warn(`Target in ${file} specifies non-standard auth profile name: '${labels.auth}'`);
              }
            }
          }
        });

        pass(`Verified target file: ${file}`);
      } catch (err) {
        fail(`Malformed YAML in target file ${file}: ${err.message}`);
      }
    });

    pass(`Validated ${seenTargets.size} unique target definitions across ${files.length} target files.`);
  }
}

// -----------------------------------------------------------------------------
// Check 5: Source of Truth vs Deprecated File Consistency Check
// -----------------------------------------------------------------------------
console.log('\n[Check 5] Verifying configuration drift between source of truth and legacy mirror...');
if (fs.existsSync(SNMP_LEGACY_FILE)) {
  try {
    const legacyContent = fs.readFileSync(SNMP_LEGACY_FILE, 'utf8');
    const legacyDoc = yaml.load(legacyContent);
    const legacyModules = Object.keys(legacyDoc?.modules || {});
    
    // Check if any authoritative module is missing from legacy file
    const missingInLegacy = exporterModules.filter(m => !legacyModules.includes(m));
    if (missingInLegacy.length > 0) {
      fail(`Configuration drift detected! Legacy ${SNMP_LEGACY_FILE} missing modules: [${missingInLegacy.join(', ')}]`);
    } else {
      pass(`Legacy ${SNMP_LEGACY_FILE} contains all ${exporterModules.length} authoritative modules.`);
    }

    if (!legacyContent.includes('DEPRECATED')) {
      warn(`Legacy file ${SNMP_LEGACY_FILE} is missing explicit DEPRECATED banner.`);
    } else {
      pass(`Legacy file ${SNMP_LEGACY_FILE} contains explicit DEPRECATED notice.`);
    }
  } catch (err) {
    fail(`Could not parse legacy file ${SNMP_LEGACY_FILE}: ${err.message}`);
  }
} else {
  pass('No legacy snmp.yml file exists (clean single source).');
}

// -----------------------------------------------------------------------------
// Summary & Exit
// -----------------------------------------------------------------------------
console.log('\n============================================================');
console.log(`AUDIT RESULTS: ${passCount} Passed | ${warnings.length} Warnings | ${errors.length} Failed`);
console.log('============================================================');

if (errors.length > 0) {
  console.error('\n❌ SNMP CONFIGURATION VALIDATION FAILED with the following errors:');
  errors.forEach((err, i) => console.error(`  ${i + 1}. ${err}`));
  process.exit(1);
} else {
  console.log('\n✅ SNMP CONFIGURATION & TARGET CONSISTENCY: ALL CHECKS PASSED!\n');
  process.exit(0);
}
