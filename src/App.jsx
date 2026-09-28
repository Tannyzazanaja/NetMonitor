import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import { ToastProvider } from './context/ToastContext';
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
import { GrafanaView } from './components/grafana/GrafanaView';
import { TrafficView } from './components/traffic/TrafficView';
import { ServicesView } from './components/services/ServicesView';
import { AlertsView } from './components/alerts/AlertsView';
import { SettingsView } from './components/settings/SettingsView';
import { AnalyticsView } from './components/analytics/AnalyticsView';

import { DeviceFormModal } from './components/devices/DeviceFormModal';
import { ExportYamlModal } from './components/devices/ExportYamlModal';

function MainApp() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);
  const [editingDeviceIp, setEditingDeviceIp] = useState(null);
  const [prefillDevice, setPrefillDevice] = useState(null);
  const [isExportYamlOpen, setIsExportYamlOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);

  const handleMenuClick = () => {
    if (window.innerWidth <= 768) {
      setIsMobileMenuOpen(true);
    } else {
      setIsDesktopSidebarCollapsed(!isDesktopSidebarCollapsed);
    }
  };

  const handleOpenAdd = (prefill = null) => {
    setEditingDeviceIp(null);
    setPrefillDevice(prefill);
    setIsAddDeviceOpen(true);
  };

  const handleOpenEdit = (ip) => {
    setEditingDeviceIp(ip);
    setPrefillDevice(null);
    setIsAddDeviceOpen(true);
  };

  const handleCloseDeviceModal = () => {
    setIsAddDeviceOpen(false);
    setEditingDeviceIp(null);
    setPrefillDevice(null);
  };

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

          {activeTab === 'grafana' && (
            <GrafanaView />
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

          {activeTab === 'settings' && (
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
