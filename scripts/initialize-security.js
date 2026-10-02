#!/usr/bin/env node
/**
 * Security Credentials & Secret Initialization Engine
 * Phase 4 / Section 17 Specification
 *
 * Implements idempotent PBKDF2 password hashing with cryptographically unique salts.
 * Eliminates default plaintext passwords from data storage.
 *
 * Precedence:
 * 1. Environment Variable: EMERGENCY_PASSWORD / NETMON_EMERGENCY_PASSWORD
 * 2. Existing database hash (Idempotent: preserves current credentials)
 * 3. Existing plaintext emergencyPassword (migrated to PBKDF2 hash + salt)
 * 4. Secure Random Bootstrap Generation (First install)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dbFile = path.join(rootDir, 'data', 'db.json');

const force = process.argv.includes('--force') || process.argv.includes('-f');

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(String(password), String(salt), 100000, 64, 'sha512').toString('hex');
}

function runInitialization() {
  console.log('====================================================');
  console.log('🔒 NetMonitor Security Credential Initialization');
  console.log('====================================================\n');

  if (!fs.existsSync(dbFile)) {
    console.error(`[Error] Database file not found at: ${dbFile}`);
    process.exit(1);
  }

  let db;
  try {
    const raw = fs.readFileSync(dbFile, 'utf8');
    db = JSON.parse(raw);
  } catch (err) {
    console.error(`[Error] Failed to read database JSON: ${err.message}`);
    process.exit(1);
  }

  if (!db.settings) db.settings = {};

  const existingHash = db.settings.emergencyPasswordHash;
  const existingSalt = db.settings.emergencyPasswordSalt;

  if (existingHash && existingSalt && !force) {
    console.log('✅ Security credentials already initialized (PBKDF2 SHA-512).');
    console.log(`- Emergency Username: "${db.settings.emergencyUsername || 'emergency'}"`);
    console.log(`- Salt length: ${existingSalt.length} hex chars`);
    console.log(`- Hash length: ${existingHash.length} hex chars`);
    console.log('- Plaintext password in DB: None (Compliant)');
    console.log('\n[Info] No changes made (Operation is idempotent). Use --force to re-initialize.');
    process.exit(0);
  }

  // Determine credential source
  let rawPassword = '';
  let source = '';

  const envPass = process.env.EMERGENCY_PASSWORD || process.env.NETMON_EMERGENCY_PASSWORD;
  if (envPass && envPass.trim().length >= 6) {
    rawPassword = envPass.trim();
    source = 'Environment Variable';
  } else if (db.settings.emergencyPassword && String(db.settings.emergencyPassword).trim() !== '***') {
    rawPassword = String(db.settings.emergencyPassword).trim();
    source = 'Migrated from Legacy Plaintext DB';
  } else {
    // Generate secure 16-character alphanumeric password
    rawPassword = crypto.randomBytes(12).toString('base64url');
    source = 'Cryptographically Generated Random Secret';
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(rawPassword, salt);

  db.settings.emergencyPasswordHash = hash;
  db.settings.emergencyPasswordSalt = salt;
  db.settings.emergencyUsername = db.settings.emergencyUsername || process.env.EMERGENCY_USERNAME || 'emergency';

  // Completely eliminate plaintext password from database
  delete db.settings.emergencyPassword;

  // Atomic write
  const tempFile = `${dbFile}.tmp.${Date.now()}`;
  try {
    fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tempFile, dbFile);
  } catch (err) {
    console.error(`[Error] Failed writing database file: ${err.message}`);
    process.exit(1);
  }

  console.log(`🎉 Security Credentials Initialized Successfully!`);
  console.log(`- Source: ${source}`);
  console.log(`- Emergency Username: "${db.settings.emergencyUsername}"`);
  console.log(`- Algorithm: PBKDF2 (SHA-512, 100,000 iterations)`);
  console.log(`- Salt: ${salt.slice(0, 8)}... (${salt.length} chars)`);
  console.log(`- Hash: ${hash.slice(0, 16)}... (${hash.length} chars)`);

  if (source === 'Cryptographically Generated Random Secret') {
    console.log('\n====================================================');
    console.log('⚠️  IMPORTANT: INITIAL EMERGENCY BREAK-GLASS CREDENTIALS');
    console.log('====================================================');
    console.log(`Username: ${db.settings.emergencyUsername}`);
    console.log(`Password: ${rawPassword}`);
    console.log('Please record this password securely. It will not be shown again.');
    console.log('====================================================\n');
  } else {
    console.log('\n✅ Plaintext password removed from database storage.');
  }

  process.exit(0);
}

runInitialization();
