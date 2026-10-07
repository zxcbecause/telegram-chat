import { useEffect, useRef, useState } from 'react';
import { GreenApiError, type GreenApiClient } from '../api/greenApi';
import type { Webhook } from '../api/types';

export type ConnectionState = 'connecting' | 'online' | 'offline' | 'unauthorized';

const RECEIVE_TIMEOUT_SEC = 20;
const MAX_BACKOFF_MS = 15_000;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}

/**
 * Receives notifications via GREEN-API HTTP API (long polling):
 *   receiveNotification → handle → deleteNotification → repeat.
 *
 * - exactly one request in flight at a time (no overlapping polls);
 * - every notification is acknowledged, even unknown types, so the queue never stalls;
 * - network errors back off exponentially (1s, 2s, 4s … 15s);
 * - everything is cancelled through an AbortController on unmount / logout.
 */
export function useNotifications(
  client: GreenApiClient | null,
  onWebhook: (webhook: Webhook) => void,
): ConnectionState {
  const [state, setState] = useState<ConnectionState>('connecting');
  // Keep the latest handler without restarting the polling loop on every render.
  const handlerRef = useRef(onWebhook);
  handlerRef.current = onWebhook;

  useEffect(() => {
    if (!client) return;
    const controller = new AbortController();
    const { signal } = controller;
    let failures = 0;

    // Retry immediately when the browser comes back online.
    let wake: AbortController | null = null;
    const onOnline = () => wake?.abort();
    window.addEventListener('online', onOnline);

    (async () => {
      setState('connecting');
      while (!signal.aborted) {
        try {
          const notification = await client.receiveNotification(RECEIVE_TIMEOUT_SEC, signal);
          failures = 0;
          setState('online');
          if (!notification) continue;

          try {
            handlerRef.current(notification.body);
          } catch (err) {
            console.error('Failed to handle notification', err, notification);
          } finally {
            await client.deleteNotification(notification.receiptId, signal);
          }
        } catch (err) {
          if (signal.aborted) break;
          failures += 1;
          const unauthorized = err instanceof GreenApiError && (err.status === 401 || err.status === 403);
          setState(unauthorized ? 'unauthorized' : 'offline');

          wake = new AbortController();
          const both = AbortSignal.any ? AbortSignal.any([signal, wake.signal]) : signal;
          await sleep(Math.min(1000 * 2 ** (failures - 1), MAX_BACKOFF_MS), both);
          wake = null;
        }
      }
    })();

    return () => {
      controller.abort();
      window.removeEventListener('online', onOnline);
    };
  }, [client]);

  return client ? state : 'connecting';
}
