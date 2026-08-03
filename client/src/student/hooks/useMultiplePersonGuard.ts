import { useEffect, useRef } from 'react';
import type { Detection } from '../../shared/types/detection';
import { MULTIPLE_PERSON_GRACE_MS } from '../lib/constants';

interface UseMultiplePersonGuardOptions {
  detections: Detection[];
  enabled: boolean;
  onMultiplePeople: () => void;
}

export const useMultiplePersonGuard = ({
  detections,
  enabled,
  onMultiplePeople
}: UseMultiplePersonGuardOptions) => {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const personCount = detections.filter(d => d.label === 'person').length;

    if (personCount > 1) {
      if (!timerRef.current) {
        timerRef.current = window.setTimeout(() => {
          onMultiplePeople();
        }, MULTIPLE_PERSON_GRACE_MS);
      }
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [detections, enabled, onMultiplePeople]);
};
