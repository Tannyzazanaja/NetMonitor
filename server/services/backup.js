/**
 * server/services/backup.js
 * Database Backup and Atomic Restore Service
 *
 * Implements Section 49 (Phase 49) of Master Development Prompt:
 * - Preserves atomic JSON database architecture
 * - Generates clean, reproducible backups without transient cache or session state
 * - Schema validation before atomic database restoration
 */

const crypto = require('crypto');

function createDatabaseBackup(db, metadata = {}) {
  if (!db || typeof db !== 'object') {
    throw new Error('Invalid database object provided for backup');
  }

  const cleanDevices = Array.isArray(db.devices) ? JSON.parse(JSON.stringify(db.devices)) : [];
  const cleanSettings = db.settings ? JSON.parse(JSON.stringify(db.settings)) : {};
  const cleanTopology = db.topology ? JSON.parse(JSON.stringify(db.topology)) : { nodes: [], edges: [], positions: {} };
  const cleanAlerts = Array.isArray(db.alerts) ? JSON.parse(JSON.stringify(db.alerts)) : [];
  const cleanDeletedIps = Array.isArray(db.deletedIps) ? [...db.deletedIps] : [];

  // Exclude transient runtime states
  const backupData = {
    schemaVersion: '1.1.0',
    exportTimestamp: new Date().toISOString(),
    metadata: {
      generator: 'NetMonitor Enterprise V1.1',
      ...metadata
    },
    data: {
      devices: cleanDevices,
      settings: cleanSettings,
      topology: cleanTopology,
      alerts: cleanAlerts,
      deletedIps: cleanDeletedIps
    }
  };

  const payloadString = JSON.stringify(backupData.data);
  backupData.checksum = crypto.createHash('sha256').update(payloadString).digest('hex');

  return backupData;
}

function validateBackupPayload(backupPayload) {
  if (!backupPayload || typeof backupPayload !== 'object') {
    return { valid: false, error: 'Backup payload must be a valid JSON object' };
  }

  const data = backupPayload.data || backupPayload;

  if (!Array.isArray(data.devices)) {
    return { valid: false, error: "Invalid backup format: 'devices' must be an array" };
  }

  if (!data.settings || typeof data.settings !== 'object') {
    return { valid: false, error: "Invalid backup format: 'settings' must be an object" };
  }

  // Validate checksum if provided
  if (backupPayload.checksum && backupPayload.data) {
    const computed = crypto.createHash('sha256').update(JSON.stringify(backupPayload.data)).digest('hex');
    if (computed !== backupPayload.checksum) {
      return { valid: false, error: 'Backup checksum mismatch: data may be corrupted or modified' };
    }
  }

  return { valid: true, cleanData: data };
}

function restoreDatabaseFromBackup(backupPayload, existingDb = {}) {
  const validation = validateBackupPayload(backupPayload);
  if (!validation.valid) {
    throw new Error(`Backup restoration rejected: ${validation.error}`);
  }

  const restored = validation.cleanData;

  return {
    devices: restored.devices || [],
    settings: {
      ...(existingDb.settings || {}),
      ...(restored.settings || {})
    },
    topology: restored.topology || { nodes: [], edges: [], positions: {} },
    topologyPositions: restored.topology?.positions || existingDb.topologyPositions || {},
    alerts: restored.alerts || [],
    deletedIps: restored.deletedIps || []
  };
}

module.exports = {
  createDatabaseBackup,
  validateBackupPayload,
  restoreDatabaseFromBackup
};
