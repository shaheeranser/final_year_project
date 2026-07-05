/**
 * Dashboard.tsx
 *
 * Placeholder for the teacher dashboard.
 * Functionality will be implemented when the backend is ready.
 */

import { Layout } from '../../shared/components';

export function Dashboard() {
  return (
    <Layout
      header={
        <div className="dashboard-header">
          <h1 className="dashboard-header__title">Teacher Dashboard</h1>
          <span className="dashboard-header__badge">Coming Soon</span>
        </div>
      }
    >
      <div className="dashboard-placeholder">
        <div className="dashboard-placeholder__card">
          <div className="dashboard-placeholder__icon">📊</div>
          <h2>Dashboard Under Construction</h2>
          <p>
            The teacher dashboard will display real-time student monitoring data,
            violation alerts, and exam session management once the backend
            integration is complete.
          </p>
          <div className="dashboard-placeholder__features">
            <div className="dashboard-placeholder__feature">
              <span className="dashboard-placeholder__feature-icon">👁️</span>
              <span>Live student feeds</span>
            </div>
            <div className="dashboard-placeholder__feature">
              <span className="dashboard-placeholder__feature-icon">🔔</span>
              <span>Real-time violation alerts</span>
            </div>
            <div className="dashboard-placeholder__feature">
              <span className="dashboard-placeholder__feature-icon">📋</span>
              <span>Session management</span>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
