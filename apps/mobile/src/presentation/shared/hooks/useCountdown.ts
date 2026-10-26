import { useEffect, useState } from 'react';

const SECOND = 1000;

function secondsUntil(target: Date): number {
  return Math.max(0, Math.ceil((target.getTime() - Date.now()) / SECOND));
}

/**
 * Segundos que faltan hasta `target`. Se calcula desde el reloj (no restando ticks), así que
 * sigue siendo exacto aunque la app pase a segundo plano.
 */
export function useCountdown(target: Date): number {
  const [state, setState] = useState(() => ({ target, seconds: secondsUntil(target) }));

  // Un objetivo nuevo (p. ej. tras reenviar el código) reinicia la cuenta en el mismo render.
  if (state.target !== target) setState({ target, seconds: secondsUntil(target) });

  useEffect(() => {
    const timer = setInterval(() => {
      const seconds = secondsUntil(target);
      setState({ target, seconds });
      if (seconds === 0) clearInterval(timer);
    }, SECOND);
    return () => clearInterval(timer);
  }, [target]);

  return state.target === target ? state.seconds : secondsUntil(target);
}

/** "02:39" a partir de segundos. */
export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
