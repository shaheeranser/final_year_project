import { useEffect, useState } from 'react';
import { ExamPage } from './pages/ExamPage';
import { EligibilityGate } from './pages/EligibilityGate';
import { Spinner } from '../shared/components';

export default function StudentApp() {
  const [resourceLinkId, setResourceLinkId] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSession() {
      try {
        const ltik = sessionStorage.getItem('ltik');
        const res = await fetch('/api/session/me', {
          headers: ltik ? { Authorization: `Bearer ${ltik}` } : {}
        });
        if (!res.ok) throw new Error('Failed to load session');
        const data = await res.json();
        if (data.resourceLinkId) {
          setResourceLinkId(data.resourceLinkId);
        } else {
          setError('No exam context found in session.');
        }
      } catch (err: any) {
        setError(err.message);
      }
    }
    loadSession();
  }, []);

  if (error) {
    return <div style={{ padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--color-danger)' }}>{error}</div>;
  }

  if (!resourceLinkId) {
    return <Spinner label="Loading session..." />;
  }

  if (!attemptId) {
    return (
      <EligibilityGate 
        resourceLinkId={resourceLinkId} 
        onAttemptReady={(id) => setAttemptId(id)} 
      />
    );
  }

  return <ExamPage attemptId={attemptId} />;
}
