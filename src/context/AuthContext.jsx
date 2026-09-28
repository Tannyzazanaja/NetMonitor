import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthService } from '../services/authService';
import { useToast } from './ToastContext';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();

  const isAuthenticated = !!user;
  const isAdmin = user?.role === 'Admin' || user?.isGrafanaAdmin;
  const isEditor = user?.role === 'Editor' || user?.role === 'Operator' || isAdmin;
  const canEdit = isEditor;

  const logout = useCallback((reason = null) => {
    AuthService.logout();
    setUser(null);
    if (reason === 'timeout') {
      showToast('warning', 'เซสชันหมดอายุ (Session Timeout)', 'ไม่มีการใช้งานเกิน 1 ชั่วโมง ระบบได้ทำการออกจากระบบโดยอัตโนมัติเพื่อความปลอดภัย');
    } else {
      showToast('info', 'ออกจากระบบแล้ว', 'คุณได้ออกจากระบบ NetMonitor เรียบร้อย');
    }
  }, [showToast]);

  useEffect(() => {
    AuthService.fetchSession().then(u => {
      setUser(u);
      setIsInitializing(false);
    });
  }, []);

  // Inactivity tracking & Keep-Alive listener
  useEffect(() => {
    if (!isAuthenticated) return;

    let lastTouch = Date.now();
    const handleActivity = () => {
      const now = Date.now();
      // Throttle updating localStorage to once every 15 seconds
      if (now - lastTouch > 15000) {
        lastTouch = now;
        AuthService.touchSession();
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));

    // Periodic check every 30 seconds for 1-hour inactivity timeout
    const interval = setInterval(() => {
      AuthService.fetchSession().then(u => {
        if (!u) logout('timeout');
      });
    }, 30000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleActivity));
      clearInterval(interval);
    };
  }, [isAuthenticated, logout]);

  const login = useCallback(async (username, password, isEmergency = false) => {
    setIsLoading(true);
    try {
      const res = await AuthService.login(username, password, isEmergency);
      if (res.success) {
        setUser(res.user);
        const roleLabel = res.user.isEmergency ? `${res.user.role} (Emergency Break-Glass)` : res.user.role;
        showToast('success', 'เข้าสู่ระบบสำเร็จ', `ยินดีต้อนรับคุณ ${res.user.name} (${roleLabel})`);
        return { success: true, user: res.user, notice: res.notice };
      } else {
        showToast('error', 'เข้าสู่ระบบไม่สำเร็จ', res.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        return { success: false, error: res.error, canUseEmergency: res.canUseEmergency };
      }
    } catch (err) {
      showToast('error', 'ระบบขัดข้อง', err.message);
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  if (isInitializing) {
    return <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)' }}>Loading session...</div>;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        isAdmin,
        isEditor,
        canEdit,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
