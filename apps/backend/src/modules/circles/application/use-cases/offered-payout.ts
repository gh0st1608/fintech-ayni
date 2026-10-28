import { Money } from '../../../../shared/domain/value-objects/money';
import { ValidationError } from '../../../../shared/errors/app-error';
import { type JoinConfig } from '../../domain/entities/join-config';
import { installmentOptions } from '../../domain/services/installment-options';
import { PayoutNotAllowedError } from './get-installment-options.use-case';

/**
 * El payout si el usuario puede elegirlo con esa duración: lo que ofrecen `join-config` e
 * `installment-options`. Lo comparten slots (COPAYNI-30) y la unión (COPAYNI-31).
 */
export function offeredPayout(joinConfig: JoinConfig, payoutAmount: number, months: number): Money {
  const payout = Money.of(payoutAmount, joinConfig.payoutRange.currency);
  if (!joinConfig.allowsPayout(payout)) throw new PayoutNotAllowedError();
  const offered = installmentOptions(payout, joinConfig.durationOptions);
  if (!offered.some((option) => option.months === months)) {
    throw new ValidationError('La duración no es una opción para ese payout', {
      months: 'not_offered',
    });
  }
  return payout;
}
