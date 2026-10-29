import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useEffect, useRef } from 'react';

import { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import { Slot } from '@/domain/circles/value-objects/Slot';
import { AppError } from '@/domain/shared/errors/AppError';
import { Money } from '@/domain/shared/value-objects/Money';
import { InMemoryCircleMembershipRepository } from '@/infrastructure/circles/InMemoryCircleMembershipRepository';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { JoinFlowProvider, useJoinFlow } from './JoinFlowProvider';
import { JoinConfirmScreen } from './screens/JoinConfirmScreen';

const pen = (major: number) => Money.fromMajor(major, 'PEN');
const SLOT = Slot.create({
  position: 3,
  payoutPeriod: '2027-01',
  type: 'lowestFees',
  fee: pen(0),
  discount: pen(0),
  available: true,
});

/** Precarga los cuatro pasos del borrador. */
function Draft({ complete = true }: { complete?: boolean }) {
  const { draft, start, setInstallment, setSlot, setPayoutMethod } = useJoinFlow();
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !complete) return;
    started.current = true;
    start(pen(30_000));
  }, [complete, start]);
  useEffect(() => {
    if (draft.payoutAmount && !draft.installment) {
      setInstallment(InstallmentOption.create({ months: 10, installment: pen(3_000) }));
    } else if (draft.installment && !draft.slot) {
      setSlot(SLOT);
    } else if (draft.slot && !draft.payoutMethod) {
      setPayoutMethod('bankTransfer');
    }
  }, [draft, setInstallment, setSlot, setPayoutMethod]);
  return null;
}

async function renderConfirm({
  circleMembership = new InMemoryCircleMembershipRepository({ latencyMs: 0, startsOn: '2026-11' }),
  complete = true,
  withRoutes = false,
}: {
  circleMembership?: InMemoryCircleMembershipRepository;
  complete?: boolean;
  withRoutes?: boolean;
} = {}) {
  const handlers = {
    onStartOver: jest.fn(),
    onEditPayout: jest.fn(),
    onEditInstallment: jest.fn(),
    onEditSlot: jest.fn(),
    onEditPayoutMethod: jest.fn(),
    onDone: jest.fn(),
    ...(withRoutes ? { onVerifyIdentity: jest.fn(), onIncreaseLimit: jest.fn() } : {}),
  };
  const test = createTestContainer({ circleMembership });
  const view = await renderWithProviders(
    <JoinFlowProvider>
      <Draft complete={complete} />
      <JoinConfirmScreen {...handlers} />
    </JoinFlowProvider>,
    test,
  );
  return { ...view, ...handlers, circleMembership, ids: test.adapters.ids };
}

const submit = () => screen.findByRole('button', { name: 'Confirmar y unirme' });

describe('JoinConfirmScreen', () => {
  it('resume los cuatro pasos y cada uno se puede editar', async () => {
    const { onEditSlot, onEditPayoutMethod } = await renderConfirm();
    const summary = await screen.findByTestId('join-summary');
    expect(summary).toHaveTextContent(/30\.?000/);
    expect(summary).toHaveTextContent(/3\.?000.* al mes · 10 meses/);
    expect(summary).toHaveTextContent(/ene\.? 2027 · Turno 3 · Menos fees/i);
    expect(summary).toHaveTextContent(/Transferencia bancaria/);

    await fireEvent.press(screen.getByRole('button', { name: 'Editar el turno de cobro' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Editar el método de cobro' }));
    expect(onEditSlot).toHaveBeenCalled();
    expect(onEditPayoutMethod).toHaveBeenCalled();
  });

  it('al confirmar se une y muestra el turno y la primera cuota', async () => {
    const { onDone, circleMembership } = await renderConfirm();
    await fireEvent.press(await submit());

    const success = await screen.findByTestId('join-success');
    expect(success).toHaveTextContent(/Ya eres parte del Game'ya/);
    expect(success).toHaveTextContent(/30\.?000.* en ene\.? 2027 \(turno 3 de 10\)/i);
    expect(success).toHaveTextContent(/primera cuota es de .*3\.?000.* en nov\.? 2026/i);
    expect(circleMembership.joinCount).toBe(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Ver mis círculos' }));
    expect(onDone).toHaveBeenCalled();
  });

  it('al tomar una vacante muestra la primera cuota de su mes de ingreso y la puesta al día', async () => {
    /** El backend responde la unión a una vacante (COPAYNI-59): cuotas en cero antes de entrar. */
    class VacancyMembership extends InMemoryCircleMembershipRepository {
      override async join(...args: Parameters<InMemoryCircleMembershipRepository['join']>) {
        const joined = await super.join(...args);
        return {
          ...joined,
          installments: [0, 0, 0, 0, 0, 12_300, 12_300, 3_000, 3_000, 3_000].map(pen),
          catchUp: pen(15_000),
        };
      }
    }
    await renderConfirm({
      circleMembership: new VacancyMembership({ latencyMs: 0, startsOn: '2026-11' }),
    });
    await fireEvent.press(await submit());

    const success = await screen.findByTestId('join-success');
    expect(success).toHaveTextContent(/primera cuota es de .*12\.?300.* en abr\.? 2027/i);
    expect(success).toHaveTextContent(/incluyen .*15\.?000.* de puesta al día/i);
  });

  it('tras un fallo de red, reintentar usa la misma clave y crea una sola unión', async () => {
    const circleMembership = new InMemoryCircleMembershipRepository({ latencyMs: 0 });
    const original = circleMembership.join.bind(circleMembership);
    const join = jest
      .spyOn(circleMembership, 'join')
      .mockRejectedValueOnce(new AppError('network', 'offline'))
      .mockImplementation(original);
    await renderConfirm({ circleMembership });

    await fireEvent.press(await submit());
    expect(await screen.findByRole('alert')).toHaveTextContent(/No hay conexión/);
    await fireEvent.press(await submit());

    expect(await screen.findByTestId('join-success')).toBeTruthy();
    expect(join.mock.calls.map(([, key]) => key)).toEqual(['key-1', 'key-1']);
    expect(circleMembership.joinCount).toBe(1);
  });

  it.each([
    [
      'PAYOUT_METHOD_REQUIRED',
      'Elige cómo quieres recibir tu payout antes de unirte.',
      'Elegir el método de cobro',
      'onEditPayoutMethod',
    ],
    [
      'PAYOUT_METHOD_LIMIT_EXCEEDED',
      'El payout supera el límite de tu método de cobro. Elige otro método.',
      'Elegir el método de cobro',
      'onEditPayoutMethod',
    ],
    [
      'SLOT_TAKEN',
      'Ese turno ya no está disponible. Elige otro.',
      'Elegir otro turno',
      'onEditSlot',
    ],
  ] as const)(
    'con %s explica el motivo y ofrece cómo resolverlo',
    async (code, message, action, handler) => {
      const view = await renderConfirm({
        circleMembership: new InMemoryCircleMembershipRepository({
          latencyMs: 0,
          rejectWith: code,
        }),
      });
      await fireEvent.press(await submit());

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      await fireEvent.press(screen.getByRole('button', { name: action }));
      expect(view[handler]).toHaveBeenCalled();
    },
  );

  it.each([
    [
      'NATIONAL_ID_REQUIRED',
      /verificar tu National ID/,
      'Verificar mi National ID',
      'onVerifyIdentity',
    ],
    [
      'MONTHLY_LIMIT_EXCEEDED',
      /superan tu límite mensual/,
      'Aumentar mi límite',
      'onIncreaseLimit',
    ],
  ] as const)(
    'con %s solo ofrece la acción si la ruta existe',
    async (code, message, action, handler) => {
      await renderConfirm({
        circleMembership: new InMemoryCircleMembershipRepository({
          latencyMs: 0,
          rejectWith: code,
        }),
      });
      await fireEvent.press(await submit());
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.queryByRole('button', { name: action })).toBeNull();
      screen.unmount();

      const view = await renderConfirm({
        circleMembership: new InMemoryCircleMembershipRepository({
          latencyMs: 0,
          rejectWith: code,
        }),
        withRoutes: true,
      });
      await fireEvent.press(await submit());
      await fireEvent.press(await screen.findByRole('button', { name: action }));
      expect((view as unknown as Record<string, jest.Mock>)[handler]).toHaveBeenCalled();
    },
  );

  it('con MEMBER_BLOCKED explica que debe pagar lo vencido más la mora y cuánto (COPAYNI-57)', async () => {
    await renderConfirm({
      circleMembership: new InMemoryCircleMembershipRepository({
        latencyMs: 0,
        rejectWith: 'MEMBER_BLOCKED',
      }),
    });
    await fireEvent.press(await submit());

    // Una cuota base de 3.000 más 3 % de mora; el pago llega con la pasarela, sin acción todavía.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /expulsado de un círculo.*cargo por mora \(.*3\.?090.*\)/,
    );
    expect(
      screen.getAllByRole('button').map((button) => button.props.accessibilityLabel),
    ).not.toContain('Elegir otro turno');
  });

  it('con MEMBER_BLOCKED sin el monto explica el motivo igual', async () => {
    const circleMembership = new InMemoryCircleMembershipRepository({ latencyMs: 0 });
    jest
      .spyOn(circleMembership, 'join')
      .mockRejectedValueOnce(new AppError('conflict', 'no', { code: 'MEMBER_BLOCKED' }));
    await renderConfirm({ circleMembership });
    await fireEvent.press(await submit());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Fuiste expulsado de un círculo por no pagar una cuota. Paga lo vencido más el cargo por mora para unirte a otro.',
    );
  });

  it('sin los pasos anteriores pide volver al paso 1', async () => {
    const { onStartOver } = await renderConfirm({ complete: false });
    expect(screen.getByRole('alert')).toHaveTextContent(/completa los cuatro pasos/);
    await fireEvent.press(screen.getByRole('button', { name: 'Elegir el monto' }));
    await waitFor(() => expect(onStartOver).toHaveBeenCalled());
  });
});
