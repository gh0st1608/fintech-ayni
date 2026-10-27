import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';

import { type AppRequest, traceIdOf } from '../http/app-request';

export interface SuccessBody<T> {
  success: true;
  data: T;
  traceId: string;
}

/**
 * Envuelve las respuestas en `{ success: true, data, traceId }`. Las respuestas sin cuerpo
 * (p. ej. 204) se dejan vacías.
 */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<
  T,
  SuccessBody<T> | undefined
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessBody<T> | undefined> {
    const traceId = traceIdOf(context.switchToHttp().getRequest<AppRequest>());
    return next
      .handle()
      .pipe(map((data) => (data === undefined ? undefined : { success: true, data, traceId })));
  }
}
