/**
 * Dashboard.tsx
 *
 * Teacher dashboard.
 * Designed as a dense, confident control surface for monitoring sessions.
 */

import { Layout, StatusRail } from '../../shared/components';

const MOCK_SESSIONS = [
  { id: '1048-A', status: 'active' as const, progress: 85, label: '00:12:45 remaining' },
  { id: '1048-B', status: 'active' as const, progress: 60, label: '00:30:10 remaining' },
  { id: '1048-C', status: 'warning' as const, progress: 95, label: 'Flagged: cell phone' },
  { id: '1048-D', status: 'terminated' as const, progress: 100, label: 'Terminated (2 strikes)' },
  { id: '1048-E', status: 'neutral' as const, progress: 0, label: 'Not started' },
];

export function Dashboard() {
  return (
    <Layout
      header={
        <div className="dashboard-header">
          <h1 className="dashboard-header__title" style={{ fontFamily: 'var(--font-serif)' }}>Session Monitoring</h1>
          <span className="dashboard-header__badge">Live</span>
        </div>
      }
    >
      <div className="dashboard-content">
        <div className="dashboard-card" style={{ padding: '0' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
            <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)', margin: 0, flex: '0 0 120px' }}>Session ID</h2>
            <div style={{ flex: 1, paddingLeft: 'var(--space-md)' }}>
              <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)', margin: 0 }}>Status Track</h2>
            </div>
            <div style={{ flex: '0 0 100px', textAlign: 'right' }}>
              <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)', margin: 0 }}>Actions</h2>
            </div>
          </div>
          
          {MOCK_SESSIONS.map((session, i) => (
            <div 
              key={session.id} 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                padding: 'var(--space-md) var(--space-lg)', 
                borderBottom: i < MOCK_SESSIONS.length - 1 ? '1px solid var(--color-border)' : 'none'
              }}
            >
              <div style={{ flex: '0 0 120px', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                {session.id}
              </div>
              <div style={{ flex: 1, paddingLeft: 'var(--space-md)', paddingRight: 'var(--space-xl)' }}>
                <StatusRail 
                  status={session.status} 
                  progress={session.progress} 
                  label={session.label} 
                />
              </div>
              <div style={{ flex: '0 0 100px', textAlign: 'right' }}>
                <button className="btn btn--ghost btn--sm" style={{ fontFamily: 'var(--font-sans)' }}>Review</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
