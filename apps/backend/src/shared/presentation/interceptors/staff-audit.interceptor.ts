import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { catchError, from, mergeMap, type Observable, throwError } from 'rxjs';

import {
  STAFF_AUDIT,
  type StaffAuditEntry,
  type StaffAuditPort,
} from '../../application/ports/staff-audit.port';
import { AppError } from '../../errors/app-error';
import { type AppRequest, traceIdOf } from '../http/app-request';

const STAFF_AUDITED = Symbol('STAFF_AUDITED');

export interface StaffAuditedOptions {
  entity: string;
  /** Parámetro de la ruta con el id de la entidad. */
  idParam?: string;
  /** Campos del cuerpo que se guardan (p. ej. el motivo). Nada más del cuerpo se registra. */
  bodyFields?: readonly string[];
}

interface StaffAuditedMetadata extends StaffAuditedOptions {
  action: string;
}

/** Registra la acción del personal en `staff_audit_log`, con su resultado. */
export const StaffAudited = (action: string, options: StaffAuditedOptions): MethodDecorator =>
  SetMetadata(STAFF_AUDITED, { action, ...options } satisfies StaffAuditedMetadata);

function pickDetails(body: unknown, fields: readonly string[] = []): Record<string, string> {
  const details: Record<string, string> = {};
  if (typeof body !== 'object' || body === null) return details;
  for (const field of fields) {
    const value = (body as Record<string, unknown>)[field];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      details[field] = String(value).slice(0, 500);
    }
  }
  return details;
}

/**
 * Auditoría de la API de administración. Corre después de `StaffGuard`, así que conoce al actor.
 * Un fallo al auditar no cambia la respuesta (la acción ya ocurrió), pero queda en el log con
 * nivel error para alertar.
 */
@Injectable()
export class StaffAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('StaffAudit');

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(STAFF_AUDIT) private readonly audit: StaffAuditPort,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    const metadata = this.reflector.get<StaffAuditedMetadata | undefined>(
      STAFF_AUDITED,
      context.getHandler(),
    );
    const request = context.switchToHttp().getRequest<AppRequest>();
    if (!metadata || !request.staff) return next.handle();

    const params = request.params as Record<string, string | undefined>;
    const entry = (outcome: StaffAuditEntry['outcome'], extra: Record<string, string> = {}) => ({
      actorId: request.staff!.staffId,
      actorEmail: request.staff!.email,
      action: metadata.action,
      entity: metadata.entity,
      entityId: metadata.idParam ? params[metadata.idParam] : undefined,
      outcome,
      details: { ...pickDetails(request.body, metadata.bodyFields), ...extra },
      traceId: traceIdOf(request),
      ip: request.ip,
    });
    const record = (value: StaffAuditEntry) =>
      this.audit.record(value).catch((error: unknown) => {
        this.logger.error({
          event: 'staff.audit.write_failed',
          action: value.action,
          reason: error instanceof Error ? error.message : String(error),
        });
      });

    return next.handle().pipe(
      mergeMap((result: unknown) => from(record(entry('succeeded')).then((): unknown => result))),
      catchError((error: unknown) =>
        from(
          record(entry('failed', { error: error instanceof AppError ? error.code : 'UNEXPECTED' })),
        ).pipe(mergeMap(() => throwError(() => error))),
      ),
    );
  }
}
