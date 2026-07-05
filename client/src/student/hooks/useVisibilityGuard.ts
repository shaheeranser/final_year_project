/**
 * useVisibilityGuard.ts
 *
 * Listens for document.visibilitychange. Whenever document.hidden
 * becomes true, fires the onHidden callback immediately — no warning,
 * no leniency, no debounce.
 *
 * Tab switching is unambiguous (unlike a camera misfire), so it is
 * intentionally stricter than the vision-based flags.
 *
 * No JSX. No DOM rendering.
 */

import { useEffect, useRef } from 'react';

interface UseVisibilityGuardOptions {
  /** Called immediately when the tab becomes hidden */
  onHidden: () => void;
  /** Whether the guard is active (disable after termination) */
  enabled: boolean;
}

export function useVisibilityGuard({ onHidden, enabled }: UseVisibilityGuardOptions) {
  const onHiddenRef = useRef(onHidden);
  onHiddenRef.current = onHidden;

  useEffect(() => {
    if (!enabled) return;

    const handler = () => {
      if (document.hidden) {
        onHiddenRef.current();
      }
    };

    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [enabled]);
}
