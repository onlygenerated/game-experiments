import { useEffect, useState } from 'react';

/** Live media-query match. Used to branch layout and pointer behaviour. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Desktop layout: board, preview lane, and log side by side. */
export const WIDE_QUERY = '(min-width: 1280px)';

/**
 * No hover available. The preview is the whole point of the prototype, so on a
 * coarse pointer placement becomes tap-to-target then confirm.
 */
export const TOUCH_QUERY = '(hover: none), (pointer: coarse)';
