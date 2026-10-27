import { AppError } from '@/domain/shared/errors/AppError';

/** Latencia de los adaptadores falsos: respeta la cancelación igual que el cliente HTTP. */
export function simulateLatency(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AppError('cancelled', 'Request cancelled'));
    if (ms <= 0) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new AppError('cancelled', 'Request cancelled'));
    });
  });
}
