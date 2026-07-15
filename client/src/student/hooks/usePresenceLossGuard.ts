import { useEffect, useRef } from 'react';
import type { Detection } from '../../shared/types/detection';
import { PRESENCE_LOSS_GRACE_MS } from '../lib/constants';

interface UsePresenceLossGuardOptions {
  detections: Detection[];
  enabled: boolean;
  onCameraLost: () => void;
}

export const usePresenceLossGuard = ({
  detections,
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

    // A face is present if there is any 'face' or pose/gaze detection that signifies a face is in view
    // Or if there is a 'person' detection from coco-ssd? Wait, face landmarking produces 'head_pose' and 'eye_gaze'.
    // If the landmark model successfully runs, we typically get those. Let's just check if we have ANY detection?
    // Actually, let's assume 'person' from coco-ssd or 'head_pose'/'eye_gaze'.
    // Wait, requirement 15: "presence loss ... tracks whether a face landmark is present in each detection batch"
    // "head_pose" and "eye_gaze" are output by the face landmarker.
    
    // If detections array is empty, or lacks face landmarks:
    const hasFace = detections.some(d => d.label === 'head_pose' || d.label === 'eye_gaze' || d.label === 'face');

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
  }, [detections, enabled, onCameraLost]);
};
