import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import { ToastProvider, useToast } from './context/ToastContext';
import { SettingsProvider } from './context/SettingsContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DeviceProvider } from './context/DeviceContext';
import { TopologyProvider } from './context/TopologyContext';
import { AlertProvider } from './context/AlertContext';

import { Navbar } from './components/common/Navbar';
import { Sidebar } from './components/common/Sidebar';
import { LoginPage } from './components/auth/LoginPage';
import { SetupWizard } from './components/setup/SetupWizard';
import { DashboardView } from './components/dashboard/DashboardView';
import { TopologyView } from './components/topology/TopologyView';
import { DeviceManagerView } from './components/devices/DeviceManagerView';
import { TrafficView } from './components/traffic/TrafficView';
import { ServicesView } from './components/services/ServicesView';
import { AlertsView } from './components/alerts/AlertsView';
import { SettingsView } from './components/settings/SettingsView';
import { AnalyticsView } from './components/analytics/AnalyticsView';

import { DeviceFormModal } from './components/devices/DeviceFormModal';
import { ExportYamlModal } from './components/devices/ExportYamlModal';

function MainApp() {
  const { canEdit, user } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);
  const [editingDeviceIp, setEditingDeviceIp] = useState(null);
  const [prefillDevice, setPrefillDevice] = useState(null);
  const [isExportYamlOpen, setIsExportYamlOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);

  const handleMenuClick = () => {
    if (window.innerWidth <= 768) {
      setIsMobileMenuOpen((prev) => !prev);
    } else {
      setIsDesktopSidebarCollapsed((prev) => !prev);
    }
  };

  const handleOpenAdd = (prefill = null) => {
    if (!canEdit) {
      showToast('error', 'สิทธิ์ไม่เพียงพอ', 'เฉพาะผู้ใช้ระดับ Editor หรือ Admin เท่านั้นที่สามารถเพิ่มอุปกรณ์ได้');
      return;
    }
    setEditingDeviceIp(null);
    setPrefillDevice(prefill);
    setIsAddDeviceOpen(true);
  };

  const handleOpenEdit = (ip) => {
    if (!canEdit) {
      showToast('error', 'สิทธิ์ไม่เพียงพอ', 'เฉพาะผู้ใช้ระดับ Editor หรือ Admin เท่านั้นที่สามารถแก้ไขอุปกรณ์ได้');
      return;
    }
    setEditingDeviceIp(ip);
    setPrefillDevice(null);
    setIsAddDeviceOpen(true);
  };

  const handleCloseDeviceModal = () => {
    setIsAddDeviceOpen(false);
    setEditingDeviceIp(null);
    setPrefillDevice(null);
  };

  // Shared Read-Only Kiosk / Wallboard Mode (เอาแค่หน้า Dashboard อย่างเดียว)
  if (user?.isShared) {
    return (
      <div className="app-container public-wallboard-mode" style={{ minHeight: '100vh', background: 'var(--bg-app)' }}>
        <Navbar isSidebarCollapsed={true} isPublicShared={true} />
        <div className="main-content" style={{ marginLeft: 0, width: '100%', maxWidth: '100%' }}>
          <main className="page-wrapper" style={{ maxWidth: '100%', padding: '24px 32px' }}>
            <DashboardView />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-container ${isDesktopSidebarCollapsed ? 'collapsed-sidebar' : ''}`}>
      {/* Mobile Backdrop Overlay */}
      <div 
        className={`mobile-menu-overlay ${isMobileMenuOpen ? 'active' : ''}`}
        onClick={() => setIsMobileMenuOpen(false)}
      />

      {/* Floating Hamburger Button */}
      <button 
        className="hamburger-btn" 
        onClick={handleMenuClick}
        style={{ 
          position: 'fixed', 
          top: 12, 
          left: isDesktopSidebarCollapsed ? 16 : 196, 
          zIndex: 102,
          transition: 'left 0.3s ease'
        }}
      >
        <Menu size={24} />
      </button>

      {/* Fixed Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => { setActiveTab(tab); setIsMobileMenuOpen(false); }}
        onOpenAddDevice={() => { handleOpenAdd(); setIsMobileMenuOpen(false); }}
        isMobileMenuOpen={isMobileMenuOpen}
        isCollapsed={isDesktopSidebarCollapsed}
      />

      {/* Main Content Area */}
      <div className="main-content">
        <Navbar onMenuClick={handleMenuClick} isSidebarCollapsed={isDesktopSidebarCollapsed} />

        <main className="page-wrapper">
          {activeTab === 'dashboard' && (
            <DashboardView
              onSelectTab={setActiveTab}
              onOpenAddDevice={() => handleOpenAdd()}
              onOpenEditDevice={handleOpenEdit}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsView />
          )}

          {activeTab === 'topology' && (
            <TopologyView
              onOpenAddDevice={handleOpenAdd}
              onOpenEditDevice={handleOpenEdit}
            />
          )}

          {activeTab === 'devices' && (
            <DeviceManagerView
              onOpenAddDevice={() => handleOpenAdd()}
              onOpenEditDevice={handleOpenEdit}
              onOpenExportYaml={() => setIsExportYamlOpen(true)}
            />
          )}

          {activeTab === 'traffic' && (
            <TrafficView />
          )}

          {activeTab === 'services' && (
            <ServicesView />
          )}

          {activeTab === 'alerts' && (
            <AlertsView />
          )}

          {activeTab === 'settings' && !user?.isShared && (
            <SettingsView />
          )}
        </main>
      </div>

      {/* Global Modals */}
      <DeviceFormModal
        isOpen={isAddDeviceOpen}
        onClose={handleCloseDeviceModal}
        initialIp={editingDeviceIp}
        initialData={prefillDevice}
      />

      <ExportYamlModal
        isOpen={isExportYamlOpen}
        onClose={() => setIsExportYamlOpen(false)}
      />
    </div>
  );
}

function AuthenticatedProviders({ children }) {
  const { isAuthenticated, user, refreshSession } = useAuth();
  const [setupStatus, setSetupStatus] = React.useState({ checked: false, isConfigured: true });

  React.useEffect(() => {
    fetch('/api/setup/status')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.success) {
          setSetupStatus({ checked: true, isConfigured: Boolean(data.isConfigured) });
        } else {
          setSetupStatus({ checked: true, isConfigured: true });
        }
      })
      .catch(() => {
        setSetupStatus({ checked: true, isConfigured: true });
      });
  }, []);

  const handleSetupComplete = async () => {
    setSetupStatus({ checked: true, isConfigured: true });
    if (refreshSession) {
      await refreshSession();
    }
    window.location.reload();
  };

  if (setupStatus.checked && !setupStatus.isConfigured) {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  // Use key to force unmount/remount of contexts when auth state changes.
  // This guarantees that all contexts fetch fresh data after login, and clears data on logout.
  const authKey = isAuthenticated ? `user-${user?.username}` : 'guest';

  if (!isAuthenticated) {
    return (
      <SettingsProvider key={authKey}>
        <LoginPage />
      </SettingsProvider>
    );
  }

  return (
    <SettingsProvider key={authKey}>
      <DeviceProvider>
        <TopologyProvider>
          <AlertProvider>
            {children}
          </AlertProvider>
        </TopologyProvider>
      </DeviceProvider>
    </SettingsProvider>
  );
}

function AppContent() {
  return (
    <AuthenticatedProviders>
      <MainApp />
    </AuthenticatedProviders>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
}
