/**
 * useVisibilityGuard.ts
 *
 * Listens for document.visibilitychange. Whenever document.hidden
 * becomes true, fires the onHidden callback — but with two safeguards
 * to prevent false-positive terminations:
 *
 * 1. **Grace period**: The guard waits a configurable delay (default 3s)
 *    after being enabled before it starts monitoring. This prevents the
 *    LTI launch/redirect sequence from triggering a termination.
 *
 * 2. **Debounce**: When the tab goes hidden, we wait a short window
 *    (default 500ms) before firing. If the tab becomes visible again
 *    within that window (e.g. transient iframe focus), the event is
 *    suppressed.
 *
 * No JSX. No DOM rendering.
 */

import { useEffect, useRef } from 'react';

interface UseVisibilityGuardOptions {
  /** Called when the tab has been hidden for longer than the debounce window */
  onHidden: () => void;
  /** Whether the guard is active (disable after termination) */
  enabled: boolean;
  /** Delay (ms) after `enabled` becomes true before monitoring starts */
  graceMs?: number;
  /** How long (ms) the tab must stay hidden before firing onHidden */
  debounceMs?: number;
}

export function useVisibilityGuard({
  onHidden,
  enabled,
  graceMs = 3000,
  debounceMs = 500,
}: UseVisibilityGuardOptions) {
  const onHiddenRef = useRef(onHidden);
  onHiddenRef.current = onHidden;

  useEffect(() => {
    if (!enabled) return;

    let armed = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    // Don't start monitoring until after the grace period
    const graceTimer = setTimeout(() => {
      armed = true;
    }, graceMs);

    const handler = () => {
      if (!armed) return;

      if (document.hidden) {
        // Tab went hidden — start the debounce countdown
        debounceTimer = setTimeout(() => {
          // Still hidden after the debounce window? Fire.
          if (document.hidden) {
            onHiddenRef.current();
          }
        }, debounceMs);
      } else {
        // Tab came back before the debounce expired — cancel
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handler);

    return () => {
      clearTimeout(graceTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      document.removeEventListener('visibilitychange', handler);
    };
  }, [enabled, graceMs, debounceMs]);
}
