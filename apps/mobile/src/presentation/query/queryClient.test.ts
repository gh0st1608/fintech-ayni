import { AppError } from '@/domain/shared/errors/AppError';

import { createQueryClient, shouldRetryQuery } from './queryClient';

describe('shouldRetryQuery', () => {
  it('reintenta fallos transitorios hasta 2 veces', () => {
    const error = new AppError('network', 'x');
    expect([0, 1, 2].map((attempt) => shouldRetryQuery(attempt, error))).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('no reintenta errores de negocio ni desconocidos', () => {
    expect(shouldRetryQuery(0, new AppError('validation', 'x'))).toBe(false);
    expect(shouldRetryQuery(0, new Error('x'))).toBe(false);
  });

  it('las mutaciones nunca se reintentan automáticamente', () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });
});
