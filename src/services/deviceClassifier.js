/**
 * Device Classifier & OS / Model Detection Engine
 * Accurately fingerprints network infrastructure, servers, and endpoint devices
 */

export const NODE_TYPES = {
  L3_SWITCH: 'L3 Switch',
  L2_SWITCH: 'L2 Switch',
  ROUTER: 'Router',
  FIREWALL: 'Firewall',
  WIRELESS_CONTROLLER: 'Wireless Controller',
  ACCESS_POINT: 'Access Point',
  SERVER: 'Server',
  UNKNOWN: 'Unknown',
  // Backward-compatible aliases
  CORE_SWITCH: 'L3 Switch',
  DISTRIBUTION_SWITCH: 'L3 Switch',
  ACCESS_SWITCH: 'L2 Switch',
};

export const EDGE_TYPES = {
  LLDP: 'LLDP',
  CDP: 'CDP',
  MANUAL: 'Manual',
  DISCOVERED: 'Discovered',
};

export function getNodeTypeMetadata(nodeType) {
  switch (nodeType) {
    case NODE_TYPES.L3_SWITCH:
    case 'Core Switch':
    case 'Distribution Switch':
      return { icon: '👑', label: 'L3 Switch', tier: 1, color: '#f59e0b', bg: '#241a0d' };
    case NODE_TYPES.L2_SWITCH:
    case 'Access Switch':
      return { icon: '🔀', label: 'L2 Switch', tier: 3, color: '#00d4ff', bg: '#0c1527' };
    case NODE_TYPES.ROUTER:
      return { icon: '🌐', label: 'Router', tier: 0, color: '#a855f7', bg: '#240c38' };
    case NODE_TYPES.FIREWALL:
      return { icon: '🛡️', label: 'Firewall', tier: 0, color: '#ef4444', bg: '#1f131d' };
    case NODE_TYPES.WIRELESS_CONTROLLER:
      return { icon: '🎛️', label: 'Wireless Controller', tier: 2, color: '#ec4899', bg: '#2f0d22' };
    case NODE_TYPES.ACCESS_POINT:
      return { icon: '📡', label: 'Access Point', tier: 4, color: '#10b981', bg: '#06291e' };
    case NODE_TYPES.SERVER:
      return { icon: '🖥️', label: 'Server', tier: 4, color: '#6366f1', bg: '#181a3a' };
    default:
      return { icon: '❓', label: 'Unknown', tier: 4, color: '#94a3b8', bg: '#172033' };
  }
}

export function detectOSAndType(dev) {
  const name     = (dev.name || dev.sysName || dev.label || '').toLowerCase();
  const descr    = (dev.sysDescr || dev.descr || '').toLowerCase();
  const modelIn  = (dev.model || dev.platform || '').toLowerCase();
  const raw      = (dev.raw || `${name} ${descr} ${modelIn}`).toLowerCase();
  const explicit = (dev.type || '').toLowerCase();

  // Helper to extract specific model numbers
  let extractedModel = dev.model || dev.platform || '';
  if (!extractedModel) {
    const ciscoModelMatch = raw.match(/\b(c9\d{3}[a-z0-9\-]*|c3\d{3}[a-z0-9\-]*|c2\d{3}[a-z0-9\-]*|ws-c\d{4}[a-z0-9\-]*|n9k-[a-z0-9\-]+|catalyst\s*\d+)\b/i);
    const fortiModelMatch = raw.match(/\b(fortigate-?\w+|fg-?\w+|fortiwifi-?\w+)\b/i);
    const fanvilModelMatch = raw.match(/\b(v61g|v62g|v64g|v65g|x3s|x4u|x5u|x6u|x7c|x210)\b/i);
    const ruijieModelMatch = raw.match(/\b(rg-rap\w+|rg-nbs\w+|rg-es\w+|rap\d+)\b/i);
    const arubaModelMatch = raw.match(/\b(aruba\s*\d{4}\w*|cx\s*\d{4}\w*|procurve\s*\w+|2930f|6300m|8320|8400)\b/i);
    const ruckusModelMatch = raw.match(/\b(icx\s*\d{4}\w*|zoneflex\w*|unleashed|r\d{3})\b/i);
    const dellModelMatch = raw.match(/\b(s4128\w*|s5248\w*|n3048\w*|n1548\w*)\b/i);

    if (fanvilModelMatch) extractedModel = fanvilModelMatch[0].toUpperCase();
    else if (fortiModelMatch) extractedModel = fortiModelMatch[0];
    else if (ciscoModelMatch) extractedModel = ciscoModelMatch[0].toUpperCase();
    else if (ruijieModelMatch) extractedModel = ruijieModelMatch[0].toUpperCase();
    else if (arubaModelMatch) extractedModel = arubaModelMatch[0];
    else if (ruckusModelMatch) extractedModel = ruckusModelMatch[0].toUpperCase();
    else if (dellModelMatch) extractedModel = dellModelMatch[0].toUpperCase();
  }

  // 1. Firewall / Security Gateway
  if (
    explicit === 'firewall' ||
    /\b(fortigate|fortios|fg-\d+|fg\d+)\b/.test(raw) ||
    /\b(palo alto|pan-os|pa-\d+)\b/.test(raw) ||
    /\b(cisco asa|adaptive security appliance|firepower|ftd)\b/.test(raw) ||
    /\b(pfsense|opnsense|checkpoint|sophos|watchguard|srx)\b/.test(raw) ||
    (/\b(fw|firewall|gate)\b/.test(name) && !/switch|sw\d+/i.test(name))
  ) {
    let vendor = 'Security Gateway';
    let os = 'Security OS';
    if (raw.includes('forti')) { vendor = 'Fortinet'; os = 'FortiOS'; if (!extractedModel) extractedModel = 'FortiGate'; }
    else if (raw.includes('palo') || raw.includes('pan-os')) { vendor = 'Palo Alto'; os = 'PAN-OS'; if (!extractedModel) extractedModel = 'PA-Series'; }
    else if (raw.includes('asa') || raw.includes('cisco')) { vendor = 'Cisco'; os = 'Cisco ASA'; if (!extractedModel) extractedModel = 'ASA Firewall'; }
    else if (raw.includes('pfsense')) { vendor = 'Netgate'; os = 'pfSense'; if (!extractedModel) extractedModel = 'pfSense Appliance'; }
    else if (raw.includes('sophos')) { vendor = 'Sophos'; os = 'SFOS'; if (!extractedModel) extractedModel = 'XGS Series'; }

    return {
      type: 'firewall',
      nodeType: NODE_TYPES.FIREWALL,
      category: 'network',
      vendor,
      model: extractedModel,
      os,
      isFirewall: true,
      isCore: false,
      isNetwork: true,
      label: '🛡️ Firewall / Gateway',
    };
  }

  // 2. Wireless Controller (WLC)
  if (
    explicit === 'controller' || explicit === 'wlc' ||
    /\b(wlc|wireless controller|mobility controller|smartzone|zonedirector|catalyst 9800|c9800)\b/.test(raw) ||
    /\b(wlc|controller)\b/.test(name)
  ) {
    let vendor = 'Cisco';
    let os = 'Wireless Controller OS';
    if (/aruba/.test(raw)) { vendor = 'Aruba'; os = 'ArubaOS'; }
    else if (/ruckus|smartzone|zonedirector/.test(raw)) { vendor = 'Ruckus'; os = 'SmartZone OS'; }
    else if (/cisco|c9800|catalyst/.test(raw)) { vendor = 'Cisco'; os = 'Cisco IOS-XE Wireless'; }

    return {
      type: 'other',
      nodeType: NODE_TYPES.WIRELESS_CONTROLLER,
      category: 'network',
      vendor,
      model: extractedModel || 'Wireless Controller',
      os,
      isFirewall: false,
      isCore: false,
      isNetwork: true,
      label: '🎛️ Wireless Controller',
    };
  }

  // 3. Wireless Access Point (AP)
  if (
    explicit === 'ap' || explicit === 'accesspoint' ||
    ((/\b(ap|wap|cap|access point|aironet|catalyst 9100|catalyst 91\d{2}|c91\d{2}|unifi ap|uap|iap|aruba ap|reyee ap|rg-rap|zoneflex|unleashed|r3\d{2}|r5\d{2}|r6\d{2}|r7\d{2}|r8\d{2})\b/.test(raw) ||
      (/\b(ap|wap)\b/.test(name))) && !/\b(icx|switch|sw|core|dist)\b/i.test(raw))
  ) {
    let apVendor = 'Cisco';
    if (raw.includes('unifi') || raw.includes('uap') || raw.includes('ubiquiti')) apVendor = 'Ubiquiti';
    else if (raw.includes('aruba') || raw.includes('iap')) apVendor = 'Aruba';
    else if (raw.includes('reyee') || raw.includes('ruijie') || raw.includes('rg-')) apVendor = 'Ruijie';
    else if (raw.includes('ruckus') || raw.includes('zoneflex') || raw.includes('unleashed')) apVendor = 'Ruckus';
    else if (raw.includes('hpe') || raw.includes('hp')) apVendor = 'HPE';

    return {
      type: 'other',
      nodeType: NODE_TYPES.ACCESS_POINT,
      category: 'network',
      vendor: apVendor,
      model: extractedModel || 'Wireless AP',
      os: 'Access Point OS',
      isFirewall: false,
      isCore: false,
      isNetwork: true,
      label: '📡 Access Point',
    };
  }

  // 4. Layer 3 Switch (Core / Distribution / Multi-Layer Routing Switch)
  if (
    explicit === 'l3switch' || explicit === 'coreswitch' || explicit === 'core' || explicit === 'distswitch' || explicit === 'dist' ||
    /\b(core|coresw|c-sw|core-switch|backbone|dist|d-sw|dist-switch|agg|aggregation|center|nexus|c9500|c9600|c6500|c6800|c4500|c3850|c3650|c9300|s5735|s6720|8320|8400|5406r|6300|6300m|icx 7850|icx 7750|icx 7650|icx 7450)\b/.test(name) ||
    (/\b(nexus|n9k|n7k|n5k|c9500|c9600|c9300|8400|8320|6300m|icx 7850|icx 7650)\b/.test(raw) && !/access/i.test(name))
  ) {
    let vendor = 'Cisco';
    let os = 'Cisco IOS-XE / NX-OS';
    if (/aruba|cx 8|8320|8400|6300|procurve 54/.test(raw)) { vendor = 'Aruba'; os = 'AOS-CX'; }
    else if (/ruckus|icx/.test(raw)) { vendor = 'Ruckus'; os = 'FastIron'; }
    else if (/hpe|hp |comware|flexnetwork/.test(raw)) { vendor = 'HPE'; os = 'Comware OS'; }
    else if (/huawei|s6720|s5735/.test(raw)) { vendor = 'Huawei'; os = 'VRP'; }

    const isCore = /\b(core|coresw|backbone|nexus|c9500|c9600|8400|8320|7850)\b/i.test(name || raw);

    return {
      type: 'l3switch',
      nodeType: NODE_TYPES.L3_SWITCH,
      category: 'network',
      vendor,
      model: extractedModel || (vendor === 'Cisco' ? 'Catalyst L3' : `${vendor} L3 Switch`),
      os,
      isFirewall: false,
      isCore,
      isNetwork: true,
      label: '👑 L3 Switch',
    };
  }

  // 5. WAN Router / Border Gateway
  if (
    explicit === 'router' ||
    /\b(router|rt|rtr|wan|border|edge|isr|asr|routeros|bng|ccr)\b/.test(raw)
  ) {
    let vendor = 'Cisco';
    let os = 'Cisco IOS-XE';
    if (/mikrotik|routeros|ccr/.test(raw)) { vendor = 'MikroTik'; os = 'RouterOS'; }
    else if (/juniper|srx|mx/.test(raw)) { vendor = 'Juniper'; os = 'Junos'; }

    return {
      type: 'router',
      nodeType: NODE_TYPES.ROUTER,
      category: 'network',
      vendor,
      model: extractedModel || (vendor === 'MikroTik' ? 'RouterBOARD' : 'Cisco Router'),
      os,
      isFirewall: false,
      isCore: false,
      isNetwork: true,
      label: '🌐 Router',
    };
  }

  // 6. Layer 2 Switch (Access / Wiring Closet / LAN Switch)
  if (
    explicit === 'switch' || explicit === 'accessswitch' || explicit === 'l2switch' ||
    /\b(catalyst|c1000|c1200|c1300|c2960|c3560|c9200|edgeswitch|procurve|arubaos-s|cx 6000|cx 6100|2930f|h3c|vrp|comware|officeconnect|1920s|1950|1820|flexnetwork|icx 7150|icx 7250)\b/.test(raw) ||
    (/\b(switch|sw|poe|lan)\b/.test(raw) && /\b(hpe|aruba|cisco|ruckus|huawei)\b/.test(raw)) ||
    /\b(sw|switch|acc-sw|access-sw|poe-sw|idf)\b/.test(name)
  ) {
    let vendor = 'Cisco';
    let os = 'Cisco IOS';
    if (/huawei|vrp|s5700|s2700/.test(raw)) { vendor = 'Huawei'; os = 'Huawei VRP'; }
    else if (/aruba|cx 6|2930f|procurve|hp |hpe/.test(raw)) {
      vendor = /aruba/.test(raw) ? 'Aruba' : 'HPE';
      os = /cx/.test(raw) ? 'AOS-CX' : 'ArubaOS-S / ProCurve';
    }
    else if (/mikrotik|routeros|switchos/.test(raw)) { vendor = 'MikroTik'; os = 'RouterOS / SwOS'; }
    else if (/ubiquiti|unifi|edgeswitch/.test(raw)) { vendor = 'Ubiquiti'; os = 'EdgeOS'; }
    else if (/ruijie|reyee/.test(raw)) { vendor = 'Ruijie'; os = 'RGOS'; }
    else if (/ruckus|icx|fastiron/.test(raw)) { vendor = 'Ruckus'; os = 'FastIron'; }

    return {
      type: 'l2switch',
      nodeType: NODE_TYPES.L2_SWITCH,
      category: 'network',
      vendor,
      model: extractedModel || 'L2 Switch',
      os,
      isFirewall: false,
      isCore: false,
      isNetwork: true,
      label: '🔀 L2 Switch',
    };
  }

  // 7. Server / Hypervisor
  if (
    explicit === 'server' ||
    /\b(server|proxmox|pve|esxi|vmware|hyper-v|ubuntu|debian|centos|redhat|rhel|windows server|linux)\b/.test(raw)
  ) {
    let os = 'Linux / Server';
    if (raw.includes('proxmox') || raw.includes('pve')) os = 'Proxmox VE';
    else if (raw.includes('esxi') || raw.includes('vmware')) os = 'VMware ESXi';
    else if (raw.includes('ubuntu')) os = 'Ubuntu Linux';
    else if (raw.includes('windows')) os = 'Windows Server';

    return {
      type: 'other',
      nodeType: NODE_TYPES.SERVER,
      category: 'server',
      vendor: 'Server Host',
      model: extractedModel || 'Server Host',
      os,
      isFirewall: false,
      isCore: false,
      isNetwork: false,
      label: '🖥️ Server',
    };
  }

  // 9. VoIP / IP Phone
  if (
    explicit === 'phone' || explicit === 'voip' ||
    /\b(voip|phone|ipphone|v61g|v62g|v64g|v65g|x3s|x4u|fanvil|yealink|t46u|t48u|grandstream|cisco 78|cisco 88|cp-)\b/.test(raw)
  ) {
    let vendor = 'Fanvil';
    if (/yealink|t46|t48/.test(raw)) vendor = 'Yealink';
    else if (/grandstream/.test(raw)) vendor = 'Grandstream';
    else if (/cisco|cp-/.test(raw)) vendor = 'Cisco';
    else if (/v61g|v62g|v64g|v65g|x3s|x4u|fanvil/.test(raw)) vendor = 'Fanvil';

    return {
      type: 'other',
      nodeType: NODE_TYPES.UNKNOWN,
      category: 'endpoint',
      vendor,
      model: extractedModel || (vendor === 'Fanvil' ? 'V61G' : 'IP Phone'),
      os: 'VoIP Phone OS',
      isFirewall: false,
      isCore: false,
      isNetwork: false,
      label: '📞 IP Phone',
    };
  }

  // Endpoints (Computer, Printer, Camera)
  if (explicit === 'computer' || /\b(pc|laptop|workstation|desktop|imac|macbook)\b/.test(name)) {
    return { type: 'other', nodeType: NODE_TYPES.UNKNOWN, category: 'endpoint', vendor: 'Client', model: extractedModel || 'PC / Workstation', os: 'Workstation OS', isFirewall: false, isCore: false, isNetwork: false, label: '💻 Computer' };
  }
  if (explicit === 'printer' || /\b(printer|mfp|canon|hp laserjet|epson|ricoh|xerox)\b/.test(raw)) {
    return { type: 'other', nodeType: NODE_TYPES.UNKNOWN, category: 'endpoint', vendor: 'Printer', model: extractedModel || 'Network Printer', os: 'Printer OS', isFirewall: false, isCore: false, isNetwork: false, label: '🖨️ Printer' };
  }
  if (explicit === 'camera' || /\b(camera|cctv|ipcam|nvr|dvr|hikvision|dahua|axis)\b/.test(raw)) {
    return { type: 'other', nodeType: NODE_TYPES.UNKNOWN, category: 'endpoint', vendor: 'Surveillance', model: extractedModel || 'IP Camera', os: 'IP Camera OS', isFirewall: false, isCore: false, isNetwork: false, label: '📹 Camera' };
  }

  // Default fallback based on category
  return {
    type: explicit || 'switch',
    nodeType: NODE_TYPES.UNKNOWN,
    category: ['switch', 'firewall', 'router', 'ap', 'coreswitch', 'distswitch'].includes(explicit) ? 'network' : 'endpoint',
    vendor: 'Network Device',
    model: extractedModel || 'SNMP Device',
    os: 'SNMP Device',
    isFirewall: false,
    isCore: false,
    isNetwork: true,
    label: '🔌 Unknown Device',
  };
}

export function isInfrastructureDevice(dev) {
  if (!dev) return false;
  const p = detectOSAndType(dev);
  return [
    NODE_TYPES.L3_SWITCH,
    NODE_TYPES.L2_SWITCH,
    NODE_TYPES.CORE_SWITCH,
    NODE_TYPES.DISTRIBUTION_SWITCH,
    NODE_TYPES.ACCESS_SWITCH,
    NODE_TYPES.ROUTER,
    NODE_TYPES.FIREWALL,
    NODE_TYPES.WIRELESS_CONTROLLER,
    NODE_TYPES.ACCESS_POINT,
    'switch', 'coreswitch', 'distswitch', 'firewall', 'router', 'ap', 'l3switch', 'l2switch'
  ].includes(p.nodeType) || ['switch', 'coreswitch', 'distswitch', 'firewall', 'router', 'ap', 'l3switch', 'l2switch'].includes(p.type);
}
