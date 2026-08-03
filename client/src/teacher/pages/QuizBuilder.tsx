import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout, Spinner, Input, TextArea, Radio, Checkbox, DateTimePicker, Button } from '../../shared/components';
import type { 
  Quiz, 
  Question 
} from '../../shared/api/quiz';
import { 
  createOrGetDraftQuiz, 
  updateQuiz, 
  publishQuiz 
} from '../../shared/api/quiz';

export function QuizBuilder() {
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishErrors, setPublishErrors] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    createOrGetDraftQuiz()
      .then(data => {
        // Default start date to today if not set
        if (!data.startAt && data.status === 'draft') {
          const now = new Date();
          // Zero out seconds/milliseconds for cleaner initial state
          now.setSeconds(0, 0);
          data.startAt = now.toISOString();
          // We immediately save it to backend so it stays consistent
          updateQuiz(data.resourceLinkId, { startAt: data.startAt })
            .catch(console.error);
        }
        setQuiz(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    if (!quiz || quiz.lockedForEditing) return;
    setSaveStatus('saving');
    try {
      const updated = await updateQuiz(quiz.resourceLinkId, quiz);
      setQuiz(updated);
      setSaveStatus('saved');
      setTimeout(() => {
        navigate('/teacher');
      }, 700);
    } catch (err: any) {
      setSaveStatus('error');
      setError(err.message);
    }
  };

  const handlePublish = async () => {
    if (!quiz) return;
    setPublishErrors([]);
    try {
      setSaveStatus('saving');
      // Save local state first before publishing
      await updateQuiz(quiz.resourceLinkId, quiz);
      const published = await publishQuiz(quiz.resourceLinkId);
      setQuiz(published);
      setSaveStatus('saved');
      setTimeout(() => {
        navigate('/teacher');
      }, 700);
    } catch (err: any) {
      setSaveStatus('error');
      if (err.details && Array.isArray(err.details)) {
        setPublishErrors(err.details);
      } else {
        setError(err.message || 'Failed to publish');
      }
    }
  };

  if (loading) return <Spinner label="Loading Quiz..." />;
  if (error) return <div className="dashboard-content"><p style={{color: 'var(--color-danger)'}}>{error}</p></div>;
  if (!quiz) return null;

  const isLocked = quiz.lockedForEditing;

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setQuiz(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        questions: prev.questions.map(q => q.id === id ? { ...q, ...updates } : q)
      };
    });
  };

  const deleteQuestion = (id: string) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    setQuiz(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        questions: prev.questions.filter(q => q.id !== id)
      };
    });
  };

  const addQuestion = () => {
    setQuiz(prev => {
      if (!prev) return prev;
      const newQuestion: Question = {
        id: window.crypto.randomUUID(),
        text: '',
        options: [],
        correctOptionId: '',
        score: 1
      };
      return {
        ...prev,
        questions: [...prev.questions, newQuestion]
      };
    });
  };

  return (
    <Layout
      header={
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-header__title" style={{ fontFamily: 'var(--font-serif)', display: 'inline-block', marginRight: 'var(--space-md)' }}>Quiz Builder</h1>
            <span className="dashboard-header__badge">{quiz.status.toUpperCase()}</span>
          </div>
          <div className="dashboard-header__actions">
            <div style={{ 
              fontFamily: 'var(--font-sans)', 
              fontSize: 'var(--font-size-sm)', 
              color: saveStatus === 'error' ? 'var(--color-danger)' : 'var(--color-ink-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-xs)',
              minWidth: '80px',
              justifyContent: 'flex-end'
            }}>
              {saveStatus === 'saving' && 'Saving...'}
              {saveStatus === 'saved' && <><span style={{ color: 'var(--color-success)' }}>✓</span> Saved</>}
              {saveStatus === 'error' && 'Save failed'}
            </div>
            
            {!isLocked && (
              <Button variant="ghost" onClick={handleSave} disabled={saveStatus === 'saving'}>
                Save Quiz
              </Button>
            )}

            {quiz.status === 'draft' && (
              <Button variant="primary" onClick={handlePublish} disabled={isLocked || saveStatus === 'saving'}>
                Publish Quiz
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="dashboard-content" style={{ paddingBottom: 'var(--space-3xl)' }}>
        
        {isLocked && (
          <div style={{ background: 'var(--color-warning)', padding: 'var(--space-md)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-lg)' }}>
            <strong>Editing is disabled:</strong> Students have already started taking this quiz.
          </div>
        )}

        {publishErrors.length > 0 && (
          <div style={{ background: 'var(--color-danger)', color: 'white', padding: 'var(--space-md)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-lg)' }}>
            <h3 style={{ marginTop: 0 }}>Cannot publish due to the following errors:</h3>
            <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
              {publishErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        <div className="dashboard-card" style={{ marginBottom: 'var(--space-xl)' }}>
          <h2 style={{ fontFamily: 'var(--font-sans)', marginTop: 0, marginBottom: 'var(--space-lg)' }}>General Settings</h2>
          
          <Input 
            label="Title"
            value={quiz.title} 
            disabled={isLocked}
            onChange={e => setQuiz({...quiz, title: e.target.value})}
          />

          <TextArea 
            label="Description"
            value={quiz.description} 
            disabled={isLocked}
            onChange={e => setQuiz({...quiz, description: e.target.value})}
          />

          <div style={{ display: 'flex', gap: 'var(--space-lg)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px' }}>
              <DateTimePicker 
                label="Start Time"
                value={quiz.startAt} 
                disabled={isLocked}
                onChange={val => {
                  setQuiz({...quiz, startAt: val});
                }}
              />
            </div>
            <div style={{ flex: '1 1 300px' }}>
              <DateTimePicker 
                label="End Time"
                value={quiz.endAt} 
                disabled={isLocked}
                onChange={val => {
                  setQuiz({...quiz, endAt: val});
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-md)' }}>
            <Checkbox 
              label="Set a time limit per attempt"
              disabled={isLocked}
              checked={quiz.attemptDurationMinutes !== null}
              onChange={e => {
                const val = e.target.checked ? 60 : null;
                setQuiz({...quiz, attemptDurationMinutes: val});
              }}
            />
            {quiz.attemptDurationMinutes !== null && (
              <div style={{ marginTop: 'var(--space-sm)', marginLeft: 'var(--space-xl)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <Input 
                    type="number"
                    fullWidth={false}
                    style={{ width: '100px' }}
                    min="1"
                    disabled={isLocked}
                    value={quiz.attemptDurationMinutes || ''}
                    onChange={e => setQuiz({...quiz, attemptDurationMinutes: parseInt(e.target.value) || 0})}
                  />
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)' }}>minutes</span>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 'var(--space-md)' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--space-sm)' }}>Student Access</label>
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <Radio 
                name="accessMode" 
                label="All enrolled students"
                disabled={isLocked}
                checked={quiz.studentAccess.mode === 'enrollment'}
                onChange={() => {
                  const studentAccess = { ...quiz.studentAccess, mode: 'enrollment' as const };
                  setQuiz({...quiz, studentAccess});
                }}
              />
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)', marginLeft: 'var(--space-xl)', marginTop: 'var(--space-xs)' }}>
                Note: "all enrolled students" is currently a placeholder check (full roster verification via Moodle's NRPS service is a planned follow-up, not yet implemented).
              </div>
            </div>
            <div>
              <Radio 
                name="accessMode" 
                label="Specific students only"
                disabled={isLocked}
                checked={quiz.studentAccess.mode === 'allowlist'}
                onChange={() => {
                  const studentAccess = { ...quiz.studentAccess, mode: 'allowlist' as const };
                  setQuiz({...quiz, studentAccess});
                }}
              />
              {quiz.studentAccess.mode === 'allowlist' && (
                <div style={{ marginTop: 'var(--space-sm)', marginLeft: 'var(--space-xl)' }}>
                  <TextArea 
                    placeholder="Enter student IDs (one per line or comma-separated)"
                    disabled={isLocked}
                    value={quiz.studentAccess.allowedStudentIds.join(', ')}
                    onChange={e => setQuiz({
                      ...quiz, 
                      studentAccess: {
                        ...quiz.studentAccess,
                        allowedStudentIds: e.target.value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
                      }
                    })}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="dashboard-card">
          <h2 style={{ fontFamily: 'var(--font-sans)', marginTop: 0, marginBottom: 'var(--space-lg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Questions
            {!isLocked && (
              <Button variant="ghost" size="sm" onClick={addQuestion}>
                + Add Question
              </Button>
            )}
          </h2>

          {quiz.questions.length === 0 ? (
            <p style={{ color: 'var(--color-ink-muted)', fontFamily: 'var(--font-sans)' }}>No questions added yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
              {quiz.questions.map((q, i) => (
                <QuestionEditor 
                  key={q.id} 
                  question={q} 
                  index={i} 
                  isLocked={isLocked}
                  onUpdate={updates => updateQuestion(q.id, updates)}
                  onDelete={() => deleteQuestion(q.id)}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
}

function QuestionEditor({ question, index, isLocked, onUpdate, onDelete }: { 
  question: Question, 
  index: number, 
  isLocked: boolean,
  onUpdate: (updates: Partial<Question>) => void,
  onDelete: () => void
}) {
  return (
    <div style={{ border: '1px solid var(--color-border)', padding: 'var(--space-lg)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-md)' }}>
        <strong style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-md)' }}>Question {index + 1}</strong>
        {!isLocked && (
          <Button variant="ghost" size="sm" style={{ color: 'var(--color-danger)' }} onClick={onDelete}>
            Delete
          </Button>
        )}
      </div>
      
      <TextArea 
        placeholder="Enter question text..."
        value={question.text}
        disabled={isLocked}
        onChange={e => onUpdate({ text: e.target.value })}
      />

      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-sm)' }}>Options</label>
        {question.options.map((opt, optIndex) => (
          <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
            <Radio 
              name={`correct-${question.id}`} 
              checked={question.correctOptionId === opt.id}
              disabled={isLocked}
              onChange={() => {
                if (opt.id) {
                  onUpdate({ correctOptionId: opt.id });
                }
              }}
              title="Mark as correct answer"
            />
            <div style={{ flex: 1, marginBottom: '-var(--space-sm)' }}>
              <Input 
                placeholder={`Option ${optIndex + 1}`}
                value={opt.text}
                disabled={isLocked}
                onChange={e => {
                  const newOpts = [...question.options];
                  newOpts[optIndex].text = e.target.value;
                  onUpdate({ options: newOpts });
                }}
              />
            </div>
            {!isLocked && (
              <Button 
                variant="ghost" 
                size="sm" 
                style={{ padding: '0 var(--space-sm)' }}
                onClick={() => {
                  const newOpts = question.options.filter((_, i) => i !== optIndex);
                  onUpdate({ options: newOpts });
                }}
              >
                &times;
              </Button>
            )}
          </div>
        ))}
        {!isLocked && (
          <Button 
            variant="ghost" 
            size="sm" 
            style={{ fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-xs)' }}
            onClick={() => {
              const newOpts = [...question.options, { id: window.crypto.randomUUID(), text: '' }];
              onUpdate({ options: newOpts });
            }}
          >
            + Add Option
          </Button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
        <label style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>Score:</label>
        <div style={{ marginBottom: '-var(--space-sm)' }}>
          <Input 
            type="number"
            fullWidth={false}
            style={{ width: '80px' }}
            min="0"
            value={question.score}
            disabled={isLocked}
            onChange={e => onUpdate({ score: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </div>
    </div>
  );
}
