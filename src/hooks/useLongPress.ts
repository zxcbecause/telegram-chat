import { useCallback, useEffect, useRef, type PointerEvent } from 'react';

const DELAY_MS = 480;
const MOVE_TOLERANCE_PX = 10;

/**
 * Long press on touch screens. iOS Safari never fires `contextmenu`, so the
 * right-click menu needs this to be reachable on an iPhone. Mouse and pen are
 * ignored (they have a real right click). Moving the finger (scrolling) cancels.
 *
 * `consumeClick()` tells the caller to ignore the click that follows a long press.
 */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        timer.current = null;
        onLongPress();
      }, DELAY_MS);
    },
    [onLongPress],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE_PX) cancel();
    },
    [cancel],
  );

  const consumeClick = useCallback(() => {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  }, []);

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp: cancel, onPointerCancel: cancel },
    consumeClick,
  };
}
