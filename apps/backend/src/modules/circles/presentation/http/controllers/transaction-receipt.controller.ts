import { Controller, Get, Inject, Param, Query, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProduces,
  ApiPropertyOptional,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { type Response } from 'express';

import { type Principal } from '../../../../../shared/application/ports/access-token-verifier.port';
import { CurrentPrincipal } from '../../../../../shared/presentation/decorators/current-principal.decorator';
import {
  GetTransactionReceiptUseCase,
  RECEIPT_LANGUAGES,
  type ReceiptLanguage,
} from '../../../application/use-cases/transaction-receipt.use-case';
import { TransactionDetailQuery } from '../dto/transactions.dto';

export class ReceiptQuery extends TransactionDetailQuery {
  @ApiPropertyOptional({ enum: RECEIPT_LANGUAGES, default: 'es' })
  @IsOptional()
  @IsIn(RECEIPT_LANGUAGES)
  lang?: ReceiptLanguage;
}

/** Comprobante en PDF de un pago o cobro (COPAYNI-80, docs/api/payments.md). */
@ApiTags('payments')
@ApiBearerAuth()
@Controller({ path: 'me/transactions', version: '1' })
export class TransactionReceiptController {
  constructor(
    @Inject(GetTransactionReceiptUseCase) private readonly getReceipt: GetTransactionReceiptUseCase,
  ) {}

  @Get(':id/receipt')
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'El PDF, sin envolver. Content-Disposition: attachment' })
  @ApiBadRequestResponse({ description: 'type o lang inválidos (VALIDATION_ERROR)' })
  @ApiNotFoundResponse({ description: 'No existe o es de otro usuario (TRANSACTION_NOT_FOUND)' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async receipt(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query() query: ReceiptQuery,
    @Res() response: Response,
  ): Promise<void> {
    const { filename, pdf } = await this.getReceipt.execute(principal, {
      type: query.type,
      id,
      language: query.lang,
    });
    response
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'Content-Length': String(pdf.length),
      })
      .end(pdf);
  }
}
