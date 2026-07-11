/**
 * App.tsx
 *
 * Top-level router. Uses React.lazy() to code-split the student and teacher
 * bundles so they only load for their respective routes.
 */

import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Spinner } from './shared/components';

const StudentApp = lazy(() => import('./student/StudentApp'));
const TeacherApp = lazy(() => import('./teacher/TeacherApp'));

function LtiAuthGuard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<'student' | 'teacher' | null>(null);

  useEffect(() => {
    // 1. Capture ltik from URL if present
    const params = new URLSearchParams(window.location.search);
    const urlLtik = params.get('ltik');
    if (urlLtik) {
      sessionStorage.setItem('ltik', urlLtik);
      // Remove from URL so it's not visible or bookmarkable
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const ltik = sessionStorage.getItem('ltik');
    if (!ltik) {
      setError('No LTI session found.');
      setLoading(false);
      return;
    }

    // 2. Validate session with the backend
    fetch('/api/session/me', {
      headers: { Authorization: `Bearer ${ltik}` }
    })
      .then(res => {
        if (!res.ok) throw new Error('Unauthorized');
        return res.json();
      })
      .then(data => {
        setRole(data.role);
        setLoading(false);
      })
      .catch(() => {
        setError('Invalid or expired LTI session.');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <Spinner label="Authenticating LTI Session…" />;
  }

  if (error) {
    return (
      <div className="role-picker">
        <div className="role-picker__card" style={{ textAlign: 'center' }}>
          <h1 className="role-picker__title">Access Denied</h1>
          <p className="role-picker__subtitle" style={{ color: '#e53e3e', marginBottom: '1rem' }}>{error}</p>
          <p>Please launch this activity directly from your Moodle course.</p>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<Spinner label="Loading module…" />}>
      <Routes>
        {role === 'student' && <Route path="/student/*" element={<StudentApp />} />}
        {role === 'teacher' && <Route path="/teacher/*" element={<TeacherApp />} />}
        <Route path="*" element={<Navigate to={`/${role}`} replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <LtiAuthGuard />
    </BrowserRouter>
  );
}

