import { type Logger } from 'pino';

import { PinoNestLogger } from '@src/shared/infrastructure/observability/pino-nest-logger';

const STACK = 'Error: falló\n    at Servicio.metodo (servicio.ts:10:5)';

describe('PinoNestLogger', () => {
  const pino = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  };
  const logger = new PinoNestLogger(pino as unknown as Logger);

  beforeEach(() => jest.clearAllMocks());

  it('mapea cada método de NestJS a un nivel de pino, con el contexto', () => {
    logger.log('a', 'Ctx');
    logger.warn('b', 'Ctx');
    logger.debug('c', 'Ctx');
    logger.verbose('d', 'Ctx');
    logger.fatal('e', 'Ctx');

    expect(pino.info).toHaveBeenCalledWith({ context: 'Ctx' }, 'a');
    expect(pino.warn).toHaveBeenCalledWith({ context: 'Ctx' }, 'b');
    expect(pino.debug).toHaveBeenCalledWith({ context: 'Ctx' }, 'c');
    expect(pino.debug).toHaveBeenCalledWith({ context: 'Ctx' }, 'd');
    expect(pino.fatal).toHaveBeenCalledWith({ context: 'Ctx' }, 'e');
  });

  it('separa stack y contexto en error(message, stack, context)', () => {
    logger.error('falló', STACK, 'Servicio');
    logger.error('sin contexto', STACK);

    expect(pino.error).toHaveBeenCalledWith({ context: 'Servicio', stack: STACK }, 'falló');
    expect(pino.error).toHaveBeenCalledWith({ stack: STACK }, 'sin contexto');
  });

  it('agrega los campos de un objeto y serializa un Error', () => {
    const error = new Error('roto');
    logger.log({ message: 'GET / 200', statusCode: 200 }, 'HTTP');
    logger.error(error, 'Ctx');
    logger.log(42);

    expect(pino.info).toHaveBeenCalledWith({
      context: 'HTTP',
      message: 'GET / 200',
      statusCode: 200,
    });
    expect(pino.error).toHaveBeenCalledWith({ context: 'Ctx', err: error }, 'roto');
    expect(pino.info).toHaveBeenCalledWith({}, '42');
  });
});
