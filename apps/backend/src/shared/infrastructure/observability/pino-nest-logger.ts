import { type LoggerService } from '@nestjs/common';
import { type Level, type Logger } from 'pino';

/** Un stack de V8: el segundo parámetro de `Logger.error(message, stack, context)`. */
const isStack = (value: unknown): value is string =>
  typeof value === 'string' && /\n\s+at /.test(value);

/**
 * Adapta pino a la interfaz de logger de NestJS, para que `new Logger(Contexto)` y los logs
 * del framework salgan como JSON. Convenciones de NestJS: el último parámetro de texto es el
 * contexto; en `error`, un parámetro con forma de stack es el stack.
 */
export class PinoNestLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, ...params: unknown[]): void {
    this.write('info', message, params);
  }

  error(message: unknown, ...params: unknown[]): void {
    this.write('error', message, params);
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', message, params);
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.write('fatal', message, params);
  }

  private write(level: Level, message: unknown, params: unknown[]): void {
    const fields: Record<string, unknown> = {};
    const stack = params.find(isStack);
    const last = params.at(-1);
    if (typeof last === 'string' && !isStack(last)) fields.context = last;
    if (stack) fields.stack = stack;

    if (message instanceof Error) {
      this.logger[level]({ ...fields, err: message }, message.message);
    } else if (typeof message === 'object' && message !== null) {
      this.logger[level]({ ...fields, ...message });
    } else {
      this.logger[level](fields, String(message));
    }
  }
}
