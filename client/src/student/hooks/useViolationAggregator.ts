/**
 * useViolationAggregator.ts
 *
 * Debounce logic: a flag only becomes a confirmed "violation" after it
 * appears on 3 consecutive detection cycles for that specific signal.
 * A single noisy frame is never counted.
 *
 * No JSX. No DOM access. Purely functional state machine.
 */

import { useCallback, useRef } from 'react';
import type { Detection } from '../../shared/types/detection';

/** Default consecutive threshold for standard object/pose/gaze checks */
const DEFAULT_CONSECUTIVE_THRESHOLD = 3;

/** Custom consecutive thresholds for specific signals */
const REQUIRED_CONSECUTIVE_THRESHOLDS: Record<string, number> = {
  identity_mismatch: 2, // Sustained across 2 consecutive periodic checks
};

interface UseViolationAggregatorOptions {
  /** Called when a flag has been confirmed after debounce */
  onViolation: (flag: string) => void;
}

/**
 * Tracks per-flag consecutive-frame counts.
 * Key = flag label (e.g. "cell phone", "head_pose", "eye_gaze", "identity_mismatch")
 * Value = number of consecutive frames/checks the flag has appeared
 */
type FlagCounters = Record<string, number>;

export function useViolationAggregator({ onViolation }: UseViolationAggregatorOptions) {
  const countersRef = useRef<FlagCounters>({});
  // Track which flags have already fired so we don't repeat
  const firedRef = useRef<Set<string>>(new Set());

  /**
   * Call this every time a new batch of detections arrives from the worker.
   * It will debounce and call onViolation only when a flag has persisted
   * for its required consecutive threshold.
   */
  const processDetections = useCallback(
    (detections: Detection[]) => {
      const counters = countersRef.current;
      const fired = firedRef.current;

      // Build a set of flags present in this frame
      const currentFlags = new Set<string>();
      for (const d of detections) {
        currentFlags.add(d.label);
      }

      // For every tracked flag, increment if present, reset if absent
      const allFlags = new Set([...Object.keys(counters), ...currentFlags]);

      for (const flag of allFlags) {
        if (currentFlags.has(flag)) {
          counters[flag] = (counters[flag] ?? 0) + 1;

          const requiredThreshold = REQUIRED_CONSECUTIVE_THRESHOLDS[flag] ?? DEFAULT_CONSECUTIVE_THRESHOLD;

          // Fire if threshold reached and not already fired
          if (counters[flag] >= requiredThreshold && !fired.has(flag)) {
            fired.add(flag);
            onViolation(flag);
          }
        } else {
          // Flag not present → reset its counter and clear fired status so it can trigger again later
          counters[flag] = 0;
          fired.delete(flag);
        }
      }
    },
    [onViolation],
  );

  /** Reset all counters (e.g. when stopping detection) */
  const reset = useCallback(() => {
    countersRef.current = {};
    firedRef.current.clear();
  }, []);

  return { processDetections, reset };
}
