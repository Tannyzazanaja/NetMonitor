export const AuthService = {
  async login(username, password, isEmergency = false) {
    if (!username || !password) return { success: false, error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' };
    
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, isEmergency })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true, user: data.user, notice: data.notice };
      }
      return {
        success: false,
        error: data.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
        canUseEmergency: data.canUseEmergency
      };
    } catch (err) {
      return { success: false, error: 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้ (Network Error)' };
    }
  },

  async loginWithShare(shareKey = 'readonly') {
    try {
      const res = await fetch('/api/auth/share-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareKey })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true, user: data.user, token: data.token };
      }
      return { success: false, error: data.error };
    } catch (err) {
      return { success: false, error: 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้' };
    }
  },

  async fetchSession() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.user) return data.user;
      }
      return null;
    } catch (err) {
      return null;
    }
  },

  async logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
  },
  
  touchSession() {
    fetch('/api/auth/me').catch(() => {});
  },

  async changeEmergencyPassword(newPassword, emergencyUsername = 'emergency') {
    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร' };
    }
    try {
      const res = await fetch('/api/auth/emergency-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emergencyPassword: newPassword, emergencyUsername })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true, message: data.message };
      }
      return { success: false, error: data.error || 'ไม่สามารถเปลี่ยนรหัสผ่านได้' };
    } catch (err) {
      return { success: false, error: 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้ (Network Error)' };
    }
  }
};
