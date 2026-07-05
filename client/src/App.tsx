/**
 * App.tsx
 *
 * Top-level router. Uses React.lazy() to code-split the student and teacher
 * bundles so they only load for their respective routes.
 */

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { Spinner } from './shared/components';

const StudentApp = lazy(() => import('./student/StudentApp'));
const TeacherApp = lazy(() => import('./teacher/TeacherApp'));

function RolePicker() {
  return (
    <div className="role-picker">
      <div className="role-picker__card">
        <h1 className="role-picker__title">Exam Monitor</h1>
        <p className="role-picker__subtitle">Select your role to continue</p>
        <div className="role-picker__buttons">
          <Link to="/student" className="role-picker__link role-picker__link--student">
            <span className="role-picker__link-icon">🎓</span>
            <span className="role-picker__link-label">Student</span>
            <span className="role-picker__link-desc">Take a proctored exam</span>
          </Link>
          <Link to="/teacher" className="role-picker__link role-picker__link--teacher">
            <span className="role-picker__link-icon">👨‍🏫</span>
            <span className="role-picker__link-label">Teacher</span>
            <span className="role-picker__link-desc">Monitor exam sessions</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Spinner label="Loading module…" />}>
        <Routes>
          <Route path="/" element={<RolePicker />} />
          <Route path="/student/*" element={<StudentApp />} />
          <Route path="/teacher/*" element={<TeacherApp />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
