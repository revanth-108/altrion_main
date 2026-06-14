import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore, selectIsAuthenticated } from '../../store';
import { engagementService } from '../../services/engagement.service';

const MIN_DURATION_MS = 3000;

export function PageEngagementTracker() {
  const location = useLocation();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const startedAt = useRef(Date.now());
  const pathRef = useRef(location.pathname + location.search);
  const titleRef = useRef(document.title);
  const lastFlushedStart = useRef<number | null>(null);

  useEffect(() => {
    const flush = () => {
      if (!isAuthenticated) return;
      const duration = Date.now() - startedAt.current;
      if (duration < MIN_DURATION_MS) return;
      if (lastFlushedStart.current === startedAt.current) return;
      lastFlushedStart.current = startedAt.current;

      engagementService.recordPageView({
        path: pathRef.current,
        title: titleRef.current,
        duration_ms: duration,
        referrer: document.referrer || undefined,
        started_at: new Date(startedAt.current).toISOString(),
        metadata: {
          visibility_state: document.visibilityState,
        },
      }).catch(() => {
        // Engagement telemetry should never interrupt the user experience.
      });
    };

    flush();
    startedAt.current = Date.now();
    lastFlushedStart.current = null;
    pathRef.current = location.pathname + location.search;
    titleRef.current = document.title;

    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHidden);

    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHidden);
      flush();
    };
  }, [location.pathname, location.search, isAuthenticated]);

  return null;
}
