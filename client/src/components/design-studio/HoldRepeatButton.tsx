/**
 * Button that fires `onPress` on mouse-down (immediate), then keeps firing
 * at REPEAT_INTERVAL_MS while held after an INITIAL_DELAY_MS warm-up.
 *
 * Used for the +/- font-size and similar nudge buttons in the design studio
 * — clicking each time to step from 24 to 96 was tedious. Hold-to-repeat
 * matches every native OS spinner / stepper.
 *
 * Stops on mouse-up, mouse-leave, touch-end, blur, or unmount. Cleanup
 * happens in every path because a stuck timer would just keep mutating
 * state forever.
 */

import { useCallback, useEffect, useRef } from 'react';

const INITIAL_DELAY_MS = 350;
const REPEAT_INTERVAL_MS = 60;

interface HoldRepeatButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  onPress: () => void;
}

export function HoldRepeatButton({ onPress, onMouseDown: _md, onMouseUp: _mu, ...rest }: HoldRepeatButtonProps) {
  const initialTimerRef = useRef<number | null>(null);
  const intervalTimerRef = useRef<number | null>(null);
  // Stable ref to onPress so the start/stop callbacks below can stay
  // stable across renders without re-binding the timers each click.
  const onPressRef = useRef(onPress);
  useEffect(() => { onPressRef.current = onPress; }, [onPress]);

  const stop = useCallback(() => {
    if (initialTimerRef.current !== null) {
      window.clearTimeout(initialTimerRef.current);
      initialTimerRef.current = null;
    }
    if (intervalTimerRef.current !== null) {
      window.clearInterval(intervalTimerRef.current);
      intervalTimerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    // Fire once immediately so a tap behaves like a normal click.
    onPressRef.current();
    // Then schedule repeat.
    initialTimerRef.current = window.setTimeout(() => {
      intervalTimerRef.current = window.setInterval(() => {
        onPressRef.current();
      }, REPEAT_INTERVAL_MS);
    }, INITIAL_DELAY_MS);
  }, []);

  // Belt-and-suspenders: tear down on unmount even if the user navigated
  // away mid-hold.
  useEffect(() => stop, [stop]);

  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); start(); }}
      onMouseUp={stop}
      onMouseLeave={stop}
      onTouchStart={(e) => { e.preventDefault(); start(); }}
      onTouchEnd={stop}
      onTouchCancel={stop}
      onBlur={stop}
      {...rest}
    />
  );
}
