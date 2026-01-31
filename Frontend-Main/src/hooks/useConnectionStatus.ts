import { useState, useEffect } from 'react';
import type { ConnectionState } from '../types';
import type { PlatformCredentials } from '@/schemas';

interface UseConnectionStatusProps {
  platformIds: string[];
  autoStart?: boolean;
  connectPlatform?: (
    platformId: string,
    credentials?: PlatformCredentials | Record<string, string>
  ) => Promise<'success' | 'error'>;
}

export function useConnectionStatus({
  platformIds,
  autoStart = true,
  connectPlatform,
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

  const runConnection = async (
    index: number,
    credentials?: PlatformCredentials | Record<string, string>
  ) => {
    const platformId = connections[index]?.platformId;
    if (!platformId) return;

    setConnections((prev) =>
      prev.map((c, i) =>
        i === index ? { ...c, status: 'connecting' } : c
      )
    );

    if (connectPlatform) {
      try {
        const status = await connectPlatform(platformId, credentials);
        setConnections((prev) =>
          prev.map((c, i) =>
            i === index ? { ...c, status } : c
          )
        );
      } catch {
        setConnections((prev) =>
          prev.map((c, i) =>
            i === index ? { ...c, status: 'error' } : c
          )
        );
      }
      return;
    }

    // Fallback mock behavior
    await new Promise((resolve) =>
      setTimeout(resolve, 1500 + Math.random() * 1500)
    );

    const success = Math.random() > 0.1;

    setConnections((prev) =>
      prev.map((c, i) =>
        i === index
          ? { ...c, status: success ? 'success' : 'error' }
          : c
      )
    );
  };

  // Connect each platform sequentially
  useEffect(() => {
    if (currentIndex >= 0 && currentIndex < connections.length) {
      const connectPlatform = async () => {
        await runConnection(currentIndex);

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

  const retryConnection = (
    index: number,
    credentials?: PlatformCredentials | Record<string, string>
  ) => {
    runConnection(index, credentials);
  };

  const successCount = connections.filter((c) => c.status === 'success').length;

  return {
    connections,
    allComplete,
    successCount,
    retryConnection,
  };
}
