import { AppError } from './AppError';

describe('AppError', () => {
  it('solo los fallos transitorios admiten reintento', () => {
    expect(new AppError('network', 'x').isTransient).toBe(true);
    expect(new AppError('timeout', 'x').isTransient).toBe(true);
    expect(new AppError('server', 'x').isTransient).toBe(true);
    expect(new AppError('validation', 'x').isTransient).toBe(false);
    expect(new AppError('business', 'x').isTransient).toBe(false);
  });

  it('conserva el código, el traceId y la causa', () => {
    const cause = new Error('root');
    const error = new AppError('not_found', 'x', {
      code: 'RESOURCE_NOT_FOUND',
      traceId: 't-1',
      cause,
    });
    expect(error).toMatchObject({ code: 'RESOURCE_NOT_FOUND', traceId: 't-1', name: 'AppError' });
    expect(error.cause).toBe(cause);
  });
});
