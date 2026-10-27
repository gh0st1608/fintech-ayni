import {
  type CallHandler,
  Inject,
  Injectable,
  type NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { catchError, type Observable, throwError, timeout, TimeoutError } from 'rxjs';

import { type AppConfigService } from '../../../config/configuration';

/** Corta las peticiones que superan `REQUEST_TIMEOUT` con un 408 (`REQUEST_TIMEOUT`). */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly timeoutMs: number;

  constructor(@Inject(ConfigService) config: AppConfigService) {
    this.timeoutMs = config.get('REQUEST_TIMEOUT', { infer: true });
  }

  intercept(_context: unknown, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((error: unknown) =>
        throwError(() => (error instanceof TimeoutError ? new RequestTimeoutException() : error)),
      ),
    );
  }
}
