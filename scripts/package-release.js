#!/usr/bin/env node

/**
 * =============================================================================
 * Automated Release Packager for NetMonitor Enterprise V1.1.0
 * Conforms to Section 32 (Phase 28 — Release Package) of Master Prompt
 * =============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.join(rootDir, 'release');

console.log('====================================================');
console.log('📦 NETMONITOR ENTERPRISE RELEASE PACKAGER (V1.1.0)');
console.log('====================================================');

// Helper to recursively copy directories with exclusion filter
function copyDirRecursive(src, dest, filterFn) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (filterFn && !filterFn(srcPath, entry)) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, filterFn);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 1. Wipe existing release directory if present
if (fs.existsSync(releaseDir)) {
  console.log('[1/5] Removing previous release directory...');
  fs.rmSync(releaseDir, { recursive: true, force: true });
}
fs.mkdirSync(releaseDir, { recursive: true });

// 2. Package App (compiled dist + server backend + package.json)
console.log('[2/5] Packaging application runtime assets (dist & server)...');
const appDir = path.join(releaseDir, 'app');
fs.mkdirSync(appDir, { recursive: true });

// Copy compiled frontend dist
const distSrc = path.join(rootDir, 'dist');
if (!fs.existsSync(distSrc)) {
  console.error('ERROR: dist/ directory not found. Run npm run build first!');
  process.exit(1);
}
copyDirRecursive(distSrc, path.join(appDir, 'dist'));

// Copy server backend (excluding node_modules, logs, data, and sensitive files)
const serverSrc = path.join(rootDir, 'server');
copyDirRecursive(serverSrc, path.join(appDir, 'server'), (filePath, entry) => {
  if (entry.name === 'node_modules') return false;
  if (entry.name === 'data') return false;
  if (entry.name === '.env' || entry.name.endsWith('.env')) return false;
  if (entry.name.endsWith('.log') || entry.name.endsWith('.bak')) return false;
  return true;
});

// Copy server/package.json
fs.copyFileSync(path.join(serverSrc, 'package.json'), path.join(appDir, 'package.json'));

// 3. Package Configurations, Deployments, Scripts, and Docs
console.log('[3/5] Packaging configs, deployment assets, scripts, and documentation...');
copyDirRecursive(path.join(rootDir, 'config'), path.join(releaseDir, 'config'));
copyDirRecursive(path.join(rootDir, 'deploy'), path.join(releaseDir, 'deploy'));
copyDirRecursive(path.join(rootDir, 'docs'), path.join(releaseDir, 'docs'));

// Package scripts (excluding scratch/temp files)
copyDirRecursive(path.join(rootDir, 'scripts'), path.join(releaseDir, 'scripts'), (filePath, entry) => {
  if (entry.name.includes('temp') || entry.name.includes('scratch')) return false;
  return true;
});

// 4. Copy Root Guides and Canonical Environment Example
console.log('[4/5] Copying release metadata, environment specification, and guides...');
const rootFilesToCopy = [
  '.env.example',
  'README.md',
  'INSTALLATION.md',
  'ADMIN_GUIDE.md',
  'DEVELOPER_GUIDE.md',
  'CHANGELOG.md',
  'SECURITY.md'
];

for (const file of rootFilesToCopy) {
  const srcPath = path.join(rootDir, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, path.join(releaseDir, file));
  } else {
    console.warn(`  [WARN] Expected file not found in root: ${file}`);
  }
}

// 5. Verification & Security Audit of the Release Bundle
console.log('[5/5] Auditing release directory for forbidden artifacts...');
const forbiddenPatterns = [
  /node_modules/i,
  /\.git/i,
  /db\.json/i,
  /\.env$/i,
  /\.log$/i,
  /\.bak$/i,
  /\.DS_Store/i
];

let violations = [];
let totalFiles = 0;
let totalBytes = 0;

function auditDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(entry.name)) {
        violations.push(fullPath);
      }
    }
    if (entry.isDirectory()) {
      auditDir(fullPath);
    } else {
      totalFiles++;
      totalBytes += fs.statSync(fullPath).size;
    }
  }
}

auditDir(releaseDir);

if (violations.length > 0) {
  console.error('\n❌ RELEASE BUNDLE AUDIT FAILED! Forbidden files found:');
  violations.forEach(v => console.error(`  - ${v}`));
  process.exit(1);
}

console.log('\n====================================================');
console.log('✅ RELEASE PACKAGE BUILT SUCCESSFULLY!');
console.log(`📁 Target:      ${releaseDir}`);
console.log(`📄 Total Files: ${totalFiles}`);
console.log(`💾 Total Size:  ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
console.log('🛡️ Security:    0 forbidden files (no git, node_modules, or db)');
console.log('====================================================');
