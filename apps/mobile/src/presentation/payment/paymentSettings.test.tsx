import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { AppError } from '@/domain/shared/errors/AppError';
import { InMemoryPaymentRepository } from '@/infrastructure/payments/InMemoryPaymentRepository';
import { InMemoryPayoutMethodRepository } from '@/infrastructure/payouts/InMemoryPayoutMethodRepository';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { ChangePayoutMethodScreen } from './screens/ChangePayoutMethodScreen';
import { PaymentSettingsScreen } from './screens/PaymentSettingsScreen';
import { PayoutEligibilityScreen } from './screens/PayoutEligibilityScreen';

describe('PayoutEligibilityScreen (COPAYNI-36)', () => {
  it('muestra cada requisito con su estado y abre la acción de los pendientes', async () => {
    const payments = new InMemoryPaymentRepository('PEN', {
      latencyMs: 0,
      eligibility: {
        isEligible: false,
        requirements: [
          { requirement: 'nationalId', status: 'pending' },
          { requirement: 'insuranceNote', status: 'unavailable' },
          { requirement: 'payoutMethod', status: 'pending' },
          { requirement: 'contract', status: 'unavailable' },
          { requirement: 'duePayments', status: 'met' },
        ],
      },
    });
    const payoutMethod = jest.fn();
    await renderWithProviders(
      <PayoutEligibilityScreen actions={{ payoutMethod, duePayments: jest.fn() }} />,
      createTestContainer({ payments }),
    );

    expect(await screen.findByTestId('eligibility-status')).toHaveTextContent(
      /Asegúrate de corregir lo siguiente/,
    );
    // Figma 55:9892: cada requisito explica qué falta; el estado va en el icono y se anuncia.
    expect(screen.getByTestId('requirement-duePayments')).toHaveTextContent(/Pagos al día/);
    expect(screen.getByTestId('requirement-duePayments')).toHaveProp(
      'accessibilityHint',
      'Completado',
    );
    expect(screen.getByTestId('requirement-contract')).toHaveTextContent(
      /Contrato.*Necesitas firmar el contrato/,
    );
    expect(screen.getByTestId('requirement-contract')).toHaveProp(
      'accessibilityHint',
      'Disponible pronto',
    );
    // Pendiente sin acción en la app todavía (documentos, COPAYNI-47): no es pulsable.
    expect(screen.getByTestId('requirement-nationalId')).toHaveProp(
      'accessibilityHint',
      'Pendiente',
    );
    expect(screen.queryByRole('button', { name: /Documento de identidad/ })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: /Método de cobro/ }));
    expect(payoutMethod).toHaveBeenCalled();
  });

  it('con todo cumplido avisa que puede cobrar', async () => {
    const payments = new InMemoryPaymentRepository('PEN', {
      latencyMs: 0,
      eligibility: {
        isEligible: true,
        requirements: [{ requirement: 'payoutMethod', status: 'met' }],
      },
    });
    await renderWithProviders(
      <PayoutEligibilityScreen actions={{}} />,
      createTestContainer({ payments }),
    );
    expect(await screen.findByTestId('eligibility-status')).toHaveTextContent(
      /Cumples todos los requisitos/,
    );
  });

  it('un error de carga se puede reintentar', async () => {
    const payments = new InMemoryPaymentRepository('PEN', { latencyMs: 0 });
    const failing = jest
      .spyOn(payments, 'getPayoutEligibility')
      .mockRejectedValue(new AppError('unknown', 'boom'));
    await renderWithProviders(
      <PayoutEligibilityScreen actions={{}} />,
      createTestContainer({ payments }),
    );
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    failing.mockRestore();
    await fireEvent.press(retry);
    expect(await screen.findByTestId('eligibility-status')).toBeTruthy();
  });
});

describe('PaymentSettingsScreen (COPAYNI-38)', () => {
  it('activa la deducción del pay-in y la guarda en el backend', async () => {
    const payments = new InMemoryPaymentRepository('PEN', { latencyMs: 0 });
    const onChangePayoutMethod = jest.fn();
    await renderWithProviders(
      <PaymentSettingsScreen onChangePayoutMethod={onChangePayoutMethod} />,
      createTestContainer({ payments }),
    );
    const toggle = await screen.findByRole('switch', { name: /Descontar la cuota del payout/ });
    expect(toggle).toHaveProp('value', false);

    await fireEvent(toggle, 'valueChange', true);
    await waitFor(() => expect(payments.settings.deductPayInFromPayout).toBe(true));
    expect(screen.getByRole('switch', { name: /Descontar/ })).toHaveProp('value', true);

    await fireEvent.press(screen.getByRole('button', { name: /Cambiar método de cobro/ }));
    expect(onChangePayoutMethod).toHaveBeenCalled();
    expect(screen.getByTestId('settings-saved-cards')).toHaveTextContent(/Próximamente/);
  });

  it('si el backend rechaza el cambio, el interruptor vuelve y avisa', async () => {
    const payments = new InMemoryPaymentRepository('PEN', { latencyMs: 0 });
    jest.spyOn(payments, 'updateSettings').mockRejectedValue(new AppError('network', 'offline'));
    await renderWithProviders(
      <PaymentSettingsScreen onChangePayoutMethod={jest.fn()} />,
      createTestContainer({ payments }),
    );
    await fireEvent(await screen.findByRole('switch'), 'valueChange', true);

    expect(await screen.findByText(/No se pudo guardar el cambio/)).toBeTruthy();
    expect(screen.getByRole('switch')).toHaveProp('value', false);
  });
});

describe('ChangePayoutMethodScreen', () => {
  it('guarda el método elegido y vuelve', async () => {
    const payoutMethods = new InMemoryPayoutMethodRepository('PEN', {
      latencyMs: 0,
      selected: 'digitalWallet',
    });
    const onSaved = jest.fn();
    await renderWithProviders(
      <ChangePayoutMethodScreen onSaved={onSaved} />,
      createTestContainer({ payoutMethods }),
    );
    await fireEvent.press(await screen.findByTestId('payout-method-bankTransfer'));
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('bankTransfer'));
    expect(payoutMethods.selected).toBe('bankTransfer');
  });
});
