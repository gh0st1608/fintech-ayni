import {
  type ApprovalsFilter,
  type StaffApprovalsPort,
} from '@src/modules/circles/application/ports/staff-approvals.port';
import {
  DecideApprovalUseCase,
  ListApprovalsUseCase,
  ProposeFundMovementUseCase,
} from '@src/modules/circles/application/use-cases/fund-approvals.use-cases';
import { type RecordFundMovementUseCase } from '@src/modules/circles/application/use-cases/record-fund-movement.use-case';
import {
  effectiveStatus,
  sameStaff,
  type StaffActor,
  type StaffApproval,
} from '@src/modules/circles/domain/staff-approval';
import { ExchangeRates } from '@src/shared/domain/value-objects/exchange-rates';
import { TestClock } from '@test/support/create-test-app';

const NOW = new Date('2026-11-12T15:00:00Z');
const ANA: StaffActor = { staffId: 'ana', email: 'ana@ayni.pe' };
const LUIS: StaffActor = { staffId: 'luis', email: 'luis@ayni.pe' };

class InMemoryApprovals implements StaffApprovalsPort {
  readonly rows = new Map<string, StaffApproval>();
  readonly reopened: string[] = [];

  create(approval: StaffApproval): Promise<StaffApproval> {
    this.rows.set(approval.id, structuredClone(approval));
    return Promise.resolve(structuredClone(approval));
  }

  find(id: string): Promise<StaffApproval | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row ? structuredClone(row) : null);
  }

  list(filter: ApprovalsFilter) {
    return Promise.resolve({
      items: [...this.rows.values()].slice(0, filter.limit),
      nextCursor: null,
    });
  }

  decide(props: {
    id: string;
    status: 'approved' | 'rejected';
    by: StaffActor;
    at: Date;
    reason: string | null;
  }): Promise<StaffApproval | null> {
    const row = this.rows.get(props.id);
    if (!row || row.status !== 'pending' || row.expiresAt <= props.at) return Promise.resolve(null);
    Object.assign(row, {
      status: props.status,
      decidedBy: props.by,
      decidedAt: props.at,
      decisionReason: props.reason,
    });
    return Promise.resolve(structuredClone(row));
  }

  reopen(id: string): Promise<void> {
    this.reopened.push(id);
    const row = this.rows.get(id)!;
    Object.assign(row, { status: 'pending', decidedBy: null, decidedAt: null });
    return Promise.resolve();
  }
}

function setup(now = NOW) {
  const approvals = new InMemoryApprovals();
  const clock = new TestClock(now);
  const record = { execute: jest.fn(() => Promise.resolve(true)) };
  const currencies = {
    official: 'PEN',
    supported: ['PEN', 'USD'],
    rates: ExchangeRates.create('PEN', {}),
  };
  return {
    approvals,
    clock,
    record,
    propose: new ProposeFundMovementUseCase(approvals, { ttlHours: 72 }, currencies, clock),
    list: new ListApprovalsUseCase(approvals, clock),
    decide: new DecideApprovalUseCase(
      approvals,
      record as unknown as RecordFundMovementUseCase,
      clock,
    ),
  };
}

const seed = (amount = 5_000_000) => ({
  kind: 'seed_capital',
  amount,
  currency: 'PEN',
  reason: 'Acta 2026-11',
  staff: ANA,
});

describe('doble aprobación: dominio', () => {
  it('una pendiente vencida se informa como expired', () => {
    const approval = { status: 'pending', expiresAt: NOW } as StaffApproval;
    expect(effectiveStatus(approval, NOW)).toBe('expired');
    expect(effectiveStatus(approval, new Date(NOW.getTime() - 1))).toBe('pending');
  });

  it('reconoce a la misma persona por id o por email', () => {
    expect(sameStaff(ANA, { staffId: 'ana', email: null })).toBe(true);
    expect(sameStaff(ANA, { staffId: 'otro-id', email: 'ANA@ayni.pe' })).toBe(true);
    expect(sameStaff(ANA, LUIS)).toBe(false);
    expect(sameStaff({ staffId: 'a', email: null }, { staffId: 'b', email: null })).toBe(false);
  });
});

describe('ProposeFundMovementUseCase', () => {
  it('propone sin mover dinero y vence a las 72 horas', async () => {
    const { propose, record } = setup();
    const approval = await propose.execute(seed());
    expect(approval).toMatchObject({
      status: 'pending',
      action: 'guarantee_fund.movement',
      payload: { kind: 'seed_capital', amount: 5_000_000, currency: 'PEN', reason: 'Acta 2026-11' },
      proposedBy: ANA,
      expiresAt: new Date('2026-11-15T15:00:00Z'),
    });
    expect(record.execute).not.toHaveBeenCalled();
  });

  it('valida el tipo, el monto, la moneda y el motivo', async () => {
    const { propose } = setup();
    const invalid = (overrides: Record<string, unknown>) =>
      propose.execute({ ...seed(), ...overrides });
    await expect(invalid({ amount: -100 })).rejects.toMatchObject({
      details: { amount: 'invalid' },
    });
    await expect(invalid({ amount: 10.5 })).rejects.toMatchObject({
      details: { amount: 'invalid' },
    });
    await expect(invalid({ amount: 2_000_000_000 })).rejects.toMatchObject({
      details: { amount: 'invalid' },
    });
    await expect(invalid({ kind: 'adjustment', amount: 0 })).rejects.toMatchObject({
      details: { amount: 'invalid' },
    });
    await expect(invalid({ kind: 'payout' })).rejects.toMatchObject({
      details: { kind: 'invalid' },
    });
    await expect(invalid({ currency: 'EUR' })).rejects.toMatchObject({
      details: { currency: 'invalid' },
    });
    await expect(invalid({ reason: '  ' })).rejects.toMatchObject({
      details: { reason: 'required' },
    });
    // Una corrección puede sacar dinero del fondo.
    await expect(invalid({ kind: 'adjustment', amount: -2500 })).resolves.toMatchObject({
      status: 'pending',
    });
  });
});

describe('DecideApprovalUseCase', () => {
  it('otra persona aprueba y se registra el movimiento con el id como clave', async () => {
    const { propose, decide, record } = setup();
    const approval = await propose.execute(seed());
    const decided = await decide.execute({ id: approval.id, decision: 'approve', staff: LUIS });
    expect(decided).toMatchObject({ status: 'approved', decidedBy: LUIS, decidedAt: NOW });
    expect(record.execute).toHaveBeenCalledWith({
      kind: 'seed_capital',
      amount: expect.objectContaining({ amount: 5_000_000, currency: 'PEN' }),
      reason: 'Acta 2026-11',
      operationId: approval.id,
    });
  });

  it('quien propuso no puede aprobar ni rechazar', async () => {
    const { propose, decide, record } = setup();
    const approval = await propose.execute(seed());
    await expect(
      decide.execute({ id: approval.id, decision: 'approve', staff: ANA }),
    ).rejects.toMatchObject({ code: 'APPROVAL_SELF_DECISION' });
    await expect(
      decide.execute({ id: approval.id, decision: 'reject', staff: ANA, reason: 'no' }),
    ).rejects.toMatchObject({ code: 'APPROVAL_SELF_DECISION' });
    expect(record.execute).not.toHaveBeenCalled();
  });

  it('rechazar exige motivo y no registra nada; decidir dos veces responde NOT_PENDING', async () => {
    const { propose, decide, record } = setup();
    const approval = await propose.execute(seed());
    await expect(
      decide.execute({ id: approval.id, decision: 'reject', staff: LUIS, reason: ' ' }),
    ).rejects.toMatchObject({ details: { reason: 'required' } });
    await expect(
      decide.execute({ id: approval.id, decision: 'reject', staff: LUIS, reason: 'No cuadra' }),
    ).resolves.toMatchObject({ status: 'rejected', decisionReason: 'No cuadra' });
    await expect(
      decide.execute({ id: approval.id, decision: 'approve', staff: LUIS }),
    ).rejects.toMatchObject({ code: 'APPROVAL_NOT_PENDING', details: { status: 'rejected' } });
    expect(record.execute).not.toHaveBeenCalled();
  });

  it('una propuesta vencida no se puede aprobar y se lista como expired', async () => {
    const { propose, decide, list, clock } = setup();
    const approval = await propose.execute(seed());
    clock.advanceSeconds(72 * 3600);
    await expect(
      decide.execute({ id: approval.id, decision: 'approve', staff: LUIS }),
    ).rejects.toMatchObject({ code: 'APPROVAL_NOT_PENDING', details: { status: 'expired' } });
    const page = await list.execute({ limit: 10, cursor: null });
    expect(page.items[0]).toMatchObject({ id: approval.id, status: 'expired' });
  });

  it('si el registro contable falla, la propuesta vuelve a quedar pendiente', async () => {
    const { propose, decide, record, approvals } = setup();
    const approval = await propose.execute(seed());
    record.execute.mockRejectedValueOnce(new Error('base caída'));
    await expect(
      decide.execute({ id: approval.id, decision: 'approve', staff: LUIS }),
    ).rejects.toThrow('base caída');
    expect(approvals.reopened).toEqual([approval.id]);
    expect((await approvals.find(approval.id))!.status).toBe('pending');
  });

  it('una propuesta inexistente responde APPROVAL_NOT_FOUND', async () => {
    await expect(
      setup().decide.execute({ id: 'nada', decision: 'approve', staff: LUIS }),
    ).rejects.toMatchObject({ code: 'APPROVAL_NOT_FOUND' });
  });
});
