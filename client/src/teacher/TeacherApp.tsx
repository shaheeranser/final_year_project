/**
 * TeacherApp.tsx
 *
 * Entry point for the teacher-side code bundle.
 * Lazy-loaded from the top-level App router.
 */

import { Routes, Route } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { QuizBuilder } from './pages/QuizBuilder';
import { ReviewPage } from './pages/ReviewPage';

export default function TeacherApp() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/quiz-builder" element={<QuizBuilder />} />
      <Route path="/review/:attemptId" element={<ReviewPage />} />
    </Routes>
  );
}
