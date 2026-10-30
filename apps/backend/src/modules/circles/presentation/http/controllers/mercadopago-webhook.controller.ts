import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { CLOCK, type ClockPort } from '../../../../../shared/application/ports/clock.port';
import { UnauthorizedError } from '../../../../../shared/errors/app-error';
import { Public } from '../../../../../shared/presentation/decorators/public.decorator';
import { isValidWebhookSignature } from '../../../../payments/infrastructure/mercadopago/webhook-signature';
import { ReconcilePaymentUseCase } from '../../../application/use-cases/pay-installment.use-cases';

export const WEBHOOK_SETTINGS = Symbol('WEBHOOK_SETTINGS');

export interface WebhookSettings {
  /** Clave secreta de Mercado Pago; sin ella se rechaza todo webhook. */
  secret: string | null;
}

/**
 * Los reintentos de Mercado Pago pueden llegar horas después. La firma solo autentica: el pago
 * siempre se consulta en la pasarela, así que un reenvío no puede aprobar nada.
 */
const MAX_AGE_SECONDS = 7 * 24 * 3600;

/** Webhooks de Mercado Pago (COPAYNI-63). Sin el token de la app: los autentica la firma. */
@ApiExcludeController()
@Public()
@Controller({ path: 'webhooks/mercadopago', version: '1' })
export class MercadoPagoWebhookController {
  constructor(
    @Inject(ReconcilePaymentUseCase) private readonly reconcile: ReconcilePaymentUseCase,
    @Inject(WEBHOOK_SETTINGS) private readonly settings: WebhookSettings,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Headers('x-signature') signature: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Query('data.id') queryDataId: string | undefined,
    @Body() body: { type?: string; data?: { id?: string | number } },
  ): Promise<{ received: true }> {
    const dataId = queryDataId ?? (body?.data?.id === undefined ? undefined : String(body.data.id));
    const valid =
      this.settings.secret !== null &&
      isValidWebhookSignature({
        signature,
        requestId,
        dataId,
        secret: this.settings.secret,
        now: this.clock.now(),
        maxAgeSeconds: MAX_AGE_SECONDS,
      });
    if (!valid) throw new UnauthorizedError('Firma del webhook inválida');
    // Solo interesan los pagos; los demás tipos se confirman para que no se reintenten.
    if (body?.type === 'payment' && dataId) await this.reconcile.execute(dataId);
    return { received: true };
  }
}
