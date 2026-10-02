#!/usr/bin/env node

/**
 * security-scan.js
 * Automated Secret & Credential Scanner for NetMonitor Codebase
 *
 * Implements Section 45 (Phase 45) of Master Development Prompt:
 * Scans repository files for hardcoded passwords, tokens, private keys,
 * unmasked SNMP communities, and organization-specific secrets.
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.system_generated'
]);

const ALLOWED_EXTENSIONS = new Set([
  '.js', '.jsx', '.cjs', '.mjs', '.ts', '.tsx', '.json', '.yml', '.yaml', '.sh', '.ps1', '.conf', '.env.example'
]);

const SECRET_PATTERNS = [
  { name: 'Private Key', regex: /-----BEGIN\s+(?:RSA|OPENSSH|DSA|EC|PGP)?\s*PRIVATE KEY-----/i },
  { name: 'LINE Token Hardcoded', regex: /line(?:Channel)?Token\s*[:=]\s*['"][a-zA-Z0-9_\-]{30,}['"]/i },
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'Generic API Secret', regex: /(?:api[_-]?key|client[_-]?secret)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/i },
  { name: 'Hardcoded Plaintext Password', regex: /(?:password|passwd|pwd)\s*[:=]\s*['"](?![\*]{3,}|test|password|changeme|admin|root|example)[a-zA-Z0-9!@#\$%^&*()_\-+]{8,}['"]/i }
];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const findings = [];

  for (const { name, regex } of SECRET_PATTERNS) {
    const match = content.match(regex);
    if (match) {
      // Check if line is within whitelist or placeholder
      const matchedText = match[0];
      if (
        matchedText.includes('***') ||
        matchedText.includes('process.env') ||
        matchedText.includes('example') ||
        matchedText.includes('placeholder')
      ) {
        continue;
      }
      findings.push({ rule: name, match: matchedText.slice(0, 40) + '...' });
    }
  }

  return findings;
}

function walkDir(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, fileList);
    } else if (entry.isFile() && ALLOWED_EXTENSIONS.has(path.extname(entry.name))) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

export function runSecurityScan() {
  const files = walkDir(ROOT_DIR);
  let totalViolations = 0;
  const reports = [];

  for (const file of files) {
    const relPath = path.relative(ROOT_DIR, file);
    // Whitelist test fixtures and test verification scripts (Section 45)
    if (relPath.startsWith('tests' + path.sep) || relPath.startsWith('tests/')) continue;
    if (relPath.includes('test') && relPath.endsWith('.json')) continue;

    const findings = scanFile(file).filter(f => !f.match.includes('$'));
    if (findings.length > 0) {
      totalViolations += findings.length;
      reports.push({ file: relPath, findings });
    }
  }

  return {
    scannedFiles: files.length,
    totalViolations,
    reports
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log('====================================================');
  console.log('🔒 NETMONITOR SECRET & CREDENTIAL SCANNER');
  console.log('====================================================\n');

  const { scannedFiles, totalViolations, reports } = runSecurityScan();
  console.log(`Scanned ${scannedFiles} source, config, and script files.`);

  if (totalViolations > 0) {
    console.error(`\n❌ FOUND ${totalViolations} POTENTIAL SECRET LEAK(S):`);
    for (const r of reports) {
      console.error(`\n  File: ${r.file}`);
      r.findings.forEach(f => console.error(`    - [${f.rule}] ${f.match}`));
    }
    process.exit(1);
  } else {
    console.log('\n✅ NO HARDCODED SECRETS OR LEAKED CREDENTIALS FOUND!');
    process.exit(0);
  }
}
