import { useState, useEffect } from 'react';
import type { ConnectionState } from '../types';

interface UseConnectionStatusProps {
  platformIds: string[];
  autoStart?: boolean;
}

export function useConnectionStatus({
  platformIds,
  autoStart = true,
}: UseConnectionStatusProps) {
  const [connections, setConnections] = useState<ConnectionState[]>(
    platformIds.map((id) => ({ platformId: id, status: 'pending' }))
  );
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [allComplete, setAllComplete] = useState(false);

  // Start connection process
  useEffect(() => {
    if (autoStart && currentIndex === -1 && connections.length > 0) {
      setCurrentIndex(0);
    }
  }, [autoStart]);

  // Connect each platform sequentially
  useEffect(() => {
    if (currentIndex >= 0 && currentIndex < connections.length) {
      const connectPlatform = async () => {
        // Set to connecting
        setConnections((prev) =>
          prev.map((c, i) =>
            i === currentIndex ? { ...c, status: 'connecting' } : c
          )
        );

        // Simulate API connection (1.5-3 seconds)
        await new Promise((resolve) =>
          setTimeout(resolve, 1500 + Math.random() * 1500)
        );

        // 90% success rate for demo
        const success = Math.random() > 0.1;

        setConnections((prev) =>
          prev.map((c, i) =>
            i === currentIndex
              ? { ...c, status: success ? 'success' : 'error' }
              : c
          )
        );

        // Move to next
        if (currentIndex < connections.length - 1) {
          setTimeout(() => setCurrentIndex(currentIndex + 1), 500);
        } else {
          setTimeout(() => setAllComplete(true), 500);
        }
      };

      connectPlatform();
    }
  }, [currentIndex, connections.length]);

  const retryConnection = (index: number) => {
    setConnections((prev) =>
      prev.map((c, i) => (i === index ? { ...c, status: 'connecting' } : c))
    );

    setTimeout(() => {
      setConnections((prev) =>
        prev.map((c, i) => (i === index ? { ...c, status: 'success' } : c))
      );
    }, 2000);
  };

  const successCount = connections.filter((c) => c.status === 'success').length;

  return {
    connections,
    allComplete,
    successCount,
    retryConnection,
  };
}
