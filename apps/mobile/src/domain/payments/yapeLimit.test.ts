import { Money } from '@/domain/shared/value-objects/Money';
import { rejectionReason } from '@/presentation/payment/paymentErrorMessage';

import { yapeAvailability } from './yapeLimit';

const OPERATION = 'PEN';
const amount = (major: number, currency = OPERATION) => Money.fromMajor(major, currency);

describe('Tope de Yape (D1, COPAYNI-77)', () => {
  it('clasifica la cuota según los topes de Yape (500, 900 y 2.000)', () => {
    expect(yapeAvailability(amount(500), OPERATION)).toBe('ok');
    expect(yapeAvailability(amount(500.01), OPERATION)).toBe('may_exceed');
    expect(yapeAvailability(amount(2000), OPERATION)).toBe('may_exceed');
    expect(yapeAvailability(amount(2000.01), OPERATION)).toBe('over_max');
  });

  it('en otra moneda Yape no está disponible', () => {
    expect(yapeAvailability(amount(100, 'USD'), OPERATION)).toBe('unavailable');
  });
});

describe('Motivo del rechazo de Mercado Pago', () => {
  it('normaliza los motivos de tarjeta y de Yape', () => {
    expect(rejectionReason('cc_rejected_insufficient_amount')).toBe('insufficient_amount');
    expect(rejectionReason('insufficient_amount')).toBe('insufficient_amount');
    expect(rejectionReason('required_call_for_authorize')).toBe('call_for_authorize');
    expect(rejectionReason('cc_rejected_call_for_authorize')).toBe('call_for_authorize');
    expect(rejectionReason('cc_rejected_bad_filled_security_code')).toBe('bad_filled');
    expect(rejectionReason('bad_filled_card_data')).toBe('bad_filled');
    expect(rejectionReason('max_attempts_exceeded')).toBe('max_attempts');
    expect(rejectionReason('invalid_card_token')).toBe('invalid_token');
    expect(rejectionReason('processing_error')).toBe('processing_error');
  });

  it('un motivo desconocido o vacío usa el mensaje genérico', () => {
    expect(rejectionReason('cc_rejected_other_reason')).toBeNull();
    expect(rejectionReason(undefined)).toBeNull();
  });
});
