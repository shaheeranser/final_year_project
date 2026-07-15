import { useEffect, useRef } from 'react';
import { PRESENCE_LOSS_GRACE_MS } from '../lib/constants';

interface UsePresenceLossGuardOptions {
  hasFace: boolean;
  enabled: boolean;
  onCameraLost: () => void;
}

export const usePresenceLossGuard = ({
  hasFace,
  enabled,
  onCameraLost
}: UsePresenceLossGuardOptions) => {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    if (!hasFace) {
      if (!timerRef.current) {
        timerRef.current = window.setTimeout(() => {
          onCameraLost();
        }, PRESENCE_LOSS_GRACE_MS);
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
  }, [hasFace, enabled, onCameraLost]);
};
