import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { GreenApiError, type ApiClient } from '../api/greenApi';
import type { Notification, Webhook } from '../api/types';
import { useLongPress } from './useLongPress';
import { useNotifications } from './useNotifications';

/** A scripted client: each receiveNotification call takes the next step. */
function scriptedClient(steps: Array<Notification | null | Error>) {
  const acked: number[] = [];
  let calls = 0;
  const client = {
    receiveNotification: vi.fn(async (_t?: number, signal?: AbortSignal) => {
      calls += 1;
      const step = steps.shift();
      if (step instanceof Error) throw step;
      if (step !== undefined) return step;
      // Script finished: behave like an idle long poll until aborted.
      return new Promise<null>((resolve) => signal?.addEventListener('abort', () => resolve(null)));
    }),
    deleteNotification: vi.fn(async (id: number) => {
      acked.push(id);
      return { result: true };
    }),
  } as unknown as ApiClient;
  return { client, acked, calls: () => calls };
}

const note = (receiptId: number, body: Partial<Webhook> = {}): Notification => ({
  receiptId,
  body: { typeWebhook: 'incomingMessageReceived', timestamp: 1, ...body } as Webhook,
});

describe('useNotifications (receive → handle → delete loop)', () => {
  it('hands every notification to the handler and acknowledges it, in order', async () => {
    const { client, acked } = scriptedClient([note(1), null, note(2)]);
    const seen: number[] = [];
    const { result } = renderHook(() => useNotifications(client, (w) => seen.push(w.timestamp)));

    await waitFor(() => expect(acked).toEqual([1, 2]));
    expect(seen).toEqual([1, 1]);
    expect(result.current).toBe('online');
  });

  it('still acknowledges a notification when the handler throws (queue never stalls)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, acked } = scriptedClient([note(7)]);
    renderHook(() =>
      useNotifications(client, () => {
        throw new Error('bad payload');
      }),
    );
    await waitFor(() => expect(acked).toEqual([7]));
    error.mockRestore();
  });

  it('goes offline on network errors and recovers after a backoff', async () => {
    const { client, acked } = scriptedClient([new TypeError('Failed to fetch'), note(3)]);
    const { result } = renderHook(() => useNotifications(client, () => {}));

    await waitFor(() => expect(result.current).toBe('offline'));
    await waitFor(() => expect(acked).toEqual([3]), { timeout: 3000 });
    expect(result.current).toBe('online');
  });

  it('reports wrong credentials separately from network problems', async () => {
    const { client } = scriptedClient([new GreenApiError('nope', 401)]);
    const { result } = renderHook(() => useNotifications(client, () => {}));
    await waitFor(() => expect(result.current).toBe('unauthorized'));
  });

  it('retries right away when the browser comes back online', async () => {
    const { client, calls } = scriptedClient([new TypeError('offline'), new TypeError('offline')]);
    renderHook(() => useNotifications(client, () => {}));
    await waitFor(() => expect(calls()).toBe(1));
    // Without the event the next attempt would wait 1 s.
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(calls()).toBeGreaterThanOrEqual(2), { timeout: 300 });
  });

  it('stops polling on unmount (logout)', async () => {
    const { client, calls } = scriptedClient([]);
    const { unmount } = renderHook(() => useNotifications(client, () => {}));
    await waitFor(() => expect(calls()).toBe(1));
    unmount();
    await new Promise((r) => setTimeout(r, 50));
    expect(calls()).toBe(1);
  });
});

function LongPressProbe({ onLongPress }: { onLongPress: () => void }) {
  const { handlers, consumeClick } = useLongPress(onLongPress);
  return (
    <button {...handlers} onClick={() => consumeClick()}>
      target
    </button>
  );
}

describe('useLongPress (iPhone has no contextmenu event)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const down = (el: HTMLElement, pointerType: string, x = 0, y = 0) =>
    fireEvent.pointerDown(el, { pointerType, clientX: x, clientY: y });

  it('fires after holding a finger on the element', () => {
    const cb = vi.fn();
    render(<LongPressProbe onLongPress={cb} />);
    down(screen.getByText('target'), 'touch');
    vi.advanceTimersByTime(500);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('does not fire for a quick tap, a scroll gesture or a mouse', () => {
    const cb = vi.fn();
    render(<LongPressProbe onLongPress={cb} />);
    const el = screen.getByText('target');

    down(el, 'touch');
    fireEvent.pointerUp(el);
    vi.advanceTimersByTime(500);

    down(el, 'touch', 0, 0);
    fireEvent.pointerMove(el, { clientX: 0, clientY: 40 });
    vi.advanceTimersByTime(500);

    down(el, 'mouse');
    vi.advanceTimersByTime(500);

    expect(cb).not.toHaveBeenCalled();
  });

  it('lets the caller swallow the click that follows a long press', () => {
    const { result } = renderHook(() => useLongPress(() => {}));
    act(() => {
      result.current.handlers.onPointerDown({ pointerType: 'touch', clientX: 0, clientY: 0 } as never);
      vi.advanceTimersByTime(500);
    });
    expect(result.current.consumeClick()).toBe(true);
    expect(result.current.consumeClick()).toBe(false);
  });
});
