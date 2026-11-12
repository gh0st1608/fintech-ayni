import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import {
  CURRENCIES,
  type CurrencySettings,
} from '../../../../shared/application/ports/currencies.port';
import { Money } from '../../../../shared/domain/value-objects/money';
import { NotFoundError, ValidationError } from '../../../../shared/errors/app-error';
import {
  ApprovalNotPendingError,
  type ApprovalStatus,
  effectiveStatus,
  FUND_MOVEMENT_KINDS,
  type FundMovementKind,
  sameStaff,
  SelfApprovalError,
  type StaffActor,
  type StaffApproval,
} from '../../domain/staff-approval';
import {
  STAFF_APPROVAL_SETTINGS,
  STAFF_APPROVALS,
  type StaffApprovalSettings,
  type StaffApprovalsPort,
} from '../ports/staff-approvals.port';
import { RecordFundMovementUseCase } from './record-fund-movement.use-case';

/** Tope de un movimiento manual (10 millones en unidades mayores): ataja un error de dedo. */
const MAX_AMOUNT_MINOR = 1_000_000_000;

const notFound = (): NotFoundError =>
  new NotFoundError('No existe esa propuesta', 'APPROVAL_NOT_FOUND');

function assertReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) throw new ValidationError('Escribe el motivo', { reason: 'required' });
  return trimmed;
}

export interface ProposeFundMovementCommand {
  kind: string;
  /** Unidades menores; negativo solo en `adjustment` (sale del fondo). */
  amount: number;
  currency: string;
  reason: string;
  staff: StaffActor;
}

/**
 * `POST /admin/v1/guarantee-fund/movements` (COPAYNI-73): propone el capital semilla o una
 * corrección. No mueve dinero: queda pendiente hasta que otra persona la apruebe.
 */
@Injectable()
export class ProposeFundMovementUseCase {
  private readonly logger = new Logger('GuaranteeFund');

  constructor(
    @Inject(STAFF_APPROVALS) private readonly approvals: StaffApprovalsPort,
    @Inject(STAFF_APPROVAL_SETTINGS) private readonly settings: StaffApprovalSettings,
    @Inject(CURRENCIES) private readonly currencies: CurrencySettings,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(command: ProposeFundMovementCommand): Promise<StaffApproval> {
    const reason = assertReason(command.reason);
    if (!(FUND_MOVEMENT_KINDS as readonly string[]).includes(command.kind)) {
      throw new ValidationError('Elige capital semilla o corrección', { kind: 'invalid' });
    }
    const kind = command.kind as FundMovementKind;
    if (!this.currencies.supported.includes(command.currency)) {
      throw new ValidationError('Esa moneda no se opera', { currency: 'invalid' });
    }
    const { amount } = command;
    const invalidAmount =
      !Number.isSafeInteger(amount) ||
      Math.abs(amount) > MAX_AMOUNT_MINOR ||
      (kind === 'seed_capital' ? amount <= 0 : amount === 0);
    if (invalidAmount) {
      throw new ValidationError('El monto no es válido', { amount: 'invalid' });
    }

    const now = this.clock.now();
    const approval = await this.approvals.create({
      id: randomUUID(),
      action: 'guarantee_fund.movement',
      payload: { kind, amount, currency: command.currency, reason },
      status: 'pending',
      proposedBy: command.staff,
      proposedAt: now,
      expiresAt: new Date(now.getTime() + this.settings.ttlHours * 3_600_000),
      decidedBy: null,
      decidedAt: null,
      decisionReason: null,
    });
    this.logger.log({
      event: 'guarantee_fund.movement_proposed',
      approvalId: approval.id,
      kind,
      amount,
      currency: command.currency,
      staffId: command.staff.staffId,
    });
    return approval;
  }
}

/** `GET /admin/v1/approvals`: propuestas, de la más reciente a la más antigua. */
@Injectable()
export class ListApprovalsUseCase {
  constructor(
    @Inject(STAFF_APPROVALS) private readonly approvals: StaffApprovalsPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(filter: {
    status?: ApprovalStatus;
    limit: number;
    cursor: string | null;
  }): Promise<{ items: StaffApproval[]; nextCursor: string | null }> {
    const now = this.clock.now();
    const page = await this.approvals.list({ ...filter, now });
    return {
      items: page.items.map((approval) => ({
        ...approval,
        status: effectiveStatus(approval, now),
      })),
      nextCursor: page.nextCursor,
    };
  }
}

/**
 * `POST /admin/v1/approvals/:id/approve` y `/reject`. Solo otra persona decide, y solo una
 * pendiente y vigente. Aprobar registra el movimiento con el id de la propuesta como clave de
 * idempotencia: si dos personas aprueban a la vez, el registro contable no se duplica.
 */
@Injectable()
export class DecideApprovalUseCase {
  private readonly logger = new Logger('GuaranteeFund');

  constructor(
    @Inject(STAFF_APPROVALS) private readonly approvals: StaffApprovalsPort,
    @Inject(RecordFundMovementUseCase) private readonly recordMovement: RecordFundMovementUseCase,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(props: {
    id: string;
    decision: 'approve' | 'reject';
    staff: StaffActor;
    reason?: string;
  }): Promise<StaffApproval> {
    const reason = props.decision === 'reject' ? assertReason(props.reason ?? '') : null;
    const approval = await this.approvals.find(props.id);
    if (!approval) throw notFound();
    const now = this.clock.now();
    const status = effectiveStatus(approval, now);
    if (status !== 'pending') throw new ApprovalNotPendingError(status);
    if (sameStaff(approval.proposedBy, props.staff)) throw new SelfApprovalError();

    // Primero se cierra la propuesta: así un rechazo simultáneo no deja un movimiento registrado.
    const decided = await this.approvals.decide({
      id: approval.id,
      status: props.decision === 'approve' ? 'approved' : 'rejected',
      by: props.staff,
      at: now,
      reason,
    });
    if (!decided) {
      const current = await this.approvals.find(approval.id);
      throw new ApprovalNotPendingError(current ? effectiveStatus(current, now) : 'expired');
    }
    if (decided.status === 'approved') {
      const { kind, amount, currency, reason: movementReason } = decided.payload;
      // Idempotente por la clave `kind:id`: reintentar tras un fallo no duplica el movimiento.
      try {
        await this.recordMovement.execute({
          kind,
          amount: Money.of(amount, currency),
          reason: movementReason,
          operationId: decided.id,
        });
      } catch (error) {
        await this.approvals.reopen(decided.id);
        throw error;
      }
    }
    this.logger.log({
      event: `guarantee_fund.movement_${decided.status}`,
      approvalId: decided.id,
      staffId: props.staff.staffId,
    });
    return decided;
  }
}
