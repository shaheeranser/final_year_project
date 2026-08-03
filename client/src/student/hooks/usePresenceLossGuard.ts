import { useEffect, useRef } from 'react';
import { PRESENCE_LOSS_GRACE_MS } from '../lib/constants';

interface UsePresenceLossGuardOptions {
  hasFace: boolean;
  enabled: boolean;
  onCameraLost: () => void;
}

/**
 * Fires onCameraLost when the face is absent for longer than PRESENCE_LOSS_GRACE_MS.
 *
 * Includes a startup grace period equal to PRESENCE_LOSS_GRACE_MS so that the guard
 * does not fire immediately when `enabled` first becomes true — this covers the window
 * between detection becoming active and the first detection frame completing (up to
 * FACE_DETECT_INTERVAL = 250ms). Without this, a spurious camera_lost event fires at
 * exam start because hasFace is false until the first inference result arrives.
 */
export const usePresenceLossGuard = ({
  hasFace,
  enabled,
  onCameraLost
}: UsePresenceLossGuardOptions) => {
  const timerRef = useRef<number | null>(null);
  const startupGraceRef = useRef<number | null>(null);
  const guardActiveRef = useRef(false);

  // Startup grace: when enabled flips to true, wait one grace period before
  // the guard starts enforcing. This prevents spurious firing before the first
  // detection frame arrives.
  useEffect(() => {
    if (!enabled) {
      // Guard disabled — clear everything
      guardActiveRef.current = false;
      if (startupGraceRef.current) {
        clearTimeout(startupGraceRef.current);
        startupGraceRef.current = null;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Start the startup grace period
    guardActiveRef.current = false;
    startupGraceRef.current = window.setTimeout(() => {
      guardActiveRef.current = true;
      startupGraceRef.current = null;
    }, PRESENCE_LOSS_GRACE_MS);

    return () => {
      guardActiveRef.current = false;
      if (startupGraceRef.current) {
        clearTimeout(startupGraceRef.current);
        startupGraceRef.current = null;
      }
    };
  }, [enabled]);

  // Absence timer: once the guard is active, fire onCameraLost after the grace period.
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
          // Only fire if the startup grace has also elapsed
          if (guardActiveRef.current) {
            onCameraLost();
          }
          timerRef.current = null;
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
