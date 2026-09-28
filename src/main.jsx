import React, { StrictMode, Component } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

// Globally register all Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Uncaught React Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#060913',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: 'sans-serif',
          textAlign: 'center'
        }}>
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 12,
            padding: 32,
            maxWidth: 600
          }}>
            <h2 style={{ color: '#ef4444', marginBottom: 12 }}>⚠️ เกิดข้อผิดพลาดในการโหลดหน้าเว็บ</h2>
            <pre style={{
              background: '#040711',
              color: '#f87171',
              padding: 16,
              borderRadius: 8,
              fontSize: 12,
              textAlign: 'left',
              overflowX: 'auto'
            }}>
              {this.state.error?.toString()}
            </pre>
            <button
              onClick={() => { localStorage.clear(); window.location.reload(); }}
              style={{
                marginTop: 20,
                padding: '10px 20px',
                background: '#00d4ff',
                color: '#060913',
                fontWeight: 700,
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer'
              }}
            >
              🔄 รีเซ็ตแคชและโหลดใหม่ (Reset Cache & Reload)
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
