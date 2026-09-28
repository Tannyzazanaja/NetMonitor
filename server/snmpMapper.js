/**
 * Central SNMP Module & Auth Mapping Engine
 * Single Source of Truth for mapping Vendors, Hardware Models, sysObjectID,
 * and Community Strings to validated Prometheus SNMP Exporter modules and auth profiles.
 */

// Supported and verified modules in snmp.yml
const VALID_SNMP_MODULES = [
  'if_mib',         // Universal standard interfaces + LLDP + CDP
  'cisco_switch',   // Cisco Catalyst/IOS-XE (Interfaces + LLDP/CDP + CPU + Memory)
  'cisco_basic',    // Lightweight Cisco CPU & Memory only
  'cisco_device',   // Cisco Environmental + Hardware Sensors
  'cisco_wlc',      // Cisco Wireless Controller
  'aruba_switch',   // HP/Aruba 2530/ProCurve/ArubaOS-S (Interfaces + LLDP + CPU + Memory)
  'host_resources', // Host Resources RFC 2790 (CPU + Memory/Storage) for Servers/Linux/Ruckus
  'synology',       // Synology NAS Storage & System
  'apcups',         // APC UPS Power & Battery
  'lldp_cdp',       // Topology Neighbors only
];

// Valid auth profiles defined in snmp.yml
const VALID_AUTH_PROFILES = [
  'seavl77_v2',     // SNMPv2c with community: seavl77
  'public_v2',      // SNMPv2c with community: public
  'public_v1',      // SNMPv1 with community: public
];

// Community string to Auth Profile translation map
const COMMUNITY_TO_AUTH_MAP = {
  'seavl77': 'seavl77_v2',
  'seavl77_v2': 'seavl77_v2',
  'public': 'public_v2',
  'public_v2': 'public_v2',
  'public_v1': 'public_v1',
};

// Vendor to SNMP Exporter module mapping
const VENDOR_TO_MODULE_MAP = {
  'cisco': 'cisco_switch',
  'cisco systems': 'cisco_switch',
  'cisco catalyst': 'cisco_switch',
  'aruba': 'aruba_switch',
  'hpe': 'aruba_switch',
  'hp': 'aruba_switch',
  'hewlett packard': 'aruba_switch',
  'procurve': 'aruba_switch',
  'ruckus': 'if_mib',
  'brocade': 'if_mib',
  'fastiron': 'if_mib',
  'huawei': 'if_mib',
  'ruijie': 'if_mib',
  'reyee': 'if_mib',
  'mikrotik': 'if_mib',
  'ubiquiti': 'if_mib',
  'synology': 'synology',
  'apc': 'apcups',
  'linux': 'host_resources',
  'windows': 'host_resources',
};

/**
 * Resolves the appropriate SNMP Exporter module for a device.
 * Enforces that only existing, verified module names from snmp.yml are returned.
 */
function resolveDeviceModule(dev = {}) {
  const explicitMod = (dev.module || '').trim();

  // If already an explicitly configured valid module, use it
  if (explicitMod && VALID_SNMP_MODULES.includes(explicitMod)) {
    return explicitMod;
  }

  // Handle legacy scanner / typo mappings (e.g. 'cisco' -> 'cisco_switch')
  if (explicitMod && VENDOR_TO_MODULE_MAP[explicitMod.toLowerCase()]) {
    return VENDOR_TO_MODULE_MAP[explicitMod.toLowerCase()];
  }

  // Check sysObjectID prefix if present
  const sysObjId = (dev.sysObjectID || dev.sysObjId || '').trim();
  if (sysObjId) {
    if (sysObjId.startsWith('1.3.6.1.4.1.9.')) {
      // Cisco
      const descr = (dev.sysDescr || '').toLowerCase();
      if (descr.includes('wireless') || descr.includes('wlc')) return 'cisco_wlc';
      return 'cisco_switch';
    }
    if (sysObjId.startsWith('1.3.6.1.4.1.11.') || sysObjId.startsWith('1.3.6.1.4.1.47196.')) {
      // HP / Aruba ProCurve
      return 'aruba_switch';
    }
    if (sysObjId.startsWith('1.3.6.1.4.1.6574.')) {
      // Synology
      return 'synology';
    }
    if (sysObjId.startsWith('1.3.6.1.4.1.318.')) {
      // APC UPS
      return 'apcups';
    }
  }

  // Check Vendor name
  const vendor = (dev.vendor || '').toLowerCase().trim();
  if (vendor && VENDOR_TO_MODULE_MAP[vendor]) {
    return VENDOR_TO_MODULE_MAP[vendor];
  }

  // Check Model / OS / Name keywords
  const text = `${dev.model || ''} ${dev.os || ''} ${dev.name || ''} ${dev.sysDescr || ''}`.toLowerCase();
  if (/\b(catalyst|c9\d{3}|c3\d{3}|c2\d{3}|ws-c|ios-xe|cisco)\b/.test(text)) {
    return 'cisco_switch';
  }
  if (/\b(procurve|aruba|2530|2920|2930|5400|hp|hpe)\b/.test(text)) {
    return 'aruba_switch';
  }
  if (/\b(synology|diskstation|nas)\b/.test(text)) {
    return 'synology';
  }
  if (/\b(apcups|smart-ups|back-ups)\b/.test(text)) {
    return 'apcups';
  }
  if (/\b(server|linux|ubuntu|debian|rhel|centos|windows)\b/.test(text)) {
    return 'host_resources';
  }

  // Default universal safe fallback (Interfaces + LLDP + CDP)
  return 'if_mib';
}

/**
 * Resolves a community string or auth input to an authorized SNMP Exporter auth profile name.
 * Frontend does not need to know plaintext community strings.
 */
function resolveAuthProfile(communityOrAuth, defaultProfile = 'seavl77_v2') {
  if (!communityOrAuth || typeof communityOrAuth !== 'string') {
    return defaultProfile;
  }
  const clean = communityOrAuth.trim();
  if (VALID_AUTH_PROFILES.includes(clean)) {
    return clean;
  }
  if (COMMUNITY_TO_AUTH_MAP[clean.toLowerCase()]) {
    return COMMUNITY_TO_AUTH_MAP[clean.toLowerCase()];
  }
  return defaultProfile;
}

module.exports = {
  VALID_SNMP_MODULES,
  VALID_AUTH_PROFILES,
  COMMUNITY_TO_AUTH_MAP,
  VENDOR_TO_MODULE_MAP,
  resolveDeviceModule,
  resolveAuthProfile,
};
